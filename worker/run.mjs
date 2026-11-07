// Render worker. For each video idea:  storyboard + script (Gemini) > voiceover per scene > scene images (Stable Diffusion) > Remotion render > Cloudinary.
// The AI-generated production data (script, voice, images) is SAVED BEFORE rendering, so a failed job resumes at the stage
// that failed instead of repeating the ones that worked. Netlify then schedules, posts and deletes the video.
// Runs in GitHub Actions (.github/workflows/render-clips.yml) or on any machine with Node 20+.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { CHANNEL } from "../netlify/lib/config.mjs";
import { llmJsonMeta, isTransient, xfetch } from "../netlify/lib/llm.mjs";
import { planScenes, toList, layoutTimeline, audioCues, pickTheme, imagePromptFor, OVERLAP } from "./engine/planner.mjs";
import { generateImage, imagesEnabled } from "../netlify/lib/images.mjs";
import { SR, wavFromPcm, assembleVoice, synthScore } from "./engine/audio.mjs";
import { QuotaError, isQuotaMessage, parseRetryAfterSec, isDailyQuota, resumeDelaySec } from "./engine/quota.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const QUICK_WAIT_SEC = 120; // quota waits up to this long are slept through inside the run; longer ones park the job

// The Netlify address exactly as the worker should call it: trimmed, with https:// and without a trailing slash
// (a trailing slash in the GitHub secret produced "//.netlify/functions/..." addresses that Netlify does not answer).
export const netlifyBase = () => {
  const v = String(process.env.NETLIFY_URL || "").trim().replace(/\/+$/, "");
  return v && !/^https?:\/\//i.test(v) ? "https://" + v : v;
};

// Tells Netlify what this video is doing. Never throws; returns {ok, status} so callers can decide how loud to be.
// attempts > 1 retries network trouble and server errors (a lost "ready" report would leave a finished video stuck on "rendering").
export async function report(id, patch, { attempts = 1 } = {}) {
  const base = netlifyBase();
  if (!base) return { ok: false, status: 0, why: "NETLIFY_URL is not set" };
  let last = { ok: false, status: 0 };
  for (let a = 1; a <= attempts; a++) {
    try {
      const r = await xfetch(`${base}/.netlify/functions/queue-status`, { method: "POST", headers: { "content-type": "application/json", "x-worker-secret": process.env.WORKER_SECRET || "" }, body: JSON.stringify({ id, ...patch }) }, { timeout: 20000, label: "Status update" });
      if (r.ok) return { ok: true, status: r.status };
      last = { ok: false, status: r.status };
      console.warn(`Status update was refused (${r.status}). ${r.status === 403 ? "WORKER_SECRET in GitHub does not match WORKER_SECRET in Netlify." : r.status === 400 ? "Netlify does not know this video id (was it removed?)." : r.status === 404 ? "NETLIFY_URL looks wrong, or the Netlify functions are not deployed." : ""}`);
      if ([400, 403, 404].includes(r.status)) break; // retrying cannot fix these
    } catch (e) { last = { ok: false, status: 0, why: e.message }; console.warn(e.message); }
    if (a < attempts) await sleep(a * 3000);
  }
  return last;
}

// Overall progress (percent) for the dashboard: each stage owns a slice of the bar and fills it as its own work advances.
const SPAN = { script: [2, 8], voice: [8, 35], images: [35, 55], render: [55, 92], upload: [92, 99] };
export const pct = (name, f = 0) => { const [a, b] = SPAN[name] || [0, 0]; return Math.round(a + (b - a) * Math.max(0, Math.min(1, +f || 0))); };
const RUN_URL = process.env.RUN_URL || ""; // link to this GitHub Actions run, shown on the dashboard card

