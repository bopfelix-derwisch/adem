# `/adem` HRV-biofeedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een losstaande pagina `/adem` in de derwisch-relay die via de vingertop op de iPhone-camera (met flitser) hartslag en HRV meet en met een ademcirkel, kleur en klank coherentie-biofeedback geeft.

**Architecture:** Statische pagina zonder build-stap. Pure rekenmodules (`signal`, `hrv`, `breath`, `session`) zijn in Node te testen; browsermodules (`camera`, `audio`, `visual`, `app`) koppelen ze aan camera, Web Audio en canvas. Alle verwerking gebeurt op het toestel.

**Tech Stack:** Vanilla JS ES-modules (`.mjs`), Canvas 2D, Web Audio API, `getUserMedia` + `requestVideoFrameCallback`; tests met een eigen mini-runner op Node 12 (`assert`). Hosting: Vercel (statisch), rewrite in `vercel.json`.

**Spec:** `docs/superpowers/specs/2026-10-10-adem-hrv-biofeedback-design.md`

## Global Constraints

- Node op orin3 is **v12.22**: geen `node --test`, geen top-level `await`, geen `?.` / `??` in modules die Node laadt (`adem/signal|hrv|breath|session|camera.mjs`, `tests/**`). Tests draaien met `node tests/run.mjs [filter]`.
- Modules heten `.mjs`; `package.json` blijft ongewijzigd (geen `"type": "module"`, Vercel-functies in `api/` niet raken).
- Geen nieuwe dependencies, geen build-stap, geen CDN-scripts.
- Er verlaat geen video of meetdata het toestel; geen KV, geen fetch naar servers. Geschiedenis alleen in `localStorage` (altijd in try/catch).
- Camera: voorkeur **telelens** (`/tele/i`) — op iPhone 15 Pro de enige lens naast de flitser; 640×480 ideaal, `frameRate {ideal: 60, min: 24}`; flitser via `applyConstraints({advanced:[{torch:true}]})`.
- Constanten (uit de spec, exact): filter 0,6–4 Hz; refractair 0,33 s; RR-uitschieter > 25 % van mediaan; coherentievenster 64 s, minimaal 45 s; piekband 0,04–0,26 Hz ± 0,015 Hz; totaalband 0,0033–0,4 Hz; niveaus laag < 0,3, hoog > 0,6; kwaliteit goed > 0,5, slecht < 0,3, 3 s aanhouden; gladstrijken τ = 10 s; coherentie elke 5 s; ademtempo 4,5–7 (standaard 5,5); duur 3/5/10 min (standaard 5); inademen 40 % van de cyclus.
- Teksten in het Nederlands. Voettekst: "Geen medisch instrument".
- **Committen mag na groene tests; pushen nooit** — dat doet Bob. Commits eindigen met:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb
  ```
- Niet meecommitten: de ongetrackte `indexold*.js` en `api/indexold5.js`.

## Review Focus

1. **Vinger even weg en terug midden in een sessie** → pauze na 3 s, hervatten na 3 s goed signaal, geen valse lange RR in HRV of coherentie. *(Tests: signal "5 s gat", hrv "gat van 10 s", session "vinger weg … hervat".)*
2. **Andere iPhone of Engelstalige labels zonder telelens** → gewone achtercamera kiezen, nooit een virtuele multi-lens of de voorcamera. *(Test: camera "toestel zonder telelens".)*
3. **30 fps** (energiebesparingsmodus, ouder toestel) → slagen nog binnen 10 ms. *(Test: signal "30 fps".)*
4. **Hartslag 50 of 150 bpm** → beide gevolgd, geen halve hartslag als controlewaarde. *(Test: signal "50 en 150 bpm".)*
5. **Stil-schakelaar van de iPhone aan** → geluid speelt toch (`navigator.audioSession.type = 'playback'`). *(Niet unit-testbaar; staat als controlepunt in de live-test van Task 7.)*

## Afwijkingen ten opzichte van de spec (bewust, in de spec-geest)

- Ademgids-timing staat in een eigen module `adem/breath.mjs` (spec: "PUUR deel van feedback.mjs"), en sessie-toestanden in `adem/session.mjs`; beeld en geluid zijn gesplitst in `visual.mjs` en `audio.mjs`. Reden: kleinere, los testbare eenheden.
- Willekeurige-RR-test: **gemiddelde** coherentie over 10 reeksen < 0,3 en nooit "hoog". Eén venster van 64 s ruis kan toevallig rond 0,31 uitkomen (gemeten bij het prototype).
- Slagdetectie gebruikt de afgeleide over ±2 frames bij 60 fps (±1 bij 30 fps) en meldt de eerste 2 s na een (her)start geen slagen: zonder dit was de RR-fout 5,4 ms en ontstonden valse slagen tijdens het inslingeren van het filter.
- Controle-hartslag (autocorrelatie) kiest de kortste periode met een lokaal maximum ≥ 85 % van het beste — anders werd 150 bpm als 75 gelezen.

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid |
|---|---|
| `tests/harness.mjs`, `tests/run.mjs` | mini-testrunner |
| `tests/adem/synth.mjs` | deterministische synthetische PPG/RR-data |
| `adem/signal.mjs` | biquad-filters, `PpgProcessor` (slagen + kwaliteit + kanaalkeuze) |
| `adem/hrv.mjs` | `rrSeries`, `heartRate`, `rmssd`, `coherence`, `level` |
| `adem/breath.mjs` | `breathAt`, `cueBetween` |
| `adem/session.mjs` | `createSession`, `step`, `summary`, drempels |
| `adem/camera.mjs` | `rankCameras` (puur) + `Camera` (browser) |
| `adem/audio.mjs` | `Sound` (Web Audio) |
| `adem/visual.mjs` | `Visual` (canvas) |
| `adem/app.mjs` | orkestratie, schermen, geschiedenis |
| `adem.html` | pagina |
| `vercel.json` | rewrite `/adem` |
| `README.md` | regel over `/adem` |

---

### Task 1: Testrunner + signaalverwerking (`signal.mjs`)

**Files:**
- Create: `tests/harness.mjs`, `tests/run.mjs`, `tests/adem/synth.mjs`, `tests/adem/signal.test.mjs`, `adem/signal.mjs`

**Interfaces:**
- Consumes: niets.
- Produces:
  - `tests/harness.mjs`: `test(name: string, fn: () => void|Promise<void>)`, `runAll(): Promise<number /*failed*/>`
  - `tests/adem/synth.mjs`: `rng(seed) → () => number`, `gauss(rand) → number`, `beatTimes({seconds, baseRR=0.85, modAmp=0.05, modHz=0.1}) → number[]`, `ppgFrames({beats, seconds, fps=60, jitter=0.001, noise=0.15, seed=1}) → {t,r,g,b}[]`, `noiseFrames({seconds, fps=60, seed=7}) → {t,r,g,b}[]`
  - `adem/signal.mjs`: `biquad(type:'hp'|'lp', f0, fs) → (x)=>y`, `makeBandpass(fs)`, `class PpgProcessor { reset(); push({t,r,g,b}) → number|null /*slagtijd s*/; quality() → {q:0–1, bpm:number|null, fps:number|null}; pulse(seconds) → {t,y}[]; get channel → 'r'|'g'; lastT: number|null }`

- [ ] **Step 1: Schrijf de testrunner en synthetische data**

`tests/harness.mjs`:
```js
// tests/harness.mjs — mini-testrunner (Node 12 heeft geen `node --test`)
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export async function runAll() {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} geslaagd`);
  return failed;
}
```

