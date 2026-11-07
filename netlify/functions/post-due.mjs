import { listItems, patchItem } from "../lib/queue.mjs";
// Runs every 15 minutes: posts videos whose scheduled time has arrived.
export default async () => {
  const now = Date.now();
  let started = 0;
  for (const it of await listItems()) {
    if (it.status === "posting" && now - new Date(it.updatedAt) > 30 * 60 * 1000) await patchItem(it.id, { status: "failed", failedAt: new Date().toISOString(), error: "Posting timed out. Use Retry." });
    if (it.status === "ready" && it.cloudinary && new Date(it.publishAt) <= now && started < 3) {
      started++;
      await fetch(`${process.env.URL}/.netlify/functions/post-video-background`, { method: "POST", headers: { "x-worker-secret": process.env.WORKER_SECRET || "", "content-type": "application/json" }, body: JSON.stringify({ id: it.id }) });
    }
  }
};
export const config = { schedule: "*/15 * * * *" };
