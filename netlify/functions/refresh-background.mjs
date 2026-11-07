// Background function: may run up to 15 minutes, returns 202 immediately.
import { load, refresh } from "../lib/generate.mjs";
export default async (req) => {
  const force = new URL(req.url).searchParams.get("force") === "1";
  const cur = await load();
  if (!force && cur && Date.now() - new Date(cur.updatedAt) < 10 * 60 * 1000) return; // already fresh
  await refresh();
};
