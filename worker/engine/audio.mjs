// Voice assembly and a procedurally synthesized music bed + sound effects (no copyrighted audio).
// Each scene starts on a beat: the tempo is nudged per scene so a whole number of beats fits the scene.
export const SR = 24000;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const arr = (sec) => new Float32Array(Math.max(1, Math.floor(sec * SR)));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mix(out, tSec, src, gain = 1) { const o = Math.floor(tSec * SR); for (let i = 0; i < src.length; i++) { const j = o + i; if (j >= 0 && j < out.length) out[j] += src[i] * gain; } }

function tone(freq, sec, { amp = 0.1, attack = 0.01, release = 0.05, wave = "sine", to = null } = {}) {
  const a = arr(sec); let ph = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR, f = to ? freq + (to - freq) * Math.min(1, t / sec) : freq;
    ph += (TAU * f) / SR;
    const s = wave === "tri" ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
    a[i] = s * amp * Math.min(1, t / attack) * Math.min(1, Math.max(0, (sec - t) / release));
  }
  return a;
}
const kick = () => { const a = arr(0.28); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; ph += (TAU * (45 + 85 * Math.exp(-t * 30))) / SR; a[i] = Math.sin(ph) * Math.exp(-t * 11) * 0.9; } return a; };
const hat = (r) => { const a = arr(0.06); let p = 0; for (let i = 0; i < a.length; i++) { const x = r() * 2 - 1; a[i] = (x - p) * Math.exp(-(i / SR) * 90); p = x; } return a; };
const whoosh = (r) => { const a = arr(0.5); let lp = 0; for (let i = 0; i < a.length; i++) { const p = i / a.length; lp += (0.02 + 0.5 * p) * ((r() * 2 - 1) - lp); a[i] = lp * Math.pow(Math.sin(Math.PI * p), 2) * 3; } return a; };
const pop = () => tone(900, 0.1, { amp: 0.8, attack: 0.002, release: 0.05, to: 300 });
const impact = (r) => { const a = tone(70, 0.9, { amp: 0.9, attack: 0.002, release: 0.4, to: 38 }); for (let i = 0; i < a.length; i++) a[i] = a[i] * Math.exp(-(i / SR) * 3) + (r() * 2 - 1) * 0.5 * Math.exp(-(i / SR) * 40); return a; };
const chime = () => { const a = tone(1046, 0.9, { amp: 0.5, attack: 0.004, release: 0.7 }), b = tone(1568, 0.9, { amp: 0.3, attack: 0.004, release: 0.7 }); for (let i = 0; i < a.length; i++) a[i] += b[i]; return a; };
const SFX_GAIN = { whoosh: 0.3, pop: 0.3, impact: 0.35, chime: 0.3 };

export function floatToPcm(f) { const b = Buffer.alloc(f.length * 2); for (let i = 0; i < f.length; i++) b.writeInt16LE(Math.round(Math.tanh(f[i]) * 32767), i * 2); return b; }
export function wavFromPcm(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Place each scene's voiceover PCM at its start time on a silent track.
export function assembleVoice(scenes, segments, totalSec) {
  const out = Buffer.alloc(Math.ceil(totalSec * SR) * 2);
  scenes.forEach((s, i) => {
    const seg = segments[i]; if (!seg) return;
    const off = Math.round(s.voiceStart * SR) * 2;
    if (off < out.length) seg.copy(out, off, 0, Math.min(seg.length, out.length - off));
  });
  return out;
}

export function synthScore(scenes, cues, totalSec, seed = 7) {
  const r = rng(seed), music = arr(totalSec), fx = arr(totalSec);
  scenes.forEach((s, i) => {
    const chord = CHORDS[i % CHORDS.length], beats = Math.max(2, Math.round((s.dur * 100) / 60)), beat = s.dur / beats;
    chord.forEach((n) => mix(music, s.start - 0.03, tone(mtof(n), s.dur + 0.4, { amp: 0.04, attack: 0.3, release: 0.45, wave: "tri" })));
    for (let b = 0; b < beats; b++) {
      const t = s.start + b * beat;
      mix(music, t, kick(), 0.22);
      if (b % 2 === 0) mix(music, t, tone(mtof(chord[0] - 12), beat * 0.9, { amp: 0.16, attack: 0.005, release: 0.1 }));
      mix(music, t + beat / 2, hat(r), 0.07);
      for (let k = 0; k < 2; k++) mix(music, t + (k * beat) / 2, tone(mtof(chord[(b * 2 + k) % 3] + 12), (beat / 2) * 0.9, { amp: 0.05, attack: 0.005, release: 0.08, wave: "tri" }));
    }
  });
  const fadeOut = Math.min(1.2, totalSec / 3);
  for (let i = 0; i < music.length; i++) { const t = i / SR; music[i] *= 0.25 * Math.min(1, t / 0.3) * Math.min(1, (totalSec - t) / fadeOut); }
  const gens = { whoosh: () => whoosh(r), pop, impact: () => impact(r), chime };
  for (const c of cues) if (gens[c.sfx]) mix(fx, c.t, gens[c.sfx](), SFX_GAIN[c.sfx]);
  const out = new Float32Array(music.length);
  for (let i = 0; i < out.length; i++) out[i] = music[i] + fx[i];
  return floatToPcm(out);
}
