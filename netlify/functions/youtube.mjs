import { configured, redirectUri, authUrl, checkState, exchangeCode, loadAuth, saveAuth, clearAuth, revoke } from "../lib/youtube-auth.mjs";

const back = (qs) => new Response(null, { status: 302, headers: { Location: "/queue.html?" + qs, "cache-control": "no-store" } });
const fail = (reason) => back("yt=error&reason=" + encodeURIComponent(reason));

async function callback(url) {
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "You cancelled the Google sign-in." : url.searchParams.get("error"));
  if (!checkState(url.searchParams.get("state"))) return fail("That sign-in link expired or wasn't started here. Click Connect YouTube again.");
  const t = await exchangeCode(url.searchParams.get("code") || "");
  if (!t.access_token) return fail("Google refused the sign-in: " + (t.error_description || t.error || "unknown error"));
  if (!String(t.scope || "").includes("youtube.upload")) { await revoke(t.refresh_token || t.access_token); return fail("The YouTube upload permission wasn't ticked. Connect again and allow it."); }
  if (!t.refresh_token) return fail("Google didn't return a long-lived token. Remove this app at myaccount.google.com/permissions, then connect again.");
  const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  await saveAuth({ refreshToken: t.refresh_token, email: me.email || "", name: me.name || "", picture: me.picture || "", connectedAt: new Date().toISOString(), needsReconnect: false });
  return back("yt=connected");
}

async function status() {
  const rec = await loadAuth();
  const env = !rec && !!process.env.YT_REFRESH_TOKEN;
  return Response.json({
    configured: configured(), redirectUri: redirectUri(),
    connected: !!rec || env, source: rec ? "oauth" : env ? "env" : null,
    email: rec?.email || "", name: rec?.name || "", connectedAt: rec?.connectedAt || null, needsReconnect: !!rec?.needsReconnect,
  }, { headers: { "cache-control": "no-store" } });
}

export default async (req) => {
  const url = new URL(req.url), route = url.pathname.replace(/^\/api\/youtube\/?/, "");
  try {
    if (req.method === "GET" && route === "callback") return await callback(url);
    if (req.method === "GET") return await status();
    const pw = process.env.ADMIN_PASSWORD;
    if (pw && req.headers.get("x-app-password") !== pw) return Response.json({ error: "Wrong password." }, { status: 401 });
    const { action } = await req.json().catch(() => ({}));
    if (action === "connect") {
      if (!configured()) return Response.json({ error: "Add YT_CLIENT_ID and YT_CLIENT_SECRET in Netlify first." }, { status: 400 });
      return Response.json({ url: authUrl() });
    }
    if (action === "disconnect") {
      const rec = await loadAuth();
      if (rec?.refreshToken) await revoke(rec.refreshToken);
      await clearAuth();
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown request." }, { status: 400 });
  } catch (e) {
    return route === "callback" ? fail(String(e.message).slice(0, 150)) : Response.json({ error: String(e.message).slice(0, 200) }, { status: 500 });
  }
};
export const config = { path: ["/api/youtube", "/api/youtube/*"] };
