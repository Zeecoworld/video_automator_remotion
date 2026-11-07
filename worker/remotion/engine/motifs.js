// Keyword-driven SVG illustrations. t = seconds since the scene's illustration appeared.
import { h, prog, easeOut, pop, lerp, Cube, Box } from "./util.js";

const svg = (...kids) => h("svg", { viewBox: "0 0 400 400", style: { width: "100%", height: "100%", overflow: "visible" } }, ...kids);
const draw = (p) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p });

function brain(t, A) {
  const layers = [[70, [90, 200, 310]], [200, [60, 150, 250, 340]], [330, [90, 200, 310]]];
  const edges = [], nodes = [];
  let k = 0;
  layers.forEach(([x, ys], li) => {
    ys.forEach((y) => {
      if (li < 2) layers[li + 1][1].forEach((y2) => { edges.push(h("line", { key: "e" + k, x1: x, y1: y, x2: layers[li + 1][0], y2, stroke: "white", strokeWidth: 2, strokeOpacity: 0.2 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3 + k)), ...draw(prog(t, 0.05 + k * 0.015, 0.5)) })); k++; });
      nodes.push(h("circle", { key: "n" + x + y, cx: x, cy: y, r: (13 + 3 * Math.sin(t * 4 + y)) * pop(t, 0.2 + li * 0.15), fill: (x + y) % 3 === 0 ? A : "white" }));
    });
  });
  return svg(...edges, ...nodes);
}
function gear(key, cx, cy, r, teeth, rot, A) {
  const kids = [];
  for (let i = 0; i < teeth; i++) kids.push(h("rect", { key: i, x: cx - 7, y: cy - r - 12, width: 14, height: 20, rx: 3, fill: A, transform: `rotate(${(i * 360) / teeth} ${cx} ${cy})` }));
  return h("g", { key, transform: `rotate(${rot} ${cx} ${cy})` }, ...kids, h("circle", { cx, cy, r, fill: A }), h("circle", { cx, cy, r: r * 0.4, fill: "#0d1024" }));
}
const gears = (t, A) => svg(gear("a", 150, 170, 70, 10, t * 40, A), gear("b", 268, 240, 50, 8, -t * 50 + 20, "white"), gear("c", 120, 310, 34, 7, t * 70, A));
function code(t, A) {
  const cols = [A, "white", "#ff80ab", "#82b1ff"], w = [160, 220, 120, 190, 90, 150];
  return svg(
    h("rect", { x: 40, y: 50, width: 320, height: 300, rx: 22, fill: "rgba(255,255,255,0.1)", stroke: "rgba(255,255,255,0.35)", strokeWidth: 3, opacity: pop(t, 0) }),
    ...[0, 1, 2].map((i) => h("circle", { key: "d" + i, cx: 70 + i * 26, cy: 82, r: 8, fill: cols[i] })),
    ...w.map((x, i) => h("rect", { key: i, x: 70, y: 125 + i * 33, width: x * easeOut(prog(t, 0.3 + i * 0.25, 0.5)), height: 14, rx: 7, fill: cols[i % 4] })),
    h("rect", { x: 70 + w[5] * easeOut(prog(t, 0.3 + 5 * 0.25, 0.5)) + 8, y: 320, width: 10, height: 18, fill: "white", opacity: Math.sin(t * 8) > 0 ? 1 : 0 }));
}
function video(t, A) {
  const s = 1 + 0.08 * Math.sin(t * 4), head = 60 + 280 * ((t * 0.25) % 1);
  return svg(
    h("rect", { x: 40, y: 80, width: 320, height: 210, rx: 20, fill: "rgba(255,255,255,0.1)", stroke: "white", strokeWidth: 4, opacity: pop(t, 0) }),
    h("polygon", { points: "175,140 175,230 255,185", fill: A, transform: `translate(${200 * (1 - s)} ${185 * (1 - s)}) scale(${s})` }),
    h("rect", { x: 60, y: 320, width: 280, height: 10, rx: 5, fill: "rgba(255,255,255,0.25)" }),
    h("rect", { x: 60, y: 320, width: head - 60, height: 10, rx: 5, fill: A }),
    h("circle", { cx: head, cy: 325, r: 13, fill: "white" }));
}
function chat(t, A) {
  const a = pop(t, 0.1), b = pop(t, 0.7);
  return svg(
    h("g", { transform: `translate(${(1 - a) * -200} 0)`, opacity: a }, h("rect", { x: 40, y: 70, width: 230, height: 76, rx: 26, fill: "rgba(255,255,255,0.18)" }), h("polygon", { points: "60,146 60,176 95,146", fill: "rgba(255,255,255,0.18)" })),
    h("g", { transform: `translate(${(1 - b) * 200} 0)`, opacity: b }, h("rect", { x: 130, y: 190, width: 230, height: 96, rx: 26, fill: A }), h("polygon", { points: "340,286 340,316 305,286", fill: A })),
    ...[0, 1, 2].map((i) => h("circle", { key: i, cx: 70 + i * 28, cy: 345 - 8 * Math.abs(Math.sin(t * 6 + i * 0.8)), r: 8, fill: "white", opacity: 0.8 })));
}
function chart(t, A) {
  const p = easeOut(prog(t, 0.2, 1.2));
  return svg(
    h("line", { x1: 40, y1: 340, x2: 370, y2: 340, stroke: "white", strokeWidth: 4, strokeLinecap: "round" }),
    h("line", { x1: 40, y1: 340, x2: 40, y2: 40, stroke: "white", strokeWidth: 4, strokeLinecap: "round" }),
    h("path", { d: "M50 320 L120 270 L180 292 L250 190 L310 140 L365 60", fill: "none", stroke: A, strokeWidth: 10, strokeLinecap: "round", strokeLinejoin: "round", ...draw(p) }),
    h("circle", { cx: 365, cy: 60, r: 16 * pop(t, 1.3), fill: "white" }));
}
function rocket(t, A) {
  const bob = -12 * Math.sin(t * 3), flame = 40 + 22 * Math.abs(Math.sin(t * 18));
  const stars = [];
  for (let i = 0; i < 9; i++) stars.push(h("circle", { key: i, cx: 30 + ((i * 47) % 340), cy: ((i * 83 + t * 220) % 420) - 10, r: 3 + (i % 3), fill: "white", opacity: 0.6 }));
  return svg(...stars, h("g", { transform: `translate(0 ${bob})` },
    h("polygon", { points: `175,250 225,250 200,${250 + flame}`, fill: "#ffab40" }),
    h("path", { d: "M200 50 C245 105 245 185 200 255 C155 185 155 105 200 50 Z", fill: "white" }),
    h("polygon", { points: "165,190 120,250 165,235", fill: A }), h("polygon", { points: "235,190 280,250 235,235", fill: A }),
    h("circle", { cx: 200, cy: 130, r: 24, fill: A })));
}
function shield(t, A) {
  const s = pop(t, 0.1);
  return svg(
    h("g", { transform: `translate(${200 * (1 - s)} ${200 * (1 - s)}) scale(${s})` }, h("path", { d: "M200 40 L330 90 V190 C330 270 270 330 200 360 C130 330 70 270 70 190 V90 Z", fill: "rgba(255,255,255,0.12)", stroke: "white", strokeWidth: 6 })),
    h("path", { d: "M135 205 L185 255 L270 150", fill: "none", stroke: A, strokeWidth: 18, strokeLinecap: "round", strokeLinejoin: "round", ...draw(easeOut(prog(t, 0.6, 0.6))) }));
}
function spark(t, A) {
  const rays = [];
  for (let i = 0; i < 12; i++) { const len = 60 + 40 * Math.abs(Math.sin(t * 2 + i)); rays.push(h("line", { key: i, x1: 200, y1: 200 - 70, x2: 200, y2: 200 - 70 - len * pop(t, 0.05 + i * 0.03), stroke: i % 2 ? "white" : A, strokeWidth: 12, strokeLinecap: "round", transform: `rotate(${i * 30 + t * 20} 200 200)` })); }
  return svg(...rays, h("circle", { cx: 200, cy: 200, r: 48 * pop(t, 0), fill: A }));
}

