// adem/signal.mjs — PPG-signaalverwerking: filters, slagdetectie, kwaliteit (puur, geen DOM)

const KEEP = 12;          // seconden gefilterd signaal bewaren
const REFRACTORY = 0.33;  // s, max ~180 bpm
const GAP_RESET = 1.0;    // s zonder frames → opnieuw beginnen
const SETTLE = 2.0;       // s na (her)start geen slagen melden: filter slingert nog in
const Q_WINDOW = 8;       // s, venster voor de kwaliteit
const MAX_STEP = 0.3;     // max relatieve RR-verandering per slag (ademgolf ~12 %, plus meetruis)
const MIN_SHAPE = 0.85;   // min correlatie tussen de golfvormen van opeenvolgende slagen
const OFF_AFTER = 0.5;    // s zonder rood beeld → vinger weg

// Vinger + flitser op de lens geeft een overwegend rood beeld; zonder vinger niet
const isFinger = f => f.r > 40 && f.r > 1.3 * f.g && f.r > 1.3 * f.b;

// 2e-orde Butterworth-biquad (RBJ-cookbook), type 'hp' of 'lp'
export function biquad(type, f0, fs) {
  const w = 2 * Math.PI * f0 / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + al;
  const b = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const b0 = b[0] / a0, b1 = b[1] / a0, b2 = b[2] / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// Banddoorlaat 0,6–4 Hz
export function makeBandpass(fs) {
  const hp = biquad('hp', 0.6, fs), lp = biquad('lp', 4, fs);
  return x => lp(hp(x));
}

// Eén kanaal: filtert, bewaart {t,y} en detecteert slagen op de steilste stijging
class Track {
  constructor(fs, warmup, key) {
    this.key = key;
    this.span = Math.max(1, Math.round(fs / 30)); // afgeleide over ±span frames: minder ruis
    this.settleUntil = warmup[warmup.length - 1].t + SETTLE;
    this.filter = makeBandpass(fs);
    this.F = [];
    this.lastBeat = -Infinity;
    this.beats = [];
    for (const f of warmup) this.filter(-(f[key] - warmup[0][key])); // inslingeren
    this.offset = warmup[0][key];
  }

  // Geeft een (sub-frame) slagtijd terug, of null
  push(f) {
    const F = this.F;
    F.push({ t: f.t, y: this.filter(-(f[this.key] - this.offset)) }); // inverteren: dip = slag
    while (F.length && f.t - F[0].t > KEEP) F.shift();
    const h = this.span, n = F.length, i = n - 2 - h;
    if (i < 1 + h) return null;
    const d = k => (F[k + h].y - F[k - h].y) / (F[k + h].t - F[k - h].t);
    const d0 = d(i - 1), d1 = d(i), d2 = d(i + 1);
    if (!(d1 > d0 && d1 >= d2 && d1 > 0)) return null;
    let maxD = 0;
    for (let k = n - 1 - h; k >= h && F[k].t > f.t - 3; k--) maxD = Math.max(maxD, d(k));
    if (d1 < 0.4 * maxD || f.t < this.settleUntil) return null;
    const den = d0 - 2 * d1 + d2, off = den ? 0.5 * (d0 - d2) / den : 0;
    const tb = F[i].t + off * (F[i + 1].t - F[i - 1].t) / 2;
    if (tb - this.lastBeat < REFRACTORY) return null;
    this.lastBeat = tb;
    this.beats.push(tb);
    while (this.beats.length && f.t - this.beats[0] > KEEP) this.beats.shift();
    return tb;
  }

  // Golfvorm rond een slag (−0,15…+0,25 s), als array van y-waarden
  _segment(tb) {
    return this.F.filter(p => p.t >= tb - 0.15 && p.t <= tb + 0.25).map(p => p.y);
  }

  // Kwaliteit = aandeel van de laatste 8 s dat bestaat uit "goede" slagen: interval
  // binnen 0,33–1,5 s, < 30 % verschil met het vorige interval, en een golfvorm die op
  // de vorige slag lijkt. Robuust voor een sterk meegolvende hartslag (geen vaste periode
  // nodig, anders dan autocorrelatie); ruis heeft geen herhaalde vorm.
  quality() {
    const tEnd = this.F.length ? this.F[this.F.length - 1].t : 0, ws = tEnd - Q_WINDOW;
    const B = this.beats;
    let good = 0, first = null;
    const goodRR = [];
    for (let i = 2; i < B.length; i++) {
      if (B[i] <= ws) continue;
      if (first === null) first = B[i - 1] > ws ? B[i - 1] : ws;
      const rr = B[i] - B[i - 1], prev = B[i - 1] - B[i - 2];
      if (rr < REFRACTORY || rr > 1.5 || Math.abs(rr - prev) > MAX_STEP * prev) continue;
      if (correlation(this._segment(B[i - 1]), this._segment(B[i])) < MIN_SHAPE) continue;
      good += Math.min(rr, B[i] - ws);
      goodRR.push(rr);
    }
    if (first === null || !goodRR.length) return { q: 0, bpm: null };
    const span = Math.max(tEnd - first, 1);
    const med = goodRR.slice().sort((a, b) => a - b)[goodRR.length >> 1];
    return { q: Math.min(1, good / span), bpm: 60 / med };
  }
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

// Verwerkt camera-frames {t (s), r, g, b} tot slagen; kiest zelf het beste kanaal (R of G)
export class PpgProcessor {
  constructor() { this.reset(); }

  reset() {
    this.pre = [];
    this.tracks = null;
    this.fs = null;
    this.active = 'r';
    this.lastT = null;
    this.offSince = null;
    this.fingerOff = false;
  }

  get channel() { return this.active; }

  // Geeft slagtijd (s) of null
  push(f) {
    if (this.lastT !== null && f.t <= this.lastT) return null;       // dubbel/oud frame
    if (this.lastT !== null && f.t - this.lastT > GAP_RESET) this.reset();
    this.lastT = f.t;
    // Vinger weg: meteen kwaliteit 0 en geen (ruis)slagen; bij terugleggen schoon herstarten
    if (!isFinger(f)) {
      if (this.offSince === null) this.offSince = f.t;
      if (f.t - this.offSince >= OFF_AFTER) { this.fingerOff = true; this.pre = []; this.tracks = null; }
      return null;
    }
    this.offSince = null;
    this.fingerOff = false;
    if (!this.tracks) {
      this.pre.push(f);
      if (this.pre.length < 30) return null;
      const P = this.pre;
      this.fs = (P.length - 1) / (P[P.length - 1].t - P[0].t);
      this.tracks = { r: new Track(this.fs, P, 'r'), g: new Track(this.fs, P, 'g') };
      return null;
    }
    const br = this.tracks.r.push(f), bg = this.tracks.g.push(f);
    return this.active === 'r' ? br : bg;
  }

  // Elke ~1 s aanroepen: kiest het kanaal met de beste kwaliteit
  quality() {
    if (this.fingerOff || !this.tracks) return { q: 0, bpm: null, fps: this.fs };
    const qr = this.tracks.r.quality(), qg = this.tracks.g.quality();
    this.active = qg.q > qr.q + 0.1 ? 'g' : qr.q > qg.q + 0.1 ? 'r' : this.active;
    const q = this.active === 'r' ? qr : qg;
    return { q: q.q, bpm: q.bpm, fps: this.fs };
  }

  // Gefilterde golf van het actieve kanaal, laatste `seconds` s (voor de mini-pulsgolf)
  pulse(seconds) {
    if (!this.tracks) return [];
    const F = this.tracks[this.active].F, tEnd = this.lastT;
    return F.filter(p => p.t > tEnd - seconds);
  }
}
