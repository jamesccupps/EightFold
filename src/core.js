// ===== Core: track generator + physics (shared by the game and the solvability tests) =====
// Move timings in seconds. They are variables so the tuning panel can try other values: the generator
// reads the same numbers, so a course built after a change is laid out for the new timings.
let HOP = 0.10, FLIP = 0.40, JUMP = 0.44, LAUNCH = 0.70, COYOTE = 0.06, LANDGRACE = 0.03, PEND = 0.45;
const FEEL0 = { hop: HOP, flip: FLIP, jump: JUMP, coyote: COYOTE, buffer: PEND };
function setFeel(o) {
  const src = o || {}; o = Object.assign({}, FEEL0);
  for (const k in FEEL0) if (typeof src[k] === 'number' && isFinite(src[k])) o[k] = src[k];   // anything missing keeps its default
  HOP = o.hop; FLIP = o.flip; JUMP = o.jump; COYOTE = Math.max(LANDGRACE + .005, o.coyote); PEND = o.buffer;
}
const HZ0 = .38, HZ1 = .62;
// Pace: how fast time runs. Sparks add lasting speed, a press at the last moment adds a short surge, slow-mo stretches time.
//   boostMax: the most ordinary sparks can add.  risk: what each red spark adds on top of that, for good.  perfect: seconds before a move's last moment that count as "at the last moment".
//   surge: the burst a perfect press gives; each perfect in a row adds surgeStep, up to surgeMax; it fades over surgeSecs.
const PACE = { boostMax: .25, risk: .01, perfect: .09, surge: .12, surgeStep: .02, surgeMax: .24, surgeSecs: 3, slow: .6, slowSecs: 3.5 };
const PACE0 = Object.assign({}, PACE);
function setPace(o) { Object.assign(PACE, PACE0); for (const k in PACE0) if (o && typeof o[k] === 'number' && isFinite(o[k])) PACE[k] = o[k]; }   // the slice of a row a low bar occupies

function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// speed = rows per second, react = seconds of warning before a forced move,
// tw = timing window (s) for a ring-gap jump, widths = corridor half-widths to draw from,
// mix = how often each kind of section turns up. Each level leans on its own sections.
// Each level adds its own new obstacles and keeps the earlier ones in the mix, a little faster and denser every time.
const LEVELS = [
  { name: 'First Light', seed: 3284, fresh: ['step', 'flipGate'], shields: 0, slows: 0, speed: 7.5, secs: 40, react: .62, tw: .36, widths: [3, 2, 2, 1], rest: [4, 7], holes: 0, decor: .25, blockP: .30, sparks: .35, detour: .08, high: 0, pickups: 0, pat: 0,
    hint: 'Stay on the floor. Turn to follow it, flip when it carries on overhead.',
    mix: { step: 4, stairs: 1, flipGate: 3, field: 1 } },
  { name: 'Sidestep', seed: 4025, fresh: ['dodge1', 'dodge2', 'slalom'], shields: 1, slows: 0, speed: 8.2, secs: 44, react: .58, tw: .35, widths: [3, 2, 2, 1], rest: [3, 6], holes: .15, decor: .40, blockP: .50, sparks: .35, detour: .08, high: 0, pickups: .16, pat: 1,
    hint: 'Tall blocks. Go around them: every wall has one opening.',
    mix: { dodge1: 4, dodge2: 2, slalom: 2, step: 2, stairs: 1, flipGate: 2, field: 1 } },
  { name: 'Leapfrog', seed: 5580, fresh: ['hurdle', 'laneGap'], shields: 1, slows: 1, speed: 8.8, secs: 46, react: .55, tw: .34, widths: [2, 1, 2, 3], rest: [3, 6], holes: .15, decor: .45, blockP: .45, sparks: .35, detour: .08, high: .35, pickups: .16, pat: 4,
    hint: 'Jump low bars and short gaps. Tall blocks you still go around.',
    mix: { hurdle: 4, laneGap: 3, hurdles: 1, stones: 1, dodge1: 2, slalom: 1, step: 2, flipGate: 2, field: 1 } },
  { name: 'Overhead', seed: 5803, fresh: ['ringGap', 'blockFlip', 'pingpong'], shields: 1, slows: 1, speed: 9.4, secs: 48, react: .52, tw: .32, widths: [2, 2, 1, 3], rest: [3, 5], holes: .20, decor: .50, blockP: .50, sparks: .35, detour: .08, high: .2, pickups: .16, pat: 3, ringOpen: 0,
    hint: 'Gaps all the way round, and walls across your whole side. The way on is overhead.',
    mix: { ringGap: 3, blockFlip: 3, pingpong: 2, flipGate: 1, hurdle: 2, laneGap: 1, dodge1: 1, slalom: 1, stairs: 1, zigzag: 1 } },
  { name: 'Sweepers', seed: 8986, fresh: ['sweep', 'launch'], shields: 2, slows: 1, speed: 10, secs: 50, react: .49, tw: .31, widths: [2, 3, 2, 1], rest: [2, 5], taper: .25, holes: .20, decor: .50, blockP: .50, sparks: .35, detour: .08, high: .2, pickups: .16, pat: 2, ringOpen: .2,
    hint: 'Sliding blocks stop on the marked tile. White pads throw you across long gaps.',
    mix: { sweep: 4, launch: 3, ringGap: 1, blockFlip: 1, pingpong: 1, hurdles: 1, stones: 1, hurdle: 1, slalom: 1, zigzag: 1, dodge2: 1 } },
  { name: 'Crossfire', seed: 9172, fresh: ['beam', 'fan', 'fans'], shields: 2, slows: 1, speed: 10.6, secs: 52, react: .44, tw: .29, widths: [2, 1, 1, 0], rest: [2, 4], taper: .2, holes: .25, decor: .50, blockP: .60, sparks: .35, detour: .08, high: .2, pickups: .16, pat: 0, ringOpen: .2,
    hint: 'Beams and fans swing across the tunnel. Slip past, and never flip through one.',
    mix: { beam: 3, fan: 2, fans: 2, sweep: 2, launch: 1, ringGap: 1, blockFlip: 1, pingpong: 1, hurdles: 1, stones: 1, slalom: 1, zigzag: 1 } },
  { name: 'Overdrive', seed: 11948, fresh: ['sprint', 'crawl', 'spiral'], shields: 2, slows: 2, speed: 11.2, secs: 62, react: .40, tw: .27, widths: [1, 1, 2, 0], rest: [2, 4], taper: .2, holes: .30, decor: .60, blockP: .60, sparks: .35, detour: .08, high: .2, pickups: .16, pat: 1, ringOpen: .2,
    hint: 'Bright zones sprint, dark zones crawl through tight turns. Change gear with them.',
    mix: { sprint: 2, crawl: 2, spiral: 2, beam: 1, fans: 1, sweep: 2, launch: 1, ringGap: 3, blockFlip: 1, pingpong: 1, hurdles: 2, stones: 3, slalom: 1 } },
  { name: 'Eightfold', seed: 9211, fresh: [], shields: 2, slows: 2, speed: 12, secs: 60, react: .36, tw: .25, widths: [1, 1, 0, 0], rest: [2, 3], taper: .18, holes: .30, decor: .75, blockP: .65, sparks: .35, detour: .08, high: .2, pickups: .16, pat: 3, ringOpen: .2,
    hint: 'Everything you have met, at full speed.',
    mix: { zigzag: 2, spiral: 1, pingpong: 2, ringGap: 3, blockFlip: 2, dodge2: 1, slalom: 2, hurdles: 3, stones: 3, sweep: 2, beam: 2, fan: 1, fans: 2, launch: 2, sprint: 1, crawl: 1 } }
];
const DAILY = { name: 'Daily', fresh: [], shields: 2, slows: 1, speed: 9.5, secs: 60, react: .50, tw: .30, widths: [2, 1, 3, 1], rest: [3, 7], holes: .25, decor: .60, blockP: .55, sparks: .35, detour: .15, high: .2, pickups: .16, pat: 0,
  hint: 'One course a day, the same for everyone.',
  mix: { step: 2, stairs: 1, zigzag: 1, flipGate: 3, pingpong: 1, ringGap: 2, dodge1: 2, slalom: 1, blockFlip: 1, sweep: 2, beam: 2, fan: 1, hurdle: 2, hurdles: 1, laneGap: 1, stones: 1, launch: 2, sprint: 1, crawl: 1 } };
