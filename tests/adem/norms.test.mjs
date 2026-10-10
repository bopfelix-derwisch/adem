import assert from 'assert';
import { test } from '../harness.mjs';
import { rmssdBand, hrBand, bmi, bmiClass, assess } from '../../adem/norms.mjs';

test('norms: RMSSD-band volgt Voss 2015 (P25–P75, lognormaal) en daalt met leeftijd', () => {
  const v30 = rmssdBand(30, 'v'), m50 = rmssdBand(50, 'm'), m70 = rmssdBand(70, 'm');
  assert.strictEqual(v30.group, '25–34');
  assert.ok(Math.abs(v30.lo - 27.1) < 0.5 && Math.abs(v30.hi - 53.0) < 0.5, JSON.stringify(v30));
  assert.ok(m50.hi < v30.hi && m70.hi < m50.hi);
});

test('norms: leeftijd buiten 25–74 → dichtstbijzijnde groep; geslacht onbekend → gemiddelde', () => {
  assert.strictEqual(rmssdBand(19, 'v').group, '25–34');
  assert.strictEqual(rmssdBand(82, 'm').group, '65–74');
  const x = rmssdBand(40, null), v = rmssdBand(40, 'v'), m = rmssdBand(40, 'm');
  assert.ok(x.lo > Math.min(v.lo, m.lo) - 0.01 && x.hi < Math.max(v.hi, m.hi) + 0.01);
});

test('norms: hartslagband uit meanNN (≈ 60–75 bpm)', () => {
  const b = hrBand(45, 'm');
  assert.ok(b.lo > 55 && b.lo < 63 && b.hi > 68 && b.hi < 78, JSON.stringify(b));
});

test('norms: BMI en WHO-klasse', () => {
  assert.strictEqual(Math.round(bmi(82, 184) * 10) / 10, 24.2);
  assert.strictEqual(bmiClass(17).key, 'onder');
  assert.strictEqual(bmiClass(24.9).key, 'normaal');
  assert.strictEqual(bmiClass(27).key, 'over');
  assert.strictEqual(bmiClass(31).key, 'obesitas');
});

test('norms: beoordeling geeft kleur (koel = laag, groen = normaal, warm = hoog) per uitkomst', () => {
  const p = { age: 50, sex: 'm', height: 180, weight: 80 };
  const lo = assess({ mode: 'hart', hr: 70, rmssd: 10, coherence: 0.2 }, p);
  const mid = assess({ mode: 'hart', hr: 65, rmssd: 25, coherence: 0.45 }, p);
  const hi = assess({ mode: 'hart', hr: 50, rmssd: 80, coherence: 0.8 }, p);
  assert.ok(lo.rmssd.tone < 0.3 && mid.rmssd.tone > 0.3 && mid.rmssd.tone < 0.7 && hi.rmssd.tone > 0.7);
  assert.ok(lo.coherence.tone < 0.3 && hi.coherence.tone > 0.7);
  assert.ok(/45–54/.test(mid.rmssd.norm), mid.rmssd.norm);
  assert.ok(hi.hr.tone > 0.7 && mid.hr.tone > 0.3 && mid.hr.tone < 0.7);
  assert.ok(mid.bmi && mid.bmi.value > 24 && mid.bmi.value < 25);
});

test('norms: hoge BMI → uitleg dat RMSSD gemiddeld lager ligt; zonder profiel geen leeftijdsnorm', () => {
  const a = assess({ mode: 'hart', hr: 70, rmssd: 20, coherence: 0.5 }, { age: 40, sex: 'v', height: 165, weight: 90 });
  assert.ok(/BMI/.test(a.rmssd.text), a.rmssd.text);
  const n = assess({ mode: 'hart', hr: 70, rmssd: 20, coherence: 0.5 }, null);
  assert.strictEqual(n.rmssd, undefined);
  assert.ok(n.coherence.tone > 0.3);
  assert.ok(!/null|NaN|undefined/.test(JSON.stringify(n)));
});
