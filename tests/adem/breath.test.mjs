import assert from 'assert';
import { test } from '../harness.mjs';
import { breathAt, cueBetween } from '../../adem/breath.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('breath: 5,5/min → 4,36 s in, 6,55 s uit', () => {
  const cyc = 60 / 5.5, inLen = cyc * 0.4;
  close(inLen, 4.364, 0.001, 'inademduur');
  assert.strictEqual(breathAt(inLen - 0.01, 5.5).phase, 'in');
  assert.strictEqual(breathAt(inLen + 0.01, 5.5).phase, 'out');
  assert.strictEqual(breathAt(cyc + 0.01, 5.5).phase, 'in');
  assert.strictEqual(breathAt(cyc + 0.01, 5.5).cycle, 1);
});

test('breath: cirkel klein → groot → klein, continu', () => {
  close(breathAt(0, 6).size, 0, 1e-9, 'start');
  close(breathAt(4, 6).size, 1, 1e-9, 'einde inademen');   // 6/min: 10 s cyclus, 4 s in
  close(breathAt(9.999, 6).size, 0, 1e-4, 'einde uitademen');
  let prev = breathAt(0, 6).size;
  for (let t = 0.01; t < 20; t += 0.01) {
    const s = breathAt(t, 6).size;
    assert.ok(Math.abs(s - prev) < 0.01, `sprong bij ${t.toFixed(2)}`);
    prev = s;
  }
});

test('breath: ademtonen precies op de fasewissels', () => {
  const cues = [];
  let prev = null;
  for (let k = 0; k < 20 * 60; k++) {
    const t = k / 60, cur = breathAt(t, 6), c = cueBetween(prev, cur);
    if (c) cues.push([t, c]);
    prev = cur;
  }
  assert.deepStrictEqual(cues.map(c => c[1]), ['in', 'out', 'in', 'out']);
  close(cues[1][0], 4, 1 / 60 + 1e-9, 'uit-toon');
  close(cues[2][0], 10, 1 / 60 + 1e-9, 'in-toon');
});
