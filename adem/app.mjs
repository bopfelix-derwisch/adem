// adem/app.mjs — koppelt camera → signaal → hrv → sessie → beeld + geluid (browser)

import { PpgProcessor } from './signal.mjs';
import { rrSeries, heartRate, rmssd, coherence, level, addBeat } from './hrv.mjs';
import { breathAt, cueBetween } from './breath.mjs';
import { createSession, step, summary, signalLevel, Q_GOOD } from './session.mjs';
import { Camera } from './camera.mjs';
import { Sound } from './audio.mjs';
import { Visual } from './visual.mjs';
import { ademWarmth } from './palette.mjs';
import { explain } from './explain.mjs';
import { assess } from './norms.mjs';
import { suggestTempo } from './tempo.mjs';
import { colorAt } from './palette.mjs';

const $ = id => document.getElementById(id);
const HISTORY_KEY = 'adem.history', PROFILE_KEY = 'adem.profile';
const TAU = 10;        // s, gladstrijken coherentie
const COH_EVERY = 5;   // s tussen coherentieberekeningen

let cam = null, sound = null, visual = null, proc = null, sess = null;
let beats = [], bpmBreath = 5.5, t0 = 0, lastTick = 0, lastCoh = -Infinity;
let cohRaw = null, cohSmooth = null, prevBreath = null, quality = 0;
let wbLocked = false, wakeLock = null, timer = null, raf = null, volume = 0.7, muted = false;
let measured = true, lastBreathSet = 0, starting = false;

function show(screen) { for (const id of ['profile', 'setup', 'practice', 'summary']) $(id).hidden = id !== screen; }
function setStatus(text) { $('status').textContent = text; }
function warn(text) { $('warn').textContent = text; }
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; } }
function saveHistory(item) {
  const h = [item, ...loadHistory()].slice(0, 20);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { /* privémodus: alleen dit scherm */ }
  return h;
}

// Profiel (leeftijd, geslacht, lengte, gewicht): alleen op dit toestel
function loadProfile() {
  try { const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); return p && typeof p === 'object' ? p : null; } catch (e) { return null; }
}
function storeProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* privémodus */ } }
let profile = loadProfile();

const num = id => { const v = parseFloat($(id).value.replace(',', '.')); return isFinite(v) ? v : null; };
function openProfile() {
  const p = profile || {};
  $('p-age').value = p.age || ''; $('p-sex').value = p.sex || ''; $('p-height').value = p.height || ''; $('p-weight').value = p.weight || '';
  $('p-err').textContent = '';
  show('profile');
}
function saveProfile() {
  const p = { age: num('p-age'), sex: $('p-sex').value || null, height: num('p-height'), weight: num('p-weight') };
  if (p.age !== null && (p.age < 12 || p.age > 110)) { $('p-err').textContent = 'Leeftijd tussen 12 en 110.'; return; }
  if (p.height !== null && (p.height < 100 || p.height > 230)) { $('p-err').textContent = 'Lengte in centimeters (100–230).'; return; }
  if (p.weight !== null && (p.weight < 25 || p.weight > 300)) { $('p-err').textContent = 'Gewicht in kilo (25–300).'; return; }
  profile = p; storeProfile(p);
  toSetup();
}
function skipProfile() { if (!profile) { profile = {}; storeProfile(profile); } toSetup(); }

function profileText(p) {
  if (!p || !(p.age || p.height || p.weight)) return 'Geen profiel — vul in voor normen en tempovoorstel';
  return [p.age && p.age + ' jaar', p.sex === 'v' ? 'vrouw' : p.sex === 'm' ? 'man' : null,
    p.height && (p.height / 100).toFixed(2).replace('.', ',') + ' m', p.weight && p.weight + ' kg'].filter(Boolean).join(' · ');
}

const fmtT = t => (+t).toFixed(1).replace('.', ',');
function applySuggestion() {
  const s = suggestTempo(profile, loadHistory());
  $('tempo').value = s.tempo; $('tempo-val').textContent = fmtT(s.tempo);
  $('tempo-hint').innerHTML = '';
  const b = document.createElement('b'); b.textContent = 'Voorstel ' + fmtT(s.tempo) + ' per minuut. ';
  $('tempo-hint').append(b, s.reason);
}
function toSetup() { $('profile-sum').textContent = profileText(profile); applySuggestion(); show('setup'); }

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

// Eén start tegelijk: een dubbele tik zou een tweede camera (met flitser) en timer achterlaten
async function begin() {
  if (starting || sess) return;
  starting = true;
  $('begin').disabled = true;
  try { await start(); } finally { starting = false; $('begin').disabled = false; }
}

