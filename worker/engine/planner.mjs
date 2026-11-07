// Script -> scenes -> timeline. Pure functions (no I/O) so they can be tested without Remotion.
export const LEAD = 0.25, TAIL = 0.45, OVERLAP = 0.4, MIN_SCENE = 2.4, OUTRO = 2.2;

const MOTIF_WORDS = {
  brain: "artificial intelligence neural machine learning smart brain",
  orbit: "ai model models llm gpt gemini claude chatgpt agent agents",
  gears: "automate automation automated workflow workflows process pipeline n8n zapier repetitive tasks routine",
  code: "code coding developer developers programming python javascript app apps software vibe cursor github bug debug build",
  video: "video videos edit editing clip clips shorts youtube film render avatar footage content creator",
  chat: "chat prompt prompts conversation assistant message ask bot chatbot reply",
  chart: "growth grow views subscribers scale data",
  bars3d: "revenue money income profit business sales earn earnings market",
  rocket: "fast faster speed quick quickly instantly launch boost minutes seconds productivity",
  shield: "security privacy safe safety risk protect secure hack hacks",
  cube: "idea ideas tool tools stack platform system framework product feature features tips",
};
const UI_WORDS = {
  chat: "chat prompt prompts assistant bot ask conversation chatgpt reply",
  editor: "code coding python javascript app apps cursor developer build bug debug software vibe",
  workflow: "automation automate workflow workflows agent agents n8n pipeline connect integrate zapier",
  dashboard: "business revenue growth analytics data dashboard metrics money views sales",
};
const toSets = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new Set(v.split(" "))]));
const MOTIFS = toSets(MOTIF_WORDS), UIS = toSets(UI_WORDS);
const LAYOUTS = new Set(["kinetic", "concept", "ui", "stat", "steps"]);
const TRANSITIONS = ["slide", "zoom", "swing", "wipe", "flip", "slideUp", "circle"];
const PALETTES = [
  { accent: "#00e676", bg1: "#0d1024", bg2: "#3a1c6e" }, { accent: "#ffd600", bg1: "#081c2c", bg2: "#0b5c7a" },
  { accent: "#40c4ff", bg1: "#1b0f2e", bg2: "#7a1c5c" }, { accent: "#ff6e40", bg1: "#0f1f14", bg2: "#14604a" },
];
const CODE = [
  ['const agent = createAgent({', '  model: "gemini",', '  tools: [search, email],', '});', 'await agent.run(task);'],
  ['import { render } from "video";', 'const clip = await render(script);', 'await clip.upload("youtube");', 'console.log("published");'],
  ['def summarize(text):', '    prompt = f"Summarize: {text}"', '    return llm(prompt)', 'print(summarize(doc))'],
];

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const tokens = (s) => String(s).toLowerCase().match(/[a-z0-9$%']+/g) || [];
const clean = (w) => String(w).toLowerCase().replace(/[^a-z0-9$%]/g, "");
const clipWords = (t, max) => (t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, "") + "…");
function pick(dict, toks) {
  let best = null, score = 0;
  for (const [k, set] of Object.entries(dict)) { const n = toks.filter((t) => set.has(t)).length; if (n > score) { best = k; score = n; } }
  return best;
}
export const pickTheme = (title) => PALETTES[hash(title) % PALETTES.length];

// Only numbers that really appear in the narration become "stat" scenes (no invented figures).
function findStat(text, given) {
  if (given && typeof given === "object" && given.value != null && text.includes(String(given.value))) return { value: String(given.value).slice(0, 12), label: str(given.label).slice(0, 40) };
  const m = text.match(/\$?\d[\d,.]*\s?(?:%|(?:x|k|m|b|hours?|minutes?|seconds?|days?|weeks?|times)\b)?/i);
  if (!m) return null;
  const v = m[0].trim();
  if (v.length > 12 || /^(19|20)\d\d$/.test(v)) return null;
  return { value: v, label: "" };
}

function buildUi(kind, narration, kw) {
  return {
    kind, user: `Can you help me with ${kw[0] || "this"}?`, reply: clipWords(narration, 95),
    nodes: ["Trigger", cap(kw[0] || "AI"), cap(kw[1] || "Action"), "Result"],
    code: CODE[hash(narration) % CODE.length], labels: [cap(kw[0] || "Growth"), cap(kw[1] || "Reach"), cap(kw[2] || "Output")],
  };
}

// Models sometimes return a list as a string ("ai, code"), an object, or objects ([{text: "..."}]); always get a real array of strings.
const prim = (x) => (x == null ? "" : typeof x === "object" ? String(x.text ?? x.title ?? x.name ?? x.label ?? x.value ?? "") : String(x)).trim();
export const toList = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]+/) : v && typeof v === "object" ? Object.values(v) : []).map(prim).filter(Boolean);
const str = (v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

// The scene list can arrive as an array, {scenes:[...]}, {items:[...]}, {"1":{...},"2":{...}}, or a JSON string. Always return an array.
export function normalizeScenes(o) {
  let v = o;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return []; } }
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    for (const k of ["scenes", "items", "storyboard", "script"]) if (v[k] != null) { const r = normalizeScenes(v[k]); if (r.length) return r; }
    const vals = Object.values(v);
    if (vals.length && vals.every((x) => x && typeof x === "object")) return vals;
  }
  return [];
}

