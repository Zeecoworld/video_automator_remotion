// Animated UI mockups: chat, code editor, workflow, dashboard. beats = scene-local reveal times.
import { h, FONT, prog, easeOut, pop, lerp, typed } from "./util.js";

const frameStyle = { position: "absolute", left: 90, top: 390, width: 900, height: 820, borderRadius: 36, background: "rgba(10,12,28,0.88)", border: "2px solid rgba(255,255,255,0.2)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", overflow: "hidden" };
const TITLES = { chat: "Assistant", editor: "main.js", workflow: "Workflow", dashboard: "Dashboard" };

function chat(ui, t, b, A) {
  const u = pop(t, b[0]), r = pop(t, b[1]), reply = typed(ui.reply, t, b[1] + 0.2, 38);
  return h("div", { style: { padding: 30 } },
    h("div", { style: { marginLeft: "auto", maxWidth: 620, padding: "22px 28px", borderRadius: 30, background: "rgba(255,255,255,0.16)", fontSize: 40, opacity: u, transform: `translateY(${(1 - u) * 40}px)` } }, ui.user),
    t >= b[0] + 0.5 && t < b[1] + 0.2 ? h("div", { style: { marginTop: 30, display: "flex", gap: 10 } }, ...[0, 1, 2].map((i) => h("div", { key: i, style: { width: 16, height: 16, borderRadius: 8, background: "white", opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 6 + i)) } }))) : null,
    t >= b[1] ? h("div", { style: { marginTop: 30, maxWidth: 700, padding: "24px 30px", borderRadius: 30, background: A, color: "#0d1024", fontSize: 38, fontWeight: 700, lineHeight: 1.3, opacity: r, minHeight: 80 } }, reply + (reply.length < ui.reply.length ? "▌" : "")) : null);
}
const colorLine = (line, A) => {
  const parts = line.split(/("[^"]*"|\b(?:const|await|import|from|return|def|async|function|print)\b|\b\d+\b)/g);
  return parts.map((p, i) => h("span", { key: i, style: { color: /^"/.test(p) ? "#ffd54f" : /^(const|await|import|from|return|def|async|function|print)$/.test(p) ? "#ff80ab" : /^\d+$/.test(p) ? "#82b1ff" : "white" } }, p));
};
function editor(ui, t, b, A) {
  const total = ui.code.join("\n"), count = Math.floor(Math.max(0, t - b[0]) * 26), shown = total.slice(0, count).split("\n");
  return h("div", { style: { padding: "28px 30px", fontFamily: '"DejaVu Sans Mono", monospace', fontSize: 38, lineHeight: 1.55 } },
    ...shown.map((l, i) => h("div", { key: i, style: { display: "flex", gap: 24, whiteSpace: "pre" } }, h("span", { style: { color: "rgba(255,255,255,0.3)", width: 36, textAlign: "right" } }, i + 1), h("span", null, ...colorLine(l, A), i === shown.length - 1 && count < total.length ? "▌" : ""))),
    t >= b[3] ? h("div", { style: { marginTop: 40, display: "inline-block", padding: "14px 28px", borderRadius: 18, background: A, color: "#0d1024", fontWeight: 800, fontSize: 36, transform: `scale(${pop(t, b[3])})` } }, "✓ Done") : null);
}
function workflow(ui, t, b, A) {
  const ys = [60, 240, 420, 600], conns = [];
  const nodes = ui.nodes.map((label, k) => {
    const p = pop(t, b[k]);
    if (k < 3) { const cp = easeOut(prog(t, b[k + 1] - 0.3, 0.4)); conns.push(h("line", { key: "c" + k, x1: 420, y1: ys[k] + 100, x2: 420, y2: ys[k + 1], stroke: A, strokeWidth: 8, strokeLinecap: "round", pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - cp })); }
    return h("div", { key: k, style: { position: "absolute", left: 110, top: ys[k], width: 620, height: 100, borderRadius: 26, background: k === 3 ? A : "rgba(255,255,255,0.14)", color: k === 3 ? "#0d1024" : "white", display: "flex", alignItems: "center", gap: 24, padding: "0 30px", fontSize: 40, fontWeight: 700, opacity: p, transform: `scale(${0.7 + 0.3 * p})` } },
      h("div", { style: { width: 56, height: 56, borderRadius: 28, background: k === 3 ? "#0d1024" : A, color: k === 3 ? A : "#0d1024", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800 } }, k + 1), label);
  });
  const dot = (t * 0.6) % 1;
  return h("div", { style: { position: "relative", width: 840, height: 740 } },
    h("svg", { width: 840, height: 740, style: { position: "absolute", left: 0, top: 0 } }, ...conns),
    ...nodes,
    t > b[3] + 0.4 ? h("div", { style: { position: "absolute", left: 410, top: 100 + dot * 500, width: 20, height: 20, borderRadius: 10, background: "white", boxShadow: `0 0 20px ${A}` } }) : null);
}
function dashboard(ui, t, b, A) {
  const cards = ui.labels.map((label, k) => {
    const p = pop(t, b[k]);
    const pts = [0, 1, 2, 3, 4, 5].map((i) => `${i * 36},${70 - (14 + i * 7 + 9 * Math.sin(i * 1.7 + k)) * easeOut(prog(t, b[k] + 0.1 + i * 0.05, 0.5))}`).join(" ");
    return h("div", { key: k, style: { width: 250, height: 190, borderRadius: 24, background: "rgba(255,255,255,0.12)", padding: 22, opacity: p, transform: `translateY(${(1 - p) * 40}px)` } },
      h("div", { style: { fontSize: 30, fontWeight: 700, opacity: 0.85 } }, label), h("svg", { width: 190, height: 90, style: { marginTop: 16 } }, h("polyline", { points: pts, fill: "none", stroke: A, strokeWidth: 6, strokeLinecap: "round", strokeLinejoin: "round" })));
  });
  const bars = [0.4, 0.65, 0.5, 0.85, 0.7, 1, 0.8].map((v, i) => h("div", { key: i, style: { flex: 1, borderRadius: 14, background: i === 5 ? A : "rgba(255,255,255,0.3)", height: 360 * v * easeOut(prog(t, b[3] + i * 0.08, 0.5)) } }));
  return h("div", { style: { padding: 30 } }, h("div", { style: { display: "flex", gap: 20 } }, ...cards), h("div", { style: { marginTop: 30, height: 400, display: "flex", alignItems: "flex-end", gap: 16, padding: 24, borderRadius: 24, background: "rgba(255,255,255,0.08)" } }, ...bars));
}
const KINDS = { chat, editor, workflow, dashboard };

export function Mockup({ ui, t, beats, accent }) {
  const open = pop(t, 0, 0.5), body = (KINDS[ui.kind] || workflow)(ui, t, beats, accent);
  return h("div", { style: { ...frameStyle, opacity: open, transform: `perspective(2400px) rotateY(${lerp(-42, -9, open) + 4 * Math.sin(t * 0.9)}deg) rotateX(${lerp(16, 5, open)}deg) scale(${0.88 + 0.12 * open}) translateY(${(1 - open) * 60}px)`, fontFamily: FONT, color: "white" } },
    h("div", { style: { height: 70, display: "flex", alignItems: "center", gap: 12, padding: "0 28px", background: "rgba(255,255,255,0.08)" } },
      ...[0, 1, 2].map((i) => h("div", { key: i, style: { width: 18, height: 18, borderRadius: 9, background: ["#ff5f57", "#febc2e", "#28c840"][i] } })),
      h("div", { style: { marginLeft: 20, fontSize: 28, opacity: 0.7 } }, TITLES[ui.kind] || "App")),
    body,
    h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: `linear-gradient(115deg, transparent ${((t * 25) % 140) - 30}%, rgba(255,255,255,0.1) ${((t * 25) % 140) - 15}%, transparent ${(t * 25) % 140}%)` } }));
}