`tests/run.mjs`:
```js
// tests/run.mjs — draai met: node tests/run.mjs [filter]
import { readdirSync } from 'fs';
import { runAll } from './harness.mjs';

async function main() {
  const dir = new URL('./adem/', import.meta.url);
  const filter = process.argv[2] || '';
  const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs') && f.includes(filter)).sort();
  for (const f of files) await import(new URL(f, dir).href);
  const failed = await runAll();
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
```

`tests/adem/synth.mjs`:
```js
// tests/adem/synth.mjs — deterministische synthetische PPG- en RR-data voor tests

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Slagtijden (s) vanaf t=1 tot `seconds`, RR = base + amp·sin(2π·modHz·t)
export function beatTimes({ seconds, baseRR = 0.85, modAmp = 0.05, modHz = 0.1 }) {
  const out = [];
  let t = 1;
  while (t < seconds) { out.push(t); t += baseRR + modAmp * Math.sin(2 * Math.PI * modHz * t); }
  return out;
}

// Eén puls: snelle stijging van het bloedvolume (0,12 s), daarna exponentieel verval
function pulse(dt) {
  if (dt < 0 || dt > 1.2) return 0;
  if (dt < 0.12) return (1 - Math.cos(Math.PI * dt / 0.12)) / 2;
  return Math.exp(-(dt - 0.12) / 0.25);
}

// Camera-frames {t, r, g, b}: bloed absorbeert licht → rood daalt bij elke slag
export function ppgFrames({ beats, seconds, fps = 60, jitter = 0.001, noise = 0.15, seed = 1 }) {
  const rand = rng(seed), frames = [];
  for (let k = 0; k * (1 / fps) < seconds; k++) {
    const t = k / fps + (rand() * 2 - 1) * jitter;
    let blood = 0;
    for (const b of beats) { if (b > t) break; blood += pulse(t - b); }
    frames.push({ t, r: 200 - 3 * blood + noise * gauss(rand), g: 1, b: 32 });
  }
  return frames;
}

export function noiseFrames({ seconds, fps = 60, seed = 7 }) {
  const rand = rng(seed), frames = [];
  for (let k = 0; k * (1 / fps) < seconds; k++) {
    frames.push({ t: k / fps, r: 150 + 3 * gauss(rand), g: 120 + 3 * gauss(rand), b: 120 });
  }
  return frames;
}
```

- [ ] **Step 2: Schrijf de falende tests**

`tests/adem/signal.test.mjs`:
```js
import assert from 'assert';
import { test } from '../harness.mjs';
import { PpgProcessor } from '../../adem/signal.mjs';
import { beatTimes, ppgFrames, noiseFrames } from './synth.mjs';

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
```

- [ ] **Step 3: Draai de tests — verwacht FAIL**

Run: `node tests/run.mjs signal`
Expected: crash met `Cannot find module …/adem/signal.mjs` (exitcode ≠ 0).

- [ ] **Step 4: Implementeer `adem/signal.mjs`**

```js
// adem/signal.mjs — PPG-signaalverwerking: filters, slagdetectie, kwaliteit (puur, geen DOM)

const KEEP = 12;          // seconden gefilterd signaal bewaren
const REFRACTORY = 0.33;  // s, max ~180 bpm
const GAP_RESET = 1.0;    // s zonder frames → opnieuw beginnen
const SETTLE = 2.0;       // s na (her)start geen slagen melden: filter slingert nog in

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
    return tb;
  }

  // Max genormaliseerde autocorrelatie over laatste 10 s, lag 0,33–1,5 s
  quality(fs) {
    const tEnd = this.F.length ? this.F[this.F.length - 1].t : 0;
    const W = this.F.filter(p => p.t > tEnd - 10);
    if (W.length < 6 * fs) return { q: 0, bpm: null };
    const mu = W.reduce((a, p) => a + p.y, 0) / W.length, x = W.map(p => p.y - mu);
    const r0 = x.reduce((a, v) => a + v * v, 0) || 1;
    const L0 = Math.round(0.33 * fs), L1 = Math.round(1.5 * fs), ac = [];
    for (let L = L0 - 1; L <= L1 + 1; L++) {
      let s = 0;
      for (let k = 0; k + L < x.length; k++) s += x[k] * x[k + L];
      ac[L] = s / (r0 * (x.length - L) / x.length);
    }
    let best = -1;
    for (let L = L0; L <= L1; L++) best = Math.max(best, ac[L]);
    // Kortste periode met een lokaal maximum ≥ 85 % van het beste: voorkomt halve hartslag
    let lag = L0;
    for (let L = L0; L <= L1; L++) if (ac[L] >= ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] >= 0.85 * best) { lag = L; break; }
    return { q: Math.max(0, best), bpm: 60 * fs / lag };
  }
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
  }

  get channel() { return this.active; }

  // Geeft slagtijd (s) of null
  push(f) {
    if (this.lastT !== null && f.t <= this.lastT) return null;       // dubbel/oud frame
    if (this.lastT !== null && f.t - this.lastT > GAP_RESET) this.reset();
    this.lastT = f.t;
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
    if (!this.tracks) return { q: 0, bpm: null, fps: this.fs };
    const qr = this.tracks.r.quality(this.fs), qg = this.tracks.g.quality(this.fs);
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
```