// Last resort when the whole worker crashes: mark every video of this run so the dashboard shows it instead of "rendering" forever.
async function failAll(msg) {
  let P; try { P = JSON.parse(process.env.PAYLOAD); } catch { return; }
  await Promise.all((P.items || []).map((it) => report(it.id, { status: "failed", crash: true, runUrl: RUN_URL, error: ("The render worker crashed: " + msg).slice(0, 300) })));
}

export async function writeScenes(idea) {
  const { name, positioning, audience, style, avoid } = CHANNEL;
  const prompt = `You direct YouTube Shorts for the channel "${name}": ${positioning}. Audience: ${audience}. Style: ${style}. Avoid: ${avoid.join("; ")}.
Turn this video idea into 5 to 7 scenes. Title: "${idea.title}". Hook: ${idea.hook || ""}. Shorts angle: ${idea.short || ""}. Why now: ${idea.why || ""}. Topic searched: ${idea.query || ""}.
Total narration 55 to 100 words. Each scene is 1 or 2 short spoken sentences (6 to 24 words), plain speech with no emojis or markdown. Scene 1 is the hook. The last scene nudges viewers to subscribe.
For each scene give: "narration"; "headline" (max 4 words naming the scene's topic); "keywords" (1 to 3 single words that can be illustrated, such as ai, code, video, automation, chat, growth, speed, security); "emphasis" (1 to 3 words copied from the narration to highlight); "layout" (one of kinetic, concept, ui, stat, steps: use ui when the scene shows a tool or workflow in action, stat only when the narration contains a real number, steps with "items" of 2 to 4 short phrases when listing things, otherwise concept); optionally "stat": {"value","label"} copied from the narration.
Also storyboard every scene: "visual" (one sentence describing what the viewer sees) and "imagePrompt" (a concrete prompt for a Stable Diffusion image generator: one clear subject and setting, written as a picture description in English, with no text or letters, no logos or brand names and no real people).
Do not invent statistics, product features or quotes; keep claims general if you are unsure.
Return ONLY JSON: {"scenes":[...], "visualStyle": one short phrase of art direction applied to every scene so all the images match (for example "clean 3D isometric illustration, neon purple and green accents, soft studio lighting"), "caption": at most 12 words for the video description, "hashtags": 3 to 5 words without #}`;
  let last;
  for (let a = 0; a < 2; a++) {
    try {
      const { data: o, provider, model } = await llmJsonMeta(prompt, 0.7);
      const scenes = planScenes(o, idea.title); // accepts [..], {scenes:[..]}, {items:[..]} and other shapes
      return { scenes, visualStyle: String(o?.visualStyle || "").slice(0, 200), caption: String(o?.caption || ""), hashtags: toList(o?.hashtags).slice(0, 5).map((h) => h.replace(/^#/, "")), provider, model };
    } catch (e) { last = e; if (isTransient(e.message)) break; } // temporary provider trouble is handled by the caller's retry, not by re-asking
  }
  throw last;
}

// Voice models, in order. Each Gemini model has its OWN free quota, so when one is used up the next one takes over.
// Set GEMINI_TTS_MODEL / GEMINI_TTS_FALLBACK_MODELS (comma separated) to change them; "none" turns the fallback off.
const ttsModels = () => {
  const fb = process.env.GEMINI_TTS_FALLBACK_MODELS || "gemini-2.5-flash-preview-tts";
  return [process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview", ...(fb === "none" ? [] : fb.split(",").map((x) => x.trim()).filter(Boolean))];
};
const ttsBlocked = new Map(); // model -> time (ms) before which it is not asked again in this run

async function ttsOnce(text, model) {
  const r = await xfetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Say in a confident, friendly, energetic voice: ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.TTS_VOICE || "Kore" } } } },
    }),
  }, { timeout: 90000, label: `Gemini voice ${model}` });
  const j = await r.json().catch(() => ({}));
  const msg = j.error?.message || "";
  if (r.status === 429 || j.error?.status === "RESOURCE_EXHAUSTED" || (!r.ok && isQuotaMessage(msg))) {
    const sec = parseRetryAfterSec(msg) || parseRetryAfterSec(JSON.stringify(j.error?.details || ""));
    const daily = isDailyQuota(msg, sec);
    throw new QuotaError(`Gemini voice quota reached on ${model}${daily ? " (daily limit)" : ""}`, { retryAfterSec: sec || (daily ? 6 * 3600 : 60), daily });
  }
  const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error("Gemini TTS returned no audio: " + (msg || JSON.stringify(j).slice(0, 200)));
  const pcm = Buffer.from(b64, "base64"); // raw 16-bit mono PCM at 24 kHz
  return pcm.length % 2 ? pcm.subarray(0, -1) : pcm;
}