// obstacle families, for spacing things out and deciding which helper suits what comes next
const KGROUP = { step: 'turns', stairs: 'turns', zigzag: 'turns', spiral: 'turns', flipGate: 'overhead', pingpong: 'overhead', dodge1: 'blocks', dodge2: 'blocks', slalom: 'blocks',
  blockFlip: 'blockflip', hurdle: 'bars', hurdles: 'bars', laneGap: 'gaps', stones: 'gaps', ringGap: 'ringgap', sweep: 'sweepers', beam: 'beams', fan: 'beams', fans: 'beams', launch: 'pads', sprint: 'sprint', crawl: 'slow', field: 'holes' };
const CRASH = { dodge2: 1, slalom: 1, sweep: 1, beam: 1, fan: 1, fans: 1, hurdles: 1, blockFlip: 1 };      // things a shield saves you from
const PRECISION = { stones: 1, pingpong: 1, spiral: 1, zigzag: 1, fans: 1, hurdles: 1, slalom: 1 };        // rhythm sections where slow-mo helps
const EMIX = [
  { step: 4, flipGate: 2, dodge1: 3, field: 1 },
  { step: 3, stairs: 2, flipGate: 3, ringGap: 1, dodge1: 3, slalom: 2, sweep: 2, hurdle: 3, laneGap: 2, launch: 1, field: 1 },
  { step: 2, stairs: 2, zigzag: 1, flipGate: 3, pingpong: 1, ringGap: 2, dodge1: 2, dodge2: 1, slalom: 1, blockFlip: 1, sweep: 2, beam: 2, hurdle: 2, hurdles: 2, stones: 2, launch: 2, sprint: 1 },
  { step: 2, stairs: 2, zigzag: 2, spiral: 1, flipGate: 3, pingpong: 2, ringGap: 2, dodge1: 2, dodge2: 1, slalom: 1, blockFlip: 2, sweep: 2, beam: 2, fan: 2, fans: 1, hurdle: 2, hurdles: 2, laneGap: 1, stones: 2, launch: 2, sprint: 2, crawl: 1 }
];
const TUTORIAL = { name: 'How to play', tutorial: true, speed: 6, secs: 0, react: 1.1, tw: .5, widths: [2], rest: [6, 6], holes: 0, decor: 0, blockP: 0, sparks: 0, detour: 0, high: 0, pickups: 0, pat: 0, mix: {} };

