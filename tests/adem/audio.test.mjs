import assert from 'assert';
import { test } from '../harness.mjs';
import { breathTone, binauralFreqs } from '../../adem/audio.mjs';

test('audio: grondtoon ademt mee — uitgeademd donker en zacht, ingeademd helder en luider', () => {
  const lo = breathTone(0), hi = breathTone(1);
  assert.ok(lo.cutoff < 400 && hi.cutoff > 1000, `cutoff ${lo.cutoff} → ${hi.cutoff}`);
  assert.ok(hi.gain > 1.8 * lo.gain, `gain ${lo.gain} → ${hi.gain}`);
  let prev = breathTone(0);
  for (let s = 0.1; s <= 1; s += 0.1) {
    const cur = breathTone(s);
    assert.ok(cur.cutoff > prev.cutoff && cur.gain > prev.gain, `niet stijgend bij ${s.toFixed(1)}`);
    prev = cur;
  }
});

test('audio: binaurale toon — 6 Hz verschil (theta), draaggolf 200 Hz', () => {
  const f = binauralFreqs();
  assert.strictEqual(f.right - f.left, 6);
  assert.strictEqual(f.left, 200);
});
