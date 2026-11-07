import { randomUUID } from "node:crypto";
import { getItem, patchItem, putItem, removeItem, listItems, getRev, destroyAsset, deleteProduction } from "../lib/queue.mjs";
import { dispatchRender, retryDelayMs } from "../lib/dispatch.mjs";

const clip = (v, n) => String(v ?? "").slice(0, n);
const bg = (id) => fetch(`${process.env.URL}/.netlify/functions/post-video-background`, { method: "POST", headers: { "x-worker-secret": process.env.WORKER_SECRET || "", "content-type": "application/json" }, body: JSON.stringify({ id }) });

// When a retry or restart is allowed to start: after the retry delay, and not before any AI quota reset the worker reported.
const startAt = (it) => Math.max(Date.now() + retryDelayMs(), it.quotaUntil ? Date.parse(it.quotaUntil) || 0 : 0);
const pushPublish = (it, at) => new Date(Math.max(Date.parse(it.publishAt) || 0, at + 45 * 60 * 1000)).toISOString(); // never post before the video can exist
const reset = { error: null, renderStartedAt: null, readyAt: null, failedAt: null, failedStage: null, progress: null, workerSeenAt: null, dispatchedAt: null, runUrl: null };

export default async (req) => {
  const m = req.method, url = new URL(req.url);
  if (m === "GET") {
    const rev = await getRev(), had = url.searchParams.get("rev"); // read BEFORE listing: a write during the listing then shows up as a new rev next time
    if (had !== null && had === rev) return Response.json({ unchanged: true, rev }, { headers: { "cache-control": "no-store" } });
    const items = (await listItems()).sort((a, b) => new Date(a.publishAt) - new Date(b.publishAt));
    return Response.json({ items, rev }, { headers: { "cache-control": "no-store" } });
  }
  const pw = process.env.ADMIN_PASSWORD;
  if (pw && req.headers.get("x-app-password") !== pw) return Response.json({ error: "Wrong password." }, { status: 401 });
  const body = m === "DELETE" ? {} : await req.json().catch(() => ({}));
  const err = (e, s = 400) => Response.json({ error: e }, { status: s });

  if (m === "POST" && Array.isArray(body.ideas)) {
    if (!body.ideas.length || body.ideas.length > 20) return err("Pick 1 to 20 ideas at a time.");
    const times = Array.isArray(body.times) && body.times.length === body.ideas.length ? body.times.map((t) => new Date(t).getTime()) : null;
    const first = new Date(body.first).getTime(), gap = Math.min(168, Math.max(1, +body.gap || 24));
    if (times ? times.some(isNaN) : isNaN(first)) return err("Pick valid post times.");
    const earliest = Date.now() + 15 * 60 * 1000, now = new Date().toISOString();
    const items = body.ideas.map((idea, n) => ({ i: idea, n })).filter(({ i }) => i?.title).map(({ i, n }) => ({
      id: randomUUID().slice(0, 8), status: "rendering", createdAt: now, updatedAt: now, dispatchedAt: now,
      publishAt: new Date(Math.max(times ? times[n] : first + n * gap * 36e5, earliest)).toISOString(),
      idea: { title: clip(i.title, 100), hook: clip(i.hook, 300), short: clip(i.short, 300), why: clip(i.why, 300), query: clip(i.query, 100), format: clip(i.format, 40), thumbnail: clip(i.thumbnail, 60), pillar: clip(i.pillar, 60) },
    }));
    if (!items.length) return err("No valid ideas.");
    try { await dispatchRender(items); } catch (e) { return err(e.message, 502); }
    await Promise.all(items.map(putItem));
    return Response.json({ ok: true, queued: items.length });
  }

  const id = body.id || url.searchParams.get("id");
  const it = id && (await getItem(id));
  if (!it) return err("Video not found.", 404);

  if (m === "DELETE") {
    if (it.status === "posting") return err("It is being posted right now.");
    if (it.cloudinary?.publicId) await destroyAsset(it.cloudinary.publicId).catch(() => {});
    await deleteProduction(id).catch(() => {});
    await removeItem(id);
    return Response.json({ ok: true });
  }
  if (m === "PATCH") {
    const t = new Date(body.publishAt).getTime();
    if (isNaN(t) || ["posted", "posting"].includes(it.status)) return err("Can't change this one.");
    return Response.json({ ok: true, item: await patchItem(id, { publishAt: new Date(t).toISOString() }) });
  }
  if (m === "POST" && body.action === "postnow") {
    if (it.status !== "ready") return err("Only ready videos can be posted.");
    const item = await patchItem(id, { publishAt: new Date().toISOString() });
    await bg(id);
    return Response.json({ ok: true, item });
  }
  if (m === "POST" && body.action === "retry") {
    if (it.status !== "failed") return err("Only failed videos can be retried.");
    if (it.cloudinary) return Response.json({ ok: true, item: await patchItem(id, { status: "ready", error: null, publishAt: new Date(Date.now() + 60e3).toISOString() }) }); // already rendered: only posting failed
    // Rendering does NOT start right away: it is scheduled a few minutes ahead (RETRY_DELAY_MIN, default 5) so free-tier rate limits can clear.
    // dispatch-due starts it, continuing from the saved script, voice and images.
    const at = startAt(it);
    return Response.json({ ok: true, item: await patchItem(id, { ...reset, status: "rendering", stage: "waiting", detail: "Retry scheduled", dispatchAt: new Date(at).toISOString(), publishAt: pushPublish(it, at) }) });
  }
  if (m === "POST" && body.action === "restart") {
    if (it.status !== "failed" || it.cloudinary) return err("Only failed renders can start over.");
    await deleteProduction(id).catch(() => {});
    const at = startAt(it);
    return Response.json({ ok: true, item: await patchItem(id, { ...reset, status: "rendering", stage: "waiting", detail: "Restart scheduled", saved: [], quotaUntil: null, dispatchAt: new Date(at).toISOString(), publishAt: pushPublish(it, at) }) });
  }
  if (m === "POST" && body.action === "startnow") {
    // Skip the wait on a scheduled retry or a parked job.
    if (it.status !== "rendering" || !it.dispatchAt) return err("Nothing is waiting to start.");
    const claimed = await patchItem(id, { dispatchAt: null, quotaUntil: null, stage: "starting", detail: "", renderStartedAt: null, progress: null, workerSeenAt: null, dispatchedAt: new Date().toISOString() });
    try { await dispatchRender([it]); } catch (e) { return Response.json({ error: e.message, item: await patchItem(id, { status: "failed", failedAt: new Date().toISOString(), error: ("Couldn't start the render: " + e.message).slice(0, 300) }) }, { status: 502 }); }
    return Response.json({ ok: true, item: claimed });
  }
  return err("Unknown request.");
};
