// adem/audio.mjs — grondtoon, coherentieklank en ademtonen via Web Audio (browser)

const RAMP = 2; // s, overgangen van de klank

// Grondtoon volgt de ademcirkel (size 0 = uitgeademd, 1 = ingeademd): helderder en luider bij
// inademen. Klank die meeademt helpt het ademtempo vast te houden (muzikaal begeleid
// resonantie-ademen); dat is het best onderbouwde effect van geluid in deze context.
export function breathTone(size) {
  return { cutoff: 300 + 1000 * size, gain: 0.1 + 0.14 * size };
}

// Binaurale toon (alleen zinvol met koptelefoon): links/rechts verschillen 6 Hz → theta.
// Bewijs voor "hersengolven meenemen" is gemengd; de pagina zegt dat er ook bij.
export function binauralFreqs(beatHz = 6, carrier = 200) {
  return { left: carrier, right: carrier + beatHz };
}

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
    const lp = this.lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = breathTone(0).cutoff;
    const drone = this.drone = ctx.createGain(); drone.gain.value = breathTone(0).gain;
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

  // size 0–1 uit de ademgids; zachte volging (τ 0,15 s) zodat het vloeiend klinkt
  setBreath(size) {
    if (!this.ctx) return;
    const { cutoff, gain } = breathTone(size), now = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(cutoff, now, 0.15);
    this.drone.gain.setTargetAtTime(gain, now, 0.15);
  }

  // Binaurale toon aan/uit: links en rechts apart via een kanaal-samenvoeger
  setBinaural(on) {
    if (!this.ctx) return;
    if (this.binaural) { this.binaural.forEach(n => { try { n.stop(); } catch (e) { /* al gestopt */ } }); this.binaural = null; }
    if (!on) return;
    const ctx = this.ctx, { left, right } = binauralFreqs();
    const merger = ctx.createChannelMerger(2), g = ctx.createGain();
    g.gain.value = 0.05;
    merger.connect(g); g.connect(this.master);
    this.binaural = [[left, 0], [right, 1]].map(([f, ch]) => {
      const o = ctx.createOscillator(); o.frequency.value = f; o.connect(merger, 0, ch); o.start(); return o;
    });
  }

  // Pauze: klank zacht (niet stil — anders lijkt het geluid kapot), ademtonen blijven
  duck(on) { if (this.ctx) this._ramp(this.feedback.gain, on ? 0.3 : 1); }

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
