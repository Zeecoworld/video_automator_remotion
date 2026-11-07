// Every text-generation call goes through here. Provider order: Gemini (preferred) > Groq > OpenRouter > Cerebras > Hugging Face.
// Change the order with LLM_PROVIDERS, e.g. "gemini,groq,huggingface". Providers without a key are skipped.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A network call that can't hang forever and says which service failed ("fetch failed" alone says nothing).
export async function xfetch(url, opts = {}, { timeout = 60000, label = "Request" } = {}) {
  try { return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) }); }
  catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    const why = timedOut ? `timed out after ${timeout < 1000 ? timeout + "ms" : Math.round(timeout / 1000) + "s"}` : `could not connect (${e?.cause?.code || e?.cause?.message || e?.message || "network error"})`;
    throw new Error(`${label} ${why}`);
  }
}
export const isTransient = (m) => /high demand|overloaded|unavailable|resource.?exhausted|quota|rate.?limit|too many requests|try again|temporar|timed out|could not connect|fetch failed|econnreset|etimedout|enotfound|eai_again|socket|\b(429|500|502|503|504)\b/i.test(String(m));
const modelProblem = (m) => /\b404\b|not found|not supported|is not available/i.test(String(m)); // try the next model, not the next provider

const unwrap = (o) => (o && !Array.isArray(o) && Object.keys(o).length === 1 && Array.isArray(o.items) ? o.items : o);
// Tolerant: accepts clean JSON, ```json fences, or JSON surrounded by chatter (open models do this).
export function extractJson(text) {
  const t = String(text).replace(/```json|```/g, "").trim();
  try { return unwrap(JSON.parse(t)); } catch {}
  const i = t.search(/[\[{]/);
  if (i < 0) throw new Error("The AI reply contained no JSON");
  const j = t.lastIndexOf(t[i] === "{" ? "}" : "]");
  if (j <= i) throw new Error("The AI reply contained incomplete JSON");
  return unwrap(JSON.parse(t.slice(i, j + 1)));
}

const chat = async (name, url, key, body, model, timeout) => {
  const r = await xfetch(url, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, { timeout, label: `${name} ${model}` });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${name} ${model} (${r.status}): ${j.error?.message || (typeof j.error === "string" ? j.error : "") || "request failed"}`);
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${name} ${model} returned nothing`);
  return extractJson(text);
};
const SYSTEM = 'You reply with valid JSON only: no explanations and no markdown. If the answer is a list, wrap it as {"items": [...]}.';

async function viaGemini(model, prompt, temperature) {
  const r = await xfetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature } }),
  }, { timeout: 60000, label: `Gemini ${model}` });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini ${model} (${r.status}): ${j.error?.message || "request failed"}`);
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) throw new Error(`Gemini ${model} returned nothing`);
  return extractJson(text);
}
const viaGroq = (model, prompt, temperature) => chat("Groq", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY,
  { model, temperature, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }] }, model, 60000);
// Hugging Face's router has no json_object mode, so ask for JSON in the prompt and parse tolerantly.
const viaHF = (model, prompt, temperature) => chat("Hugging Face", "https://router.huggingface.co/v1/chat/completions", process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY,
  { model, temperature, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }] }, model, 90000);

const viaOpenRouter = (model, prompt, temperature) => chat("OpenRouter", "https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY,
  { model, temperature, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }] }, model, 90000);
const viaCerebras = (model, prompt, temperature) => chat("Cerebras", "https://api.cerebras.ai/v1/chat/completions", process.env.CEREBRAS_API_KEY,
  { model, temperature, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }] }, model, 60000);

// Providers that answered 401/402/403 (bad key, no credits) are skipped for the rest of this process,
// so one broken provider can't slow down or spam every later call.
const dead = new Set();

const PROVIDERS = {
  gemini: { name: "Gemini", on: () => !!process.env.GEMINI_API_KEY, call: viaGemini, hint: "GEMINI_API_KEY",
    models: () => [process.env.GEMINI_MODEL || "gemini-3.8-flash", ...(process.env.GEMINI_FALLBACK_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean)] },
  groq: { name: "Groq", on: () => !!process.env.GROQ_API_KEY, call: viaGroq, hint: "GROQ_API_KEY", models: () => [process.env.GROQ_MODEL || "openai/gpt-oss-120b"] },
  openrouter: { name: "OpenRouter", on: () => !!process.env.OPENROUTER_API_KEY, call: viaOpenRouter, hint: "OPENROUTER_API_KEY",
    models: () => [process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", ...(process.env.OPENROUTER_FALLBACK_MODELS || "").split(",").map((x) => x.trim()).filter(Boolean)] },
  cerebras: { name: "Cerebras", on: () => !!process.env.CEREBRAS_API_KEY, call: viaCerebras, hint: "CEREBRAS_API_KEY", models: () => [process.env.CEREBRAS_MODEL || "llama-3.3-70b"] },
  huggingface: { name: "Hugging Face", on: () => !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY), call: viaHF, hint: "HF_TOKEN", models: () => [process.env.HF_MODEL || "openai/gpt-oss-120b:fastest"] },
};
const order = () => (process.env.LLM_PROVIDERS || "gemini,groq,openrouter,cerebras,huggingface").split(",").map((s) => s.trim().toLowerCase()).filter((k) => PROVIDERS[k]);
export const anyProvider = () => order().some((k) => PROVIDERS[k].on());

// Returns { data, provider, model } so callers can record which provider wrote the content.
export async function llmJsonMeta(prompt, temperature = 0.7) {
  const errors = [], tried = [];
  for (const key of order()) {
    const P = PROVIDERS[key];
    if (!P.on() || dead.has(key)) continue;
    models: for (const model of P.models()) {
      tried.push(`${P.name} ${model}`);
      for (let a = 0; a < 2; a++) {
        try { return { data: await P.call(model, prompt, temperature), provider: P.name, model }; }
        catch (e) {
          errors.push(e.message);
          if (/\((401|402|403)\)/.test(e.message)) dead.add(key);
          if (modelProblem(e.message) && !isTransient(e.message)) continue models; // try this provider's next model
          if (!isTransient(e.message)) break models;                                // bad key / bad request: next provider
          if (a === 0) await sleep(4000);
        }
      }
    }
  }
  if (!tried.length) throw new Error("No AI provider is configured. Set GEMINI_API_KEY (preferred), and optionally GROQ_API_KEY and HF_TOKEN as backups.");
  const missing = order().filter((k) => !PROVIDERS[k].on()).map((k) => PROVIDERS[k].hint);
  const all = [...new Set(errors)].map((m) => m.slice(0, 160)).join(" | ");
  throw new Error(`All AI providers failed: ${all}. Tried: ${tried.join(" > ")}.${missing.length ? ` Not configured as backup: ${missing.join(", ")}.` : ""}`);
}
export const llmJson = async (prompt, temperature) => (await llmJsonMeta(prompt, temperature)).data;
