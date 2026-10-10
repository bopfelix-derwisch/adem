// tests/adem/synth.mjs — deterministische synthetische PPG- en RR-data voor tests

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Slagtijden (s) vanaf t=1 tot `seconds`, RR = base + amp·sin(2π·modHz·t)
export function beatTimes({ seconds, baseRR = 0.85, modAmp = 0.05, modHz = 0.1 }) {
  const out = [];
  let t = 1;
  while (t < seconds) { out.push(t); t += baseRR + modAmp * Math.sin(2 * Math.PI * modHz * t); }
  return out;
}

// Eén puls: snelle stijging van het bloedvolume (0,12 s), daarna exponentieel verval
function pulse(dt) {
  if (dt < 0 || dt > 1.2) return 0;
  if (dt < 0.12) return (1 - Math.cos(Math.PI * dt / 0.12)) / 2;
  return Math.exp(-(dt - 0.12) / 0.25);
}

// Camera-frames {t, r, g, b}: bloed absorbeert licht → rood daalt bij elke slag
export function ppgFrames({ beats, seconds, fps = 60, jitter = 0.001, noise = 0.15, seed = 1 }) {
  const rand = rng(seed), frames = [];
  for (let k = 0; k * (1 / fps) < seconds; k++) {
    const t = k / fps + (rand() * 2 - 1) * jitter;
    let blood = 0;
    for (const b of beats) { if (b > t) break; blood += pulse(t - b); }
    frames.push({ t, r: 200 - 3 * blood + noise * gauss(rand), g: 1, b: 32 });
  }
  return frames;
}

export function noiseFrames({ seconds, fps = 60, seed = 7 }) {
  const rand = rng(seed), frames = [];
  for (let k = 0; k * (1 / fps) < seconds; k++) {
    frames.push({ t: k / fps, r: 150 + 3 * gauss(rand), g: 120 + 3 * gauss(rand), b: 120 });
  }
  return frames;
}
