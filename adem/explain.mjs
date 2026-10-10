// adem/explain.mjs — uitleg bij de resultaten, met vergelijking t.o.v. eerdere sessies (puur)

import { LEVELS } from './hrv.mjs';

const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');

// 'hoger' | 'lager' | 'gelijk' t.o.v. het gemiddelde van eerdere waarden (±10 %), of null
export function trend(value, previous) {
  const P = previous.filter(v => typeof v === 'number');
  if (value === null || value === undefined || !P.length) return null;
  const avg = P.reduce((a, b) => a + b, 0) / P.length;
  return value > avg * 1.1 ? 'hoger' : value < avg * 0.9 ? 'lager' : 'gelijk';
}

function compare(key, value, prev, digits, unit) {
  const P = prev.map(p => p[key]).filter(v => typeof v === 'number');
  const t = trend(value, P);
  if (!t) return '';
  const avg = P.reduce((a, b) => a + b, 0) / P.length;
  const n = P.length === 1 ? 'je vorige sessie' : `je vorige ${P.length} sessies`;
  return t === 'gelijk'
    ? ` Vergelijkbaar met ${n} (${fmt(avg, digits)}${unit}).`
    : ` Dat is ${t} dan ${n} (gemiddeld ${fmt(avg, digits)}${unit}).`;
}

const BREATH = 'Rond 5,5 keer per minuut ademen valt samen met het natuurlijke ritme van je bloeddrukregeling (de baroreflex). '
  + 'Je hartslag gaat dan omhoog bij inademen en omlaag bij uitademen, in één grote, regelmatige golf. '
  + 'Die resonantie versterkt de rustzenuw (nervus vagus); oefenen hiermee verlaagt in studies stress en angst.';

// item: het zojuist opgeslagen resultaat; previous: eerdere items (nieuwste eerst)
export function explain(item, previous) {
  if (item.mode === 'adem') {
    return {
      headline: item.minutes >= 1 ? `${item.minutes} minuten rustig geademd` : 'Even rustig geademd',
      body: BREATH + ' Ook zonder meting werkt het: het langzame ademen zelf doet het werk. Wil je zien hoe je hart meegolft, kies dan een keer "Met hartslag".',
      items: [],
    };
  }

  const prev = previous.filter(p => p.mode !== 'adem').slice(0, 5);
  const c = item.coherence;
  const headline = c === null ? 'Te weinig meting voor een coherentiescore'
    : c > LEVELS.high ? 'Mooi: je hartritme golfde in hoge coherentie mee'
      : c >= LEVELS.low ? 'Je hartritme begon mee te golven met je adem'
        : 'Een begin — coherentie groeit met oefenen';
  const body = BREATH + (c !== null && c < LEVELS.low
    ? ' Lage coherentie is normaal in de eerste sessies of bij spanning; adem zonder forceren, vooral lang uit.'
    : '');

  const items = [];
  if (item.hr !== null) items.push({ key: 'hr', label: 'Gemiddelde hartslag',
    text: 'Slagen per minuut tijdens de oefening. In rust ligt dit bij volwassenen meestal tussen 60 en 80.' + compare('hr', item.hr, prev, 0, '') });
  if (item.rmssd !== null) items.push({ key: 'rmssd', label: 'RMSSD',
    text: 'Hoeveel je hartslag van slag tot slag wisselt, in milliseconden. Hoger betekent meer activiteit van de rustzenuw. '
      + 'Bij volwassenen vaak 20–60 ms en sterk afhankelijk van leeftijd, dus vergelijk vooral met jezelf.' + compare('rmssd', item.rmssd, prev, 0, ' ms') });
  if (c !== null) items.push({ key: 'coherence', label: 'Gemiddelde coherentie',
    text: `Hoe regelmatig je hartslag met je adem meegolft (0–1). Onder ${fmt(LEVELS.low, 1)} laag, boven ${fmt(LEVELS.high, 1)} hoog — dan is de cirkel goud.`
      + compare('coherence', c, prev, 2, '') });
  if (item.highPct !== null) items.push({ key: 'highPct', label: 'Tijd in hoge coherentie',
    text: 'Het deel van de oefentijd waarin de cirkel warm/goud was. Het eerste halve tot hele minuut telt niet mee: dan wordt je ritme nog ingelezen.'
      + compare('highPct', item.highPct, prev, 0, ' %') });
  items.push({ key: 'pauseSec', label: 'Pauze',
    text: 'Tijd dat de camera je vinger niet goed zag. Die tijd telt niet mee in de getallen hierboven. Leg je vinger licht neer: drukken knijpt het bloed weg.' });
  return { headline, body, items };
}
