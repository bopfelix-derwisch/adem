// adem/session.mjs — sessie-toestanden en statistiek (puur, geen DOM)
//
// zoek-vinger → inlezen → oefenen → einde;  inlezen/oefenen ⇄ pauze
// Zonder meting (modus "alleen ademen"): direct oefenen → einde, nooit pauze.

export const Q_GOOD = 0.5, Q_BAD = 0.3, HOLD = 3; // kwaliteitsdrempels, s aanhouden
export const HIGH = 0.6;                           // coherentie "hoog"
export const MAX_DT = 2;                           // s; grotere tik = pagina was weg (iOS pauzeert timers)
export const SEARCH_MAX = 90;                      // s zoeken naar de vinger, daarna stoppen (flitser wordt warm)

export function createSession(durationSec, { measured = true } = {}) {
  return {
    state: measured ? 'zoek-vinger' : 'oefenen', measured, resume: null, durationSec,
    elapsed: 0,      // s sinds vinger gevonden (sessieklok, loopt ook in pauze)
    goodFor: 0, badFor: 0, searchSec: 0,
    stats: { practiceSec: 0, highSec: 0, cohIntegral: 0, pauseSec: 0 },
  };
}

// Eén tik van dt seconden. input: { quality, coherence (gladgestreken, of null), hidden }
export function step(s, dt, { quality, coherence, hidden = false }) {
  if (s.state === 'einde') return s;
  if (s.measured && dt > MAX_DT && s.state !== 'zoek-vinger') {
    // Pagina was op de achtergrond: die tijd telt als pauze, nooit als oefening
    s.elapsed += dt; s.stats.pauseSec += dt; s.goodFor = s.badFor = 0;
    if (s.state !== 'pauze') { s.resume = s.state; s.state = 'pauze'; }
    if (s.elapsed >= s.durationSec) s.state = 'einde';
    return s;
  }
  s.goodFor = quality > Q_GOOD ? s.goodFor + dt : 0;
  s.badFor = quality < Q_BAD ? s.badFor + dt : 0;

  if (s.state !== 'zoek-vinger') s.elapsed += dt;
  if (!s.measured) {
    s.stats.practiceSec += dt;
    if (s.elapsed >= s.durationSec) s.state = 'einde';
    return s;
  }

  switch (s.state) {
    case 'zoek-vinger':
      s.searchSec += dt;
      if (s.goodFor >= HOLD) s.state = 'inlezen';
      else if (s.searchSec > SEARCH_MAX) s.state = 'einde';
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
  const p = s.stats.practiceSec, cp = s.measured ? p : 0; // zonder meting: geen coherentie
  return {
    practiceSec: Math.round(p),
    meanCoherence: cp ? s.stats.cohIntegral / cp : null,
    highPct: cp ? Math.round(100 * s.stats.highSec / cp) : null,
    pauseSec: Math.round(s.stats.pauseSec),
  };
}

// Vinger-indicator: 'goed' | 'zwak' | 'geen' (zelfde drempels als pauze/hervat)
export function signalLevel(q) {
  return q > Q_GOOD ? 'goed' : q < Q_BAD ? 'geen' : 'zwak';
}