- [ ] **Step 5: Draai de tests — verwacht PASS**

Run: `node tests/run.mjs signal`
Expected: `7/7 geslaagd`, exitcode 0. (Een `ExperimentalWarning` over ES-modules op Node 12 is normaal.)

- [ ] **Step 6: Commit**

```bash
git add tests/harness.mjs tests/run.mjs tests/adem/synth.mjs tests/adem/signal.test.mjs adem/signal.mjs
git commit -m "feat(adem): PPG-signaalverwerking met slagdetectie en kwaliteit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb"
```

---

### Task 2: HRV en coherentie (`hrv.mjs`)

**Files:**
- Create: `tests/adem/hrv.test.mjs`, `adem/hrv.mjs`

**Interfaces:**
- Consumes: `tests/adem/synth.mjs` (`beatTimes`, `rng`, `gauss`) uit Task 1.
- Produces (`adem/hrv.mjs`): `WINDOW = 64`, `MIN_SPAN = 45`, `LEVELS = {low: 0.3, high: 0.6}`, `rrSeries(beats: number[]) → {t, rr}[]` (opgeschoond), `heartRate(rr: number[]) → number|null` (bpm), `rmssd(series: {t,rr}[]) → number|null` (ms), `coherence(beats: number[], now: number) → {value: 0–1, peakHz} | null`, `level(c) → 'laag'|'midden'|'hoog'`

- [ ] **Step 1: Schrijf de falende tests**

`tests/adem/hrv.test.mjs`:
```js
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
```

- [ ] **Step 2: Draai de tests — verwacht FAIL**

Run: `node tests/run.mjs hrv`
Expected: crash met `Cannot find module …/adem/hrv.mjs`.

- [ ] **Step 3: Implementeer `adem/hrv.mjs`**

```js
// adem/hrv.mjs — hartslag, RMSSD en coherentie uit slagtijden (puur, geen DOM)

export const WINDOW = 64;      // s, venster voor coherentie
export const MIN_SPAN = 45;    // s schone RR nodig voor een coherentiewaarde
export const LEVELS = { low: 0.3, high: 0.6 };

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

// Slagtijden (s) → [{t, rr}] met rr = t_i − t_{i−1}; uitschieters (> 25 % van mediaan) eruit
export function rrSeries(beats) {
  const all = [];
  for (let i = 1; i < beats.length; i++) all.push({ t: beats[i], rr: beats[i] - beats[i - 1] });
  if (all.length < 3) return all;
  const med = median(all.map(p => p.rr));
  return all.filter(p => Math.abs(p.rr - med) < 0.25 * med);
}

export function heartRate(rr) {   // rr in s → bpm
  if (!rr.length) return null;
  return 60 / (rr.reduce((a, b) => a + b, 0) / rr.length);
}

// RMSSD in ms; alleen opeenvolgende paren zonder tussenliggend gat (verschil in t ≈ rr)
export function rmssd(series) {
  let s = 0, n = 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i];
    if (Math.abs((b.t - a.t) - b.rr) > 0.05) continue; // er zit een weggefilterde slag tussen
    s += (b.rr - a.rr) ** 2; n++;
  }
  return n ? 1000 * Math.sqrt(s / n) : null;
}

// Coherentie 0–1: aandeel van het RR-spectrum in de piek (0,04–0,26 Hz ± 0,015 Hz).
// `now` in dezelfde klok als de slagtijden. null zolang er < MIN_SPAN s schone data is.
export function coherence(beats, now) {
  const S = rrSeries(beats.filter(t => t > now - WINDOW - 2)).filter(p => p.t > now - WINDOW);
  if (S.length < 10 || S[S.length - 1].t - S[0].t < MIN_SPAN) return null;

  // Lineair herbemonsteren op 4 Hz over [S0.t, S_last.t]
  const fs = 4, N = 256, x = [];
  let j = 0;
  for (let t = S[0].t; t <= S[S.length - 1].t && x.length < N; t += 1 / fs) {
    while (j < S.length - 2 && S[j + 1].t < t) j++;
    const a = S[j], b = S[j + 1], u = (t - a.t) / (b.t - a.t);
    x.push(a.rr + Math.min(1, Math.max(0, u)) * (b.rr - a.rr));
  }

  // Lineaire trend eraf, Hann-venster, nulvullen tot N
  const M = x.length, mt = (M - 1) / 2, my = x.reduce((a, b) => a + b, 0) / M;
  let sxy = 0, sxx = 0;
  x.forEach((v, i) => { sxy += (i - mt) * (v - my); sxx += (i - mt) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const w = x.map((v, i) => (v - my - slope * (i - mt)) * 0.5 * (1 - Math.cos(2 * Math.PI * i / (M - 1))));
  while (w.length < N) w.push(0);

  // Vermogensspectrum (DFT, alleen bins tot 0,4 Hz)
  const df = fs / N, kMax = Math.floor(0.4 / df), P = [];
  for (let k = 0; k <= kMax; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) { const a = 2 * Math.PI * k * n / N; re += w[n] * Math.cos(a); im -= w[n] * Math.sin(a); }
    P.push(re * re + im * im);
  }

  const kLo = Math.ceil(0.0033 / df), kPk0 = Math.ceil(0.04 / df), kPk1 = Math.floor(0.26 / df);
  let kPk = kPk0;
  for (let k = kPk0; k <= kPk1; k++) if (P[k] > P[kPk]) kPk = k;
  const halfBins = Math.round(0.015 / df);
  let peak = 0, total = 0;
  for (let k = kLo; k <= kMax; k++) {
    total += P[k];
    if (Math.abs(k - kPk) <= halfBins) peak += P[k];
  }
  return { value: total ? peak / total : 0, peakHz: kPk * df };
}

export function level(c) {
  return c < LEVELS.low ? 'laag' : c > LEVELS.high ? 'hoog' : 'midden';
}
```

- [ ] **Step 4: Draai de tests — verwacht PASS**

Run: `node tests/run.mjs hrv`
Expected: `6/6 geslaagd`.

- [ ] **Step 5: Commit**

```bash
git add tests/adem/hrv.test.mjs adem/hrv.mjs
git commit -m "feat(adem): HRV — RR opschonen, RMSSD en coherentie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb"
```

---

### Task 3: Ademgids-timing (`breath.mjs`)