export function planScenes(raw, title) {
  const list = normalizeScenes(raw).filter((s) => s && typeof s.narration === "string" && s.narration.trim()).slice(0, 8);
  if (list.length < 2) throw new Error("A video needs at least 2 scenes.");
  const seed = hash(title);
  let uiCount = 0, prev = null;
  return list.map((s, i) => {
    const narration = s.narration.trim().replace(/\s+/g, " ");
    const toks = tokens(narration);
    const known = (t) => Object.values(MOTIFS).some((x) => x.has(t)) || Object.values(UIS).some((x) => x.has(t));
    const kw = [...new Set([...toList(s.keywords).map((k) => k.toLowerCase()), ...toks.filter(known)])].slice(0, 4);
    const motif = pick(MOTIFS, [...toks, ...kw]) || "cube";
    let uiKind = pick(UIS, [...toks, ...kw]);
    const stat = findStat(narration, s.stat);
    const items = toList(s.items).map((x) => x.slice(0, 60)).slice(0, 4);
    let layout = i === 0 ? "kinetic" : LAYOUTS.has(s.layout) ? s.layout : stat ? "stat" : uiKind && uiCount < 2 ? "ui" : items.length >= 2 ? "steps" : "concept";
    if (layout === "steps" && items.length < 2) layout = "concept";
    if (layout === "stat" && !stat) layout = "concept";
    if (layout === "ui" && !uiKind) uiKind = "workflow";
    if (i > 0 && layout === prev) layout = layout === "kinetic" ? "concept" : "kinetic";
    if (layout === "ui") uiCount++;
    prev = layout;
    let emphasis = toList(s.emphasis).map(clean).filter((g) => g && toks.includes(g));
    if (!emphasis.length) {
      emphasis = [...new Set(toks.filter((t) => kw.includes(t) || /\d/.test(t)))];
      emphasis.push(...[...new Set(toks)].filter((t) => t.length >= 8 && !emphasis.includes(t)).sort((a, b) => b.length - a.length).slice(0, 2));
    }
    return {
      i, narration, layout, motif, items, stat, keywords: kw, emphasis: emphasis.slice(0, 4),
      headline: i === 0 ? title : (str(s.headline) || cap(kw[0] || "")).slice(0, 40),
      // storyboard: what the viewer sees, and a prompt for the image generator
      visual: str(s.visual).slice(0, 220),
      imagePrompt: (str(s.imagePrompt) || str(s.visual) || (i > 0 && (str(s.headline) || kw[0]) ? `a clean illustration representing ${str(s.headline) || kw[0]}` : "")).slice(0, 300),
      ui: layout === "ui" ? buildUi(uiKind, narration, kw) : null,
      transition: i === 0 ? null : TRANSITIONS[(seed + i) % TRANSITIONS.length],
    };
  });
}

// Spread a scene's words over its real voiceover length, weighted by word length (TTS gives no word timestamps).
export function timeWords(text, dur, lead = 0) {
  const ws = text.trim().split(/\s+/).filter(Boolean);
  const total = ws.reduce((a, w) => a + w.length + 2, 0) || 1;
  let t = lead;
  return ws.map((w) => { const d = (dur * (w.length + 2)) / total; const o = { w, start: t, end: t + d }; t += d; return o; });
}

// Attach timings, reveal times and sound cues. voiceDurs[i] = length in seconds of scene i's voiceover.
export function layoutTimeline(scenes, voiceDurs, title) {
  let t = 0;
  const out = scenes.map((s, i) => {
    const vd = voiceDurs[i], dur = Math.max(MIN_SCENE, LEAD + vd + TAIL), words = timeWords(s.narration, vd, LEAD);
    const sc = { ...s, start: t, dur, voiceStart: t + LEAD, voiceDur: vd, words, reveal: [], cues: [] };
    t += dur;
    const add = (time, sfx) => { sc.reveal.push(time); sc.cues.push({ t: time, sfx }); };
    if (s.layout === "kinetic") {
      if (i === 0) sc.cues.push({ t: LEAD, sfx: "impact" });
      const em = new Set(s.emphasis);
      words.filter((w) => em.has(clean(w.w))).slice(0, 3).forEach((w) => add(w.start, "pop"));
    } else if (s.layout === "concept") add(LEAD + 0.05, "pop");
    else if (s.layout === "ui") { const gap = clamp((vd * 0.7) / 4, 0.7, 1.6); for (let k = 0; k < 4; k++) add(LEAD + 0.1 + k * gap, "pop"); }
    else if (s.layout === "steps") s.items.forEach((_, k) => add(LEAD + (k + 0.2) * ((vd * 0.85) / s.items.length), "pop"));
    else if (s.layout === "stat") add(LEAD + 0.15, "impact");
    return sc;
  });
  const outro = { i: out.length, layout: "outro", narration: "", headline: "", keywords: [], motif: "spark", emphasis: [], items: [], stat: null, ui: null, words: [], start: t, dur: OUTRO, voiceStart: t, voiceDur: 0, reveal: [0.2], cues: [{ t: 0.15, sfx: "chime" }], transition: TRANSITIONS[(hash(title) + out.length) % TRANSITIONS.length] };
  return { scenes: [...out, outro], durationSec: t + OUTRO };
}

// All sound effects on one absolute timeline (seconds): transition whooshes plus per-scene cues.
export function audioCues(scenes) {
  const c = [];
  scenes.forEach((s, i) => {
    if (i > 0) c.push({ t: Math.max(0, s.start - OVERLAP + 0.03), sfx: "whoosh" });
    s.cues.forEach((q) => c.push({ t: s.start + q.t, sfx: q.sfx }));
  });
  return c.sort((a, b) => a.t - b.t);
}

// The final Stable Diffusion prompt: the scene's subject, one shared art direction for the whole video, and safety rules.
export const imagePromptFor = (scene, style) => scene.imagePrompt
  ? `${scene.imagePrompt}. ${style || "clean modern 3D illustration, soft lighting, vibrant colors"}. Vertical composition, cinematic lighting, high detail. No text, no letters, no logos, no real people.`
  : "";
