// adem/tempo.mjs — voorstel voor het ademtempo (puur, geen DOM)
//
// Volgorde: 1) hoe het vorige tempo voelde (comfort eerst), 2) eigen metingen: het tempo met
// de hoogste gemiddelde coherentie zodra ≥ 2 tempo's gemeten zijn, 3) schatting van de
// resonantiefrequentie uit geslacht en lengte, 4) 5,5 per minuut.
// Schatting: mannen RF = 17,90 − 0,07·lengte(cm), vrouwen RF = 15,88 − 0,06·lengte(cm)
// (122 gezonde volwassenen, R² ≈ 0,5; PMC10869367). Langer → lager tempo; mannen lager.

export const MIN = 4.5, MAX = 7, DEFAULT = 5.5;

const clamp = t => Math.min(MAX, Math.max(MIN, t));
const half = t => Math.round(t * 2) / 2;
const fmt = t => (+t).toFixed(1).replace('.', ',');

export function resonanceEstimate(height, sex) {
  if (!(height > 0)) return null;
  const m = 17.90 - 0.07 * height, v = 15.88 - 0.06 * height;
  return clamp(half(sex === 'm' ? m : sex === 'v' ? v : (m + v) / 2));
}

const FEEL = {
  luchthonger: { d: +0.5, why: 'Vorige keer voelde het te langzaam (luchthonger)' },
  duizelig: { d: +0.5, why: 'Vorige keer werd je duizelig of kreeg je tintelingen — adem ook minder diep, vooral rustig uit' },
  gejaagd: { d: -0.5, why: 'Vorige keer voelde het gejaagd' },
};

// history: nieuwste eerst. Geeft { tempo, reason }
export function suggestTempo(profile, history) {
  const last = history[0];
  if (last && FEEL[last.feel]) {
    const f = FEEL[last.feel];
    return { tempo: clamp(last.tempo + f.d), reason: `${f.why}; daarom ${fmt(clamp(last.tempo + f.d))} per minuut.` };
  }

  const by = {};
  for (const h of history) {
    if (h.mode === 'adem' || typeof h.coherence !== 'number' || h.feel === 'luchthonger' || h.feel === 'duizelig') continue;
    (by[h.tempo] = by[h.tempo] || []).push(h.coherence);
  }
  const tempos = Object.keys(by).map(Number);
  const est = profile ? resonanceEstimate(profile.height, profile.sex) : null;

  if (tempos.length >= 2) {
    const mean = t => by[t].reduce((a, b) => a + b, 0) / by[t].length;
    const best = tempos.reduce((a, b) => (mean(b) > mean(a) ? b : a));
    return { tempo: best, reason: `Bij ${fmt(best)} per minuut had je de hoogste coherentie (gemiddeld ${mean(best).toFixed(2).replace('.', ',')} over ${by[best].length} sessie${by[best].length > 1 ? 's' : ''}).` };
  }
  if (tempos.length === 1) {
    // Eén tempo gemeten: probeer een buurtempo, richting de schatting (anders omlaag), zoals in het resonantieprotocol
    const t = tempos[0], dir = est !== null && est > t ? +0.5 : -0.5;
    const next = clamp(t + dir) === t ? clamp(t - dir) : clamp(t + dir);
    return { tempo: next, reason: `Je hebt ${fmt(t)} gemeten. Probeer nu ${fmt(next)}: na twee of meer tempo's stel ik het tempo voor waarbij je hart het sterkst meegolft.` };
  }
  if (est !== null) {
    return { tempo: est, reason: `Geschat uit je lengte${profile.sex ? ' en geslacht' : ''}: langere mensen en mannen hebben gemiddeld een lager resonantietempo.` };
  }
  return { tempo: DEFAULT, reason: 'Gemiddeld resonantietempo van volwassenen. Vul je profiel in voor een persoonlijke schatting.' };
}
