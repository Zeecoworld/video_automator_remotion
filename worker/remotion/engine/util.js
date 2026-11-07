import React from "react";
export const h = React.createElement;
export const FONT = '"DejaVu Sans", "Helvetica Neue", Arial, sans-serif';
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const prog = (t, start, dur) => clamp((t - start) / dur);
export const easeOut = (p) => 1 - Math.pow(1 - p, 3);
export const easeBack = (p) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
export const lerp = (a, b, p) => a + (b - a) * p;
export const pop = (t, start, dur = 0.45) => easeBack(prog(t, start, dur));
export const typed = (s, t, start, cps = 30) => s.slice(0, Math.max(0, Math.floor((t - start) * cps)));
export const clean = (w) => String(w).toLowerCase().replace(/[^a-z0-9$%]/g, "");

// --- 3D helpers (CSS perspective transforms) ---
// Stacked text-shadows read as a solid, extruded letter shape.
export const extrude = (depth = 8, color = "rgba(0,0,0,0.55)") =>
  Array.from({ length: depth }, (_, i) => `${i + 1}px ${i + 1}px 0 ${color}`).join(",") + `, ${depth + 8}px ${depth + 22}px 40px rgba(0,0,0,0.45)`;

const FACES = ["rotateY(0deg)", "rotateY(90deg)", "rotateY(180deg)", "rotateY(-90deg)", "rotateX(90deg)", "rotateX(-90deg)"];
// A spinning glass cube centred on its parent's origin. Faces may carry text labels.
// Opacity goes on the faces: opacity on the 3D container itself would flatten the cube.
export const Cube = ({ size, t, accent, labels, spin = 45, s = 1, extra = "", fill = "rgba(255,255,255,0.1)", border = 6, fontSize = 52, opacity = 1 }) =>
  h("div", { style: { position: "absolute", left: -size / 2, top: -size / 2, width: size, height: size, transformStyle: "preserve-3d", transform: `perspective(1400px) ${extra} scale(${s}) rotateX(${-22 + 12 * Math.sin(t * 0.9)}deg) rotateY(${t * spin}deg)` } },
    ...FACES.map((f, i) => h("div", { key: i, style: { position: "absolute", left: 0, top: 0, width: size, height: size, boxSizing: "border-box", transform: `${f} translateZ(${size / 2}px)`, border: `${border}px solid ${accent}`, background: fill, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize, fontWeight: 800, color: "white", textTransform: "uppercase", opacity } }, labels && labels.length ? labels[i % labels.length] : "")));

export const rand = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }; // deterministic pseudo-random 0..1

// A solid 3D box (bar). Centred on its parent's origin; every ancestor up to the camera must keep preserve-3d.
export const Box = ({ w, d, hgt, color, glow }) => {
  const f = (style, shade) => ({ position: "absolute", background: color, backgroundImage: shade ? `linear-gradient(${shade},${shade})` : "none", boxShadow: glow ? `0 0 30px ${color}` : "none", ...style });
  return h("div", { style: { position: "absolute", left: 0, top: 0, width: 0, height: 0, transformStyle: "preserve-3d" } },
    h("div", { style: f({ left: -w / 2, top: -hgt / 2, width: w, height: hgt, transform: `translateZ(${d / 2}px)` }) }),
    h("div", { style: f({ left: -w / 2, top: -hgt / 2, width: w, height: hgt, transform: `rotateY(180deg) translateZ(${d / 2}px)` }, "rgba(0,0,0,0.35)") }),
    h("div", { style: f({ left: -d / 2, top: -hgt / 2, width: d, height: hgt, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }, "rgba(0,0,0,0.3)") }),
    h("div", { style: f({ left: -d / 2, top: -hgt / 2, width: d, height: hgt, transform: `rotateY(90deg) translateZ(${w / 2}px)` }, "rgba(0,0,0,0.15)") }),
    h("div", { style: f({ left: -w / 2, top: -d / 2, width: w, height: d, transform: `rotateX(90deg) translateZ(${hgt / 2}px)` }, "rgba(255,255,255,0.3)") }));
};

// Confetti-style particle burst with simple gravity. t = seconds since the burst started.
export const Burst = ({ t, accent, x = 540, y = 900, count = 28, power = 700 }) => {
  if (t < 0 || t > 1.6) return null;
  return h("div", { style: { position: "absolute", left: 0, top: 0, width: 0, height: 0 } },
    ...Array.from({ length: count }, (_, i) => {
      const a = rand(i, 5) * Math.PI * 2, v = power * (0.4 + 0.6 * rand(i, 6)), s = 10 + rand(i, 7) * 16;
      return h("div", { key: i, style: { position: "absolute", left: x + Math.cos(a) * v * t - s / 2, top: y + Math.sin(a) * v * t + 900 * t * t - s / 2, width: s, height: i % 3 ? s : s * 2.2, borderRadius: i % 2 ? s : 3, background: i % 3 === 0 ? "white" : accent, opacity: clamp(1 - t / 1.5), transform: `rotate(${t * (200 + rand(i, 8) * 400)}deg)` } });
    }));
};
