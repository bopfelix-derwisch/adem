// adem/breath.mjs — timing van de ademgids (puur, geen DOM)

export const INHALE_FRAC = 0.4;

// t = seconden sinds start, bpm = ademhalingen per minuut
// → { phase: 'in'|'out', progress 0–1 binnen de fase, cycle (0-based), size 0–1 (cirkelgrootte) }
export function breathAt(t, bpm) {
  const cycleLen = 60 / bpm, inLen = cycleLen * INHALE_FRAC;
  const cycle = Math.floor(t / cycleLen), u = t - cycle * cycleLen;
  if (u < inLen) {
    const p = u / inLen;
    return { phase: 'in', progress: p, cycle, size: (1 - Math.cos(Math.PI * p)) / 2 };
  }
  const p = (u - inLen) / (cycleLen - inLen);
  return { phase: 'out', progress: p, cycle, size: (1 + Math.cos(Math.PI * p)) / 2 };
}

// Fasewissel tussen twee momenten → 'in' | 'out' | null (voor de ademtonen)
export function cueBetween(prev, cur) {
  if (!prev) return cur.phase === 'in' ? 'in' : null;
  return prev.phase !== cur.phase || prev.cycle !== cur.cycle ? cur.phase : null;
}