class Track {
  // cfg: a level config, or null for the endless run
  constructor(seed, cfg) {
    this.rnd = rng(seed); this.seed = seed;
    this.rnd2 = rng((seed ^ 0x5bd1e995) >>> 0); this.extra = 0;   // a second stream for the risk routes, so adding them leaves the rest of the course as it was
    // per row: solid lanes, tall-block lanes, low-bar lanes, launch-pad lanes, no-flip flag, speed, zone (1 sprint, 2 slow)
    this.S = []; this.B = []; this.H = []; this.PD = []; this.X = []; this.V = []; this.Z = [];
    this.G = {};                       // per row: moving-obstacle drawing info
    this.I = {};                       // per row: one pickup {lane, t: spark | high | shield | slow}
    this.notes = [];                   // tutorial captions that need no key press
    this.events = [];                  // the pilot's route: {z0, z1, key, opt?} press windows
    this.L = 0; this.w = 4;            // pilot lane and corridor half-width
    this.level = cfg || null; this.end = Infinity;
    this.decor = []; this.noDecor = false; this.mult = 1; this.zone = 0; this.vo = 0; this.nSparks = 0;
    this.cps = [];                     // safe places to restart from: {z, lane}
    this.P = this.params(0);
    if (cfg && cfg.tutorial) { this.buildTutorial(); this.end = this.S.length; return; }
    this.plain(Math.ceil(this.P.speed * 2.2), { noHoles: true });
    if (cfg) {
      const N = Math.round(cfg.speed * cfg.secs);
      this.layout(cfg, N);
      if (this.mult !== 1) this.setMult(1);
      // home straight: wide floor and a last line of sparks
      this.P = this.params(this.S.length); this.w = 4;
      const s0 = this.S.length, n = Math.ceil(cfg.speed * 1.5), lead = Math.ceil(HOP * cfg.speed) + 1;
      this.plain(n, { noHoles: true });
      for (let r = s0 + lead, c = 0; r < s0 + n - 1 && c < 6; r++, c++) this.spark(r, this.L);
      this.end = this.S.length;
    }
  }
  base(row) { return this.level ? this.level.speed : Math.min(14.5, 8 + row / 320); }
  speedAt(z) {
    const r = Math.floor(z); if (r < 0) return this.V[0];
    if (this.end === Infinity) this.cell(r + 1, 0);
    const V = this.V, n = V.length; if (r >= n - 1) return V[n - 1];
    return V[r] + (V[r + 1] - V[r]) * (z - r);
  }
  params(row) {
    const b = this.base(row) * this.mult;
    if (this.level) { const P = Object.create(this.level); P.speed = b; return P; }
    const d = Math.min(1, row / 3200);
    return {
      speed: b, react: .60 - .20 * d, tw: .36 - .10 * d,
      widths: d < .2 ? [4, 3, 2, 2] : d < .55 ? [3, 2, 1, 1] : [2, 1, 0, 1],
      rest: [Math.round(6 - 3 * d), Math.round(10 - 5 * d)],
      holes: .1 + .2 * d, decor: .3 + .45 * d, blockP: .3 + .35 * d, sparks: .35, detour: .15, high: .2, pickups: .14,
      mix: EMIX[d < .08 ? 0 : d < .25 ? 1 : d < .5 ? 2 : 3]
    };
  }
  cell(r, lane) {                      // 0 gap, 1 floor, 2 block
    if (r < 0 || r >= this.end) return 1;
    if (r >= this.S.length) { if (this.level) return 1; while (this.S.length <= r) this.segment(); }
    const b = 1 << (lane & 7);
    return this.B[r] & b ? 2 : (this.S[r] & b ? 1 : 0);
  }
  bit(l) { return 1 << (l & 7); }
  band(c, w) { if (w >= 4) return 255; let m = 0; for (let i = -w; i <= w; i++) m |= this.bit(c + i); return m; }
  ri(a, b) { return a + Math.floor(this.rnd() * (b - a + 1)); }
  pickW() { const a = this.P.widths; return a[Math.floor(this.rnd() * a.length)]; }
  dir() { return this.rnd() < .5 ? 1 : -1; }

