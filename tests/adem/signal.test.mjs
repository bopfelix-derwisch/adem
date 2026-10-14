import assert from 'assert';
import { test } from '../harness.mjs';
import { PpgProcessor } from '../../adem/signal.mjs';
import { beatTimes, ppgFrames, noiseFrames, realisticFrames } from './synth.mjs';

function run(frames) {
  const p = new PpgProcessor(), beats = [];
  let q = null;
  for (const f of frames) {
    const b = p.push(f);
    if (b !== null) beats.push(b);
    if (Math.floor(f.t) !== Math.floor(f.t - 1 / 60)) q = p.quality();
  }
  return { p, beats, q: p.quality() || q };
}

// Vergelijk gedetecteerde RR met echte RR (constante filtervertraging valt weg in RR)
function rrError(trueBeats, found, from = 5) {
  const T = trueBeats.filter(t => t > from), errs = [];
  for (let i = 1; i < T.length; i++) {
    const a = found.find(x => Math.abs(x - T[i - 1] - 0.05) < 0.15);
    const b = found.find(x => Math.abs(x - T[i] - 0.05) < 0.15);
    if (a !== undefined && b !== undefined) errs.push(Math.abs((b - a) - (T[i] - T[i - 1])) * 1000);
  }
  return { n: errs.length, expected: T.length - 1, mean: errs.reduce((x, y) => x + y, 0) / errs.length, max: Math.max(...errs) };
}

test('signal: 60 fps — RR binnen 5 ms gemiddeld, alle slagen gevonden', () => {
  const beats = beatTimes({ seconds: 40 });
  const { beats: found } = run(ppgFrames({ beats, seconds: 40 }));
  const e = rrError(beats, found);
  assert.ok(e.n >= e.expected - 1, `slagen gemist: ${e.n}/${e.expected}`);
  assert.ok(e.mean < 5, `gem. fout ${e.mean.toFixed(1)} ms`);
  assert.ok(e.max < 15, `max fout ${e.max.toFixed(1)} ms`);
});

test('signal: kwaliteit hoog en hartslag klopt binnen 1 bpm', () => {
  const beats = beatTimes({ seconds: 30, modAmp: 0 }); // vaste RR 0,85 s = 70,6 bpm
  const { q } = run(ppgFrames({ beats, seconds: 30 }));
  assert.ok(q.q > 0.8, `kwaliteit ${q.q.toFixed(2)}`);
  assert.ok(Math.abs(q.bpm - 60 / 0.85) < 1, `bpm ${q.bpm.toFixed(1)}`);
});

test('signal: pure ruis → kwaliteit < 0,3', () => {
  const { q } = run(noiseFrames({ seconds: 20 }));
  assert.ok(q.q < 0.3, `kwaliteit ${q.q.toFixed(2)}`);
});

test('signal: 30 fps (andere telefoon / energiebesparing) — RR binnen 10 ms', () => {
  const beats = beatTimes({ seconds: 40 });
  const { beats: found } = run(ppgFrames({ beats, seconds: 40, fps: 30 }));
  const e = rrError(beats, found);
  assert.ok(e.n >= e.expected - 1, `slagen gemist: ${e.n}/${e.expected}`);
  assert.ok(e.mean < 10, `gem. fout ${e.mean.toFixed(1)} ms`);
});

test('signal: 50 en 150 bpm worden beide gevolgd', () => {
  for (const rr of [1.2, 0.4]) {
    const beats = beatTimes({ seconds: 30, baseRR: rr, modAmp: 0 });
    const { q, beats: found } = run(ppgFrames({ beats, seconds: 30 }));
    assert.ok(Math.abs(q.bpm - 60 / rr) < 3, `rr ${rr}: bpm ${q.bpm.toFixed(1)}`);
    const late = found.filter(t => t > 10).length, want = beats.filter(t => t > 10).length;
    assert.ok(Math.abs(late - want) <= 1, `rr ${rr}: ${late} slagen, verwacht ${want}`);
  }
});

test('signal: 5 s gat in frames (tabblad weg) → herstart zonder vals lange slag', () => {
  const beats = beatTimes({ seconds: 40, modAmp: 0 });
  const frames = ppgFrames({ beats, seconds: 40 }).filter(f => f.t < 15 || f.t > 20);
  const { beats: found } = run(frames);
  const after = found.filter(t => t > 20);
  assert.ok(after.length > 15, `na gat ${after.length} slagen`);
  assert.ok(!found.some(t => t > 20 && t < 22.5), 'slag gemeld tijdens inslingeren na gat');
  for (let i = 1; i < found.length; i++) {
    const rr = found[i] - found[i - 1];
    if (found[i - 1] < 15 && found[i] > 20) continue; // RR over het gat zelf filtert hrv.cleanRR
    assert.ok(rr > 0.7 && rr < 1.0, `onverwachte RR ${rr.toFixed(3)} bij ${found[i].toFixed(1)} s`);
  }
});

