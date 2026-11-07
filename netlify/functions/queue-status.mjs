import { getItem, patchItem, deleteVoice } from "../lib/queue.mjs";
const clip = (v, n) => String(v ?? "").slice(0, n);
// Models and older versions of the worker sometimes send a list as a string or an object; always store a real array of short strings.
const list = (v, n, len) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]+/) : v && typeof v === "object" ? Object.values(v) : [])
  .map((x) => clip(typeof x === "object" && x ? x.text ?? x.title ?? x.name ?? "" : x, len).replace(/^#/, "").trim()).filter(Boolean).slice(0, n);
// Called by the render worker to report progress. Rendering reports carry the current stage, an overall progress percent and
// what has been saved so far. A report with beat:true is a heartbeat / progress tick: it only proves the worker is alive.
export default async (req) => {
  const secret = process.env.WORKER_SECRET;
  if (req.method !== "POST" || !secret || req.headers.get("x-worker-secret") !== secret) return new Response("Forbidden", { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cur = b.id && (await getItem(b.id));
  if (!cur || !["rendering", "ready", "failed"].includes(b.status)) return new Response("Bad request", { status: 400 });
  const ignored = () => Response.json({ ok: true, ignored: true, status: cur.status });
  // Late or repeated reports must never undo a finished state or un-park a job.
  if (["posting", "posted"].includes(cur.status)) return ignored(); // already on its way to YouTube: a repeated "ready" would make it post twice
  if (cur.status === "ready" && b.status !== "ready") return ignored();
  if (b.beat && (cur.status !== "rendering" || cur.dispatchAt)) return ignored();
  if (b.crash && (cur.status !== "rendering" || cur.dispatchAt)) return ignored(); // "the run crashed" notes only apply to a video the run still owned
  const now = new Date().toISOString(), patch = { status: b.status, workerSeenAt: now };
  if (typeof b.runUrl === "string" && /^https:\/\/github\.com\//.test(b.runUrl)) patch.runUrl = clip(b.runUrl, 200);
  const saved = Array.isArray(b.saved) ? b.saved.slice(0, 5).map((x) => clip(x, 20)) : undefined;
  if (b.status === "rendering") {
    if (cur.status === "failed") Object.assign(patch, { error: null, failedAt: null, failedStage: null }); // the worker is alive after all (e.g. the stall check fired too early)
    if (b.stage === "queued") { patch.stage = "queued"; patch.detail = clip(b.detail, 60); } // the run has started but this video's turn has not come
    else {
      if (!cur.renderStartedAt) patch.renderStartedAt = now; // first start only, so progress reports don't reset it
      if (b.stage) { patch.stage = clip(b.stage, 20); patch.detail = clip(b.detail, 60); }
      else if (cur.stage === "queued") { patch.stage = "starting"; patch.detail = ""; }
    }
    if (typeof b.progress === "number" && isFinite(b.progress)) patch.progress = Math.max(0, Math.min(100, Math.round(b.progress)));
    if (saved) patch.saved = saved;
    if (b.resumeAt) {
      // The worker parked this video (AI quota used up). dispatch-due starts it again at that time; its saved progress is kept.
      const t = Math.min(Math.max(Date.parse(b.resumeAt) || 0, Date.now() + 60e3), Date.now() + 27 * 36e5);
      Object.assign(patch, { stage: "waiting", detail: clip(b.detail || "Waiting for AI quota", 60), dispatchAt: new Date(t).toISOString(), quotaUntil: new Date(t).toISOString(), renderStartedAt: null, progress: null });
      if (!(Date.parse(cur.publishAt) > t + 45 * 60e3)) patch.publishAt = new Date(t + 45 * 60e3).toISOString(); // never leave the post time before the video can exist
    } else Object.assign(patch, { dispatchAt: null, quotaUntil: null });
  }
  if (b.status === "failed") {
    Object.assign(patch, { failedAt: now, error: clip(b.error || "Unknown error", 300), failedStage: b.stage ? clip(b.stage, 20) : cur.stage && cur.stage !== "queued" ? cur.stage : null, dispatchAt: null, quotaUntil: null, progress: null });
    if (saved) patch.saved = saved;
  }
  if (b.status === "ready") {
    Object.assign(patch, { readyAt: now, script: clip(b.script, 3000), points: list(b.points, 6, 60), caption: clip(b.caption, 300), hashtags: list(b.hashtags, 8, 40), cloudinary: b.cloudinary, aiProvider: clip(b.aiProvider, 40), imageInfo: clip(b.imageInfo, 120), storyboard: list(b.storyboard, 8, 220), error: null, failedStage: null, stage: null, detail: null, progress: null, dispatchAt: null, quotaUntil: null });
    await deleteVoice(b.id).catch(() => {}); // the finished video no longer needs the raw voice recordings
  }
  const item = await patchItem(b.id, patch);
  return Response.json({ ok: true, status: item.status });
};
