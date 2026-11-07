import { Img, staticFile } from "remotion";
import { h, FONT, clamp, prog, easeOut, easeBack, lerp, pop, clean, Cube, extrude, rand, Burst } from "./util.js";
import { Motif } from "./motifs.js";
import { Mockup } from "./ui.js";

export function Background({ frame, theme, idx, image }) {
  const a = 160 + idx * 40 + frame * 0.15;
  return h("div", { style: { position: "absolute", inset: 0, background: `linear-gradient(${a}deg, ${theme.bg1}, ${theme.bg2})` } },
    // generated scene image (Stable Diffusion): slow drift, then a dark veil so text stays readable
    image ? h(Img, { src: staticFile(image), style: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.1 + 0.05 * Math.sin(frame / 150)}) translate(${Math.sin(frame / 170 + idx) * 18}px, ${Math.cos(frame / 210 + idx) * 26}px)` } }) : null,
    image ? h("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,10,24,0.55), rgba(8,10,24,0.82))" } }) : null,
    ...[0, 1].map((i) => h("div", { key: i, style: { position: "absolute", width: 900, height: 900, borderRadius: "50%", filter: "blur(120px)", opacity: 0.32, background: i ? theme.accent : "#7c4dff", left: 540 + Math.sin(frame / 70 + i * 3 + idx) * 380 - 450, top: 900 + Math.cos(frame / 90 + i * 2) * 600 - 450 } })),
    // parallax dust: far particles are small, dim, blurred and slow; near ones are big and fast
    ...Array.from({ length: 26 }, (_, i) => { const z = rand(i, 1), sp = 14 + z * 70, sz = 4 + z * 12; return h("div", { key: "p" + i, style: { position: "absolute", left: rand(i, 2) * 1080, top: ((rand(i, 3) * 2000 - (frame / 30) * sp) % 2000 + 2000) % 2000 - 40, width: sz, height: sz, borderRadius: "50%", background: i % 4 === 0 ? theme.accent : "white", opacity: 0.12 + 0.5 * z, filter: z < 0.3 ? "blur(2px)" : "none" } }); }),
    // depth: three slowly tumbling wireframe cubes at different distances
    ...[0, 1, 2].map((i) => h("div", { key: "c" + i, style: { position: "absolute", width: 0, height: 0, left: 130 + i * 420 + Math.sin(frame / 80 + i + idx) * 60, top: 400 + i * 560 + Math.cos(frame / 100 + i * 2) * 80 } },
      h(Cube, { size: [120, 190, 90][i], t: frame / 30 + i * 2 + idx, accent: theme.accent, spin: [28, -20, 34][i], fill: "rgba(255,255,255,0.03)", border: 3, opacity: 0.45, extra: `translateZ(${[-100, 160, -260][i]}px)` }))));
}

export function Captions({ words, t, accent, top = 1400 }) {
  const ph = []; let cur = [];
  for (const w of words) { if (cur.length && (cur.length >= 5 || w.start - cur[cur.length - 1].end > 0.5)) { ph.push(cur); cur = []; } cur.push(w); }
  if (cur.length) ph.push(cur);
  const act = [...ph].reverse().find((p) => t >= p[0].start - 0.05);
  if (!act) return null;
  return h("div", { style: { position: "absolute", left: 60, right: 60, top, textAlign: "center", fontSize: 70, fontWeight: 800, lineHeight: 1.2 } },
    ...act.map((w, i) => { const on = t >= w.start && t < w.end + 0.05; return h("span", { key: i, style: { display: "inline-block", margin: "0 11px", color: on ? accent : "white", transform: `scale(${on ? 1.1 : 1})`, WebkitTextStroke: "10px #000", paintOrder: "stroke fill", textShadow: "0 4px 14px rgba(0,0,0,.6)" } }, w.w); }));
}

const headline = (text, t, size = 78, top = 230) => text ? h("div", { style: { position: "absolute", top, left: 70, right: 70, textAlign: "center", fontSize: size, fontWeight: 800, lineHeight: 1.1, opacity: pop(t, 0.05), transform: `perspective(1400px) rotateX(8deg) rotateY(${-9 + 7 * Math.sin(t * 0.9)}deg) translateY(${(1 - pop(t, 0.05)) * 40}px)`, textShadow: extrude(7) } }, text) : null;

function Kinetic({ s, t, theme }) {
  const n = s.words.length, size = n <= 10 ? 118 : n <= 16 ? 96 : n <= 22 ? 80 : 68, em = new Set(s.emphasis);
  return h("div", null,
    s.i === 0 ? headline(s.headline, t, 60, 200) : null,
    h("div", { style: { position: "absolute", left: 70, right: 70, top: s.i === 0 ? 420 : 300, bottom: 300, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", textAlign: "center" } },
      ...s.words.map((w, i) => { const p = pop(t, w.start - 0.04, 0.35), on = em.has(clean(w.w)); return h("span", { key: i, style: { display: "inline-block", margin: "6px 14px", fontSize: on ? size * 1.15 : size, fontWeight: 800, lineHeight: 1.1, color: on ? theme.accent : "white", opacity: clamp(p * 2), transform: `perspective(1200px) translate3d(0px, ${(1 - p) * 40}px, ${(1 - p) * -700}px) rotateX(${(1 - p) * -35}deg) scale(${0.8 + 0.2 * p})`, textShadow: on ? extrude(7) : "0 6px 24px rgba(0,0,0,.5)" } }, w.w); })));
}
function Concept({ s, t, theme }) {
  const p = pop(t, s.reveal[0] || 0.2, 0.6);
  return h("div", null, headline(s.headline, t),
    h("div", { style: { position: "absolute", left: 300, top: 1120, width: 480, height: 60, borderRadius: "50%", background: "rgba(0,0,0,0.45)", filter: "blur(24px)", opacity: clamp(p * 2) * (0.7 + 0.15 * Math.sin(t * 2)) } }),
    h("div", { style: { position: "absolute", left: 220, top: 470, width: 640, height: 640, opacity: clamp(p * 2), transform: ["cube", "bars3d", "orbit"].includes(s.motif) ? `scale(${0.6 + 0.4 * p})` : `perspective(1600px) rotateY(${14 * Math.sin(t * 0.8)}deg) rotateX(${7 * Math.cos(t * 0.7)}deg) scale(${0.6 + 0.4 * p})` } },
      h(Motif, { kind: s.motif, t: t - (s.reveal[0] || 0.2), accent: theme.accent, labels: s.keywords.length ? s.keywords : [s.headline] })),
    h(Captions, { words: s.words, t, accent: theme.accent }));
}
function Ui({ s, t, theme }) {
  return h("div", null, headline(s.headline, t, 64, 200), h(Mockup, { ui: s.ui, t, beats: s.reveal, accent: theme.accent }), h(Captions, { words: s.words, t, accent: theme.accent, top: 1340 }));
}
function Steps({ s, t, theme }) {
  return h("div", null, headline(s.headline, t, 70, 200),
    ...s.items.map((text, i) => { const p = pop(t, s.reveal[i] ?? 9e9); if (t < (s.reveal[i] ?? 9e9)) return null; return h("div", { key: i, style: { position: "absolute", left: 70, right: 70, top: 440 + i * 215, display: "flex", alignItems: "center", gap: 28, padding: "28px 34px", borderRadius: 32, background: "rgba(255,255,255,.12)", border: "2px solid rgba(255,255,255,.2)", opacity: clamp(p * 2), transformOrigin: "50% 0%", transform: `perspective(1400px) rotateX(${(1 - p) * -85}deg) translateY(${(1 - p) * 40}px)` } },
      h("div", { style: { flex: "none", width: 76, height: 76, borderRadius: 38, background: theme.accent, color: "#0d1024", fontSize: 44, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" } }, i + 1), h("div", { style: { fontSize: 50, fontWeight: 700, lineHeight: 1.15 } }, text)); }),
    h(Captions, { words: s.words, t, accent: theme.accent }));
}
function Stat({ s, t, theme }) {
  const r = s.reveal[0] || 0.4, p = pop(t, r, 0.6), m = String(s.stat.value).match(/^(\$?)([\d,.]+)(.*)$/);
  let shown = s.stat.value;
  if (m) { const num = parseFloat(m[2].replace(/,/g, "")); if (!isNaN(num)) { const v = num * easeOut(prog(t, r, 1.1)); shown = m[1] + (Number.isInteger(num) ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)) + m[3]; } }
  return h("div", null, headline(s.headline, t, 64, 260),
    h("div", { style: { position: "absolute", left: 40, right: 40, top: 620, textAlign: "center", fontSize: 230, fontWeight: 800, color: theme.accent, opacity: clamp(p * 2), transform: `perspective(1600px) rotateY(${10 * Math.sin(t * 0.9)}deg) rotateX(6deg) scale(${0.6 + 0.4 * p})`, textShadow: extrude(16) } }, shown),
    h(Burst, { t: t - r, accent: theme.accent, y: 760, count: 30 }),
    s.stat.label ? h("div", { style: { position: "absolute", left: 70, right: 70, top: 930, textAlign: "center", fontSize: 60, fontWeight: 700, opacity: prog(t, r + 0.8, 0.4) } }, s.stat.label) : null,
    h(Captions, { words: s.words, t, accent: theme.accent }));
}
function Outro({ t, theme, channel }) {
  const p = pop(t, 0.1, 0.6), pulse = 1 + 0.04 * Math.sin(t * 6);
  return h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" } },
    h("div", { style: { position: "absolute", left: "50%", top: "28%", width: 0, height: 0 } }, h(Cube, { size: 260, t, accent: theme.accent, labels: [channel || "follow"], spin: 70, s: pop(t, 0.1, 0.7), fontSize: 40 })),
    h(Burst, { t: t - 0.1, accent: theme.accent, y: 560, count: 36, power: 900 }),
    h("div", { style: { fontSize: 100, fontWeight: 800, textAlign: "center", opacity: clamp(p * 2), transform: `scale(${(0.7 + 0.3 * p) * pulse})` } }, "Follow for more"),
    h("div", { style: { fontSize: 56, marginTop: 28, color: theme.accent, fontWeight: 700, opacity: prog(t, 0.5, 0.4) } }, channel || ""));
}
const LAYOUTS = { kinetic: Kinetic, concept: Concept, ui: Ui, steps: Steps, stat: Stat, outro: Outro };

export function SceneBody(props) { const C = LAYOUTS[props.s.layout] || Concept; return h(C, props); }