async function start() {
  $('err').textContent = '';
  const mode = document.querySelector('input[name=mode]:checked').value;
  measured = mode === 'hart';
  if (measured && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
    $('err').textContent = 'Deze browser geeft geen cameratoegang (open de pagina via https in Safari).';
    return;
  }
  bpmBreath = +$('tempo').value;
  const durationSec = +$('duur').value * 60;

  sound = new Sound();
  try {
    await sound.start();
    sound.setVolume(muted ? 0 : volume);
    if ($('binaural').checked) sound.setBinaural(true);
  } catch (e) { sound = null; } // zonder geluid werkt de oefening nog

  beats = []; proc = null; cam = null; warn('');
  if (measured) {
    proc = new PpgProcessor();
    cam = new Camera($('video'), onFrame);
    try {
      const r = await cam.open();
      warn(r.torch ? '' : 'Flitser niet beschikbaar — werk iOS bij (≥ 17.5) of meet bij fel licht.');
    } catch (e) {
      if (sound) sound.stop();
      cam.close(); cam = null;
      $('err').textContent = cameraError(e);
      return;
    }
  }

  $('practice').dataset.mode = mode;
  sess = createSession(durationSec, { measured });
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
  if (b !== null) { beats = addBeat(beats, b); flashBeat(); }
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
  if (measured) measure(now, dt);

  const before = sess.state;
  step(sess, dt, { quality, coherence: cohSmooth, hidden: document.hidden });
  if (sound) {
    sound.setCoherence(!measured ? 0.7 : cohSmooth === null ? 0 : cohSmooth); // zonder meting: rustig akkoord
    if (before !== sess.state && (sess.state === 'pauze' || before === 'pauze')) sound.duck(sess.state === 'pauze');
  }
  updateText();
  if (sess.state === 'einde') finish();
}

// Alleen in de hartslagmodus: kwaliteit, witbalans, coherentie en de vinger-indicator
function measure(now, dt) {
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

  const lvl = signalLevel(quality);
  $('sig').dataset.level = lvl;
  $('sigtext').textContent = SIGNAL_TEXT[lvl];
}

function updateText() {
  $('time').textContent = mmss(Math.max(0, sess.durationSec - sess.elapsed));
  if (!measured) { setStatus('Adem mee met de cirkel en de klank'); return; }
  const S = rrSeries(beats).slice(-8);
  $('hr').textContent = S.length >= 4 ? Math.round(heartRate(S.map(p => p.rr))) : '–';
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
  if (sound && now - lastBreathSet > 0.05) { sound.setBreath(b.size); lastBreathSet = now; }
  const progress = sess.elapsed / sess.durationSec;
  visual.draw(measured
    ? { size: b.size, warmth: sess.state === 'oefenen' && cohSmooth !== null ? cohSmooth : 0, pulse: proc.pulse(4), active: measuring, progress }
    : { size: b.size, warmth: ademWarmth(now - t0, b.size), pulse: [], active: true, progress });
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
    mode: measured ? 'hart' : 'adem', tempo: bpmBreath,
    minutes: Math.round(sess.elapsed / 60),
    hr: S.length ? Math.round(heartRate(S.map(p => p.rr))) : null,
    rmssd: rmssd(S) === null ? null : Math.round(rmssd(S)),
    coherence: sum.meanCoherence === null ? null : +sum.meanCoherence.toFixed(2),
    highPct: sum.highPct, pauseSec: sum.pauseSec,
  };
  const ex = explain(item, loadHistory());
  const history = saveHistory(item);
  const as = assess(item, profile);
  renderExplain(ex, as);
  renderAssessment(as);
  for (const b of document.querySelectorAll('#feel button')) b.setAttribute('aria-pressed', 'false');
  $('next-tempo').textContent = '';
  const val = v => v === null ? '–' : v;
  $('s-hr').textContent = val(item.hr);
  $('s-rmssd').textContent = item.rmssd === null ? '–' : item.rmssd + ' ms';
  $('s-coh').textContent = item.coherence === null ? '–' : item.coherence.toFixed(2).replace('.', ',');
  $('s-high').textContent = item.highPct === null ? '–' : item.highPct + ' %';
  $('s-pause').textContent = mmss(item.pauseSec);
  $('s-mode').textContent = measured ? 'met hartslag' : 'alleen ademen';
  $('s-tempo').textContent = fmtT(bpmBreath) + ' per minuut';
  $('summary').dataset.mode = item.mode;
  renderHistory(history);
  show('summary');
  sess = null;
}

// Kleur per uitkomst volgens de norm (koel = laag, groen = gemiddeld, warm = hoog/gunstig)
function renderAssessment(as) {
  for (const key of ['hr', 'rmssd', 'coherence', 'bmi']) {
    const card = $('c-' + key), a = as[key];
    card.style.removeProperty('--tone');
    card.querySelector('.verdict').textContent = a ? a.verdict : '';
    card.querySelector('.norm').textContent = a ? a.norm : '';
    if (a) card.style.setProperty('--tone', 'rgb(' + colorAt(a.tone).join(',') + ')');
  }
  $('c-bmi').hidden = !as.bmi;
  if (as.bmi) $('s-bmi').textContent = as.bmi.value.toFixed(1).replace('.', ',');
}

