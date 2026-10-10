import assert from 'assert';
import { test } from '../harness.mjs';
import { colorAt, ademWarmth } from '../../adem/palette.mjs';

// Verzadiging (HSV) en tint in graden, uit [r,g,b] 0–255
function hsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx / 255 };
}

test('palette: nergens grijs — elke stap duidelijk verzadigd', () => {
  for (let u = 0; u <= 1.0001; u += 0.05) assert.ok(hsv(colorAt(u)).s > 0.35, 'u=' + u.toFixed(2) + ' ' + colorAt(u));
});

test('palette: koud begin (blauw) → warm eind (amber/goud), geen rood', () => {
  const lo = hsv(colorAt(0)), hi = hsv(colorAt(1));
  assert.ok(lo.h > 195 && lo.h < 235, 'begin blauw, h=' + lo.h);
  assert.ok(hi.h > 30 && hi.h < 50, 'eind amber, h=' + hi.h);
  for (let u = 0; u <= 1.0001; u += 0.05) { const h = hsv(colorAt(u)).h; assert.ok(h > 25, 'geen rood bij u=' + u.toFixed(2)); }
});

test('palette: tint loopt gelijkmatig van koud naar warm (via groen, niet via paars)', () => {
  let prev = Infinity;
  for (let u = 0; u <= 1.0001; u += 0.05) { const h = hsv(colorAt(u)).h; assert.ok(h <= prev + 1, 'u=' + u.toFixed(2)); prev = h; }
});

test('palette: buiten 0–1 begrensd, geldige RGB', () => {
  assert.deepStrictEqual(colorAt(-1), colorAt(0));
  assert.deepStrictEqual(colorAt(2), colorAt(1));
  for (const v of colorAt(0.5)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
});

test('palette: alleen-ademen warmt in ~2 min op, inademen iets warmer', () => {
  assert.ok(ademWarmth(0, 0) < 0.15);
  assert.ok(ademWarmth(120, 0) > 0.75);
  assert.ok(ademWarmth(600, 0) <= 1);
  assert.ok(ademWarmth(60, 1) > ademWarmth(60, 0));
});