**Files:**
- Create: `tests/adem/breath.test.mjs`, `adem/breath.mjs`

**Interfaces:**
- Consumes: `tests/harness.mjs`.
- Produces (`adem/breath.mjs`): `INHALE_FRAC = 0.4`, `breathAt(t: s, bpm) → {phase:'in'|'out', progress:0–1, cycle:int, size:0–1}`, `cueBetween(prev|null, cur) → 'in'|'out'|null`

- [ ] **Step 1: Schrijf de falende tests**

`tests/adem/breath.test.mjs`:
```js
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
```

- [ ] **Step 2: Draai de tests — verwacht FAIL**

Run: `node tests/run.mjs breath`
Expected: crash met `Cannot find module …/adem/breath.mjs`.

- [ ] **Step 3: Implementeer `adem/breath.mjs`**

```js
// adem/breath.mjs — timing van de ademgids (puur, geen DOM)

export const INHALE_FRAC = 0.4;

// t = seconden sinds start, bpm = ademhalingen per minuut
// → { phase: 'in'|'out', progress 0–1 binnen de fase, cycle (0-based), size 0–1 (cirkelgrootte) }
export function breathAt(t, bpm) {
  const cycleLen = 60 / bpm, inLen = cycleLen * INHALE_FRAC;
  const cycle = Math.floor(t / cycleLen), u = t - cycle * cycleLen;
  if (u < inLen) {
    const p = u / inLen;
    return { phase: 'in', progress: p, cycle, size: (1 - Math.cos(Math.PI * p)) / 2 };
  }
  const p = (u - inLen) / (cycleLen - inLen);
  return { phase: 'out', progress: p, cycle, size: (1 + Math.cos(Math.PI * p)) / 2 };
}

// Fasewissel tussen twee momenten → 'in' | 'out' | null (voor de ademtonen)
export function cueBetween(prev, cur) {
  if (!prev) return cur.phase === 'in' ? 'in' : null;
  return prev.phase !== cur.phase || prev.cycle !== cur.cycle ? cur.phase : null;
}
```

- [ ] **Step 4: Draai de tests — verwacht PASS**

Run: `node tests/run.mjs breath`
Expected: `3/3 geslaagd`.

- [ ] **Step 5: Commit**

```bash
git add tests/adem/breath.test.mjs adem/breath.mjs
git commit -m "feat(adem): ademgids-timing en fasewissels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb"
```

---

### Task 4: Sessie-toestanden en statistiek (`session.mjs`)

**Files:**
- Create: `tests/adem/session.test.mjs`, `adem/session.mjs`

**Interfaces:**
- Consumes: `tests/harness.mjs`.
- Produces (`adem/session.mjs`): `Q_GOOD = 0.5`, `Q_BAD = 0.3`, `HOLD = 3`, `HIGH = 0.6`, `createSession(durationSec) → Session`, `step(s, dt, {quality, coherence: number|null, hidden?: boolean}) → Session` (muteert en geeft `s` terug; `s.state ∈ 'zoek-vinger'|'inlezen'|'oefenen'|'pauze'|'einde'`, `s.elapsed`, `s.durationSec`, `s.resume`), `summary(s) → {practiceSec, meanCoherence|null, highPct|null, pauseSec}`

- [ ] **Step 1: Schrijf de falende tests**

`tests/adem/session.test.mjs`:
```js
import assert from 'assert';
import { test } from '../harness.mjs';
import { createSession, step, summary } from '../../adem/session.mjs';

// Draai `sec` seconden in tikken van 1 s met vaste input; geeft toestanden per tik
function run(s, sec, input) {
  const states = [];
  for (let i = 0; i < sec; i++) states.push(step(s, 1, input).state);
  return states;
}

test('session: vinger 3 s goed → inlezen → oefenen zodra coherentie er is', () => {
  const s = createSession(300);
  run(s, 2, { quality: 0.9, coherence: null });
  assert.strictEqual(s.state, 'zoek-vinger');
  run(s, 1, { quality: 0.9, coherence: null });
  assert.strictEqual(s.state, 'inlezen');
  run(s, 40, { quality: 0.9, coherence: null });
  assert.strictEqual(s.state, 'inlezen');
  run(s, 1, { quality: 0.9, coherence: 0.5 });
  assert.strictEqual(s.state, 'oefenen');
});

test('session: zoeken telt niet mee voor de sessieklok', () => {
  const s = createSession(60);
  run(s, 100, { quality: 0.1, coherence: null });
  assert.strictEqual(s.state, 'zoek-vinger');
  assert.strictEqual(s.elapsed, 0);
});

test('session: vinger weg midden in oefenen → pauze, terug → hervat; pauzetijd apart', () => {
  const s = createSession(300);
  run(s, 3, { quality: 0.9, coherence: null });
  run(s, 1, { quality: 0.9, coherence: 0.7 });
  run(s, 10, { quality: 0.9, coherence: 0.7 });
  run(s, 3, { quality: 0.1, coherence: 0.7 });
  assert.strictEqual(s.state, 'pauze');
  run(s, 7, { quality: 0.1, coherence: 0.7 });
  run(s, 3, { quality: 0.9, coherence: 0.7 });
  assert.strictEqual(s.state, 'oefenen');
  const sum = summary(s);
  assert.ok(sum.pauseSec >= 9 && sum.pauseSec <= 11, `pauze ${sum.pauseSec}`);
  assert.strictEqual(sum.highPct, 100);
});

test('session: tabblad verborgen → direct pauze', () => {
  const s = createSession(300);
  run(s, 3, { quality: 0.9, coherence: null });
  step(s, 0.1, { quality: 0.9, coherence: null, hidden: true });
  assert.strictEqual(s.state, 'pauze');
  assert.strictEqual(s.resume, 'inlezen');
});

test('session: einde na duur; samenvatting klopt', () => {
  const s = createSession(60);
  run(s, 3, { quality: 0.9, coherence: null });  // gevonden
  run(s, 20, { quality: 0.9, coherence: null }); // inlezen
  run(s, 20, { quality: 0.9, coherence: 0.4 });
  run(s, 30, { quality: 0.9, coherence: 0.8 });
  assert.strictEqual(s.state, 'einde');
  const sum = summary(s);
  assert.strictEqual(sum.practiceSec, 39);   // 60 s klok − 20 inlezen − 1 overgangstik
  assert.ok(sum.meanCoherence > 0.4 && sum.meanCoherence < 0.8);
  assert.strictEqual(sum.highPct, Math.round(100 * 20 / 39));
});

test('session: korte dip (< 3 s) geeft geen pauze', () => {
  const s = createSession(300);
  run(s, 3, { quality: 0.9, coherence: null });
  run(s, 2, { quality: 0.1, coherence: null });
  run(s, 1, { quality: 0.9, coherence: null });
  run(s, 2, { quality: 0.1, coherence: null });
  assert.strictEqual(s.state, 'inlezen');
});
```

