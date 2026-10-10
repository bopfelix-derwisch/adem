// adem/palette.mjs — kleurverloop koud → warm voor de ademcirkel (puur, geen DOM)
//
// Blauw (rustig begin) → turquoise/groen → gedempt amber/goud (hoge coherentie).
// Geen fel rood: verzadigd rood/geel verhoogt in studies de hartslag en opwinding,
// blauw voelt het rustigst; gedempt warm licht hangt samen met hogere vagale HRV.
// Interpolatie in OKLCH: gelijkmatig voor het oog en zonder grijze tussentinten
// (die ontstaan bij mengen in RGB).

const LOW = { L: 0.64, C: 0.13, h: 250 };   // blauw
const HIGH = { L: 0.80, C: 0.13, h: 72 };   // amber/goud; tint daalt 250 → 72 via groen
const WARMUP = 120;                          // s, opwarmen in de modus zonder meting

function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
const encode = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));

// OKLCH → sRGB [0–255]; chroma wordt verlaagd tot de kleur weergeefbaar is
export function oklch(L, C, h) {
  const rad = h * Math.PI / 180;
  let c = C, rgb = oklabToLinear(L, c * Math.cos(rad), c * Math.sin(rad));
  while (!inGamut(rgb) && c > 0) { c -= 0.005; rgb = oklabToLinear(L, c * Math.cos(rad), c * Math.sin(rad)); }
  return rgb.map(v => encode(Math.min(1, Math.max(0, v))));
}

// u 0–1 (coherentie of opwarming) → [r,g,b]
export function colorAt(u) {
  const t = Math.min(1, Math.max(0, u));
  return oklch(LOW.L + (HIGH.L - LOW.L) * t, LOW.C + (HIGH.C - LOW.C) * t, LOW.h + (HIGH.h - LOW.h) * t);
}

// Modus zonder meting: warmt in ~2 min op naar ~0,85, bij inademen (size→1) iets warmer
export function ademWarmth(elapsedSec, size) {
  const base = 0.85 * (1 - Math.exp(-3 * elapsedSec / WARMUP));
  return Math.min(1, base + 0.1 * size);
}
