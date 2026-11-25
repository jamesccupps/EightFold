// ================= sound: a small synth, no samples =================
const Snd = {
  ac: null, out: null, nbuf: null, muted: !!store.get('muted', false), on: false,
  bpm: 120, rate: 1, beats: [], root: 55, t0: 0, nextT: 0, stepN: 0, bass: [], lead: [],
  init() {
    if (this.ac) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = this.ac = new AC(), comp = ac.createDynamicsCompressor();
      this.out = ac.createGain(); this.out.gain.value = this.muted ? 0 : .55;
      this.out.connect(comp); comp.connect(ac.destination);
      this.mus = ac.createGain(); this.sfx = ac.createGain(); this.mus.connect(this.out); this.sfx.connect(this.out); this.bus = this.sfx; this.levels();
      const n = ac.sampleRate, b = ac.createBuffer(1, n, n), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.nbuf = b;
    } catch (e) { this.ac = null; }
  },
  wake() { this.init(); try { if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {}); } catch (e) {} },
  sleep() { try { if (this.ac && this.ac.state === 'running') this.ac.suspend().catch(() => {}); } catch (e) {} },
  levels() { if (this.mus) { this.mus.gain.value = opts.music / 100; this.sfx.gain.value = opts.sfx / 100; } },
  setMuted(m) { this.muted = m; store.set('muted', m); if (this.out) this.out.gain.setTargetAtTime(m ? 0 : .55, this.ac.currentTime, .02); },
  tone(type, f0, f1, t, dur, vol, cut) {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    let node = o;
    if (cut) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); node = f; }
    node.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + .03);
  },
  noise(t, dur, vol, hp) {
    const ac = this.ac; if (!ac) return;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.nbuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random() * .5, dur + .03);
  },
  song(i) {
    const r = rng(900 + i * 31), sc = [0, 3, 5, 7, 10, 12];
    this.bpm = 112 + (i % 8) * 5; this.root = [55, 49, 58.27, 51.91, 61.74, 46.25, 65.41, 55][i % 8];
    this.bass = []; this.lead = [];
    for (let s = 0; s < 16; s++) this.bass.push(s % 4 === 0 ? 0 : (r() < .45 ? sc[Math.floor(r() * 4)] : null));
    for (let s = 0; s < 16; s++) this.lead.push(r() < .55 ? sc[Math.floor(r() * 6)] : null);
    this.on = true; this.beats.length = 0;
    if (this.ac) { this.t0 = this.ac.currentTime + .06; this.nextT = this.t0; this.stepN = 0; }
  },
  stop() { this.on = false; },
  pump() {
    const ac = this.ac; if (!ac || !this.on || ac.state !== 'running') return;
    const sp = 60 / (this.bpm * this.rate) / 4;
    if (this.nextT < ac.currentTime - .2) { const k = Math.ceil((ac.currentTime - this.nextT) / sp); this.nextT += k * sp; this.stepN += k; }
    while (this.nextT < ac.currentTime + .14) { this.playStep(this.stepN, this.nextT, sp); this.nextT += sp; this.stepN++; }
  },
  playStep(s, t, sp) {
    const i = s % 16, bar = s >> 4; this.bus = this.mus;
    if (i % 4 === 0) { this.tone('sine', 160, 42, t, .24, .9); this.beats.push(t); if (this.beats.length > 6) this.beats.shift(); }
    if (i % 4 === 2) this.noise(t, .04, .16, 7000);
    if ((i === 4 || i === 12) && bar > 0) this.noise(t, .13, .2, 1500);
    if (i % 2 === 1 && bar % 2 === 1) this.noise(t, .02, .06, 9000);
    const b = this.bass[i];
    if (b != null) this.tone('sawtooth', this.root * Math.pow(2, b / 12), 0, t, sp * 1.7, .26, 420 + (bar % 4) * 120);
    if (bar % 4 >= 2) { const l = this.lead[(i + bar * 5) % 16]; if (l != null && i % 2 === 0) this.tone('square', this.root * 4 * Math.pow(2, l / 12), 0, t, sp * 1.4, .055, 2600); }
  },
  pulse() {
    const ac = this.ac; if (calm() || !ac || !this.on || ac.state !== 'running') return 0;
    const now = ac.currentTime; let tb = -1; for (let i = 0; i < this.beats.length; i++) { const b = this.beats[i]; if (b <= now && b > tb) tb = b; }
    return tb < 0 ? 0 : Math.exp(-(now - tb) * this.bpm * this.rate / 60 * 5);
  },
  fx(name) {
    const ac = this.ac; if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime; this.bus = this.sfx;
    if (name === 'hop') this.tone('triangle', 520, 760, t, .06, .14);
    else if (name === 'jump') this.tone('triangle', 330, 660, t, .16, .16);
    else if (name === 'launch') { this.tone('sine', 220, 990, t, .5, .2); this.noise(t, .3, .06, 4000); }
    else if (name === 'flip') { this.tone('sine', 280, 880, t, .28, .16); this.noise(t, .2, .05, 3000); }
    else if (name === 'spark') { const k = 1 + (pace ? pace.boost : 0) * 2.2; this.tone('triangle', 1320 * k, 1760 * k, t, .09, .12); }
    else if (name === 'risk') { this.tone('triangle', 1760, 2640, t, .1, .14); this.tone('triangle', 2640, 3520, t + .07, .12, .12); }
    else if (name === 'perfect') this.tone('sine', 1975, 2960, t, .07, .1);
    else if (name === 'shield' || name === 'slow' || name === 'magnet' || name === 'double') { this.tone('triangle', 660, 0, t, .12, .16); this.tone('triangle', 990, 0, t + .09, .2, .16); }
    else if (name === 'shieldhit') { this.noise(t, .2, .3, 1200); this.tone('square', 180, 90, t, .2, .15, 1200); }
    else if (name === 'fall' || name === 'crash') { this.noise(t, .35, .45, name === 'crash' ? 300 : 900); this.tone('sawtooth', 220, 38, t, .45, .3, 900); }
    else if (name === 'win') [0, 4, 7, 12, 16].forEach((n, k) => this.tone('triangle', 440 * Math.pow(2, n / 12), 0, t + k * .09, .3, .2));
  }
};