test('signal: dubbele en terug-in-de-tijd frames worden genegeerd', () => {
  const p = new PpgProcessor();
  for (let k = 0; k < 40; k++) p.push({ t: k / 60, r: 200, g: 1, b: 32 });
  assert.strictEqual(p.push({ t: 39 / 60, r: 0, g: 0, b: 0 }), null);
  assert.strictEqual(p.lastT, 39 / 60);
});

test('signal: sterke ademgolf in hartslag (RR ±0,2 s, 0,09 Hz) → kwaliteit blijft > 0,5', () => {
  // Bij goed coherent ademen schommelt de hartslag sterk; dat mag geen "vinger kwijt" geven
  const beats = beatTimes({ seconds: 60, modAmp: 0.2, modHz: 0.09 });
  const p = new PpgProcessor(), qs = [];
  for (const f of ppgFrames({ beats, seconds: 60, noise: 0.4 })) {
    p.push(f);
    if (f.t > 15 && Math.abs(f.t % 1) < 1 / 60) qs.push(p.quality().q);
  }
  assert.ok(Math.min(...qs) > 0.5, `kwaliteit min ${Math.min(...qs).toFixed(2)}`);
});

test('signal: ruis met meerdere seeds → kwaliteit blijft < 0,3', () => {
  for (const seed of [7, 8, 9, 10, 11]) {
    const p = new PpgProcessor(), qs = [];
    for (const f of noiseFrames({ seconds: 40, seed })) {
      p.push(f);
      if (f.t > 15 && Math.abs(f.t % 1) < 1 / 60) qs.push(p.quality().q);
    }
    assert.ok(Math.max(...qs) < 0.3, `seed ${seed}: kwaliteit max ${Math.max(...qs).toFixed(2)}`);
  }
});

// Review #1/#2: vinger eraf → camera ziet geen rood meer. Direct q = 0 en geen ruisslagen.
function fingerOffOn() {
  const b1 = beatTimes({ seconds: 30, modAmp: 0 });
  const b2 = beatTimes({ seconds: 30, modAmp: 0 }).map(t => t + 45);
  return [
    ...ppgFrames({ beats: b1, seconds: 30 }),
    ...noiseFrames({ seconds: 15 }).map(f => Object.assign({}, f, { t: f.t + 30 })),
    ...ppgFrames({ beats: b2, seconds: 75 }).filter(f => f.t >= 45),
  ];
}

test('signal: vinger eraf → binnen 1 s kwaliteit 0 en geen slagen zolang hij weg is', () => {
  const p = new PpgProcessor(), found = [];
  let q31 = null;
  for (const f of fingerOffOn()) {
    const b = p.push(f);
    if (b !== null) found.push(b);
    if (q31 === null && f.t >= 31) q31 = p.quality().q;
  }
  assert.strictEqual(q31, 0, 'kwaliteit 1 s na weghalen: ' + q31);
  assert.ok(!found.some(t => t > 30.2 && t < 45), 'ruisslagen: ' + found.filter(t => t > 30.2 && t < 45).map(t => t.toFixed(1)));
  assert.ok(found.filter(t => t > 50).length > 15, 'slagen na terugleggen');
});

test('signal: vinger terug → kwaliteit binnen 6 s weer > 0,5', () => {
  const p = new PpgProcessor();
  let back = null;
  for (const f of fingerOffOn()) {
    p.push(f);
    if (f.t >= 45 && back === null && Math.floor(f.t * 4) !== Math.floor((f.t - 1 / 60) * 4) && p.quality().q > 0.5) back = f.t;
  }
  assert.ok(back !== null && back < 51, 'kwaliteit weer goed op ' + back);
});

// Vinger lag stil maar de app zei toch "vinger kwijt": op een ruiziger signaal won een
// ruispiekje vóór de opgaande flank, en één foute slag keurde ook de buren af
test('signal: realistisch signaal (30 fps, ruis, ademgolf, bewegingen) → zelden een pauze', () => {
  let qSum = 0, n = 0, pauses = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const p = new PpgProcessor();
    let low = 0;
    for (const f of realisticFrames({ seed })) {
      p.push(f);
      if (f.t < 15 || Math.floor(f.t) === Math.floor(f.t - 1 / 30)) continue;
      const q = p.quality().q;
      qSum += q; n++;
      low = q < 0.3 ? low + 1 : 0;
      if (low === 3) pauses++; // zelfde regel als session: 3 s onder Q_BAD
    }
  }
  assert.ok(qSum / n > 0.6, `gem. kwaliteit ${(qSum / n).toFixed(2)}`);
  assert.ok(pauses <= 4, `${pauses} pauzes in 6 × 105 s`);
});
