import assert from 'assert';
import { test } from '../harness.mjs';
import { rankCameras, videoConstraints } from '../../adem/camera.mjs';

// Labels zoals gemeten op iPhone 15 Pro (iOS 26, NL)
const IPHONE15PRO = [
  'Camera aan voorzijde', 'Back Triple Camera', 'Back Dual Wide Camera',
  'Ultragroothoekcamera aan achterzijde', 'Dubbele camera achterzijde',
  'Camera aan achterzijde', 'Telelens aan achterzijde',
].map((label, i) => ({ deviceId: 'id' + i, label, kind: 'videoinput' }));

test('camera: iPhone 15 Pro → telelens eerst, gewone achtercamera tweede, geen voorcamera', () => {
  const r = rankCameras(IPHONE15PRO, null);
  assert.strictEqual(r[0].label, 'Telelens aan achterzijde');
  assert.strictEqual(r[1].label, 'Camera aan achterzijde');
  assert.ok(!r.some(d => /voorzijde/.test(d.label)));
});

test('camera: onthouden keuze wint', () => {
  const r = rankCameras(IPHONE15PRO, 'id5');
  assert.strictEqual(r[0].deviceId, 'id5');
});

test('camera: toestel zonder telelens (Engelse labels) → gewone back camera', () => {
  const devs = ['Front Camera', 'Back Dual Wide Camera', 'Back Ultra Wide Camera', 'Back Camera']
    .map((label, i) => ({ deviceId: 'd' + i, label }));
  assert.strictEqual(rankCameras(devs, null)[0].label, 'Back Camera');
});

test('camera: geen harde minimum-framerate (te trage camera → waarschuwing, niet weigeren)', () => {
  const c = videoConstraints({ facingMode: 'environment' });
  assert.strictEqual(c.frameRate.min, undefined);
  assert.strictEqual(c.frameRate.ideal, 60);
  assert.strictEqual(c.facingMode, 'environment');
  assert.deepStrictEqual(videoConstraints({ deviceId: { exact: 'x' } }).deviceId, { exact: 'x' });
});
