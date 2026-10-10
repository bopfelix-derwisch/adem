import assert from 'assert';
import { test } from '../harness.mjs';
import { resonanceEstimate, suggestTempo } from '../../adem/tempo.mjs';

test('tempo: schatting uit geslacht en lengte, afgerond op 0,5, binnen 4,5–7', () => {
  assert.strictEqual(resonanceEstimate(180, 'm'), 5.5);   // 17,90 − 0,07·180 = 5,3
  assert.strictEqual(resonanceEstimate(190, 'm'), 4.5);   // 4,6
  assert.strictEqual(resonanceEstimate(160, 'v'), 6.5);   // 15,88 − 0,06·160 = 6,28
  assert.strictEqual(resonanceEstimate(120, 'v'), 7);
  assert.strictEqual(resonanceEstimate(null, 'v'), null);
});

test('tempo: zonder profiel en geschiedenis → 5,5', () => {
  assert.strictEqual(suggestTempo(null, []).tempo, 5.5);
});

test('tempo: met profiel → schatting met uitleg', () => {
  const s = suggestTempo({ age: 50, sex: 'm', height: 188, weight: 80 }, []);
  assert.strictEqual(s.tempo, 4.5);
  assert.ok(/lengte/.test(s.reason));
});

test('tempo: ≥ 2 geteste tempo\'s met coherentie → het beste tempo', () => {
  const h = [
    { mode: 'hart', tempo: 5, coherence: 0.8 }, { mode: 'hart', tempo: 5.5, coherence: 0.5 },
    { mode: 'hart', tempo: 5, coherence: 0.7 }, { mode: 'adem', tempo: 6 },
  ];
  const s = suggestTempo({ height: 180, sex: 'm' }, h);
  assert.strictEqual(s.tempo, 5);
  assert.ok(/coherentie/.test(s.reason));
});

test('tempo: gevoel na de vorige sessie gaat voor (luchthonger → sneller, gejaagd → langzamer)', () => {
  assert.strictEqual(suggestTempo(null, [{ mode: 'adem', tempo: 5, feel: 'luchthonger' }]).tempo, 5.5);
  assert.strictEqual(suggestTempo(null, [{ mode: 'adem', tempo: 7, feel: 'duizelig' }]).tempo, 7);
  assert.strictEqual(suggestTempo(null, [{ mode: 'hart', tempo: 6, feel: 'gejaagd' }]).tempo, 5.5);
  assert.ok(/duizelig/i.test(suggestTempo(null, [{ mode: 'adem', tempo: 5, feel: 'duizelig' }]).reason));
});

test('tempo: één getest tempo → nodigt uit een buurtempo te proberen', () => {
  const s = suggestTempo(null, [{ mode: 'hart', tempo: 5.5, coherence: 0.6, feel: 'prettig' }]);
  assert.ok(s.tempo === 5 || s.tempo === 6, String(s.tempo));
});
