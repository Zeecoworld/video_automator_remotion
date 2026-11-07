import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { getAccessToken } from "./youtube-auth.mjs";
import { xfetch } from "./llm.mjs";

// "strong" makes a read right after a write return the new data (the default can serve stale data for a while, which made the
// Queue look like it ignored a click).
const store = () => getStore({ name: "yt-queue", consistency: "strong" });
// A revision marker changes on EVERY write. The Queue page sends the one it has, and when it still matches, the server answers
// "unchanged" after reading a single small blob instead of listing and reading every video.
const bump = () => store().set("meta-rev", `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).catch(() => {});
export const getRev = async () => (await store().get("meta-rev").catch(() => null)) || "0";
export const getItem = (id) => store().get("item-" + id, { type: "json" });
export async function patchItem(id, patch) {
  const cur = (await getItem(id)) || { id };
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await store().setJSON("item-" + id, next);
  await bump();
  return next;
}
export const putItem = async (item) => { await store().setJSON("item-" + item.id, item); await bump(); };
export const removeItem = async (id) => { await store().delete("item-" + id); await bump(); };
export async function listItems() {
  const s = store(), { blobs } = await s.list({ prefix: "item-" });
  return (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
}

// Saved production data (script, voiceover) lives in its own store so the queue list stays small.
const prodStore = () => getStore("yt-production");
// Raw voice recordings and generated images are only needed to render; drop them once the video exists.
export async function deleteVoice(id) { const s = prodStore(); for (const p of ["seg", "img"]) { const { blobs } = await s.list({ prefix: `${p}-${id}-` }); await Promise.all(blobs.map((b) => s.delete(b.key))); } }
export async function deleteProduction(id) { await deleteVoice(id); await prodStore().delete("prod-" + id); }

const sha1 = (s) => createHash("sha1").update(s).digest("hex");

// Delete the rendered video from Cloudinary once it has been posted.
export async function destroyAsset(publicId) {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !key || !secret) throw new Error("Cloudinary env vars are not set in Netlify.");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sha1(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${secret}`);
  const r = await xfetch(`https://api.cloudinary.com/v1_1/${cloud}/video/destroy`, {
    method: "POST",
    body: new URLSearchParams({ public_id: publicId, timestamp, api_key: key, signature, invalidate: "true" }),
  }, { timeout: 30000, label: "Cloudinary delete" });
  const j = await r.json().catch(() => ({}));
  if (!["ok", "not found"].includes(j.result)) throw new Error("Cloudinary delete failed: " + (j.error?.message || JSON.stringify(j).slice(0, 150)));
}

export async function uploadToYouTube(buf, { title, description, tags }) {
  const accessToken = await getAccessToken();
  const meta = {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 4900), tags: tags.slice(0, 15), categoryId: "28" },
    status: { privacyStatus: process.env.YT_PRIVACY || "public", selfDeclaredMadeForKids: false },
  };
  const init = await xfetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(buf.length) },
    body: JSON.stringify(meta),
  }, { timeout: 60000, label: "YouTube upload start" });
  if (!init.ok) throw new Error("YouTube refused the upload: " + (await init.text()).slice(0, 300));
  const put = await xfetch(init.headers.get("location"), { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: buf }, { timeout: 600000, label: "YouTube upload" });
  const j = await put.json().catch(() => ({}));
  if (!put.ok || !j.id) throw new Error("Upload failed: " + JSON.stringify(j).slice(0, 300));
  return j.id;
}
