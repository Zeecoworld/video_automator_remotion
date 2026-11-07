import { getStore } from "@netlify/blobs";
// Saved production data (AI script + per-scene voiceover) so a failed render resumes instead of starting over.
// Only the render worker may use this (x-worker-secret).
const store = () => getStore("yt-production");
export default async (req) => {
  const secret = process.env.WORKER_SECRET;
  if (!secret || req.headers.get("x-worker-secret") !== secret) return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url), id = u.searchParams.get("id"), img = u.searchParams.get("img");
  const seg = img !== null ? img : u.searchParams.get("seg"), prefix = img !== null ? "img" : "seg"; // voice recordings and generated scene images
  if (!/^[a-z0-9-]{4,40}$/i.test(id || "")) return new Response("Bad id", { status: 400 });
  const s = store();
  if (seg !== null) {
    if (!/^\d{1,2}$/.test(seg)) return new Response("Bad segment", { status: 400 });
    const key = `${prefix}-${id}-${seg}`;
    if (req.method === "PUT") { await s.set(key, await req.arrayBuffer()); return Response.json({ ok: true }); }
    if (req.method === "GET") { const b = await s.get(key, { type: "arrayBuffer" }); return b ? new Response(b, { headers: { "content-type": "application/octet-stream" } }) : new Response("Not found", { status: 404 }); }
    return new Response("Method not allowed", { status: 405 });
  }
  const key = `prod-${id}`;
  if (req.method === "GET") return Response.json((await s.get(key, { type: "json" })) || {}, { headers: { "cache-control": "no-store" } });
  if (req.method === "POST") {
    const { patch } = await req.json().catch(() => ({}));
    if (!patch || typeof patch !== "object") return new Response("Bad patch", { status: 400 });
    const next = { ...((await s.get(key, { type: "json" })) || {}), ...patch, updatedAt: new Date().toISOString() };
    await s.setJSON(key, next);
    return Response.json({ ok: true });
  }
  return new Response("Method not allowed", { status: 405 });
};
