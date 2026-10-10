import assert from 'assert';
import { test } from '../harness.mjs';
import { explain, trend } from '../../adem/explain.mjs';

const hart = (o) => Object.assign({ mode: 'hart', tempo: 5.5, minutes: 3, hr: 64, rmssd: 40, coherence: 0.7, highPct: 55, pauseSec: 4 }, o);

test('explain: trend t.o.v. gemiddelde vorige sessies (±10 %)', () => {
  assert.strictEqual(trend(45, [40, 40]), 'hoger');
  assert.strictEqual(trend(35, [40, 40]), 'lager');
  assert.strictEqual(trend(41, [40, 40]), 'gelijk');
  assert.strictEqual(trend(41, []), null);
  assert.strictEqual(trend(null, [40]), null);
});

test('explain: hartslagmodus → uitleg bij elk getal + vergelijking met eerdere hartsessies', () => {
  const prev = [hart({ rmssd: 30 }), { mode: 'adem', minutes: 5 }, hart({ rmssd: 30 })];
  const e = explain(hart(), prev);
  const keys = e.items.map(i => i.key);
  assert.deepStrictEqual(keys, ['hr', 'rmssd', 'coherence', 'highPct', 'pauseSec']);
  for (const i of e.items) assert.ok(i.text.length > 20, i.key);
  assert.ok(/hoger dan/.test(e.items[1].text), e.items[1].text);
  assert.ok(/hoge/.test(e.headline), e.headline);
});

test('explain: lage coherentie → bemoedigende kop, geen oordeel', () => {
  const e = explain(hart({ coherence: 0.2, highPct: 0 }), []);
  assert.ok(e.headline.length > 10);
  assert.ok(!/slecht|fout/i.test(e.headline + e.items.map(i => i.text).join(' ')));
});

test('explain: zonder meting → uitleg over langzaam ademen, geen meetgetallen', () => {
  const e = explain({ mode: 'adem', tempo: 5.5, minutes: 5, hr: null, rmssd: null, coherence: null, highPct: null, pauseSec: 0 }, []);
  assert.deepStrictEqual(e.items, []);
  assert.ok(/adem/i.test(e.body));
});

test('explain: ontbrekende meetwaarden → geen getal-uitleg die "null" toont', () => {
  const e = explain(hart({ hr: null, rmssd: null, coherence: null, highPct: null }), []);
  assert.ok(!/null|NaN|undefined/.test(JSON.stringify(e)));
});
