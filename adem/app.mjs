// adem/app.mjs — koppelt camera → signaal → hrv → sessie → beeld + geluid (browser)

import { PpgProcessor } from './signal.mjs';
import { rrSeries, heartRate, rmssd, coherence, level } from './hrv.mjs';
import { breathAt, cueBetween } from './breath.mjs';
import { createSession, step, summary, signalLevel, Q_GOOD } from './session.mjs';
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

const SIGNAL_TEXT = { goed: 'signaal goed', zwak: 'signaal zwak — stil houden', geen: 'geen vinger' };

function onFrame(f) {
  const b = proc.push(f);
  if (b !== null) { beats.push(b); flashBeat(); }
}

// Direct zichtbare terugkoppeling: hartje licht op bij elke gedetecteerde slag
function flashBeat() {
  const el = $('beat');
  el.classList.remove('tick');
  void el.offsetWidth; // animatie opnieuw starten
  el.classList.add('tick');
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
  const lvl = signalLevel(quality);
  $('sig').dataset.level = lvl;
  $('sigtext').textContent = SIGNAL_TEXT[lvl];
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
