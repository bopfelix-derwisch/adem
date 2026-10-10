// adem/session.mjs — sessie-toestanden en statistiek (puur, geen DOM)
//
// zoek-vinger → inlezen → oefenen → einde;  inlezen/oefenen ⇄ pauze

export const Q_GOOD = 0.5, Q_BAD = 0.3, HOLD = 3; // kwaliteitsdrempels, s aanhouden
export const HIGH = 0.6;                           // coherentie "hoog"

export function createSession(durationSec) {
  return {
    state: 'zoek-vinger', resume: null, durationSec,
    elapsed: 0,      // s sinds vinger gevonden (sessieklok, loopt ook in pauze)
    goodFor: 0, badFor: 0,
    stats: { practiceSec: 0, highSec: 0, cohIntegral: 0, pauseSec: 0 },
  };
}

// Eén tik van dt seconden. input: { quality, coherence (gladgestreken, of null), hidden }
export function step(s, dt, { quality, coherence, hidden = false }) {
  if (s.state === 'einde') return s;
  s.goodFor = quality > Q_GOOD ? s.goodFor + dt : 0;
  s.badFor = quality < Q_BAD ? s.badFor + dt : 0;

  if (s.state !== 'zoek-vinger') s.elapsed += dt;

  switch (s.state) {
    case 'zoek-vinger':
      if (s.goodFor >= HOLD) s.state = 'inlezen';
      break;
    case 'inlezen':
    case 'oefenen':
      if (hidden || s.badFor >= HOLD) { s.resume = s.state; s.state = 'pauze'; break; }
      if (s.state === 'inlezen' && coherence !== null) s.state = 'oefenen';
      else if (s.state === 'oefenen') {
        s.stats.practiceSec += dt;
        s.stats.cohIntegral += coherence * dt;
        if (coherence > HIGH) s.stats.highSec += dt;
      }
      break;
    case 'pauze':
      s.stats.pauseSec += dt;
      if (!hidden && s.goodFor >= HOLD) s.state = s.resume;
      break;
  }
  if (s.elapsed >= s.durationSec) s.state = 'einde';
  return s;
}

export function summary(s) {
  const p = s.stats.practiceSec;
  return {
    practiceSec: Math.round(p),
    meanCoherence: p ? s.stats.cohIntegral / p : null,
    highPct: p ? Math.round(100 * s.stats.highSec / p) : null,
    pauseSec: Math.round(s.stats.pauseSec),
  };
}

// Vinger-indicator: 'goed' | 'zwak' | 'geen' (zelfde drempels als pauze/hervat)
export function signalLevel(q) {
  return q > Q_GOOD ? 'goed' : q < Q_BAD ? 'geen' : 'zwak';
}
