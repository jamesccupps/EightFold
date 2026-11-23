// How hard is each level, measured rather than assumed.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'core.js'), 'utf8');
const { LEVELS, Track, Runner, rng } = new Function(src + '; return {LEVELS,Track,Runner,rng};')();
const GROUP = { step: 'turns', stairs: 'turns', zigzag: 'turns', spiral: 'turns', flipGate: 'overhead', pingpong: 'overhead', dodge1: 'blocks', dodge2: 'blocks', slalom: 'blocks',
  blockFlip: 'blockflip', hurdle: 'bars', hurdles: 'bars', laneGap: 'gaps', stones: 'gaps', ringGap: 'ringgap', sweep: 'sweepers', beam: 'beams', fan: 'beams', fans: 'beams', launch: 'pads', sprint: 'sprint', crawl: 'slow', field: 'holes' };
function human(track, sigma, seed) {
  const rnd = rng(seed), gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(.5); };
  const r = new Runner(track); let i = 0, target = null, frame = 0; const ev = track.events;
  while (r.z < track.end + 1 && !r.dead) {
    if (target == null) { while (i < ev.length && ev[i].opt) i++; if (i < ev.length) { const e = ev[i]; target = e.z0 + (e.z1 - e.z0) * .4 + gauss() * sigma * track.speedAt(e.z0); } }
    if (frame % 4 === 0 && target != null && r.z >= target) { r.press(ev[i].key); i++; target = null; }
    r.step(1 / 240); frame++;
  }
  return !r.dead;
}
function metrics(t, trials) {
  const must = t.events.filter(e => !e.opt); let dur = 0, minW = 9;
  for (let r = 0; r < t.end; r++) dur += 1 / t.V[r];
  for (const e of must) minW = Math.min(minW, (e.z1 - e.z0) / t.speedAt(e.z0));
  const types = {}; for (const k in t.kinds || {}) types[GROUP[k]] = 1;
  const m = { secs: dur, presses: must.length, perMin: must.length / dur * 60, minW, types: Object.keys(types).filter(x => x !== 'holes') };
  if (trials) { let ok = 0; for (let k = 0; k < trials; k++) if (human(t, .08, 500 + k)) ok++; m.clear = ok / trials; }
  return m;
}
module.exports = { metrics, GROUP, LEVELS, Track };
if (require.main === module) {
  const seen = {};
  console.log('level            speed  presses/min  tightest  kinds  new kinds                 sloppy-player clear rate');
  LEVELS.forEach((lv, i) => {
    const t = new Track(lv.seed, lv), m = metrics(t, 400);
    const kinds = t.kinds ? m.types : Object.keys(Object.fromEntries(Object.keys(lv.mix).map(k => [GROUP[k], 1]))).filter(x => x !== 'holes');
    const fresh = kinds.filter(k => !seen[k]); kinds.forEach(k => seen[k] = 1);
    console.log(`${(i + 1 + ' ' + lv.name).padEnd(16)} ${String(lv.speed).padEnd(6)} ${m.perMin.toFixed(0).padEnd(12)} ${m.minW.toFixed(2).padEnd(9)} ${String(kinds.length).padEnd(6)} ${(fresh.join(', ') || '-').padEnd(25)} ${(m.clear * 100).toFixed(0)}%`);
  });
}