- [ ] **Step 2: Draai de tests — verwacht FAIL**

Run: `node tests/run.mjs session`
Expected: crash met `Cannot find module …/adem/session.mjs`.

- [ ] **Step 3: Implementeer `adem/session.mjs`**

```js
// adem/session.mjs — sessie-toestanden en statistiek (puur, geen DOM)
//
// zoek-vinger → inlezen → oefenen → einde;  inlezen/oefenen ⇄ pauze

export const Q_GOOD = 0.5, Q_BAD = 0.3, HOLD = 3; // kwaliteitsdrempels, s aanhouden
export const HIGH = 0.6;                           // coherentie "hoog"

export function createSession(durationSec) {
  return {
    state: 'zoek-vinger', resume: null, durationSec,
    elapsed: 0,      // s sinds vinger gevonden (sessieklok, loopt ook in pauze)
    goodFor: 0, badFor: 0,
    stats: { practiceSec: 0, highSec: 0, cohIntegral: 0, pauseSec: 0 },
  };
}

// Eén tik van dt seconden. input: { quality, coherence (gladgestreken, of null), hidden }
export function step(s, dt, { quality, coherence, hidden = false }) {
  if (s.state === 'einde') return s;
  s.goodFor = quality > Q_GOOD ? s.goodFor + dt : 0;
  s.badFor = quality < Q_BAD ? s.badFor + dt : 0;

  if (s.state !== 'zoek-vinger') s.elapsed += dt;

  switch (s.state) {
    case 'zoek-vinger':
      if (s.goodFor >= HOLD) s.state = 'inlezen';
      break;
    case 'inlezen':
    case 'oefenen':
      if (hidden || s.badFor >= HOLD) { s.resume = s.state; s.state = 'pauze'; break; }
      if (s.state === 'inlezen' && coherence !== null) s.state = 'oefenen';
      else if (s.state === 'oefenen') {
        s.stats.practiceSec += dt;
        s.stats.cohIntegral += coherence * dt;
        if (coherence > HIGH) s.stats.highSec += dt;
      }
      break;
    case 'pauze':
      s.stats.pauseSec += dt;
      if (!hidden && s.goodFor >= HOLD) s.state = s.resume;
      break;
  }
  if (s.elapsed >= s.durationSec) s.state = 'einde';
  return s;
}

export function summary(s) {
  const p = s.stats.practiceSec;
  return {
    practiceSec: Math.round(p),
    meanCoherence: p ? s.stats.cohIntegral / p : null,
    highPct: p ? Math.round(100 * s.stats.highSec / p) : null,
    pauseSec: Math.round(s.stats.pauseSec),
  };
}
```

- [ ] **Step 4: Draai de tests — verwacht PASS**

Run: `node tests/run.mjs session`
Expected: `6/6 geslaagd`.

- [ ] **Step 5: Commit**

```bash
git add tests/adem/session.test.mjs adem/session.mjs
git commit -m "feat(adem): sessie-toestanden, pauze/hervat en samenvatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb"
```

---

### Task 5: Camera (`camera.mjs`)

**Files:**
- Create: `tests/adem/camera.test.mjs`, `adem/camera.mjs`

**Interfaces:**
- Consumes: `tests/harness.mjs`.
- Produces (`adem/camera.mjs`): `rankCameras(devices: {deviceId,label}[], storedId|null) → devices[]` (puur, voorcamera eruit), `class Camera(video: HTMLVideoElement, onFrame: ({t,r,g,b}) => void) { open() → Promise<{torch:boolean}>; nextLens() → Promise<void>; setTorch(on) → Promise<boolean>; lockWhiteBalance() → Promise<boolean>; close(); get label }`. `t` in seconden (`captureTime/1000`, anders `mediaTime`, anders `performance.now()/1000`).

Het `Camera`-deel gebruikt alleen DOM-API's binnen methodes, zodat Node de module kan importeren voor de test van `rankCameras`.

- [ ] **Step 1: Schrijf de falende tests**

`tests/adem/camera.test.mjs`:
```js
import assert from 'assert';
import { test } from '../harness.mjs';
import { rankCameras } from '../../adem/camera.mjs';

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
```

- [ ] **Step 2: Draai de tests — verwacht FAIL**

Run: `node tests/run.mjs camera`
Expected: crash met `Cannot find module …/adem/camera.mjs`.

- [ ] **Step 3: Implementeer `adem/camera.mjs`**

```js
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
      video: Object.assign({ width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60, min: 24 } }, which),
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
```

- [ ] **Step 4: Draai de tests — verwacht PASS**

Run: `node tests/run.mjs camera`
Expected: `3/3 geslaagd`.

- [ ] **Step 5: Commit**

```bash
git add tests/adem/camera.test.mjs adem/camera.mjs
git commit -m "feat(adem): camera met telelens-voorkeur, flitser en witbalans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb"
```

---

### Task 6: Geluid en beeld (`audio.mjs`, `visual.mjs`)

**Files:**
- Create: `adem/audio.mjs`, `adem/visual.mjs`

**Interfaces:**
- Consumes: niets.
- Produces:
  - `class Sound { start() → Promise<void> /*na gebruikerstik*/; setCoherence(c: 0–1); duck(on: boolean); cue('in'|'out'); resume(); setVolume(v: 0–1); stop() }`
  - `class Visual(canvas) { draw({size: 0–1, coherence: number|null, pulse: {t,y}[], active: boolean}) }`

Deze modules zijn puur browser (Web Audio, canvas) en hebben geen unit-tests; ze worden in Task 7 live gecontroleerd.

- [ ] **Step 1: Implementeer `adem/audio.mjs`**

