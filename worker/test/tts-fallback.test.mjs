import test from "node:test";
import assert from "node:assert/strict";
import { QuotaError } from "../engine/quota.mjs";
process.env.GEMINI_API_KEY = "k";
const { tts, voiceScenes } = await import("../run.mjs");

const pcm = Buffer.alloc(48000).toString("base64");
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: pcm } }] } }] }), { status: 200 });
const quota = (msg) => new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: msg } }), { status: 429 });
const DAILY = "You exceeded your current quota. Generate content requests per day limit exceeded on Free Tier. Please retry in 13h12m0.35s.";

test("falls over to the next voice model when the first one's daily quota is gone", async () => {
  const seen = [];
  globalThis.fetch = async (url) => { const m = String(url).match(/models\/([^:]+):/)[1]; seen.push(m); return m.includes("3.1") ? quota(DAILY) : ok(); };
  const buf = await tts("hello");
  assert.ok(buf.length > 0);
  assert.deepEqual(seen, ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]);
  seen.length = 0; await tts("again");           // the exhausted model is remembered and not asked again
  assert.deepEqual(seen, ["gemini-2.5-flash-preview-tts"]);
});

test("when every model is out of daily quota the job is parked, not slept on", async () => {
  process.env.GEMINI_TTS_MODEL = "m1"; process.env.GEMINI_TTS_FALLBACK_MODELS = "m2";
  globalThis.fetch = async () => quota(DAILY);
  const t0 = Date.now();
  await assert.rejects(voiceScenes([{ i: 0, narration: "hi there" }], {}, 0), (e) => e instanceof QuotaError && e.daily && e.retryAfterSec > 12 * 3600);
  assert.ok(Date.now() - t0 < 2000, "must fail fast instead of waiting");
});
