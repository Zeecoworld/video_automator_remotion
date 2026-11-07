// Starts render runs on GitHub Actions. Shared by the Queue API (new videos) and dispatch-due (retries and parked jobs).
const CHUNK = 5; // videos per render run; bigger requests start several runs in parallel
export async function dispatchRender(all) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) throw new Error("GITHUB_TOKEN and GITHUB_REPO are not set in Netlify.");
  for (let k = 0; k < all.length; k += CHUNK) {
    const items = all.slice(k, k + CHUNK);
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "yt-idea-engine" },
      body: JSON.stringify({ event_type: "render-videos", client_payload: { payload: JSON.stringify({ items: items.map(({ id, idea }) => ({ id, idea })) }) } }),
    });
    if (r.status !== 204) throw new Error(`GitHub answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}
export const MAX_PER_RUN = CHUNK;

// How long Retry waits before the render starts. Gives free-tier rate limits time to clear. Default 5 minutes (RETRY_DELAY_MIN).
export const retryDelayMs = () => Math.max(0, Number(process.env.RETRY_DELAY_MIN ?? 5) || 0) * 60e3;
