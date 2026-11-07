// Run by the GitHub workflow when the job fails or is cancelled (for example apt-get or npm install broke before the worker could start).
// No imports and no dependencies on purpose: it must work even when `npm install` did not. It tells Netlify that the videos of this run
// failed, so the Queue shows the reason and a link to the run instead of "rendering" forever. Netlify ignores it for any video that
// already finished or was parked, so it is safe to call after a partly successful run.
const base = String(process.env.NETLIFY_URL || "").trim().replace(/\/+$/, "").replace(/^(?!https?:\/\/)(.+)$/i, "https://$1");
const secret = process.env.WORKER_SECRET || "", runUrl = process.env.RUN_URL || "";
let items = [];
try { items = JSON.parse(process.env.PAYLOAD || "{}").items || []; } catch {}
if (!base || !secret || !items.length) { console.log("Nothing to report (missing NETLIFY_URL, WORKER_SECRET or payload)."); process.exit(0); }
const why = process.env.RUN_RESULT === "cancelled" ? "was cancelled or timed out" : "failed";
for (const it of items) {
  try {
    const r = await fetch(`${base}/.netlify/functions/queue-status`, {
      method: "POST", headers: { "content-type": "application/json", "x-worker-secret": secret }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ id: it.id, status: "failed", crash: true, runUrl, error: `The GitHub render run ${why} before this video finished. Open the run to see why (${runUrl || "GitHub > Actions"}), fix it, then press Retry.`.slice(0, 300) }),
    });
    console.log(`${it.id}: Netlify answered ${r.status}`);
  } catch (e) { console.log(`${it.id}: ${e.message}`); }
}
