// adem/visual.mjs — ademcirkel met coherentiekleur + mini-pulsgolf op canvas (browser)

const COOL = [120, 140, 160], WARM = [245, 190, 90];
const mix = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));

export class Visual {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  _fit() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w, h, dpr };
  }

  // size 0–1 (ademfase), coherence 0–1 of null, pulse [{t,y}], active: meting loopt
  draw({ size, coherence, pulse, active }) {
    const { w, h, dpr } = this._fit(), x = this.ctx;
    x.clearRect(0, 0, w, h);
    const u = coherence === null ? 0 : coherence;
    const [r, g, b] = mix(COOL, WARM, u);
    const R = Math.min(w, h) * (0.18 + 0.22 * size);

    x.save();
    x.globalAlpha = active ? 1 : 0.4;
    if (!this.reduced) { x.shadowColor = `rgba(${r},${g},${b},${0.3 + 0.6 * u})`; x.shadowBlur = (10 + 50 * u) * dpr; }
    x.fillStyle = `rgba(${r},${g},${b},${0.35 + 0.45 * u})`;
    x.beginPath(); x.arc(w / 2, h / 2, R, 0, 2 * Math.PI); x.fill();
    x.restore();

    // Mini-pulsgolf rechtsonder
    if (pulse && pulse.length > 2) {
      const pw = w * 0.3, ph = h * 0.08, px = w - pw - 12 * dpr, py = h - ph - 12 * dpr;
      const t0 = pulse[0].t, t1 = pulse[pulse.length - 1].t;
      let lo = Infinity, hi = -Infinity;
      pulse.forEach(p => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
      x.strokeStyle = 'rgba(230,120,110,0.9)'; x.lineWidth = 1.5 * dpr; x.beginPath();
      pulse.forEach((p, i) => {
        const X = px + (p.t - t0) / ((t1 - t0) || 1) * pw, Y = py + ph - (p.y - lo) / ((hi - lo) || 1) * ph;
        i ? x.lineTo(X, Y) : x.moveTo(X, Y);
      });
      x.stroke();
    }
  }
}
