import test from "node:test";
import assert from "node:assert/strict";
import { planScenes, normalizeScenes, toList } from "../engine/planner.mjs";
import { parseRetryAfterSec, isDailyQuota, resumeDelaySec, QuotaError } from "../engine/quota.mjs";

const REAL = "You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-3.1-flash-tts Please retry in 13h12m0.353766208s.";

test("reads the retry time from the real error text", () => {
  assert.equal(parseRetryAfterSec(REAL), 13 * 3600 + 12 * 60 + 1);
  assert.equal(parseRetryAfterSec("Please retry in 47.5s."), 48);
  assert.equal(parseRetryAfterSec("Please retry in 2m5s"), 125);
  assert.equal(parseRetryAfterSec('{"retryDelay":"37s"}'), 37);
  assert.equal(parseRetryAfterSec("nothing here"), 0);
});
test("daily vs per-minute", () => {
  assert.equal(isDailyQuota(REAL, parseRetryAfterSec(REAL)), true);
  assert.equal(isDailyQuota("Too many requests", 30), false);
  assert.equal(isDailyQuota("requests per day limit exceeded", 0), true);
});
test("resume delay is clamped", () => {
  assert.equal(resumeDelaySec(10), 300);
  assert.equal(resumeDelaySec(47521), 47581);
  assert.equal(resumeDelaySec(99 * 3600), 26 * 3600);
});
test("planner survives every malformed shape that models return", () => {
  const sc = [{ narration: "AI video tools are changing everything fast", emphasis: "ai, video", keywords: "ai", items: "a, b" }, { narration: "Second scene about code and apps", emphasis: { a: "code" }, hashtags: "x" }];
  for (const raw of [sc, { scenes: sc }, { items: sc }, { 1: sc[0], 2: sc[1] }, JSON.stringify({ scenes: sc })]) assert.equal(planScenes(raw, "T").length, 2);
  const odd = [{ narration: "one two three four", emphasis: 5, keywords: [{ text: "ai" }], items: null, headline: { a: 1 }, stat: "10" }, { narration: "five six seven", emphasis: true }];
  assert.equal(planScenes(odd, "T").length, 2);
  assert.throws(() => planScenes({ foo: "bar" }, "T"), /at least 2 scenes/);
  assert.deepEqual(toList("#a, b;c"), ["#a", "b", "c"]);
  assert.deepEqual(toList({ x: "a", y: "b" }), ["a", "b"]);
  assert.deepEqual(normalizeScenes(null), []);
});
