// Google Trends data. Order of preference:
//  1) SerpApi (paid, reliable) if SERPAPI_KEY is set
//  2) Unofficial direct calls to Trends' own JSON endpoints (what pytrends did; free, may get 429)
// Google's official Trends API is still an invite-only alpha, so it is not used here.
const BASE = "https://trends.google.com";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cookie = "";

async function warm() {
  try {
    const r = await fetch(`${BASE}/?geo=US`, { headers: UA });
    cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  } catch {}
}
async function get(path) {
  const r = await fetch(BASE + path, { headers: { ...UA, cookie } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text();
  return JSON.parse(t.slice(t.indexOf("{")));
}
const mk = (list, kind) => (list?.rankedKeyword || []).map((k) => ({
  query: k.query, kind, breakout: k.formattedValue === "Breakout", value: Number(k.value) || 0,
}));

async function direct(keyword, geo, time, property) {
  const req = { comparisonItem: [{ keyword, geo, time }], category: 0, property };
  const ex = await get(`/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`);
  const w = ex.widgets?.find((x) => x.id === "RELATED_QUERIES");
  if (!w) return [];
  const rel = await get(`/trends/api/widgetdata/relatedsearches?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(w.request))}&token=${w.token}`);
  const l = rel.default?.rankedList || [];
  return [...mk(l[1], "rising"), ...mk(l[0], "top")];
}

async function serp(keyword, geo, time, property) {
  const u = new URL("https://serpapi.com/search.json");
  Object.entries({ engine: "google_trends", q: keyword, data_type: "RELATED_QUERIES", geo, date: time, api_key: process.env.SERPAPI_KEY })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  if (property) u.searchParams.set("gprop", property);
  const j = await (await fetch(u)).json();
  const m = (a, kind) => (a || []).map((k) => ({ query: k.query, kind, breakout: /breakout/i.test(k.value || ""), value: k.extracted_value || 0 }));
  return [...m(j.related_queries?.rising, "rising"), ...m(j.related_queries?.top, "top")];
}

// seeds: [{q, pillar}] -> [{query, seed, pillar, geo, kind, breakout, value}]
export async function risingFor(seeds, { geos, time, property }) {
  const useSerp = !!process.env.SERPAPI_KEY;
  if (!useSerp) await warm();
  const out = []; let fails = 0;
  for (const geo of geos) for (const s of seeds) {
    if (fails >= 4) break; // blocked: stop hammering
    let rows = null;
    for (let a = 0; a < 2 && !rows; a++) {
      try { rows = await (useSerp ? serp : direct)(s.q, geo, time, property); } catch { if (a === 0) await sleep(1500); }
    }
    if (rows) rows.forEach((r) => out.push({ ...r, seed: s.q, pillar: s.pillar, geo })); else fails++;
    await sleep(useSerp ? 100 : 900);
  }
  return { rows: out, blocked: fails >= 4, provider: useSerp ? "SerpApi" : "Google Trends (direct)" };
}
