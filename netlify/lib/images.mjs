// Stable Diffusion image generation. Provider order: Stability AI (official API) > Hugging Face (hosted Stable Diffusion).
// Images are optional: if every provider fails, the scene simply keeps its code-drawn graphics.
import { xfetch, isTransient } from "./llm.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const NEGATIVE = "text, letters, words, watermark, logo, signature, blurry, low quality, distorted, deformed, ugly, nsfw";

// Identify the real image type from its first bytes (providers differ, and error pages can arrive with a 200).
export function sniff(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return { ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png" };
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return { ext: "webp" };
  return null;
}
const errText = async (r) => {
  const t = await r.text().catch(() => "");
  try { const j = JSON.parse(t); return String(j.errors?.join?.("; ") || j.error?.message || j.error || j.message || t).slice(0, 200); } catch { return t.slice(0, 200); }
};

async function viaStability(prompt) {
  const model = process.env.STABILITY_MODEL || "core"; // core | ultra | sd3.5-large | sd3.5-medium | sd3.5-large-turbo ...
  const path = model === "core" || model === "ultra" ? model : "sd3";
  const fd = new FormData();
  fd.append("prompt", prompt); fd.append("negative_prompt", NEGATIVE); fd.append("aspect_ratio", "9:16"); fd.append("output_format", "jpeg");
  if (path === "sd3") fd.append("model", model);
  const r = await xfetch(`https://api.stability.ai/v2beta/stable-image/generate/${path}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.STABILITY_API_KEY}`, Accept: "image/*" }, body: fd }, { timeout: 90000, label: "Stability AI image" });
  if (!r.ok) throw new Error(`Stability AI (${r.status}): ${await errText(r) || "request failed"}${r.status === 402 ? " (out of credits)" : ""}`);
  if (/CONTENT_FILTERED/i.test(r.headers.get("finish-reason") || "")) throw new Error("Stability AI blocked this prompt with its content filter");
  return Buffer.from(await r.arrayBuffer());
}
// Hugging Face's router: raw image bytes come back for a Stable Diffusion model. 768x1344 is an SDXL-friendly 9:16 size.
async function viaHF(prompt) {
  const model = process.env.HF_IMAGE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0";
  const r = await xfetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY}`, "content-type": "application/json", Accept: "image/*" },
    body: JSON.stringify({ inputs: prompt, parameters: { negative_prompt: NEGATIVE, width: 768, height: 1344 } }),
  }, { timeout: 120000, label: `Hugging Face image ${model}` });
  if (!r.ok) throw new Error(`Hugging Face image (${r.status}): ${await errText(r) || "request failed"}`);
  return Buffer.from(await r.arrayBuffer());
}

const PROVIDERS = {
  stability: { name: "Stability AI", on: () => !!process.env.STABILITY_API_KEY, call: viaStability, model: () => process.env.STABILITY_MODEL || "core" },
  huggingface: { name: "Hugging Face", on: () => !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY), call: viaHF, model: () => process.env.HF_IMAGE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0" },
};
const order = () => (process.env.IMAGE_PROVIDERS || "stability,huggingface").split(",").map((s) => s.trim().toLowerCase()).filter((k) => PROVIDERS[k]);
export const imagesEnabled = () => process.env.IMAGES !== "off" && order().some((k) => PROVIDERS[k].on());

// Returns { buffer, ext, provider, model }. Throws if no provider could make an image.
export async function generateImage(prompt) {
  const errors = [], tried = [];
  for (const key of order()) {
    const P = PROVIDERS[key];
    if (!P.on()) continue;
    tried.push(P.name);
    for (let a = 0; a < 2; a++) {
      try {
        const buffer = await P.call(prompt), type = sniff(buffer);
        if (!type) throw new Error(`${P.name} did not return an image`);
        return { buffer, ext: type.ext, provider: P.name, model: P.model() };
      } catch (e) {
        errors.push(e.message);
        if (!isTransient(e.message)) break; // blocked prompt, bad key, no credits: try the next provider instead of repeating
        if (a === 0) await sleep(3000);
      }
    }
  }
  if (!tried.length) throw new Error("No image provider is configured (set STABILITY_API_KEY and/or HF_TOKEN).");
  throw new Error(`${errors.at(-1)}. Tried: ${tried.join(" > ")}.`);
}