// Tries each voice model that still has quota. Throws QuotaError (with the soonest reset time) when every model is used up.
export async function tts(text) {
  const models = ttsModels(), now = Date.now();
  let soonest = Infinity, daily = false;
  for (const model of models) {
    const until = ttsBlocked.get(model) || 0;
    if (until > now) { soonest = Math.min(soonest, until); continue; }
    try { return await ttsOnce(text, model); }
    catch (e) {
      if (!(e instanceof QuotaError)) throw e;
      const t = now + Math.max(5, e.retryAfterSec) * 1000;
      ttsBlocked.set(model, t); soonest = Math.min(soonest, t); daily = daily || e.daily;
      console.warn(`${e.message}; trying the next voice model if there is one.`);
    }
  }
  throw new QuotaError(`Voice quota used up on ${models.join(", ")}`, { retryAfterSec: Math.max(1, Math.ceil((soonest - Date.now()) / 1000)), daily });
}

// One TTS call per scene gives exact scene lengths. hooks.have(i) returns an already-saved recording (skipped, not re-spoken),
// hooks.saved(i, buf) persists a new one right away. Busy-server errors retry with growing waits (5s, 10s, 20s, 40s).
// A video is never shipped with missing narration unless ALLOW_SILENT=1.
export async function voiceScenes(scenes, hooks = {}, delayMs = Number(process.env.TTS_DELAY_MS ?? 1500)) {
  const segs = [];
  for (const s of scenes) {
    let seg = hooks.have ? await hooks.have(s.i) : null;
    if (seg) { segs.push(seg); continue; }
    if (hooks.start) await hooks.start(s.i, scenes.length);
    let lastErr = "";
    for (let a = 0, quickWaits = 0; a < 5 && !seg; a++) {
      try { seg = await tts(s.narration); }
      catch (e) {
        lastErr = e.message;
        if (e instanceof QuotaError) {
          // A short wait (per-minute limit) is waited out here. A long one (daily limit) is NOT slept through: the job is parked.
          if (e.retryAfterSec <= QUICK_WAIT_SEC && ++quickWaits <= 3) { console.log(`Voice rate limit, waiting ${e.retryAfterSec + 2}s…`); await sleep((e.retryAfterSec + 2) * 1000); a--; continue; }
          if (process.env.ALLOW_SILENT === "1") break;
          throw e;
        }
        if (a < 4) await sleep(5000 * 2 ** a);
      }
    }
    if (!seg && process.env.ALLOW_SILENT !== "1") throw new Error(`Voiceover failed on scene ${s.i + 1} of ${scenes.length}: ${lastErr}`);
    if (!seg) console.warn(`Scene ${s.i} has no voice:`, lastErr);
    else if (hooks.saved) await hooks.saved(s.i, seg);
    segs.push(seg);
    if (delayMs) await sleep(delayMs);
  }
  return { segs, durs: scenes.map((s, i) => (segs[i] ? segs[i].length / (SR * 2) : s.narration.split(/\s+/).length / 2.6)) };
}

