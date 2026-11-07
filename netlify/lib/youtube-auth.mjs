// YouTube OAuth: signed state, encrypted token storage, access-token refresh.
import { getStore } from "@netlify/blobs";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SCOPES = "https://www.googleapis.com/auth/youtube.upload openid email"; // upload only, plus the email shown on the page
const store = () => getStore("yt-auth");
const secret = () => {
  const s = process.env.TOKEN_SECRET || process.env.WORKER_SECRET;
  if (!s) throw new Error("Set WORKER_SECRET (or TOKEN_SECRET) in Netlify first.");
  return s;
};
const key = () => createHash("sha256").update("yt-oauth-key:" + secret()).digest();
export const siteUrl = () => (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
export const redirectUri = () => siteUrl() + "/api/youtube/callback";
export const configured = () => !!(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET);

// AES-256-GCM so the refresh token is never stored in plain text.
export function seal(obj) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
}
export function unseal(s) {
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(s.iv, "base64"));
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(s.data, "base64")), d.final()]).toString("utf8"));
}

// "state" proves the sign-in was started by an authorised request and has not expired (10 minutes).
const sign = (p) => createHmac("sha256", key()).update(p).digest("hex");
export function makeState() { const p = `${Date.now().toString(36)}.${randomBytes(12).toString("hex")}`; return `${p}.${sign(p)}`; }
export function checkState(st) {
  const [ts, nonce, sig] = String(st || "").split(".");
  if (!ts || !nonce || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(`${ts}.${nonce}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const age = Date.now() - parseInt(ts, 36);
  return age >= 0 && age < 10 * 60 * 1000;
}
export const authUrl = () => "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: process.env.YT_CLIENT_ID || "", redirect_uri: redirectUri(), response_type: "code", scope: SCOPES,
  access_type: "offline", prompt: "consent", state: makeState(),
});

export async function loadAuth() {
  const raw = await store().get("google", { type: "json" });
  if (!raw) return null;
  try { return unseal(raw); } catch { return null; } // unreadable if WORKER_SECRET / TOKEN_SECRET changed: reconnect
}
export const saveAuth = (rec) => store().setJSON("google", seal(rec));
export const clearAuth = () => store().delete("google");

const form = (o) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o) });
export const exchangeCode = (code) => fetch("https://oauth2.googleapis.com/token", form({ code, client_id: process.env.YT_CLIENT_ID, client_secret: process.env.YT_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: "authorization_code" })).then((r) => r.json());
export const revoke = (token) => fetch("https://oauth2.googleapis.com/revoke", form({ token })).catch(() => {});

export async function getAccessToken() {
  const rec = await loadAuth();
  const refresh = rec?.refreshToken || process.env.YT_REFRESH_TOKEN; // env var is the older, manual way
  if (!refresh) throw new Error("YouTube isn't connected. Open the Queue tab and click Connect YouTube.");
  const j = await fetch("https://oauth2.googleapis.com/token", form({ client_id: process.env.YT_CLIENT_ID || "", client_secret: process.env.YT_CLIENT_SECRET || "", refresh_token: refresh, grant_type: "refresh_token" })).then((r) => r.json());
  if (j.access_token) return j.access_token;
  if (j.error === "invalid_grant" && rec) {
    await saveAuth({ ...rec, needsReconnect: true });
    throw new Error("YouTube access expired or was revoked. Click Reconnect YouTube on the Queue tab, then Retry.");
  }
  throw new Error("Google token error: " + (j.error_description || j.error));
}
