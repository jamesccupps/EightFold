const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'core.js'), 'utf8');
const { LEVELS, DAILY, TUTORIAL, Track, Runner, Bot, rng } = new Function(src + '; return {LEVELS,DAILY,TUTORIAL,Track,Runner,Bot,rng};')();

function run(track, f, dt, zEnd, skipOpt) {
  const r = new Runner(track), b = new Bot(track, f, skipOpt);
  let guard = 0;
  while (r.z < zEnd && !r.dead && guard++ < 5e6) { b.update(r); r.step(dt); }
  return r;
}
// A person who knows the course: aims 40% into each press window, with gaussian timing error and
// input only read once per 60 Hz frame. sigma in seconds.
function human(track, sigma, seed, skipOpt) {
  const rnd = rng(seed), gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(.5); };
  const r = new Runner(track); let i = 0, target = null, frame = 0;
  const ev = track.events, dt = 1 / 240;
  while (r.z < track.end + 1 && !r.dead) {
    if (target == null) {
      while (i < ev.length && skipOpt && ev[i].opt) i++;
      if (i < ev.length) { const e = ev[i]; target = e.z0 + (e.z1 - e.z0) * .4 + gauss() * sigma * track.speedAt(e.z0); }
    }
    if (frame % 4 === 0 && target != null && r.z >= target) { r.press(ev[i].key); i++; target = null; }
    r.step(dt); frame++;
  }
  return r;
}
let fails = 0;
const all = LEVELS.map((lv, i) => ['L' + (i + 1) + ' ' + lv.name, lv.seed, lv]).concat([['Tutorial', 1, TUTORIAL]]);
for (const [label, seed, lv] of all) {
  const t0 = new Track(seed, lv); let res = [];
  // tightest mandatory press window, in seconds
  let minW = 9; for (const e of t0.events) if (!e.opt) minW = Math.min(minW, (e.z1 - e.z0) / t0.speedAt(e.z0));
  for (const f of [0.03, 0.25, 0.5, 0.75, 0.97]) for (const dt of [1 / 240, 1 / 120]) for (const skip of [true, false]) {
    const t = new Track(seed, lv), r = run(t, f, dt, t.end + 2, skip);
    if (r.dead) { fails++; res.push(`FAIL f=${f} skip=${skip} z=${r.z.toFixed(1)} ${r.dead.kind}`); }
    else if (!skip && r.sparks !== t.nSparks) { fails++; res.push(`SPARKS f=${f} ${r.sparks}/${t.nSparks}`); }
    else if (skip && !lv.tutorial && r.sparks !== t.nSparks - (t.nOpt || 0)) { fails++; res.push(`ROUTE-SPARKS f=${f} ${r.sparks}/${t.nSparks - (t.nOpt || 0)}`); }
  }
  let line = `${label}: rows=${t0.end} presses=${t0.events.filter(e => !e.opt).length} sparks=${t0.nSparks} minWindow=${minW.toFixed(2)}s ${res.length ? res.slice(0, 4).join('; ') : 'pilot ok'}`;
  if (!lv.tutorial) {
    const rate = s => { let ok = 0; for (let k = 0; k < 300; k++) if (!human(new Track(seed, lv), s, 1000 + k, true).dead) ok++; return Math.round(ok / 3); };
    line += ` | human-model clears: ${rate(.03)}% @30ms, ${rate(.05)}% @50ms, ${rate(.07)}% @70ms`;
  }
  console.log(line);
}
// restarting from any checkpoint must still be finishable
for (const [label, seed, lv] of all) {
  if (lv.tutorial) continue; const t = new Track(seed, lv); let badCp = 0;
  for (const cp of t.cps) for (const f of [0.03, 0.5, 0.97]) {
    const r = new Runner(t), b = new Bot(t, f, true); r.z = cp.z; r.lane = cp.lane; r.from = cp.lane; r.cam = cp.lane;
    while (b.i < t.events.length && t.events[b.i].z0 < cp.z) b.i++;
    let g = 0; while (r.z < t.end + 2 && !r.dead && g++ < 5e6) { b.update(r); r.step(1 / 240); }
    if (r.dead) badCp++;
  }
  if (badCp) { fails++; console.log(label + ': ' + badCp + ' checkpoint restarts FAIL'); }
}
console.log('checkpoint restarts ok unless listed above');
let bad = 0, n = 0;
for (let k = 0; k < 300; k++) for (const f of [0.03, 0.5, 0.97]) for (const skip of [true, false]) {
  const t = new Track(20261122 + k, DAILY), r = run(t, f, 1 / 240, t.end + 2, skip); n++;
  if (r.dead || (!skip && r.sparks !== t.nSparks)) { bad++; if (bad < 5) console.log(`daily FAIL seed+${k} f=${f} skip=${skip} z=${r.z.toFixed(1)} ${r.dead ? r.dead.kind : 'sparks'}`); }
}
console.log(`daily: ${n - bad}/${n} ok`); fails += bad; bad = 0; n = 0;
for (let seed = 1; seed <= 100; seed++) for (const f of [0.03, 0.5, 0.97]) for (const skip of [true, false]) {
  const t = new Track(seed * 7919, null), r = run(t, f, 1 / 240, 5000, skip); n++;
  if (r.dead) { bad++; if (bad < 5) console.log(`endless FAIL seed=${seed} f=${f} skip=${skip} z=${r.z.toFixed(1)} ${r.dead.kind}`); }
}
console.log(`endless: ${n - bad}/${n} ok`); fails += bad;
// what each level is made of
for (const [i, lv] of LEVELS.entries()) {
  const t = new Track(lv.seed, lv); let beams = 0, sweeps = 0, sprint = 0, slow = 0, blocks = 0, gaps = 0, bars = 0, pads = 0, picks = 0;
  for (const k in t.G) t.G[k].t === 'beam' ? beams++ : sweeps++;
  for (let r = 0; r < t.end; r++) { if (t.Z[r] === 1) sprint++; if (t.Z[r] === 2) slow++; if (t.B[r] && !t.G[r]) blocks++; if (!t.S[r]) gaps++; if (t.H[r]) bars++; if (t.PD[r]) pads++; if (t.I[r] && (t.I[r].t === 'shield' || t.I[r].t === 'slow')) picks++; }
  console.log(`  L${i + 1}: beams=${beams} sweepers=${sweeps} blockRows=${blocks} ringGapRows=${gaps} sprintRows=${sprint} slowRows=${slow} flips=${t.events.filter(e => e.key === 'F').length} jumps=${t.events.filter(e => e.key === 'J' && !e.opt).length} bars=${bars} padRows=${pads} pickups=${picks}`);
}
process.exit(fails ? 1 : 0);
