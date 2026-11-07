import { load, loadSearch } from "../lib/generate.mjs";
export default async (req) => {
  const q = new URL(req.url).searchParams.get("q");
  const data = (q ? await loadSearch(q.slice(0, 80)) : await load()) || { updatedAt: null, ideas: [] };
  return Response.json(data, { headers: { "cache-control": "no-store" } });
};