// 3D: a spinning glass cube whose faces carry the scene's keywords.
const cube = (t, A, labels) => h("div", { style: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0 } },
  h(Cube, { size: 300, t, accent: A, labels: labels && labels.length ? labels : ["idea"], s: 0.5 + 0.5 * pop(t, 0, 0.7), spin: 50 }));

// 3D: solid bars growing on a turning platform.
const bars3d = (t, A) => {
  const hs = [90, 150, 120, 215, 285];
  return h("div", { style: { position: "absolute", left: "50%", top: "58%", width: 0, height: 0, transformStyle: "preserve-3d", transform: `perspective(1600px) rotateX(-20deg) rotateY(${-32 + 14 * Math.sin(t * 0.6)}deg)` } },
    h("div", { style: { position: "absolute", left: -330, top: -150, width: 660, height: 300, background: "rgba(255,255,255,0.08)", border: "3px solid rgba(255,255,255,0.3)", transform: "rotateX(90deg)" } }),
    ...hs.map((v, i) => { const g = Math.max(1, v * easeOut(prog(t, 0.2 + i * 0.18, 0.7))); return h("div", { key: i, style: { position: "absolute", left: 0, top: 0, width: 0, height: 0, transformStyle: "preserve-3d", transform: `translate3d(${(i - 2) * 120}px, ${-g / 2}px, 0px)` } },
      h(Box, { w: 70, d: 70, hgt: g, color: i === 4 ? A : "rgba(255,255,255,0.85)", glow: i === 4 })); }));
};
// 3D: glowing core with tilted rings and satellites orbiting in depth.
const orbit = (t, A) => {
  const rings = [[360, 70, 0], [460, 60, 60], [560, 75, -50]];
  return h("div", { style: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transformStyle: "preserve-3d", transform: `perspective(1400px) rotateX(${-14 + 8 * Math.sin(t * 0.7)}deg) rotateY(${20 * Math.sin(t * 0.5)}deg)` } },
    h("div", { style: { position: "absolute", left: -70, top: -70, width: 140, height: 140, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, white, ${A} 45%, #0d1024)`, boxShadow: `0 0 80px ${A}`, transform: `scale(${pop(t, 0, 0.7)})` } }),
    ...rings.map(([S, tilt, yaw], i) => h("div", { key: i, style: { position: "absolute", left: -S / 2, top: -S / 2, width: S, height: S, boxSizing: "border-box", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.45)", transformStyle: "preserve-3d", transform: `rotateY(${yaw}deg) rotateX(${tilt}deg) rotateZ(${t * (60 - i * 18) * (i % 2 ? -1 : 1)}deg)` } },
      h("div", { style: { position: "absolute", left: S / 2 - 16, top: -16, width: 32, height: 32, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, white, ${i === 0 ? A : "#82b1ff"})`, boxShadow: `0 0 24px ${A}` } }))));
};

const MAP = { brain, gears, code, video, chat, chart, rocket, shield, spark, cube, bars3d, orbit };
export const Motif = ({ kind, t, accent, labels }) => (MAP[kind] || cube)(Math.max(0, t), accent, labels);
export const MOTIF_KINDS = Object.keys(MAP);