```js
// adem/audio.mjs — grondtoon, coherentieklank en ademtonen via Web Audio (browser)

const RAMP = 2; // s, overgangen van de klank

export class Sound {
  async start() {
    // iOS: zonder dit zwijgt Web Audio als de stil-schakelaar aan staat
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ouder iOS */ }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    this.master = ctx.createGain(); this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);
    this.feedback = ctx.createGain(); this.feedback.gain.value = 1;   // alles behalve ademtonen
    this.feedback.connect(this.master);

    // Grondtoon: twee licht ontstemde sinussen door een laagdoorlaat
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    const drone = ctx.createGain(); drone.gain.value = 0.18;
    lp.connect(drone); drone.connect(this.feedback);
    this.oscs = [110, 110.7].map(f => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(lp); o.start(); return o; });

    // Harmonischen (kwint, octaaf): klinken op bij hoge coherentie
    this.harm = ctx.createGain(); this.harm.gain.value = 0;
    this.harm.connect(this.feedback);
    [165, 220].forEach(f => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(this.harm); o.start(); this.oscs.push(o); });

    // Wind: gefilterde ruis, sterk bij lage coherentie
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseSrc = ctx.createBufferSource(); this.noiseSrc.buffer = buf; this.noiseSrc.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.7;
    this.wind = ctx.createGain(); this.wind.gain.value = 0.06;
    this.noiseSrc.connect(bp); bp.connect(this.wind); this.wind.connect(this.feedback);
    this.noiseSrc.start();
  }

  _ramp(param, value) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + RAMP);
  }

  // c = gladgestreken coherentie 0–1
  setCoherence(c) {
    if (!this.ctx) return;
    this._ramp(this.harm.gain, 0.12 * c);
    this._ramp(this.wind.gain, 0.12 * (1 - c));
  }

  // Pauze: alleen de ademtonen blijven
  duck(on) { if (this.ctx) this._ramp(this.feedback.gain, on ? 0 : 1); }

  cue(phase) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = phase === 'in' ? 523.25 : 392;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.15, now + 0.05);
    g.gain.linearRampToValueAtTime(0, now + 0.6);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 0.65);
  }

  // Na terugkeer uit de achtergrond kan iOS de context hebben gepauzeerd
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  setVolume(v) { if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  stop() {
    if (!this.ctx) return;
    this.ctx.close();
    this.ctx = null;
  }
}
```

- [ ] **Step 2: Implementeer `adem/visual.mjs`**

```js
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
```

- [ ] **Step 3: Syntaxcontrole**

Run: `node --check adem/audio.mjs && node --check adem/visual.mjs && echo ok`
Expected: `ok` (eventueel na een `ExperimentalWarning`).

- [ ] **Step 4: Volledige suite nog groen**

Run: `node tests/run.mjs`
Expected: `25/25 geslaagd`.

- [ ] **Step 5: Commit**

```bash
git add adem/audio.mjs adem/visual.mjs
git commit -m "feat(adem): ademcirkel met coherentiekleur en Web Audio-klank

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb"
```

---

### Task 7: Pagina, orkestratie, route en live-test

**Files:**
- Create: `adem.html`, `adem/app.mjs`
- Modify: `vercel.json` (rewrites), `README.md` (endpoint-lijst)

**Interfaces:**
- Consumes: alles uit Task 1–6 (exacte namen hierboven).
- Produces: route `/adem`.

- [ ] **Step 1: Schrijf `adem.html`**

```html
<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0e1116">
<title>Adem</title>
<style>
  :root {
    --bg: #0e1116; --panel: #171b22; --fg: #e8e6e1; --muted: #8b929c;
    --accent: #f0b85a; --line: #2a303a; --warn: #f2a65a; --err: #ff7b72;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    background: var(--bg); color: var(--fg);
    font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom);
    display: flex; flex-direction: column; min-height: 100%;
  }
  main { flex: 1; max-width: 520px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; }
  section { display: flex; flex-direction: column; gap: 16px; padding: 24px 0; flex: 1; }
  section[hidden] { display: none; }
  h1 { font-size: 28px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  p { margin: 0; color: var(--muted); }
  label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 14px; }
  label b { color: var(--fg); font-weight: 600; }
  input[type=range] { width: 100%; accent-color: var(--accent); }
  select, button {
    font: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; padding: 12px 14px; min-height: 44px;
  }
  button.primary { background: var(--accent); color: #1a1408; border: 0; font-weight: 600; font-size: 18px; }
  .note { font-size: 14px; }
  .err { color: var(--err); font-size: 14px; min-height: 1em; }
  .warn { color: var(--warn); font-size: 14px; min-height: 1em; text-align: center; }
  #practice { gap: 8px; }
  .top { display: flex; justify-content: space-between; align-items: baseline; color: var(--muted); font-size: 14px; }
  .top b { color: var(--fg); font-size: 22px; font-variant-numeric: tabular-nums; }
  #circle { width: 100%; flex: 1; min-height: 300px; }
  #status { text-align: center; font-size: 17px; min-height: 2.9em; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .row > * { flex: 1 1 auto; }
  .row input[type=range] { flex: 2 1 120px; }
  dl { display: grid; grid-template-columns: 1fr auto; gap: 10px 16px; margin: 0; }
  dt { color: var(--muted); } dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
  #history { margin: 0; padding-left: 18px; color: var(--muted); font-size: 14px; }
  video { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  footer { text-align: center; color: var(--muted); font-size: 12px; padding: 12px 0; }
</style>
</head>
<body>
<main>
  <section id="setup">
    <h1>Adem</h1>
    <p>Adem rustig mee met de cirkel. De camera meet via je vingertop je hartslag; kleur en klank laten zien hoe gelijkmatig je hartritme met je adem meegolft.</p>
    <label>Ademtempo: <b><span id="tempo-val">5,5</span> per minuut</b>
      <input id="tempo" type="range" min="4.5" max="7" step="0.5" value="5.5">
    </label>
    <label>Duur
      <select id="duur">
        <option value="3">3 minuten</option>
        <option value="5" selected>5 minuten</option>
        <option value="10">10 minuten</option>
      </select>
    </label>
    <p class="note">Leg straks je wijsvinger licht op de lens naast de flitser. De flitser wordt warm — haal je vinger weg als het onprettig wordt.</p>
    <button id="begin" class="primary">Begin</button>
    <div id="err" class="err" role="alert"></div>
  </section>

  <section id="practice" hidden>
    <div class="top"><span>hartslag <b id="hr">–</b></span><span>nog <b id="time">–</b></span></div>
    <canvas id="circle" aria-hidden="true"></canvas>
    <div id="status" aria-live="polite"></div>
    <div id="warn" class="warn"></div>
    <div class="row">
      <button id="mute">Geluid uit</button>
      <input id="volume" type="range" min="0" max="1" step="0.05" value="0.7" aria-label="Volume">
    </div>
    <div class="row">
      <button id="lens">Andere lens</button>
      <button id="stop">Stoppen</button>
    </div>
    <video id="video" playsinline muted></video>
  </section>

  <section id="summary" hidden>
    <h1>Klaar</h1>
    <dl>
      <dt>Gemiddelde hartslag</dt><dd id="s-hr">–</dd>
      <dt>RMSSD</dt><dd id="s-rmssd">–</dd>
      <dt>Gemiddelde coherentie</dt><dd id="s-coh">–</dd>
      <dt>Tijd in hoge coherentie</dt><dd id="s-high">–</dd>
      <dt>Pauze</dt><dd id="s-pause">–</dd>
    </dl>
    <p>Eerdere sessies (alleen op dit toestel)</p>
    <ul id="history"></ul>
    <button id="again" class="primary">Nog een keer</button>
  </section>
</main>
<footer>Geen medisch instrument · alles blijft op je telefoon</footer>
<script type="module" src="adem/app.mjs"></script>
</body>
</html>
```

