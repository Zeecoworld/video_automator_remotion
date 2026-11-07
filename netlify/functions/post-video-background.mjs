import { getItem, patchItem, destroyAsset, uploadToYouTube, deleteProduction } from "../lib/queue.mjs";
import { xfetch } from "../lib/llm.mjs";
const tags = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]+/) : []).map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean);
// Background function (up to 15 min): download from Cloudinary, post to YouTube, then delete the Cloudinary copy.
export default async (req) => {
  if (!process.env.WORKER_SECRET || req.headers.get("x-worker-secret") !== process.env.WORKER_SECRET) return;
  const { id } = await req.json().catch(() => ({}));
  const it = id && (await getItem(id));
  if (!it || it.status !== "ready" || !it.cloudinary) return;
  await patchItem(id, { status: "posting", postingAt: new Date().toISOString() });
  try {
    const v = await xfetch(it.cloudinary.url, {}, { timeout: 180000, label: "Downloading the video from Cloudinary" });
    if (!v.ok) throw new Error("Couldn't download the video from Cloudinary (" + v.status + ").");
    const youtubeId = await uploadToYouTube(Buffer.from(await v.arrayBuffer()), {
      title: it.idea.title,
      description: `${it.caption || ""}\n\n${tags(it.hashtags).map((h) => "#" + h).join(" ")} #Shorts`.trim(),
      tags: tags(it.hashtags),
    });
    await patchItem(id, { status: "posted", youtubeId, postedAt: new Date().toISOString(), error: null });
    await deleteProduction(id).catch(() => {}); // posted: the saved script and voice are no longer needed
    try { await destroyAsset(it.cloudinary.publicId); await patchItem(id, { cloudinary: null, cloudinaryDeleted: true }); }
    catch (e) { await patchItem(id, { cleanupError: String(e.message).slice(0, 200) }); }
  } catch (e) {
    await patchItem(id, { status: "failed", failedAt: new Date().toISOString(), error: String(e.message).slice(0, 300) });
  }
};