  push(m, b, clean) {
    const row = this.S.length;
    if (clean || this.noDecor) this.decor.length = 0;
    else {
      // stray platforms away from the corridor: extra floor only, never hazards
      const guard = this.band(this.L, Math.min(4, this.w + 1));
      this.decor = this.decor.filter(d => !(d.m & guard) && d.n-- > 0);
      if (this.decor.length < 2 && this.rnd() < this.P.decor * .14) {
        const dm = this.band(this.ri(0, 7), this.rnd() < .3 ? 1 : 0);
        if (!(dm & guard)) this.decor.push({ m: dm, n: this.ri(3, 12) });
      }
      for (const d of this.decor) m |= d.m;
    }
    this.S.push(m); this.B.push(b || 0); this.H.push(0); this.PD.push(0); this.X.push(0); this.Z.push(this.zone);
    this.V.push(this.vo || this.base(row) * this.mult);
  }
  item(r, lane, t) { if (!this.I[r]) { this.I[r] = { lane: lane & 7, t }; if (t === 'spark' || t === 'high' || t === 'risk') this.nSparks++; if (t === 'risk') this.nRisk = (this.nRisk || 0) + 1; } }
  spark(r, lane) { this.item(r, lane, 'spark'); }
  plain(n, o) {
    o = o || {};
    const s0 = this.S.length, hp = o.holes != null ? o.holes : this.P.holes * .3;
    let hole = null;
    for (let i = 0; i < n; i++) {
      let m = this.band(this.L, this.w);
      if (!o.noHoles && this.w >= 1 && hp > 0) {
        if (hole) { m &= ~hole.m; if (--hole.n <= 0) hole = null; }
        else if (this.rnd() < hp) {
          const off = this.w >= 4 ? this.ri(1, 7) : this.ri(1, this.w) * this.dir();
          hole = { m: this.bit(this.L + off), n: this.ri(2, 4) };
        }
      }
      this.push(m);
    }
    if (o.sparks) {   // something to pick up along the route
      const P = this.P, lead = Math.ceil(HOP * P.speed) + 1;
      if (n >= lead + 2 && (o.sparks === 'yes' || this.rnd() < P.sparks)) {
        const jr = JUMP * P.speed, q = Math.ceil(.75 * jr), y = this.rnd();
        if (y < P.high && n >= lead + 2 * q + 2) {   // a spark hung in the air: jump for it
          const c = s0 + lead + q + this.ri(0, n - lead - 2 * q - 2);
          this.item(c, this.L, 'high');
          this.events.push({ z0: c - .75 * jr + .3, z1: c + 1 - .25 * jr - .3, key: 'J', opt: 1 }); this.nOpt = (this.nOpt || 0) + 1;
        } else {
          const cnt = Math.min(this.ri(2, 4), n - lead), st = s0 + lead + this.ri(0, n - lead - cnt);
          for (let c = 0; c < cnt; c++) this.spark(st + c, this.L);
        }
      }
    }
  }
  // Level layout. Teach each new obstacle alone with room around it, practise it mixed with old ones as the
  // gaps between obstacles shrink, give a breather at half way, then test everything close together.
  layout(cfg, N) {
    let shields = cfg.shields | 0, slows = cfg.slows | 0, breathed = false, last = null;
    const risks = cfg.risk == null ? 3 : cfg.risk; let risked = 0;
    for (const k of cfg.fresh || []) { this.lead(-.4, null); this.runKind(k); last = k; }
    while (this.S.length - this.extra < N) {
      const prog = (this.S.length - this.extra) / N;
      if (!breathed && prog >= .5) { breathed = true; this.breather(shields > 0); if (shields > 0) shields--; continue; }
      const kind = this.draw(last); last = kind;
      // what the stretch before this obstacle offers: slow-mo (off the route, your choice) before a rhythm section,
      // a shield (on the route) before something you can run into
      let offer = null;
      if (slows > 0 && prog > .6 && PRECISION[kind]) { offer = 'slow'; slows--; }
      else if (shields > 0 && prog > .72 && CRASH[kind]) { offer = 'shield'; shields--; }
      // a risk route now and then: an optional stretch with red sparks off the safe line
      if (risked < risks && prog >= (risked + 1) / (risks + 1) && this.mult === 1) { this.riskStretch(); risked++; }
      this.lead(prog, offer); this.runKind(kind);
    }
  }
  // Risk route: a calm straight where the safe line carries on, and three red sparks sit somewhere that takes nerve:
  // on a short strip along the far wall (flip over, flip back before it ends) or on a short strip beside the floor
  // (hop out, hop back before it ends). Worth more points and more speed. Built from its own random stream and with
  // the corridor put back as it was, so the course around it is unchanged.
  riskStretch() {
    const P = this.P = this.params(this.S.length), v = P.speed, s0 = this.S.length, e0 = this.events.length, w0 = this.w, dec = this.decor;
    this.decor = []; this.noDecor = true;
    const far = this.rnd2() < .5, s = this.rnd2() < .5 ? 1 : -1;
    this.narrow(far ? 2 : 1);
    const hops = far ? 0 : this.w + 1, air = far ? FLIP * v : hops * HOP * v, lane = far ? this.L + 4 : this.L + s * hops;
    const a = this.S.length, p0 = a + .3 + Math.ceil(v * .12), p1 = p0 + Math.max(1.5, v * .28);       // the window to set off in
    const q0 = Math.ceil(p1 + air) + 1, back0 = q0 + 2.25, b = Math.ceil(back0 + Math.max(1.3, v * .2));   // sparks at q0..q0+2; the strip ends after row b
    const n = Math.ceil(b + .6 + air) + 2 - a;
    this.plain(n, { noHoles: true });
    for (let r = Math.floor(p0 + air); r <= b; r++) this.S[r] |= this.bit(lane);
    for (let c = 0; c < 3; c++) this.item(q0 + c, lane, 'risk');
    this.nOpt = (this.nOpt || 0) + 3;
    const out = far ? 'F' : s > 0 ? 'L' : 'R', home = far ? 'F' : s > 0 ? 'R' : 'L', kind = far ? 'riskFar' : 'riskSide';
    for (let h = 0; h < Math.max(1, hops); h++) this.events.push({ z0: p0 + h * .01, z1: p1 + h * .01, key: out, opt: 1, kind });
    for (let h = 0; h < Math.max(1, hops); h++) this.events.push({ z0: back0 + h * .01, z1: b + .6 + h * .01, key: home, opt: 1, kind });
    this.w = w0; this.noDecor = false; this.decor = dec;
    (this.segs || (this.segs = [])).push([s0, this.S.length, kind]);
    this.extra += this.S.length - s0;
  }
  // next obstacle from a shuffle bag (each kind turns up in proportion), never the same family twice running
  draw(last) {
    const P = this.P = this.params(this.S.length);
    if (!this.bag || !this.bag.length || this.bagMix !== P.mix) {
      this.bagMix = P.mix; this.bag = [];
      for (const k in P.mix) for (let i = 0; i < P.mix[k]; i++) this.bag.push(k);
      for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)), t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t; }
    }
    let i = this.bag.length - 1;
    if (last) while (i > 0 && KGROUP[this.bag[i]] === KGROUP[last]) i--;
    return this.bag.splice(i, 1)[0];
  }
  runKind(kind) {
    this.P = this.params(this.S.length);
    (this.kinds || (this.kinds = {}))[kind] = (this.kinds[kind] || 0) + 1;
    const r0 = this.S.length, e0 = this.events.length;
    this.noDecor = true;
    if (kind === 'dodge1') this.dodge(1); else if (kind === 'dodge2') this.dodge(2);
    else if (kind === 'sweep') this.dodge(1, 'sweep'); else if (kind === 'beam') this.dodge(1, 'beam'); else if (kind === 'fan') this.dodge(1, 'fan');
    else this[kind]();
    this.noDecor = false;
    // which rows and presses belong to this obstacle (the play recording reads these)
    (this.segs || (this.segs = [])).push([r0, this.S.length, kind]);
    for (let i = e0; i < this.events.length; i++) this.events[i].kind = kind;
  }
  // A number that changes if the course does. Recorded with each run, so that a recording is only ever played back
  // against the course it was made on, however the generator changes later.
  checksum() {
    if (this._cs == null) {
      const n = this.end === Infinity ? 300 : this.end; if (this.end === Infinity) this.cell(n - 1, 0);
      let h = 17; for (let r = 0; r < n; r++) h = (Math.imul(h, 31) + this.S[r] + 7 * this.B[r] + 13 * this.H[r] + 19 * this.PD[r] + 23 * this.X[r]) | 0;
      this._cs = h >>> 0;
    }
    return this._cs;
  }
  kindAt(row) {   // the obstacle at this row, or the one just behind it, or 'floor'
    const g = this.segs || []; let best = 'floor';
    for (let i = g.length - 1; i >= 0; i--) {
      if (row >= g[i][0] && row < g[i][1] + 5) { best = g[i][2]; break; }
      if (g[i][1] + 5 <= row) break;
    }
    return best;
  }
  // the stretch of floor before an obstacle. prog 0..1 through the level shortens it; offer puts a helper in it.
  lead(prog, offer) {
    const P = this.P = this.params(this.S.length), hop = Math.ceil(HOP * P.speed) + 1;
    if (this.rnd() < .5) this.w = this.pickW();
    this.cps.push({ z: this.S.length + 1.5, lane: this.L });
    if (offer === 'slow') return this.detour('slow');
    let n = Math.max(3, Math.round(P.rest[1] + (P.rest[0] - P.rest[1]) * prog) + this.ri(0, 1));
    if (offer === 'shield') { n = Math.max(n, hop + 3); this.plain(n, { noHoles: true }); this.item(this.S.length - 2, this.L, 'shield'); return; }
    if (this.rnd() < P.detour) return this.detour();
    const want = this.rnd() < P.sparks; if (want) n = Math.max(n, hop + 2);
    this.plain(n, { sparks: want ? 'yes' : false });
  }
  // half-way breather: a long open straight with a line of sparks, and a shield at the end if the level has things to hit
  breather(shield) {
    const P = this.P = this.params(this.S.length), hop = Math.ceil(HOP * P.speed) + 1;
    if (this.w < 2) this.w = 2;
    const s0 = this.S.length, n = Math.ceil(P.speed * 2.2);
    this.cps.push({ z: s0 + 1.5, lane: this.L });
    this.plain(n, { noHoles: true });
    for (let r = s0 + hop, c = 0; r < s0 + n - 3 && c < 8; r++, c++) this.spark(r, this.L);
    if (shield) this.item(s0 + n - 2, this.L, 'shield');
  }
  // something one lane off the route, with room to hop over and back: two sparks, or a slow-mo you can choose to take
  detour(what) {
    const P = this.P, hr = HOP * P.speed, s = this.dir();
    if (this.w < 1) this.w = 1;
    const G = Math.ceil(P.speed * P.react * .8) + Math.ceil(hr) + 1, n = 2 * G + 2, s0 = this.S.length, c = s0 + G;
    this.plain(n, { noHoles: true });
    if (what === 'slow') this.item(c, this.L + s, 'slow');
    else { this.spark(c, this.L + s); this.spark(c + 1, this.L + s); this.nOpt = (this.nOpt || 0) + 2; }
    this.events.push({ z0: s0 + .1, z1: c - hr - .3, key: s > 0 ? 'L' : 'R', opt: 1 }, { z0: c + 1.9, z1: s0 + n - .6, key: s > 0 ? 'R' : 'L', opt: 1 });
  }
  // endless run: no fixed plan, but helpers still turn up before the sections they suit
  segment() {
    const kind = this.draw(this.lastKind); this.lastKind = kind;
    const x = this.rnd(), offer = PRECISION[kind] && x < .14 ? 'slow' : CRASH[kind] && x < .3 ? 'shield' : null;
    if (this.S.length > 150 && this.mult === 1 && this.rnd2() < .16) this.riskStretch();
    this.lead(.5, offer); this.runKind(kind);
  }
  // change pace: 1.35 = sprint, .7 = slow zone; eased in over four rows
  setMult(m) {
    const from = this.mult; this.mult = m; this.zone = m > 1 ? 1 : m < 1 ? 2 : 0;
    for (let i = 1; i <= 4; i++) { this.vo = this.base(this.S.length) * (from + (m - from) * i / 4); this.push(this.band(this.L, this.w)); }
    this.vo = 0; this.P = this.params(this.S.length);
  }
  // funnel the corridor down a lane at a time so nobody is stranded on its edge
  narrow(to) { while (this.w > to) { this.w--; this.plain(Math.ceil(this.P.speed * (this.P.taper || .3)) + 1, { noHoles: true }); } }
  // single-file floor jogs one lane sideways; the old lane ends, so everyone has to turn
  step(dir, wNew, k) {
    const P = this.P; dir = dir || this.dir();
    this.narrow(0);
    const U = Math.ceil(P.speed * P.react * (k || 1)) + Math.ceil(HOP * P.speed);
    const s = this.S.length, m = this.bit(this.L) | this.bit(this.L + dir);
    for (let i = 0; i < U; i++) this.push(m);
    this.events.push({ z0: s + .1, z1: s + U - .6, key: dir > 0 ? 'L' : 'R' });
    this.L += dir; this.w = 0; this.plain(k ? 1 : 2, { noHoles: true });
    if (!k) this.spark(this.S.length - 1, this.L);
  }
  stairs() { const d = this.dir(), n = this.ri(2, 4); this.narrow(0); this.plain(2, { noHoles: true }); for (let i = 0; i < n; i++) { this.step(d, 0, .7); this.plain(this.ri(0, 1), { noHoles: true }); } this.plain(2, { noHoles: true }); this.spark(this.S.length - 1, this.L); }
  zigzag() { let d = this.dir(); const n = this.ri(3, 5); this.narrow(0); this.plain(2, { noHoles: true }); for (let i = 0; i < n; i++) { this.step(d, 0, .7); this.plain(this.ri(0, 1), { noHoles: true }); d = -d; } this.plain(2, { noHoles: true }); this.spark(this.S.length - 1, this.L); }
  spiral() { const d = this.dir(), n = this.ri(6, 9); this.narrow(0); this.plain(2, { noHoles: true }); for (let i = 0; i < n; i++) this.step(d, 0, .6); this.plain(3, { noHoles: true }); this.spark(this.S.length - 2, this.L); this.spark(this.S.length - 1, this.L); }
  // floor ends; it carries on along the opposite wall. Both sides are narrow, so no lane is shared and turning cannot reach it
  flipGate() {
    const P = this.P; this.narrow(1); this.plain(2, { noHoles: true });
    const wNew = Math.min(this.pickW(), 1), U = Math.ceil(P.speed * P.react) + 1;
    const s = this.S.length, m = this.band(this.L, this.w) | this.band(this.L + 4, wNew);
    for (let i = 0; i < U; i++) this.push(m);
    this.events.push({ z0: s + .1, z1: s + U - .6, key: 'F' });
    this.L += 4; this.w = wNew; this.plain(Math.ceil(FLIP * P.speed) + 2, { noHoles: true });
    this.spark(this.S.length - 1, this.L);
  }
  pingpong() { const n = this.ri(2, 3); for (let i = 0; i < n; i++) this.flipGate(); }
  // every lane drops away for a moment. open: full ring both sides, so a jump or a flip clears it.
  // otherwise the floor resumes only on the opposite wall, so it has to be a flip.
  ringGap(open) {
    const P = this.P, fr = FLIP * P.speed;
    if (open === undefined) open = this.rnd() < (P.ringOpen == null ? .35 : P.ringOpen);
    if (open) this.w = 4; else this.narrow(1);
    this.plain(Math.ceil(fr) + 2, { noHoles: true });
    const g = Math.max(1, Math.floor(fr - P.tw * P.speed)), e = this.S.length;
    for (let i = 0; i < g; i++) this.push(0, 0, true);
    this.events.push({ z0: e + g - fr + .2, z1: e - .15, key: 'F' });
    this.L += 4; this.w = open ? 4 : Math.min(this.pickW(), 1);
    this.plain(Math.ceil(fr) + 2, { noHoles: true });
    this.spark(this.S.length - 1, this.L);
  }
  // something across the whole corridor with one opening, d lanes from the route.
  // style: 'bumps' wall of blocks, 'sweep' sliding blocks, 'beam' bar across the tunnel, 'fan' two crossed bars
  dodge(d, style, dirO) {
    const P = this.P, dir = dirO || this.dir(), hr = HOP * P.speed; style = style || 'bumps';
    let m, E;
    if (style === 'beam' || style === 'fan') { d = 1; this.narrow(0); E = this.L + dir; m = this.bit(this.L) | this.bit(E); }
    else if (style === 'sweep') { d = 1; this.narrow(1); this.w = 1; E = this.L + dir; m = this.band(this.L, 1); }
    else { this.narrow(2); if (this.w < d) this.w = d; E = this.L + d * dir; m = this.band(this.L, this.w); }
    const A = Math.ceil(P.speed * (P.react + (d - 1) * .18)) + Math.ceil(hr) * d + 1, s = this.S.length;
    for (let i = 0; i < A; i++) this.push(m);
    const b0 = this.S.length; let blk = 0, n = 1;
    if (style === 'bumps') { blk = m & ~this.bit(E); n = this.ri(1, 2); }
    else if (style === 'sweep') {
      const span = this.ri(2, 3); blk = this.bit(this.L) | this.bit(this.L - dir);
      this.G[b0] = { t: 'sweep', items: [{ lane: this.L, dir, span }, { lane: this.L - dir, dir, span }] };
    } else {
      const arms = style === 'fan' ? [this.L, this.L + 2] : [this.L];
      for (const a of arms) blk |= this.bit(a) | this.bit(a + 4);
      this.G[b0] = { t: 'beam', arms, spin: this.dir() * this.ri(1, 3) };
    }
    for (let i = 0; i < n; i++) this.push(m, blk);
    if (style === 'beam' || style === 'fan') { this.X[b0] = 1; this.w = 0; }
    for (let i = 0; i < d; i++) this.events.push({ z0: s + .1 + i * (hr + .35), z1: b0 - .3 - (d - 1 - i) * (hr + .35), key: dir > 0 ? 'L' : 'R' });
    this.L = E;
    // landing strip past the opening, with a spark for threading it
    this.plain(Math.ceil(hr) + 1, { noHoles: true }); this.spark(this.S.length - 1, this.L);
  }
  slalom() { let d = this.dir(); const n = this.ri(3, 4); for (let i = 0; i < n; i++) { this.dodge(1, 'bumps', d); d = -d; } }
  fans() { const n = this.ri(2, 3); for (let i = 0; i < n; i++) this.dodge(1, this.rnd() < .5 ? 'fan' : 'beam'); }
  // blocks across your whole side; the opposite wall is clear
  blockFlip() {
    const P = this.P; this.narrow(1); this.plain(2, { noHoles: true });
    const w2 = Math.min(this.pickW(), 1), A = Math.ceil(P.speed * P.react) + 1;
    const s = this.S.length, old = this.band(this.L, this.w), m = old | this.band(this.L + 4, w2);
    for (let i = 0; i < A; i++) this.push(m);
    const b0 = this.S.length, n = this.ri(1, 2);
    for (let i = 0; i < n; i++) this.push(m, old);
    this.events.push({ z0: s + .1, z1: b0 - .3, key: 'F' });
    this.L += 4; this.w = w2; this.plain(Math.ceil(FLIP * P.speed) + 2, { noHoles: true });
    this.spark(this.S.length - 1, this.L);
  }
  // fast, open stretch with long jumps
  sprint() {
    this.setMult(1.35); this.w = this.rnd() < .5 ? 4 : 3;
    const n = this.ri(2, 3);
    for (let i = 0; i < n; i++) { this.plain(this.ri(6, 10), { sparks: true, noHoles: true }); this.ringGap(true); }
    this.plain(3, { noHoles: true }); this.setMult(1);
  }
  // slow, single-file stretch with quick turns
  crawl() {
    this.setMult(.7); let d = this.dir(); const n = this.ri(5, 8);
    this.narrow(0); this.plain(2, { noHoles: true });
    for (let i = 0; i < n; i++) { this.step(d, 0, .55); if (this.rnd() < .7) d = -d; }
    this.plain(2, { noHoles: true }); this.spark(this.S.length - 1, this.L); this.setMult(1);
  }
  // a low bar across the corridor: jump it
  hurdle(lead) {
    this.narrow(1);   // three lanes at most, so there is no opposite floor to flip to
    const P = this.P, jr = JUMP * P.speed, A = lead || Math.ceil(P.speed * P.react) + 1, m = this.band(this.L, this.w);
    for (let i = 0; i < A; i++) this.push(m);
    const b = this.S.length; this.push(m); this.H[b] = m; this.item(b, this.L, 'high');   // a spark over the bar: a clean jump collects it
    this.events.push({ z0: b + HZ1 - .92 * jr + .15, z1: b + HZ0 - .08 * jr - .15, key: 'J' });
    this.plain(Math.ceil(jr) + 1, { noHoles: true });
  }
  hurdles() { const n = this.ri(2, 4), jr = JUMP * this.P.speed; this.hurdle(); for (let i = 1; i < n; i++) this.hurdle(Math.ceil(.92 * jr) + this.ri(0, 2)); }
  // a short break in a single-file floor with nothing overhead: jump it
  laneGap(pre) {
    const P = this.P, jr = JUMP * P.speed, g = Math.max(1, Math.floor(jr - P.tw * P.speed - .2));
    this.narrow(0); this.plain(pre || Math.max(3, Math.ceil(jr - g)), { noHoles: true });
    const e = this.S.length;
    for (let i = 0; i < g; i++) this.push(0, 0, true);
    this.item(e + Math.floor(g / 2), this.L, 'high');   // a spark over the gap
    this.events.push({ z0: e + g - jr + .2, z1: e - .1, key: 'J' });
    this.plain(Math.ceil(jr) + 1, { noHoles: true });
  }
  // stepping stones: several of those in a row
  stones() {
    const P = this.P, jr = JUMP * P.speed, g = Math.max(1, Math.floor(jr - P.tw * P.speed - .2)), n = this.ri(3, 5);
    const pre = Math.max(1, Math.ceil(jr - g + .22 * P.speed) - Math.ceil(jr) - 1);
    this.laneGap(); for (let i = 1; i < n; i++) this.laneGap(pre);
  }
  // a pad that throws you over a long gap; nothing to press
  launch() {
    const P = this.P, Lr = LAUNCH * P.speed; if (this.w < 1) this.w = 1;
    this.plain(3, { noHoles: true });
    const m = this.band(this.L, this.w), b = this.S.length;
    this.push(m); this.push(m); this.PD[b] = m; this.PD[b + 1] = m;
    const g = Math.max(2, Math.floor(Lr) - 3);
    for (let i = 0; i < g; i++) this.push(0, 0, true);
    for (let r = b + 2; r < b + 2 + g; r += 2) this.item(r, this.L, 'high');   // an arc of sparks along the flight
    this.plain(Math.ceil(Lr) + 3, { noHoles: true });
  }
  // wide floor full of holes
  field() { if (this.w < 3) this.w = 3; this.plain(this.ri(10, 16), { holes: .8, sparks: true }); }

  buildTutorial() {
    const tip = (i0, t) => { for (let i = i0; i < this.events.length; i++) { this.events[i].tip = t; delete this.events[i].opt; } };
    const calm = n => this.plain(n, { noHoles: true });
    let n;
    this.w = 3; calm(12); this.w = 0; calm(5);
    n = this.events.length; this.step(1, 0); tip(n, 'The floor shifts left. Press {K} to follow it.'); calm(6);
    n = this.events.length; this.step(-1, 0); tip(n, 'Now it shifts right. Press {K}.'); calm(6);
    n = this.events.length; this.flipGate(); tip(n, 'The floor ends, but it carries on overhead. Press {K} to flip.'); calm(4);
    this.w = 2; calm(4);
    n = this.events.length; this.dodge(1, 'bumps', 1); tip(n, 'A tall block. Press {K} to go around it.'); calm(6);
    n = this.events.length; this.hurdle(); tip(n, 'A low bar. Press {K} to jump it.'); calm(4);
    this.w = 0; calm(3);
    n = this.events.length; this.laneGap(); tip(n, 'A short gap with nothing overhead. Press {K} to jump it.'); calm(5);
    this.w = 4;
    n = this.events.length; this.ringGap(); tip(n, 'A gap all the way round. Press {K} to flip across it.'); this.w = 2; calm(6);
    n = this.events.length; this.dodge(1, 'beam', -1); tip(n, 'A beam. Press {K} to slip past. Never flip through one.'); calm(5);
    n = this.events.length; this.dodge(1, 'sweep', 1); tip(n, 'A sliding block. It stops on the marked tile: press {K} to be elsewhere.'); calm(5);
    n = this.events.length; this.detour();
    this.events[n].tip = 'Sparks score points, and each one speeds you up a little. Press {K} to hop over for these.'; this.events[n + 1].tip = 'Press {K} to hop back.';
    delete this.events[n].opt; delete this.events[n + 1].opt;
    this.w = 2; calm(4);
    this.notes.push({ z: this.S.length - 1, text: 'A launch pad. Nothing to press: it throws you across.' });
    this.launch();
    this.w = 4; calm(12);
  }
}