- [ ] **Step 2: Schrijf `adem/app.mjs`**

```js
// adem/app.mjs — koppelt camera → signaal → hrv → sessie → beeld + geluid (browser)

import { PpgProcessor } from './signal.mjs';
import { rrSeries, heartRate, rmssd, coherence, level } from './hrv.mjs';
import { breathAt, cueBetween } from './breath.mjs';
import { createSession, step, summary, Q_GOOD } from './session.mjs';
import { Camera } from './camera.mjs';
import { Sound } from './audio.mjs';
import { Visual } from './visual.mjs';

const $ = id => document.getElementById(id);
const HISTORY_KEY = 'adem.history';
const TAU = 10;        // s, gladstrijken coherentie
const COH_EVERY = 5;   // s tussen coherentieberekeningen

let cam = null, sound = null, visual = null, proc = null, sess = null;
let beats = [], bpmBreath = 5.5, t0 = 0, lastTick = 0, lastCoh = -Infinity;
let cohRaw = null, cohSmooth = null, prevBreath = null, quality = 0;
let wbLocked = false, wakeLock = null, timer = null, raf = null, volume = 0.7, muted = false;

function show(screen) { for (const id of ['setup', 'practice', 'summary']) $(id).hidden = id !== screen; }
function setStatus(text) { $('status').textContent = text; }
function warn(text) { $('warn').textContent = text; }
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; } }
function saveHistory(item) {
  const h = [item, ...loadHistory()].slice(0, 20);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { /* privémodus: alleen dit scherm */ }
  return h;
}

async function requestWakeLock() {
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}

function cameraError(e) {
  const name = e && e.name;
  return name === 'NotAllowedError'
    ? 'Geen cameratoegang. Ga naar Instellingen → Safari → Camera → Sta toe, en tik opnieuw op Begin.'
    : name === 'NotFoundError' || name === 'OverconstrainedError'
      ? 'Geen geschikte achtercamera gevonden.'
      : 'Camera starten mislukt: ' + (e && e.message || e);
}

async function begin() {
  $('err').textContent = '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('err').textContent = 'Deze browser geeft geen cameratoegang (open de pagina via https in Safari).';
    return;
  }
  bpmBreath = +$('tempo').value;
  const durationSec = +$('duur').value * 60;

  sound = new Sound();
  try { await sound.start(); sound.setVolume(muted ? 0 : volume); } catch (e) { sound = null; } // zonder geluid werkt de oefening nog

  proc = new PpgProcessor(); beats = [];
  cam = new Camera($('video'), onFrame);
  try {
    const r = await cam.open();
    warn(r.torch ? '' : 'Flitser niet beschikbaar — werk iOS bij (≥ 17.5) of meet bij fel licht.');
  } catch (e) {
    if (sound) sound.stop();
    $('err').textContent = cameraError(e);
    return;
  }

  sess = createSession(durationSec);
  t0 = lastTick = performance.now() / 1000;
  lastCoh = -Infinity; cohRaw = cohSmooth = null; prevBreath = null; quality = 0; wbLocked = false;
  visual = new Visual($('circle'));
  show('practice');
  requestWakeLock();
  timer = setInterval(tick, 1000);
  raf = requestAnimationFrame(frame);
}

function onFrame(f) {
  const b = proc.push(f);
  if (b !== null) beats.push(b);
}

function tick() {
  const now = performance.now() / 1000, dt = now - lastTick;
  lastTick = now;
  const q = proc.quality();
  quality = q.q;
  if (q.fps && q.fps < 24) warn('Lage beeldsnelheid — meting minder nauwkeurig.');
  if (!wbLocked && quality > Q_GOOD) { wbLocked = true; setTimeout(() => cam && cam.lockWhiteBalance(), 2500); }

  if (proc.lastT !== null && now - lastCoh >= COH_EVERY) {
    lastCoh = now;
    const c = coherence(beats, proc.lastT);
    cohRaw = c ? c.value : null;
  }
  if (cohRaw !== null) cohSmooth = cohSmooth === null ? cohRaw : cohSmooth + (cohRaw - cohSmooth) * (1 - Math.exp(-dt / TAU));

  const before = sess.state;
  step(sess, dt, { quality, coherence: cohSmooth, hidden: document.hidden });
  if (sound) {
    sound.setCoherence(cohSmooth === null ? 0 : cohSmooth);
    if (before !== sess.state && (sess.state === 'pauze' || before === 'pauze')) sound.duck(sess.state === 'pauze');
  }
  updateText();
  if (sess.state === 'einde') finish();
}

function updateText() {
  const S = rrSeries(beats).slice(-8);
  $('hr').textContent = S.length >= 4 ? Math.round(heartRate(S.map(p => p.rr))) : '–';
  $('time').textContent = mmss(Math.max(0, sess.durationSec - sess.elapsed));
  switch (sess.state) {
    case 'zoek-vinger': setStatus('Leg je wijsvinger licht op de lens naast de flitser'); break;
    case 'inlezen': setStatus('Inlezen… volg de cirkel met je adem'); break;
    case 'oefenen': setStatus('Coherentie: ' + (cohSmooth === null ? '–' : level(cohSmooth))); break;
    case 'pauze': setStatus('Vinger kwijt — leg hem terug (druk lichter als hij er wel ligt)'); break;
  }
}

function frame() {
  const now = performance.now() / 1000, b = breathAt(now - t0, bpmBreath);
  const measuring = sess.state === 'inlezen' || sess.state === 'oefenen';
  const cue = cueBetween(prevBreath, b);
  if (cue && sound && sess.state !== 'zoek-vinger') sound.cue(cue);
  prevBreath = b;
  visual.draw({ size: b.size, coherence: sess.state === 'oefenen' ? cohSmooth : null, pulse: proc.pulse(4), active: measuring });
  raf = requestAnimationFrame(frame);
}

function stopRunning() {
  clearInterval(timer); cancelAnimationFrame(raf);
  if (cam) cam.close();
  if (sound) sound.stop();
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function finish() {
  stopRunning();
  const S = rrSeries(beats), sum = summary(sess);
  const item = {
    date: new Date().toISOString(),
    minutes: Math.round(sess.elapsed / 60),
    hr: S.length ? Math.round(heartRate(S.map(p => p.rr))) : null,
    rmssd: rmssd(S) === null ? null : Math.round(rmssd(S)),
    coherence: sum.meanCoherence === null ? null : +sum.meanCoherence.toFixed(2),
    highPct: sum.highPct, pauseSec: sum.pauseSec,
  };
  const history = saveHistory(item);
  const val = v => v === null ? '–' : v;
  $('s-hr').textContent = val(item.hr);
  $('s-rmssd').textContent = item.rmssd === null ? '–' : item.rmssd + ' ms';
  $('s-coh').textContent = item.coherence === null ? '–' : item.coherence.toFixed(2) + ' (' + level(item.coherence) + ')';
  $('s-high').textContent = item.highPct === null ? '–' : item.highPct + ' %';
  $('s-pause').textContent = mmss(item.pauseSec);
  renderHistory(history);
  show('summary');
  sess = null;
}

function renderHistory(h) {
  const ul = $('history');
  ul.innerHTML = '';
  for (const it of h) {
    const li = document.createElement('li');
    const d = new Date(it.date);
    li.textContent = `${d.toLocaleDateString('nl-NL')} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · ${it.minutes} min · coherentie ${it.coherence === null ? '–' : it.coherence.toFixed(2)}`;
    ul.appendChild(li);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (!sess) return;
  if (document.hidden) { if (cam) cam.close(); return; }
  try { await cam.open(); proc.reset(); wbLocked = false; } catch (e) { warn(cameraError(e)); }
  if (sound) sound.resume();
  requestWakeLock();
});

$('tempo').addEventListener('input', e => { $('tempo-val').textContent = (+e.target.value).toFixed(1).replace('.', ','); });
$('begin').addEventListener('click', begin);
$('again').addEventListener('click', () => show('setup'));
$('stop').addEventListener('click', () => { if (sess) finish(); });
$('lens').addEventListener('click', async () => {
  try { await cam.nextLens(); proc.reset(); wbLocked = false; warn('Lens: ' + cam.label); } catch (e) { warn(cameraError(e)); }
});
$('volume').addEventListener('input', e => { volume = +e.target.value; if (sound && !muted) sound.setVolume(volume); });
$('mute').addEventListener('click', () => {
  muted = !muted;
  $('mute').textContent = muted ? 'Geluid aan' : 'Geluid uit';
  if (sound) sound.setVolume(muted ? 0 : volume);
});
renderHistory(loadHistory());
```

