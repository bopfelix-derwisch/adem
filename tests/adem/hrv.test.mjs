import assert from 'assert';
import { test } from '../harness.mjs';
import { rrSeries, heartRate, rmssd, coherence, level } from '../../adem/hrv.mjs';
import { beatTimes, rng, gauss } from './synth.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('hrv: RMSSD van bekende reeks exact', () => {
  const beats = [0, 0.8, 1.7, 2.5, 3.4]; // rr 0.8 0.9 0.8 0.9 → verschillen ±0.1
  close(rmssd(rrSeries(beats)), 100, 1e-6, 'rmssd');
  close(heartRate(rrSeries(beats).map(p => p.rr)), 60 / 0.85, 1e-6, 'hr');
});

test('hrv: valse extra slagen worden weggefilterd en breken RMSSD niet', () => {
  const beats = beatTimes({ seconds: 60, modAmp: 0 });
  // valse slagen ná de refractaire periode van de detector (0,33 s)
  const dirty = [...beats, beats[10] + 0.35, beats[30] + 0.4, beats[50] + 0.5].sort((a, b) => a - b);
  const S = rrSeries(dirty);
  assert.ok(S.every(p => Math.abs(p.rr - 0.85) < 0.01), 'uitschieter overgebleven');
  close(rmssd(S), 0, 1e-6, 'rmssd zonder variatie');
});

test('hrv: coherentie null bij < 45 s data', () => {
  const beats = beatTimes({ seconds: 40 });
  assert.strictEqual(coherence(beats, 40), null);
});

test('hrv: RR die met 0,1 Hz golft → coherentie > 0,6, piek bij 0,1 Hz', () => {
  const beats = beatTimes({ seconds: 70, modAmp: 0.06, modHz: 0.1 });
  const c = coherence(beats, 70);
  assert.ok(c.value > 0.6, `coherentie ${c.value.toFixed(2)}`);
  close(c.peakHz, 0.1, 0.02, 'piek');
  assert.strictEqual(level(c.value), 'hoog');
});

test('hrv: willekeurige RR → gemiddeld coherentie < 0,3, nooit "hoog"', () => {
  // Eén venster van 64 s ruis kan toevallig rond de 0,3 uitkomen; de feedback strijkt glad
  const vals = [];
  for (let seed = 1; seed <= 10; seed++) {
    const rand = rng(seed), beats = [1];
    while (beats[beats.length - 1] < 70) beats.push(beats[beats.length - 1] + 0.85 + 0.04 * gauss(rand));
    vals.push(coherence(beats, 70).value);
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  assert.ok(mean < 0.3, `gemiddeld ${mean.toFixed(2)} (${vals.map(v => v.toFixed(2)).join(' ')})`);
  assert.ok(vals.every(v => level(v) !== 'hoog'), vals.map(v => v.toFixed(2)).join(' '));
});

test('hrv: gat van 10 s (vinger weg) → nog steeds een waarde, geen NaN', () => {
  const beats = beatTimes({ seconds: 75, modAmp: 0.06 }).filter(t => t < 30 || t > 40);
  const c = coherence(beats, 75);
  assert.ok(c && Number.isFinite(c.value) && c.value >= 0 && c.value <= 1, JSON.stringify(c));
  const S = rrSeries(beats);
  assert.ok(S.every(p => p.rr < 1.2), 'RR over het gat niet weggefilterd');
});

test('hrv: sterke ademgolf (RR 0,85 ± 0,25 s) — toppen en dalen blijven behouden', () => {
  const beats = beatTimes({ seconds: 70, modAmp: 0.25, modHz: 0.09 });
  const all = beats.length - 1, kept = rrSeries(beats).length;
  assert.strictEqual(kept, all, `${all - kept} echte intervallen weggegooid`);
  assert.ok(coherence(beats, 70).value > 0.6, 'coherentie');
});