class Runner {
  constructor(track) {
    this.tr = track; this.z = 0; this.lane = 0; this.from = 0;
    this.mode = 'ground'; this.t = 0; this.dur = HOP; this.high = .5; this.gap = 0; this.noJump = false;
    this.q = []; this.dead = null;   // q: up to two buffered presses, so a quick double tap is never lost
    this.lastDir = 1; this.cam = 0; this.on = null;
    this.sparks = 0; this.pts = 0; this.taken = {}; this.shield = false; this.inv = 0;
  }
  press(k) {   // 'L', 'R', 'F' (flip) or 'J' (jump)
    if (this.dead) return;
    if (this.q.length >= 2) this.q.pop();
    this.q.push({ k, age: 0 });
  }
  emit(n) { if (this.on) this.on(n); }
  die(kind) { this.dead = { kind, t: 0, was: this.mode }; this.mode = 'ground'; this.emit(kind); }   // was: what the ball was doing when it ended
  hit() {   // ran into something solid; true if that ended the run
    if (this.inv > 0) return false;
    if (this.shield) { this.shield = false; this.inv = .7; this.emit('shieldhit'); return false; }
    this.die('crash'); return true;
  }
  take(r, it) {
    this.taken[r] = 1;
    if (it.t === 'shield') { this.shield = true; this.emit('shield'); }
    else if (it.t === 'slow') this.emit('slow');
    else if (it.t === 'risk') { this.sparks++; this.risk = (this.risk || 0) + 1; this.pts += 300; this.emit('risk'); }
    else { this.sparks++; this.pts += it.t === 'high' ? 200 : 100; this.emit('spark'); }
  }
  air(mode, dur, high) { this.mode = mode; this.dur = dur; this.high = high || .5; this.from = this.lane; this.t = 0; this.gap = 0; }
  step(dt) {
    const tr = this.tr;
    if (this.dead) {
      const d = this.dead; d.t += dt;
      if (d.kind === 'fall') this.z += tr.speedAt(this.z) * dt * Math.max(0, 1 - d.t * 1.6);
      return;
    }
    this.z += tr.speedAt(this.z) * dt;
    for (let i = 0; i < this.q.length; i++) this.q[i].age += dt;
    while (this.q.length && this.q[0].age > PEND) this.q.shift();
    if (this.inv > 0) this.inv -= dt;
    const r = Math.floor(this.z), fz = this.z - r, l7 = this.lane & 7, bit = 1 << l7;
    const it = tr.I[r], mine = it && it.lane === l7 && !this.taken[r];
    const bar = r >= 0 && (tr.H[r] & bit) && fz > HZ0 && fz < HZ1;
    if (this.mode === 'ground') {
      const c = tr.cell(r, this.lane);
      if (c === 2 && this.hit()) return;
      if (c === 0) { this.gap += dt; if (this.gap > COYOTE) return this.die('fall'); }
      else { this.gap = 0; this.noJump = false; }
      if (bar && this.hit()) return;
      if (mine && it.t !== 'high') this.take(r, it);
      if (c !== 0 && r >= 0 && (tr.PD[r] & bit)) { this.q.length = 0; this.air('jump', LAUNCH, .8); this.emit('launch'); }
      else if (this.q.length && !this.noJump) {
        const p = this.q.shift().k;
        if (p === 'F') { this.air('flip', FLIP); this.lane += 4 * this.lastDir; this.emit('flip'); }
        else if (p === 'J') { this.air('jump', JUMP, .5); this.emit('jump'); }
        else { const d = p === 'L' ? 1 : -1; this.air('hop', HOP); this.lane += d; this.lastDir = d; this.emit('hop'); }
      }
    } else {
      this.t += dt; const u = this.t / this.dur;
      if (this.mode === 'flip') { if (r >= 0 && tr.X[r] && u > .12 && u < .88 && this.hit()) return; }
      else {
        if (tr.cell(r, this.lane) === 2 && this.hit()) return;
        if (bar && (this.mode === 'hop' || !(u > .08 && u < .92)) && this.hit()) return;
        if (this.mode === 'jump' && mine && it.t === 'high' && u > .1 && u < .9) this.take(r, it);
      }
      if (this.t >= this.dur) {
        this.mode = 'ground'; this.from = this.lane;
        const c = tr.cell(r, this.lane);
        if (c === 2 && this.hit()) return;
        if (c === 0) { this.gap = COYOTE - LANDGRACE; this.noJump = true; } else this.gap = 0;
      }
    }
    const v = this.vis();
    this.cam += (v.camT - this.cam) * (1 - Math.exp(-dt * 26));
  }
  // where to draw the runner: lane angle, radial factor (1 = on its floor, -1 = opposite wall), camera target.
  // ex looks that many seconds ahead (for smooth drawing between physics steps). One object is reused: no garbage.
  vis(ex) {
    const o = this._v || (this._v = { lane: 0, r: 1, camT: 0 });
    let lane = this.lane, r = 1, camT = this.lane;
    const u = Math.min(1, (this.t + (ex || 0)) / this.dur);
    if (this.mode === 'hop') { const e = u * u * (3 - 2 * u); lane = this.from + (this.lane - this.from) * e; r = 1 - .1 * Math.sin(Math.PI * u); camT = lane; }
    else if (this.mode === 'flip') { const e = u * u * (3 - 2 * u); lane = this.from; r = Math.cos(Math.PI * u); camT = this.from + (this.lane - this.from) * e; }
    else if (this.mode === 'jump') r = 1 - this.high * Math.sin(Math.PI * u);
    if (this.dead && this.dead.kind === 'fall') r = 1 + this.dead.t * this.dead.t * 9;
    o.lane = lane; o.r = r; o.camT = camT; return o;
  }
}

