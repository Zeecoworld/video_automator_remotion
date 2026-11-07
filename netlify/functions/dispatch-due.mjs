import { listItems, patchItem } from "../lib/queue.mjs";
import { dispatchRender, MAX_PER_RUN } from "../lib/dispatch.mjs";
// Runs every 5 minutes. Two jobs:
// 1. WATCHDOG. A video marked "rendering" must hear from the render worker regularly (it sends a heartbeat every minute).
//    If the worker never started (GitHub run didn't begin, failed during setup, wrong NETLIFY_URL / WORKER_SECRET) or went
//    silent, the card is marked failed with a clear message instead of saying "rendering" forever. Retry then continues from saved progress.
// 2. Starts renders that were SCHEDULED for later: a Retry (which waits a few minutes on purpose) and jobs the worker parked because
//    the free AI quota ran out (they restart when the quota resets). One run starts at most MAX_PER_RUN videos per tick, so a pile
//    of waiting jobs is spread out instead of hitting the AI quota all at once.
const mins = (v, d) => Math.max(1, Number(v) || d) * 60e3;
const START_LIMIT = () => mins(process.env.RENDER_START_TIMEOUT_MIN, 30); // GitHub run must report within this long after dispatch
const STALL_LIMIT = () => mins(process.env.RENDER_STALL_TIMEOUT_MIN, 20); // a started run must send a heartbeat within this long
const NEVER = "The render server never reported back. Open GitHub > Actions > Render videos and read the latest run. Usual causes: the workflow is not on the default branch, a setup step failed, or NETLIFY_URL / WORKER_SECRET in GitHub are missing or wrong. Then press Retry.";
const STALLED = "The render server stopped reporting (no update for 20+ minutes), so the run probably crashed or was cancelled. Check the latest run in GitHub > Actions, then press Retry; it continues from what was saved.";

export default async () => {
  const now = Date.now(), all = await listItems(), stuckIds = new Set();
  for (const i of all) {
    if (i.status !== "rendering" || i.dispatchAt) continue;
    const seen = Date.parse(i.workerSeenAt), since = seen || Date.parse(i.dispatchedAt) || Date.parse(i.createdAt) || 0;
    if (now - since <= (seen ? STALL_LIMIT() : START_LIMIT())) continue;
    stuckIds.add(i.id);
    await patchItem(i.id, { status: "failed", failedAt: new Date().toISOString(), failedStage: seen && i.stage && i.stage !== "queued" ? i.stage : null, error: seen ? STALLED : NEVER, progress: null });
  }
  const due = all
    .filter((i) => !stuckIds.has(i.id) && i.status === "rendering" && i.dispatchAt && new Date(i.dispatchAt) <= now)
    .sort((a, b) => new Date(a.dispatchAt) - new Date(b.dispatchAt))
    .slice(0, MAX_PER_RUN);
  if (!due.length) return;
  // Clear the marker first so an overlapping tick can't start the same video twice.
  const started = new Date().toISOString();
  await Promise.all(due.map((i) => patchItem(i.id, { dispatchAt: null, quotaUntil: null, stage: "starting", detail: "", renderStartedAt: null, progress: null, workerSeenAt: null, dispatchedAt: started })));
  try { await dispatchRender(due); }
  catch (e) {
    await Promise.all(due.map((i) => patchItem(i.id, { status: "failed", failedAt: new Date().toISOString(), error: ("Couldn't start the render: " + e.message).slice(0, 300) })));
  }
};
export const config = { schedule: "*/5 * * * *" };
