// Background function: live search for any topic. Cached for 1 hour per topic.
import { searchTopic, loadSearch } from "../lib/generate.mjs";
export default async (req) => {
  const { q } = await req.json().catch(() => ({}));
  const topic = String(q || "").trim().slice(0, 80);
  if (!topic) return;
  const cur = await loadSearch(topic);
  if (cur && Date.now() - new Date(cur.updatedAt) < 60 * 60 * 1000) return;
  await searchTopic(topic);
};