// Follows the generator's own route. f picks where in each press window to act (0 early, 1 late).
// skipOpt leaves out the optional spark detours.
class Bot {
  constructor(track, f, skipOpt) { this.tr = track; this.f = f; this.i = 0; this.skipOpt = skipOpt; }
  update(run) {
    const ev = this.tr.events;
    while (this.i < ev.length) {
      const e = ev[this.i];
      if (this.skipOpt && e.opt) { this.i++; continue; }
      if (run.z >= e.z0 + (e.z1 - e.z0) * this.f) { run.press(e.key); this.i++; } else break;
    }
  }
}

// The clock of a run. It is stepped with the physics and fed the same events, so the same presses always give the same
// time: a run's time can be worked out again from its recording, on any machine.
class Pace {
  // base: the speed setting (1 = normal). plain: no boosts and no perfects (the tutorial).
  constructor(track, base, plain) {
    this.tr = track; this.base = base || 1; this.plain = !!plain;
    this.boost = 0; this.over = 0; this.surge = 0; this.slowT = 0; this.t = 0;
    this.streak = 0; this.best = 0; this.perfects = 0; this.ei = 0; this.hit = {};
  }
  scale() { return this.base * (1 + this.boost + this.over + this.surge) * (this.slowT > 0 ? PACE.slow : 1); }
  gain() { return this.boost + this.over + this.surge; }   // how much faster than the base speed, as a fraction
  // dt of game time has just been simulated: returns the real time that took, and moves the clock and the timers on
  step(dt) {
    const real = dt / this.scale(); this.t += real;
    if (this.slowT > 0) this.slowT -= real;
    if (this.surge > 0) { this.surge -= PACE.surgeMax * real / PACE.surgeSecs; if (this.surge < 0) this.surge = 0; }
    return real;
  }
  // n sparks' worth of lasting speed: each closes a fixed share of the gap to the cap, so the first few are felt most
  spark(n) {
    if (this.plain || this.boost >= PACE.boostMax) return;
    const k = this.tr.end === Infinity ? .06 : 1 - Math.pow(.28, 3 / Math.max(15, this.tr.nSparks));
    for (let i = 0; i < (n || 1); i++) this.boost += (PACE.boostMax - this.boost) * k;
    if (this.boost > PACE.boostMax * .97) this.boost = PACE.boostMax;
  }
  // a red spark: an ordinary spark's worth, plus a little speed beyond the cap that nothing else gives
  risk() { this.spark(1); if (!this.plain) this.over += PACE.risk; }
  slow() { this.slowT = PACE.slowSecs; }
  // A press of move m at position z: which move on the course's route it answers, where in that move's window it came
  // (f: 0 first moment, 1 last), how many seconds were left, and whether that was close enough to the end to be perfect.
  press(m, z) {
    const ev = this.tr.events, v = this.tr.speedAt(z), slack = v * .3;
    while (this.ei < ev.length && ev[this.ei].z1 + slack < z) this.ei++;
    for (let j = this.ei; j < ev.length && ev[j].z0 - slack <= z; j++) {
      const e = ev[j]; if (this.hit[j] || e.key !== m) continue;
      this.hit[j] = 1;
      const f = (z - e.z0) / Math.max(.01, e.z1 - e.z0), left = (e.z1 - z) / v, perfect = !this.plain && f >= 0 && left <= PACE.perfect;
      if (perfect) {
        this.streak++; this.perfects++; if (this.streak > this.best) this.best = this.streak;
        this.surge = Math.min(PACE.surgeMax, Math.max(this.surge, PACE.surge + PACE.surgeStep * (this.streak - 1)));
      } else this.streak = 0;
      return { e, j, f, left, perfect };
    }
    return null;
  }
  // the required move that was due and never made (for telling the player what was needed), or null
  missed(z) {
    const ev = this.tr.events, v = this.tr.speedAt(z);
    let j = this.ei; while (j > 0 && ev[j - 1].z1 + v * 1.2 >= z) j--;
    for (; j < ev.length && ev[j].z0 <= z + v * .3; j++) if (!this.hit[j] && !ev[j].opt && ev[j].z1 + v * 1.2 >= z) return ev[j];
    return null;
  }
}
