// adem/norms.mjs — normen naar leeftijd/geslacht en beoordeling met kleur (puur, geen DOM)
//
// Bron RMSSD en meanNN: Voss e.a. (2015), PLoS ONE 10(3): e0118308 — 1906 gezonde
// volwassenen, 5 min rust, liggend; tabel 5 (vrouwen) en 7 (mannen), gemiddelde ± SD
// per leeftijdsgroep. RMSSD is scheef verdeeld: de "gemiddelde band" (P25–P75) wordt
// berekend uit een lognormale verdeling met dat gemiddelde en die SD.

import { LEVELS } from './hrv.mjs';

const GROUPS = ['25–34', '35–44', '45–54', '55–64', '65–74'];
const VOSS = {
  v: { rmssd: [[42.9, 22.8], [35.4, 18.5], [26.3, 13.6], [21.4, 11.9], [19.1, 11.8]],
       nn: [[900, 116], [903, 122], [903, 109], [868, 118], [873, 110]] },
  m: { rmssd: [[39.7, 19.9], [32.0, 16.5], [23.0, 10.9], [19.9, 11.1], [19.1, 10.7]],
       nn: [[939, 129], [925, 138], [923, 134], [904, 123], [906, 123]] },
};
const Z25 = 0.6745;   // z-waarde van het 25e/75e percentiel
const TONE = { laag: 0.1, normaal: 0.5, hoog: 0.95 }; // plek op de kleurschaal koel → warm

function groupIndex(age) { return Math.min(4, Math.max(0, Math.floor((age - 25) / 10))); }

// [gemiddelde, SD] voor geslacht 'v' | 'm' | onbekend (gemiddelde van beide)
function stat(key, sex, i) {
  if (sex === 'v' || sex === 'm') return VOSS[sex][key][i];
  const a = VOSS.v[key][i], b = VOSS.m[key][i];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

const sexWord = sex => sex === 'v' ? 'vrouwen' : sex === 'm' ? 'mannen' : 'volwassenen';

export function rmssdBand(age, sex) {
  const i = groupIndex(age), [m, sd] = stat('rmssd', sex, i);
  const s2 = Math.log(1 + (sd / m) ** 2), mu = Math.log(m) - s2 / 2, s = Math.sqrt(s2);
  return { lo: Math.exp(mu - Z25 * s), hi: Math.exp(mu + Z25 * s), group: GROUPS[i], exact: age >= 25 && age < 75 };
}

// Hartslagband uit meanNN (normaal verdeeld) → bpm
export function hrBand(age, sex) {
  const i = groupIndex(age), [m, sd] = stat('nn', sex, i);
  return { lo: 60000 / (m + Z25 * sd), hi: 60000 / (m - Z25 * sd), group: GROUPS[i] };
}

export const bmi = (kg, cm) => kg / (cm / 100) ** 2;

// WHO-indeling
export function bmiClass(b) {
  return b < 18.5 ? { key: 'onder', label: 'ondergewicht' }
    : b < 25 ? { key: 'normaal', label: 'gezond gewicht' }
      : b < 30 ? { key: 'over', label: 'overgewicht' }
        : { key: 'obesitas', label: 'obesitas' };
}

const r0 = v => String(Math.round(v));
const fmt = (v, d) => v.toFixed(d).replace('.', ',');
const hasProfile = p => !!p && typeof p.age === 'number' && p.age > 0;

// item: sessieresultaat; profile: { age, sex, height, weight } of null.
// Geeft per uitkomst { tone (0–1, koel→warm), verdict, norm, text } — alleen wat te beoordelen is.
export function assess(item, profile) {
  const out = {};
  const b = profile && profile.height > 0 && profile.weight > 0 ? bmi(profile.weight, profile.height) : null;
  if (b !== null) {
    const c = bmiClass(b);
    out.bmi = { value: b, tone: c.key === 'normaal' ? TONE.normaal : 0.25, verdict: c.label,
      norm: 'gezond: 18,5–25', text: 'BMI = gewicht / lengte². Telt niet als meting, maar helpt de hartslagvariatie te duiden.' };
  }
  if (item.mode === 'adem') return out;

  if (item.coherence !== null && item.coherence !== undefined) {
    const c = item.coherence, k = c < LEVELS.low ? 'laag' : c > LEVELS.high ? 'hoog' : 'normaal';
    out.coherence = { tone: TONE[k], verdict: k === 'normaal' ? 'midden' : k,
      norm: `laag < ${fmt(LEVELS.low, 1)} · hoog > ${fmt(LEVELS.high, 1)}`,
      text: 'Coherentie kent geen leeftijdsnorm; ze groeit met oefenen en het juiste ademtempo.' };
  }
  if (!hasProfile(profile)) return out;

  const who = `${sexWord(profile.sex)} ${rmssdBand(profile.age, profile.sex).group} jaar`;
  if (item.rmssd !== null && item.rmssd !== undefined) {
    const band = rmssdBand(profile.age, profile.sex);
    const k = item.rmssd < band.lo ? 'laag' : item.rmssd > band.hi ? 'hoog' : 'normaal';
    let text = 'De norm is gemeten in rust met gewone ademhaling; langzaam ademen verhoogt RMSSD, dus tijdens deze oefening ligt je waarde vaak hoger dan je rustwaarde.';
    if (!band.exact) text += ` Voor jouw leeftijd zijn geen normen; de dichtstbijzijnde groep (${band.group}) is gebruikt.`;
    if (b !== null && b >= 25) text += ` Bij een BMI boven ${b >= 30 ? 30 : 25} ligt RMSSD gemiddeld lager; vergelijk vooral met je eigen eerdere sessies.`;
    out.rmssd = { tone: TONE[k], verdict: k === 'laag' ? 'lager dan de meeste leeftijdgenoten' : k === 'hoog' ? 'hoger dan de meeste leeftijdgenoten' : 'gemiddeld voor je leeftijd',
      norm: `gemiddeld voor ${who}: ${r0(band.lo)}–${r0(band.hi)} ms`, text };
  }
  if (item.hr !== null && item.hr !== undefined) {
    const band = hrBand(profile.age, profile.sex);
    const k = item.hr < band.lo ? 'laag' : item.hr > band.hi ? 'hoog' : 'normaal';
    // lagere hartslag = rustiger → warm; hoger dan gebruikelijk → koel
    out.hr = { tone: k === 'laag' ? TONE.hoog : k === 'hoog' ? TONE.laag : TONE.normaal,
      verdict: k === 'laag' ? 'rustiger dan gemiddeld' : k === 'hoog' ? 'hoger dan gemiddeld' : 'gemiddeld',
      norm: `gemiddeld voor ${who}: ${r0(band.lo)}–${r0(band.hi)} per minuut`,
      text: 'Een lage rusthartslag past meestal bij een goede conditie; bij klachten (duizelig, flauw) of onder 45 is het iets om met een arts te bespreken.' };
  }
  return out;
}