// Saved production data: always on local disk (resumes within this run), and on Netlify when configured (resumes across runs).
export function prodStore(id, dir) {
  const base = netlifyBase(), h = { "x-worker-secret": process.env.WORKER_SECRET || "" };
  const remote = !!base && !!process.env.WORKER_SECRET, pushed = new Set(), pushedImg = new Set();
  const url = (q = "") => `${base}/.netlify/functions/queue-data?id=${id}${q}`;
  const file = path.join(dir, "prod.json"), segFile = (i) => path.join(dir, `seg-${i}.pcm`);
  const post = (patch) => xfetch(url(), { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ patch }) }, { timeout: 20000, label: "Saving progress" }).then((r) => { if (!r.ok) throw new Error(`Saving progress failed (${r.status})`); });
  const putImg = (i, buf) => xfetch(url(`&img=${i}`), { method: "PUT", headers: h, body: buf }, { timeout: 30000, label: "Saving image" }).then((r) => { if (!r.ok) throw new Error(`Saving image failed (${r.status})`); pushedImg.add(i); });
  const put = (i, buf) => xfetch(url(`&seg=${i}`), { method: "PUT", headers: h, body: buf }, { timeout: 30000, label: "Saving voiceover" }).then((r) => { if (!r.ok) throw new Error(`Saving voiceover failed (${r.status})`); pushed.add(i); });
  return {
    async load() {
      if (fs.existsSync(file)) try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
      if (remote) {
        try { const r = await xfetch(url(), { headers: h }, { timeout: 20000, label: "Loading saved progress" }); if (r.ok) { const j = await r.json(); fs.writeFileSync(file, JSON.stringify(j)); return j; } }
        catch (e) { console.warn(e.message); }
      }
      return {};
    },
    // save(patch) merges into what is already stored, locally and on Netlify
    async save(patch) {
      let cur = {};
      try { cur = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
      fs.writeFileSync(file, JSON.stringify({ ...cur, ...patch }));
      if (remote) await post(patch);
    },
    async saveSeg(i, buf) { fs.writeFileSync(segFile(i), buf); if (remote) await put(i, buf); },
    async loadSeg(i) {
      if (fs.existsSync(segFile(i))) return fs.readFileSync(segFile(i));
      if (remote) try { const r = await xfetch(url(`&seg=${i}`), { headers: h }, { timeout: 30000, label: "Loading saved voiceover" }); if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(segFile(i), b); pushed.add(i); return b; } } catch (e) { console.warn(e.message); }
      return null;
    },
    async saveImg(i, buf, ext) { fs.writeFileSync(path.join(dir, `img-${i}.${ext}`), buf); if (remote) await putImg(i, buf); },
    async loadImg(i, ext) { // true when the image file is available locally (downloading it if needed)
      const f = path.join(dir, `img-${i}.${ext}`);
      if (fs.existsSync(f)) return true;
      if (remote) try { const r = await xfetch(url(`&img=${i}`), { headers: h }, { timeout: 30000, label: "Loading saved image" }); if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); pushedImg.add(i); return true; } } catch (e) { console.warn(e.message); }
      return false;
    },
    // Make sure everything is on Netlify before the (long) render starts.
    async flush(prod) {
      if (!remote) return;
      await post(prod);
      for (const i of Object.keys(prod.voice || {})) if (!pushed.has(+i) && fs.existsSync(segFile(i))) await put(+i, fs.readFileSync(segFile(i)));
      for (const [i, m] of Object.entries(prod.images || {})) { const f = path.join(dir, `img-${i}.${m.ext}`); if (!pushedImg.has(+i) && fs.existsSync(f)) await putImg(+i, fs.readFileSync(f)); }
    },
  };
}

