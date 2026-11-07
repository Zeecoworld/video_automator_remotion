import { getStore } from "@netlify/blobs";
import * as C from "./config.mjs";
import { risingFor } from "./trends.mjs";
import { llmJson, anyProvider } from "./llm.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; yt-idea-engine)" };
const defaultSeeds = C.PILLARS.flatMap((p) => p.seeds.map((q) => ({ q, pillar: p.name })));

async function suggest(q) {
  try {
    const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`, { headers: UA });
    const d = await r.json();
    return Array.isArray(d[1]) ? d[1] : [];
  } catch { return []; }
}
async function trendingNow(geo) {
  try {
    const xml = await (await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, { headers: UA })).text();
    return [...xml.matchAll(/<item>\s*<title>([^<]+)<\/title>/g)]
      .map((m) => m[1].replace(/&amp;/g, "&").trim()).filter((t) => C.TECH_FILTER.test(t))
      .map((query) => ({ query, geo }));
  } catch { return []; }
}

const ageText = (iso) => { const h = Math.floor((Date.now() - new Date(iso)) / 36e5); return h < 1 ? "less than an hour ago" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };

// ---- 1. Gather candidates from every source ----
async function gather(seeds, withNow = true) {
  const cand = new Map();
  const add = (c) => { const k = c.query.toLowerCase(); if (!cand.has(k) || cand.get(k).score < c.score) cand.set(k, c); };

  // Google Trends is a core signal: remember the last good result and fall back to it (clearly labelled) if Google blocks us.
  const tr = await risingFor(seeds, { geos: C.GEOS, time: C.TREND_TIME, property: C.TREND_PROPERTY });
  let rows = tr.rows, trends = { status: rows.length ? "live" : "unavailable", provider: tr.provider, fetchedAt: new Date().toISOString(), count: rows.length };
  if (withNow) {
    const kv = getStore("yt-ideas");
    if (rows.length) await kv.setJSON("trends-cache", { savedAt: trends.fetchedAt, provider: tr.provider, rows }).catch(() => {});
    else {
      const c = await kv.get("trends-cache", { type: "json" }).catch(() => null);
      if (c?.rows?.length && Date.now() - new Date(c.savedAt) < 7 * 864e5) { rows = c.rows; trends = { status: "cached", provider: c.provider, fetchedAt: c.savedAt, count: rows.length, ageText: ageText(c.savedAt) }; }
    }
  }
  rows.forEach((r) => add({
    query: r.query, seed: r.seed, pillar: r.pillar,
    score: (r.kind === "rising" ? (r.breakout ? 100 : Math.min(95, 70 + r.value / 100)) : 40) - (trends.status === "cached" ? 10 : 0),
    signal: (r.kind === "rising" ? (r.breakout ? "Breakout on Google Trends" : `Rising on Google Trends (+${r.value}%)`) : "Top related search") + (trends.status === "cached" ? `, saved ${trends.ageText}` : ""),
  }));

  const sugg = await Promise.all(seeds.flatMap((s) => C.MODIFIERS.map(async (m) => ({ s, list: await suggest(s.q + m) }))));
  sugg.forEach(({ s, list }) => list.forEach((q, rank) => add({ query: q, seed: s.q, pillar: s.pillar, score: 55 - rank * 4, signal: "Searched on YouTube" })));

  const now = withNow ? (await Promise.all(C.TRENDING_NOW_GEOS.map(trendingNow))).flat() : [];
  now.forEach((t) => add({ query: t.query, seed: "trending now", pillar: "Trending now", score: 85, signal: `Trending now (${t.geo})` }));

  return { list: [...cand.values()].sort((a, b) => b.score - a.score).slice(0, 80), provider: tr.provider, blocked: tr.blocked, trends };
}

// ---- 2. Gemini picks + writes ideas for THIS channel ----
let aiError = null;
async function gemini(list, focus) {
  aiError = null;
  if (!anyProvider()) { aiError = "GEMINI_API_KEY is not visible to functions. Add it in Netlify env vars (Functions scope) and redeploy."; return null; }
  const { name, positioning, audience, style, avoid } = C.CHANNEL;
  const prompt = `You are the content strategist for the YouTube channel "${name}": ${positioning}.
Audience: ${audience}. Style: ${style}. Avoid: ${avoid.join("; ")}.${focus ? ` The viewer searched for "${focus}", so every idea must be about that topic.` : ""}

Candidate topics from live search data (index. topic | pillar | signal):
${list.map((c, i) => `${i}. ${c.query} | ${c.pillar} | ${c.signal}`).join("\n")}

Choose the ${C.MAX_IDEAS} best for this channel: strong momentum, a clear hands-on demo, and not saturated with generic content. Drop off-topic or meaningless entries. Return ONLY a JSON array of objects:
{"i": index, "title": under 65 chars, curiosity-driven but honest, "hook": the first 10 seconds in one sentence, "thumbnail": max 4 words of thumbnail text, "format": "Long-form tutorial" | "Demo + Short" | "Comparison" | "Build log", "short": a 30-second Shorts angle, "why": one sentence on why this topic now and why it fits the channel}`;
  try {
    const out = await llmJson(prompt, 0.9);
    const arr = Array.isArray(out) ? out : Object.values(out).find(Array.isArray) || [];
    const picks = arr.filter((x) => list[x.i]).map((x) => ({ ...list[x.i], ...x, i: undefined }));
    if (!picks.length) throw new Error("Gemini returned no usable picks");
    return picks;
  } catch (e) { aiError = String(e.message || e).slice(0, 200); console.error("Gemini failed:", aiError); return null; }
}

// ---- 3. Fallback without Gemini ----
const T = [
  (q) => `I Tested ${q} So You Don't Have To`, (q) => `${q}: What Nobody Tells You`,
  (q) => `I Built Something Real With ${q}`, (q) => `Can ${q} Actually Replace Your Workflow?`,
  (q) => `${q} in 10 Minutes: Zero to Working Demo`, (q) => `5 Mistakes Everyone Makes With ${q}`,
];
const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const templated = (list) => list.slice(0, C.MAX_IDEAS).map((c) => ({
  ...c, title: T[hash(c.query) % T.length](cap(c.query)),
  hook: `Show the finished result first, then how you got there with "${c.query}".`,
  format: /tutorial|how|beginner/i.test(c.query) ? "Long-form tutorial" : "Demo + Short",
}));

async function run(seeds, key, focus) {
  const { list, provider, blocked, trends } = await gather(seeds, !focus);
  if (!list.length) return null;
  const ai = await gemini(list, focus);
  const data = { updatedAt: new Date().toISOString(), ai: !!ai?.length, aiError: ai?.length ? null : aiError, provider, blocked, trends, query: focus || null, ideas: ai?.length ? ai : templated(list) };
  await getStore("yt-ideas").setJSON(key, data);
  return data;
}
const slug = (q) => "search-" + q.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
export const refresh = () => run(defaultSeeds, "latest");
export const searchTopic = (q) => run([{ q, pillar: "Search" }], slug(q), q);
export const load = () => getStore("yt-ideas").get("latest", { type: "json" });
export const loadSearch = (q) => getStore("yt-ideas").get(slug(q), { type: "json" });
