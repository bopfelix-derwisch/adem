import assert from 'assert';
import { test } from '../harness.mjs';
import { createSession, step, summary, signalLevel } from '../../adem/session.mjs';

// Draai `sec` seconden in tikken van 1 s met vaste input; geeft toestanden per tik
function run(s, sec, input) {
  const states = [];
  for (let i = 0; i < sec; i++) states.push(step(s, 1, input).state);
  return states;
}

test('session: vinger 3 s goed → inlezen → oefenen zodra coherentie er is', () => {
  const s = createSession(300);
  run(s, 2, { quality: 0.9, coherence: null });
  assert.strictEqual(s.state, 'zoek-vinger');
  run(s, 1, { quality: 0.9, coherence: null });
  assert.strictEqual(s.state, 'inlezen');
  run(s, 40, { quality: 0.9, coherence: null });
  assert.strictEqual(s.state, 'inlezen');
  run(s, 1, { quality: 0.9, coherence: 0.5 });
  assert.strictEqual(s.state, 'oefenen');
});

test('session: zoeken telt niet mee voor de sessieklok', () => {
  const s = createSession(60);
  run(s, 100, { quality: 0.1, coherence: null });
  assert.strictEqual(s.state, 'zoek-vinger');
  assert.strictEqual(s.elapsed, 0);
});

test('session: vinger weg midden in oefenen → pauze, terug → hervat; pauzetijd apart', () => {
  const s = createSession(300);
  run(s, 3, { quality: 0.9, coherence: null });
  run(s, 1, { quality: 0.9, coherence: 0.7 });
  run(s, 10, { quality: 0.9, coherence: 0.7 });
  run(s, 3, { quality: 0.1, coherence: 0.7 });
  assert.strictEqual(s.state, 'pauze');
  run(s, 7, { quality: 0.1, coherence: 0.7 });
  run(s, 3, { quality: 0.9, coherence: 0.7 });
  assert.strictEqual(s.state, 'oefenen');
  const sum = summary(s);
  assert.ok(sum.pauseSec >= 9 && sum.pauseSec <= 11, `pauze ${sum.pauseSec}`);
  assert.strictEqual(sum.highPct, 100);
});

test('session: tabblad verborgen → direct pauze', () => {
  const s = createSession(300);
  run(s, 3, { quality: 0.9, coherence: null });
  step(s, 0.1, { quality: 0.9, coherence: null, hidden: true });
  assert.strictEqual(s.state, 'pauze');
  assert.strictEqual(s.resume, 'inlezen');
});

test('session: einde na duur; samenvatting klopt', () => {
  const s = createSession(60);
  run(s, 3, { quality: 0.9, coherence: null });  // gevonden
  run(s, 20, { quality: 0.9, coherence: null }); // inlezen
  run(s, 20, { quality: 0.9, coherence: 0.4 });
  run(s, 30, { quality: 0.9, coherence: 0.8 });
  assert.strictEqual(s.state, 'einde');
  const sum = summary(s);
  assert.strictEqual(sum.practiceSec, 39);   // 60 s klok − 20 inlezen − 1 overgangstik
  assert.ok(sum.meanCoherence > 0.4 && sum.meanCoherence < 0.8);
  assert.strictEqual(sum.highPct, Math.round(100 * 20 / 39));
});

test('session: korte dip (< 3 s) geeft geen pauze', () => {
  const s = createSession(300);
  run(s, 3, { quality: 0.9, coherence: null });
  run(s, 2, { quality: 0.1, coherence: null });
  run(s, 1, { quality: 0.9, coherence: null });
  run(s, 2, { quality: 0.1, coherence: null });
  assert.strictEqual(s.state, 'inlezen');
});

test('session: signaalniveau voor de vinger-indicator', () => {
  assert.strictEqual(signalLevel(0.9), 'goed');
  assert.strictEqual(signalLevel(0.5), 'zwak');   // grens: goed is > 0,5
  assert.strictEqual(signalLevel(0.3), 'zwak');   // grens: geen is < 0,3
  assert.strictEqual(signalLevel(0.1), 'geen');
});

test('session: modus zonder meting start direct, pauzeert nooit, eindigt op tijd', () => {
  const s = createSession(60, { measured: false });
  assert.strictEqual(s.state, 'oefenen');
  run(s, 30, { quality: 0, coherence: null });
  assert.strictEqual(s.state, 'oefenen');           // geen vinger → geen pauze
  step(s, 1, { quality: 0, coherence: null, hidden: true });
  assert.strictEqual(s.state, 'oefenen');           // tabblad weg → geen pauze
  run(s, 29, { quality: 0, coherence: null });
  assert.strictEqual(s.state, 'einde');
  const sum = summary(s);
  assert.strictEqual(sum.practiceSec, 60);
  assert.strictEqual(sum.meanCoherence, null);
  assert.strictEqual(sum.highPct, null);
  assert.strictEqual(sum.pauseSec, 0);
});
