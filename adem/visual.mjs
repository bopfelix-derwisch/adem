// adem/visual.mjs — ademcirkel met koud→warm-kleur, voortgangsring, kleurbalk en mini-pulsgolf (browser)

import { colorAt } from './palette.mjs';

const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const lighten = (c, f) => c.map(v => Math.round(v + (255 - v) * f));

export class Visual {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  _fit() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w, h, dpr };
  }

  // size 0–1 (ademfase), warmth 0–1 (koud→warm), pulse [{t,y}], active: meting/oefening loopt,
  // progress 0–1 (verstreken sessietijd)
  draw({ size, warmth, pulse, active, progress }) {
    const { w, h, dpr } = this._fit(), x = this.ctx;
    x.clearRect(0, 0, w, h);
    const col = colorAt(warmth), cx = w / 2, cy = h * 0.46;
    const Rmax = Math.min(w, h * 0.92) * 0.40, R = Rmax * (0.45 + 0.55 * size);
    const a = active ? 1 : 0.55;

    // Zachte gloed rond de bol
    const halo = x.createRadialGradient(cx, cy, R * 0.6, cx, cy, Math.min(R * 1.9, w / 2, cy)); // binnen het canvas uitdoven
    halo.addColorStop(0, rgba(col, 0.35 * a));
    halo.addColorStop(1, rgba(col, 0));
    x.fillStyle = halo;
    x.fillRect(0, 0, w, h);

    // Bol: lichter hart, verzadigde rand
    const g = x.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, rgba(lighten(col, 0.45), 0.95 * a));
    g.addColorStop(1, rgba(col, 0.85 * a));
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, R, 0, 2 * Math.PI); x.fill();

    // Voortgangsring (dunne baan + verstreken deel)
    const rr = Rmax * 1.08;
    x.lineWidth = 2.5 * dpr; x.lineCap = 'round';
    x.strokeStyle = 'rgba(255,255,255,0.08)';
    x.beginPath(); x.arc(cx, cy, rr, 0, 2 * Math.PI); x.stroke();
    if (progress > 0) {
      x.strokeStyle = rgba(lighten(col, 0.2), 0.8);
      x.beginPath(); x.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, progress)); x.stroke();
    }

    // Kleurbalk koel → warm met stip op de huidige stand
    const bw = Math.min(w * 0.55, 260 * dpr), bh = 6 * dpr, bx = cx - bw / 2, by = h - 18 * dpr;
    const bar = x.createLinearGradient(bx, 0, bx + bw, 0);
    for (let i = 0; i <= 8; i++) bar.addColorStop(i / 8, rgba(colorAt(i / 8), 0.9));
    x.fillStyle = bar;
    x.beginPath(); x.roundRect ? x.roundRect(bx, by, bw, bh, bh / 2) : x.rect(bx, by, bw, bh); x.fill();
    const mx = bx + bw * Math.min(1, Math.max(0, warmth));
    x.fillStyle = '#fff'; x.strokeStyle = rgba(col, 1); x.lineWidth = 2 * dpr;
    x.beginPath(); x.arc(mx, by + bh / 2, 6 * dpr, 0, 2 * Math.PI); x.fill(); x.stroke();
    x.fillStyle = 'rgba(232,230,225,0.5)'; x.font = `${11 * dpr}px -apple-system, system-ui, sans-serif`;
    x.textBaseline = 'middle';
    x.textAlign = 'right'; x.fillText('koel', bx - 8 * dpr, by + bh / 2);
    x.textAlign = 'left'; x.fillText('warm', bx + bw + 8 * dpr, by + bh / 2);

    // Mini-pulsgolf rechtsboven
    if (pulse && pulse.length > 2) {
      const pw = w * 0.26, ph = h * 0.06, px = w - pw - 8 * dpr, py = 8 * dpr;
      const t0 = pulse[0].t, t1 = pulse[pulse.length - 1].t;
      let lo = Infinity, hi = -Infinity;
      pulse.forEach(p => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
      x.strokeStyle = 'rgba(240,140,130,0.85)'; x.lineWidth = 1.5 * dpr; x.beginPath();
      pulse.forEach((p, i) => {
        const X = px + (p.t - t0) / ((t1 - t0) || 1) * pw, Y = py + ph - (p.y - lo) / ((hi - lo) || 1) * ph;
        i ? x.lineTo(X, Y) : x.moveTo(X, Y);
      });
      x.stroke();
    }
  }
}