- [ ] **Step 3: Route toevoegen in `vercel.json`**

Voeg in `"rewrites"` na de `/dashboard`-regel toe:
```json
    { "source": "/adem",      "destination": "/adem.html" }
```
(De voorgaande regel krijgt een komma.) Controle:

Run: `node -e "const v=require('./vercel.json'); console.log(v.rewrites.map(r=>r.source).join(' '))"`
Expected: `/ /login /dashboard /adem`

- [ ] **Step 4: README bijwerken**

Voeg onder `## Endpoints` toe:
```markdown
- `GET /adem` — HRV-biofeedback-oefening (vingertop op de iPhone-camera; alles lokaal op het toestel)
```

- [ ] **Step 5: Suite + syntax**

Run: `node tests/run.mjs && node --check adem/app.mjs && echo ok`
Expected: `25/25 geslaagd` en `ok`.

- [ ] **Step 6: Live-preview op Bob's iPhone via Tailscale**

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory /home/bob/derwisch-relay   # achtergrond
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8765
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://orin3.tail897ef4.ts.net:8443/adem/app.mjs
```
Expected: `200 text/javascript` (of `application/javascript`).

Vraag Bob om `https://orin3.tail897ef4.ts.net:8443/adem.html` in Safari te openen, een sessie van 3 minuten te doen en te melden:
1. Gaat de flitser aan en verschijnt binnen ~10 s "Inlezen…"? (telelens automatisch gekozen)
2. Klopt de hartslag ongeveer, en verschijnt na ~45–60 s "Coherentie: …"?
3. Stijgt de coherentie / wordt de cirkel warmer bij rustig mee-ademen?
4. Hoor je grondtoon, wind/akkoord en de ademtonen — **ook met de stil-schakelaar aan**?
5. Vinger 5 s weg → "Vinger kwijt", geluid dempt; terug → gaat verder?
6. Eindscherm met waarden en een regel in "Eerdere sessies"?

Bij een fout: los op (bij codewijzigingen eerst een test in de betreffende Node-module), herhaal de check.

- [ ] **Step 7: Preview opruimen**

```bash
sudo tailscale serve --https=8443 off
pkill -f "http.server 8765"
```

- [ ] **Step 8: Commit**

```bash
git add adem.html adem/app.mjs vercel.json README.md
git commit -m "feat(adem): /adem — HRV-biofeedbackpagina met camera, geluid en beeld

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXBcacfGbv5KHm9a6XeWNb"
```

- [ ] **Step 9: Overdracht aan Bob**

Meld: alle commits staan lokaal op `main`; **pushen doet Bob** (`git push`, remote op SSH). Daarna één controle op `https://derwisch-relay.vercel.app/adem`: laadt de pagina en serveert Vercel `adem/app.mjs` met een JavaScript-MIME-type? Zo niet: hernoem de modules naar `.js` en pas de imports aan.
