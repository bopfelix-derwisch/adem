// adem/camera.mjs — achtercamera + flitser + frames {t (s), r, g, b} (browser)

const STORE_KEY = 'adem.camera';
const AVOID = /dual|triple|ultra|dubbel|drievoud|breed|front|voor/i;

function remember(id) { try { localStorage.setItem(STORE_KEY, id); } catch (e) { /* privémodus */ } }
function remembered() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }

// Volgorde van voorkeur: onthouden keuze → telelens (naast de flitser op iPhone Pro) → gewone achtercamera
export function rankCameras(devices, storedId) {
  const back = devices.filter(d => !/front|voor/i.test(d.label));
  const score = d =>
    d.deviceId === storedId ? 0 :
    /tele/i.test(d.label) ? 1 :
    /back|achter/i.test(d.label) && !AVOID.test(d.label) ? 2 : 3;
  return back.slice().sort((a, b) => score(a) - score(b));
}

// Geen harde minimum-framerate: een tragere camera moet nog openen (de app waarschuwt bij < 24 fps)
export function videoConstraints(which) {
  return Object.assign({ width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } }, which);
}

export class Camera {
  constructor(video, onFrame) {
    this.video = video;
    this.onFrame = onFrame;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 40; this.canvas.height = 30;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.stream = null; this.track = null; this.list = []; this.running = false;
    this.torch = false;
  }

  get label() { return this.track ? this.track.label : ''; }

  // Opent de beste achtercamera; geeft { torch: bool } terug. Gooit bij geweigerde toegang.
  async open() {
    await this._start({ facingMode: 'environment' }); // nodig voordat labels zichtbaar zijn
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    this.list = rankCameras(devices, remembered());
    const best = this.list[0];
    if (best && best.deviceId !== this.track.getSettings().deviceId) await this._start({ deviceId: { exact: best.deviceId } });
    return { torch: this.torch };
  }

  // Volgende achtercamera in de lijst (knop "Andere lens"); onthoudt de keuze
  async nextLens() {
    if (!this.list.length) return;
    const cur = this.track.getSettings().deviceId;
    const i = this.list.findIndex(d => d.deviceId === cur);
    const next = this.list[(i + 1) % this.list.length];
    await this._start({ deviceId: { exact: next.deviceId } });
    remember(next.deviceId);
  }

  async _start(which) {
    this.close();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints(which),
    });
    this.track = this.stream.getVideoTracks()[0];
    this.video.srcObject = this.stream;
    await this.video.play();
    this.torch = await this.setTorch(true);
    this.running = true;
    this._loop();
  }

  async setTorch(on) {
    try { await this.track.applyConstraints({ advanced: [{ torch: on }] }); return on; }
    catch (e) { return false; }
  }

  // Witbalans vastzetten zodra de vinger goed ligt (iOS regelt anders de rode tint weg)
  async lockWhiteBalance() {
    const caps = this.track && this.track.getCapabilities ? this.track.getCapabilities() : {};
    if (!caps.whiteBalanceMode || !caps.whiteBalanceMode.includes('manual')) return false;
    try { await this.track.applyConstraints({ advanced: [{ whiteBalanceMode: 'manual' }] }); return true; }
    catch (e) { return false; }
  }

  _loop() {
    const v = this.video, track = this.track;
    const tick = (now, meta) => {
      if (!this.running || this.track !== track) return;
      const t = meta && meta.captureTime ? meta.captureTime / 1000
        : meta && meta.mediaTime !== undefined ? meta.mediaTime
        : performance.now() / 1000;
      this.ctx.drawImage(v, 0, 0, 40, 30);
      const d = this.ctx.getImageData(0, 0, 40, 30).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      this.onFrame({ t, r: r / n, g: g / n, b: b / n });
      next();
    };
    const next = () => v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(now => tick(now, null));
    next();
  }

  close() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.track = null;
  }
}
