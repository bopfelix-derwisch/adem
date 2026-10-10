// adem/hrv.mjs — hartslag, RMSSD en coherentie uit slagtijden (puur, geen DOM)

export const WINDOW = 64;      // s, venster voor coherentie
export const MIN_SPAN = 45;    // s schone RR nodig voor een coherentiewaarde
export const LEVELS = { low: 0.3, high: 0.6 };

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

// Slagtijden (s) → [{t, rr}] met rr = t_i − t_{i−1}; uitschieters (> 25 % van mediaan) eruit
export function rrSeries(beats) {
  const all = [];
  for (let i = 1; i < beats.length; i++) all.push({ t: beats[i], rr: beats[i] - beats[i - 1] });
  if (all.length < 3) return all;
  const med = median(all.map(p => p.rr));
  return all.filter(p => Math.abs(p.rr - med) < 0.25 * med);
}

export function heartRate(rr) {   // rr in s → bpm
  if (!rr.length) return null;
  return 60 / (rr.reduce((a, b) => a + b, 0) / rr.length);
}

// RMSSD in ms; alleen opeenvolgende paren zonder tussenliggend gat (verschil in t ≈ rr)
export function rmssd(series) {
  let s = 0, n = 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i];
    if (Math.abs((b.t - a.t) - b.rr) > 0.05) continue; // er zit een weggefilterde slag tussen
    s += (b.rr - a.rr) ** 2; n++;
  }
  return n ? 1000 * Math.sqrt(s / n) : null;
}

// Coherentie 0–1: aandeel van het RR-spectrum in de piek (0,04–0,26 Hz ± 0,015 Hz).
// `now` in dezelfde klok als de slagtijden. null zolang er < MIN_SPAN s schone data is.
export function coherence(beats, now) {
  const S = rrSeries(beats.filter(t => t > now - WINDOW - 2)).filter(p => p.t > now - WINDOW);
  if (S.length < 10 || S[S.length - 1].t - S[0].t < MIN_SPAN) return null;

  // Lineair herbemonsteren op 4 Hz over [S0.t, S_last.t]
  const fs = 4, N = 256, x = [];
  let j = 0;
  for (let t = S[0].t; t <= S[S.length - 1].t && x.length < N; t += 1 / fs) {
    while (j < S.length - 2 && S[j + 1].t < t) j++;
    const a = S[j], b = S[j + 1], u = (t - a.t) / (b.t - a.t);
    x.push(a.rr + Math.min(1, Math.max(0, u)) * (b.rr - a.rr));
  }

  // Lineaire trend eraf, Hann-venster, nulvullen tot N
  const M = x.length, mt = (M - 1) / 2, my = x.reduce((a, b) => a + b, 0) / M;
  let sxy = 0, sxx = 0;
  x.forEach((v, i) => { sxy += (i - mt) * (v - my); sxx += (i - mt) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const w = x.map((v, i) => (v - my - slope * (i - mt)) * 0.5 * (1 - Math.cos(2 * Math.PI * i / (M - 1))));
  while (w.length < N) w.push(0);

  // Vermogensspectrum (DFT, alleen bins tot 0,4 Hz)
  const df = fs / N, kMax = Math.floor(0.4 / df), P = [];
  for (let k = 0; k <= kMax; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) { const a = 2 * Math.PI * k * n / N; re += w[n] * Math.cos(a); im -= w[n] * Math.sin(a); }
    P.push(re * re + im * im);
  }

  const kLo = Math.ceil(0.0033 / df), kPk0 = Math.ceil(0.04 / df), kPk1 = Math.floor(0.26 / df);
  let kPk = kPk0;
  for (let k = kPk0; k <= kPk1; k++) if (P[k] > P[kPk]) kPk = k;
  const halfBins = Math.round(0.015 / df);
  let peak = 0, total = 0;
  for (let k = kLo; k <= kMax; k++) {
    total += P[k];
    if (Math.abs(k - kPk) <= halfBins) peak += P[k];
  }
  return { value: total ? peak / total : 0, peakHz: kPk * df };
}

export function level(c) {
  return c < LEVELS.low ? 'laag' : c > LEVELS.high ? 'hoog' : 'midden';
}