export async function cloudinaryUpload(file, id) {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !key || !secret) throw new Error("Cloudinary secrets are not set in GitHub.");
  const timestamp = String(Math.floor(Date.now() / 1000)), folder = "yt-shorts", public_id = `short-${id}`;
  const signature = createHash("sha1").update(`folder=${folder}&public_id=${public_id}&timestamp=${timestamp}${secret}`).digest("hex");
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(file)], { type: "video/mp4" }), "short.mp4");
  Object.entries({ api_key: key, timestamp, folder, public_id, signature }).forEach(([k, v]) => fd.append(k, v));
  const r = await xfetch(`https://api.cloudinary.com/v1_1/${cloud}/video/upload`, { method: "POST", body: fd }, { timeout: 300000, label: "Cloudinary upload" });
  const j = await r.json().catch(() => ({}));
  if (!j.secure_url) throw new Error("Cloudinary upload failed: " + (j.error?.message || r.status));
  return { publicId: j.public_id, url: j.secure_url };
}

async function main() {
  const P = JSON.parse(process.env.PAYLOAD);
  const n = P.items.length;
  // Everything in this run starts as "queued" so the dashboard shows the run has started and which place each video has in line.
  // This doubles as a connection check: if Netlify refuses every report, nothing the worker does would ever show up there, so stop
  // loudly (a red run on GitHub) instead of rendering videos that can never be posted.
  const live = new Map(P.items.map((it) => [it.id, { state: "queued", stage: null, detail: "", progress: 0, saved: null }]));
  const hello = await Promise.all(P.items.map((it, k) => report(it.id, { status: "rendering", stage: "queued", detail: n > 1 ? `${k + 1} of ${n} in this run` : "run started", progress: 0, runUrl: RUN_URL })));
  if (hello.every((r) => !r.ok && r.status !== 400)) {
    const r = hello[0];
    throw new Error(!netlifyBase() ? "NETLIFY_URL is not set in GitHub (Settings > Secrets and variables > Actions), so progress can't be reported and videos can't be posted."
      : r.status === 403 ? "WORKER_SECRET in GitHub does not match WORKER_SECRET in Netlify."
      : r.status === 404 ? `NETLIFY_URL (${netlifyBase()}) does not serve the queue-status function. Check the address and that the site deployed.`
      : `Can't reach Netlify at ${netlifyBase()} (${r.why || r.status}).`);
  }
  // Heartbeat: once a minute, tell Netlify each unfinished video is still alive. Without it a crashed run is indistinguishable from a slow one.
  const beat = setInterval(() => {
    for (const [id, st] of live) {
      if (st.state === "done") continue;
      const queued = st.state === "queued";
      report(id, { beat: true, status: "rendering", stage: queued ? "queued" : st.stage || "starting", detail: st.detail, progress: queued ? 0 : st.progress, ...(!queued && Array.isArray(st.saved) ? { saved: st.saved } : {}), runUrl: RUN_URL });
    }
  }, 60000);
  beat.unref?.();
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  const renderedThisRun = new Map(); // id -> path of a finished render, so an upload retry doesn't re-render

  const renderOne = async ({ id, idea }, st) => {
    const dir = path.resolve("work", id.replace(/\W/g, "_"));
    fs.mkdirSync(dir, { recursive: true });
    const ps = prodStore(id, dir), prod = await ps.load();
    const saved = () => [prod.script && "script", Object.keys(prod.voice || {}).length && "voiceover", Object.keys(prod.images || {}).length && "images"].filter(Boolean);
    const stage = (name, detail = "", f = 0) => { st.stage = name; st.detail = detail; st.progress = pct(name, f); st.saved = saved(); return report(id, { status: "rendering", stage: name, detail, progress: st.progress, saved: st.saved, runUrl: RUN_URL }); };
    if (saved().length) console.log(`Resuming ${id}: already saved (${saved().join(", ")}), skipping those stages.`);

    // 1. Script (AI). Saved immediately.
    if (!prod.script) {
      await stage("script");
      const m = await writeScenes(idea);
      prod.script = { scenes: m.scenes, visualStyle: m.visualStyle, caption: m.caption, hashtags: m.hashtags, provider: m.provider, model: m.model, savedAt: new Date().toISOString() };
      await ps.save({ script: prod.script });
    }
    const planned = prod.script.scenes;

    // 2. Voiceover (AI), scene by scene. Each recording is saved as soon as it exists; saved scenes are never re-spoken.
    prod.voice = prod.voice || {};
    const { segs, durs } = await voiceScenes(planned, {
      have: async (i) => (prod.voice[i] ? ps.loadSeg(i) : null),
      start: (i, n) => stage("voice", `scene ${i + 1} of ${n}`, i / n),
      saved: async (i, buf) => { await ps.saveSeg(i, buf); prod.voice[i] = { dur: buf.length / (SR * 2) }; await ps.save({ voice: prod.voice }); st.saved = saved(); },
    });

    // 2b. Scene images (Stable Diffusion). Best effort: a scene without an image keeps its code-drawn graphics. Each image is saved when made.
    prod.images = prod.images || {};
    if (imagesEnabled()) {
      for (const s of planned) {
        const have = prod.images[s.i];
        if (have && (await ps.loadImg(s.i, have.ext))) continue;
        delete prod.images[s.i];
        const prompt = imagePromptFor(s, prod.script.visualStyle);
        if (!prompt) continue;
        await stage("images", `scene ${s.i + 1} of ${planned.length}`, s.i / planned.length);
        try {
          const g = await generateImage(prompt);
          await ps.saveImg(s.i, g.buffer, g.ext);
          prod.images[s.i] = { ext: g.ext, provider: g.provider, model: g.model };
          await ps.save({ images: prod.images }); st.saved = saved();
        } catch (e) { console.warn(`Scene ${s.i + 1} has no image: ${e.message}`); }
      }
    } else console.log("Images are off (no STABILITY_API_KEY or HF_TOKEN, or IMAGES=off): scenes use code-drawn graphics.");
    await ps.flush(prod); // principle: production data is on Netlify before rendering starts

    // 3. Timeline and audio (deterministic: rebuilt from the saved script and voice)
    const { scenes, durationSec } = layoutTimeline(planned, durs, idea.title);
    const hasVoice = segs.some(Boolean);
    scenes.forEach((s) => { const m = prod.images[s.i]; if (m && fs.existsSync(path.join(dir, `img-${s.i}.${m.ext}`))) s.image = `img-${s.i}.${m.ext}`; });
    const made = scenes.filter((s) => s.image).length, imgProviders = [...new Set(Object.values(prod.images).map((m) => m.provider))].join(" + ");
    if (hasVoice) fs.writeFileSync(path.join(dir, "voice.wav"), wavFromPcm(assembleVoice(scenes, segs, durationSec)));
    fs.writeFileSync(path.join(dir, "score.wav"), wavFromPcm(synthScore(scenes, audioCues(scenes), durationSec)));

    // 4. Render with Remotion (skipped if this run already finished it and only the upload failed)
    const out = path.join(dir, "out.mp4");
    if (!(renderedThisRun.get(id) && fs.existsSync(out))) {
      await stage("render", "preparing");
      const inputProps = { scenes, theme: pickTheme(idea.title), channel: process.env.CHANNEL_NAME || "", durationSec, hasVoice, hasScore: true, overlap: OVERLAP };
      const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.jsx"), publicDir: dir });
      st.detail = "starting the browser"; await report(id, { beat: true, status: "rendering", stage: "render", detail: st.detail, progress: st.progress });
      const composition = await selectComposition({ serveUrl, id: "Engine", inputProps });
      // Frame-by-frame progress goes to the dashboard (at most every 5 seconds and only when the percent moved).
      let lastPct = -1, lastAt = 0;
      const onProgress = ({ progress }) => {
        st.progress = pct("render", progress); st.detail = `${Math.round(progress * 100)}%`;
        if (st.progress !== lastPct && Date.now() - lastAt > 5000) { lastPct = st.progress; lastAt = Date.now(); report(id, { beat: true, status: "rendering", stage: "render", detail: st.detail, progress: st.progress }); }
      };
      await renderMedia({ composition, serveUrl, codec: "h264", crf: 20, outputLocation: out, inputProps, onProgress });
      renderedThisRun.set(id, out);
    } else console.log("Reusing the video already rendered in this run.");

    // 5. Store on Cloudinary; Netlify takes it from here
    await stage("upload");
    const cloudinary = await cloudinaryUpload(out, id);
    const done = await report(id, { status: "ready", script: planned.map((s) => s.narration).join(" "), points: planned.map((s) => s.headline).filter(Boolean).slice(0, 4), caption: prod.script.caption, hashtags: prod.script.hashtags, aiProvider: prod.script.provider, storyboard: planned.map((s) => s.visual).filter(Boolean), imageInfo: imagesEnabled() ? `Images: ${made} of ${planned.length} scenes${imgProviders ? ` (${imgProviders})` : ""}` : "Images: off", cloudinary, runUrl: RUN_URL }, { attempts: 4 });
    if (!done.ok) throw new Error(`The video is rendered and uploaded (${cloudinary.url}) but Netlify did not accept the "ready" update (${done.status || done.why}). Check NETLIFY_URL and WORKER_SECRET in GitHub.`);
    console.log(`Ready: ${idea.title} (${durationSec.toFixed(1)}s, ${scenes.length} scenes) -> ${cloudinary.url}`);
  };

  // Temporary provider problems (busy servers, dropped connections) are retried after a wait and resume from saved progress.
  // A voice QUOTA problem is different: waiting inside the run would burn GitHub minutes (daily limits last hours), so the job is
  // PARKED instead. Progress is already saved, Netlify restarts the job when the quota resets (dispatch-due), and the other videos
  // in this run are parked too instead of hitting the same wall. Anything else fails the card; Retry continues from the same saved point.
  let failed = 0, blockedUntil = 0;
  for (const item of P.items) {
    const st = live.get(item.id);
    if (blockedUntil > Date.now()) { st.state = "done"; await report(item.id, { status: "rendering", stage: "waiting", detail: "Voice quota reached", resumeAt: new Date(blockedUntil).toISOString() }); continue; }
    st.state = "running"; st.stage = "starting"; st.progress = 1;
    await report(item.id, { status: "rendering", progress: 1, runUrl: RUN_URL });
    for (let attempt = 1; ; attempt++) {
      try { await renderOne(item, st); break; }
      catch (e) {
        if (e instanceof QuotaError) {
          blockedUntil = Date.now() + resumeDelaySec(e.retryAfterSec) * 1000;
          console.warn(`${e.message}. Parked until ${new Date(blockedUntil).toISOString()}; saved progress is kept.`);
          st.state = "done"; // stop heartbeats first: a beat after parking must not un-park the job
          await report(item.id, { status: "rendering", stage: "waiting", detail: "Voice quota reached", resumeAt: new Date(blockedUntil).toISOString(), saved: st.saved || [] });
          break;
        }
        if (attempt < 3 && isTransient(e.message)) {
          console.warn(`Attempt ${attempt} hit a temporary problem (${e.message}). Waiting, then continuing from saved progress.`);
          st.detail = "temporary problem, retrying shortly"; await report(item.id, { beat: true, status: "rendering", stage: st.stage || "starting", detail: st.detail });
          await sleep(attempt * 90000); continue;
        }
        failed++; console.error(e.message);
        st.state = "done";
        await report(item.id, { status: "failed", error: String(e.message).slice(0, 300), stage: st.stage, saved: st.saved || [], runUrl: RUN_URL }, { attempts: 3 });
        break;
      }
    }
    st.state = "done";
  }
  clearInterval(beat);
  if (failed) process.exit(1);
}
// A crash anywhere (a failed import, a bad payload, Netlify unreachable at the start) is reported to the dashboard and fails the GitHub run.
if (process.env.PAYLOAD) main().catch(async (e) => { console.error(e); await failAll(String(e?.message || e)); process.exit(1); });