function chooseFeel(feel, btn) {
  const h = loadHistory();
  if (!h.length) return;
  h[0].feel = feel;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { /* privémodus */ }
  for (const b of document.querySelectorAll('#feel button')) b.setAttribute('aria-pressed', String(b === btn));
  const s = suggestTempo(profile, h);
  $('next-tempo').textContent = 'Volgende keer: ' + fmtT(s.tempo) + ' per minuut. ' + s.reason;
}

function renderExplain(ex, as) {
  $('s-head').textContent = ex.headline;
  $('s-body').textContent = ex.body;
  $('s-body').parentElement.open = !ex.items.length; // zonder meetgetallen is dit de uitleg
  const box = $('s-explain');
  box.innerHTML = '';
  for (const it of ex.items) {
    const d = document.createElement('details'), sm = document.createElement('summary'), p = document.createElement('p');
    sm.textContent = 'Wat betekent ' + (it.label === it.label.toUpperCase() ? it.label : it.label.toLowerCase()) + '?';
    p.textContent = it.text + (as && as[it.key] ? ' ' + as[it.key].text : '');
    d.append(sm, p);
    box.appendChild(d);
  }
}

function renderHistory(h) {
  const ul = $('history');
  ul.innerHTML = '';
  for (const it of h) {
    const li = document.createElement('li');
    const d = new Date(it.date);
    li.textContent = `${d.toLocaleDateString('nl-NL')} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · ${it.minutes} min · ${it.mode === 'adem' ? 'alleen ademen' : 'coherentie ' + (it.coherence === null ? '–' : it.coherence.toFixed(2).replace('.', ','))}`;
    ul.appendChild(li);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (!sess) return;
  if (document.hidden) {
    // Meteen naar pauze: iOS legt de timers stil, de tijd weg telt dan als pauze (zie session.step)
    if (cam) { cam.close(); proc.reset(); }
    tick();
    return;
  }
  if (cam) { try { await cam.open(); proc.reset(); wbLocked = false; } catch (e) { warn(cameraError(e)); } }
  if (sound) sound.resume();
  requestWakeLock();
});

$('tempo').addEventListener('input', e => { $('tempo-val').textContent = (+e.target.value).toFixed(1).replace('.', ','); });
$('begin').addEventListener('click', begin);

// Duurkeuze per modus: met flitser max 3 min (wordt warm), zonder camera langer
const DURATIONS = { hart: [[2, false], [3, true]], adem: [[3, false], [5, true], [10, false], [20, false]] };
function fillDurations() {
  const mode = document.querySelector('input[name=mode]:checked').value, sel = $('duur');
  sel.innerHTML = '';
  for (const [min, def] of DURATIONS[mode]) {
    const o = document.createElement('option');
    o.value = min; o.textContent = min + ' minuten'; o.selected = def;
    sel.appendChild(o);
  }
  $('mode-note').textContent = mode === 'hart'
    ? 'Leg straks je wijsvinger licht op de lens naast de flitser. Het hartje knippert bij elke slag die de camera ziet; groen = goed signaal. De flitser wordt warm, daarom duurt een sessie hooguit 3 minuten.'
    : 'Geen camera, geen flitser: alleen de ademcirkel en de klank. Ogen dicht kan — de klank ademt mee.';
}
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', fillDurations));
fillDurations();
$('again').addEventListener('click', toSetup);
$('edit-profile').addEventListener('click', openProfile);
$('p-save').addEventListener('click', saveProfile);
$('p-skip').addEventListener('click', skipProfile);
document.querySelectorAll('#feel button').forEach(b => b.addEventListener('click', () => chooseFeel(b.dataset.feel, b)));
$('stop').addEventListener('click', () => { if (sess) finish(); });
$('lens').addEventListener('click', async () => {
  if (!cam) return;
  try { await cam.nextLens(); proc.reset(); wbLocked = false; warn('Lens: ' + cam.label); } catch (e) { warn(cameraError(e)); }
});
$('volume').addEventListener('input', e => { volume = +e.target.value; if (sound && !muted) sound.setVolume(volume); });
$('mute').addEventListener('click', () => {
  muted = !muted;
  $('mute').textContent = muted ? 'Geluid aan' : 'Geluid uit';
  if (sound) sound.setVolume(muted ? 0 : volume);
});
renderHistory(loadHistory());
if (profile) toSetup(); else openProfile(); // eerste keer: profiel vragen (overslaan kan)
