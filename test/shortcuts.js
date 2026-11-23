// "Laziest route" check: what is the smallest number of key presses that still finishes a level,
// and can it be finished with a whole move left unused? Exhaustive search over the real physics.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'core.js'), 'utf8');
const { LEVELS, DAILY, Track, Runner } = new Function(src + '; return {LEVELS,DAILY,Track,Runner};')();
const Q = 4, DT = 1 / 120, INF = 1e9;
function sim(track, z, lane, key, target) {
  const r = new Runner(track); r.z = z; r.lane = lane; r.from = lane; r.cam = lane;
  if (key) r.press(key);
  let n = 0;
  while (!r.dead && n++ < 4000) {
    r.step(DT);
    if (r.z >= track.end) return r;
    if (r.mode === 'ground' && r.gap === 0 && !r.q.length && r.z >= target) return r;
  }
  return r.dead ? null : r;
}
function solve(track, allowed) {
  const N = Math.ceil((track.end + 2) * Q), cost = new Int32Array((N + 8) * 8).fill(INF);
  cost[0] = 0; let best = INF;
  const relax = (r, c) => { if (!r) return; if (r.z >= track.end) { if (c < best) best = c; return; } const zi = Math.ceil(r.z * Q - 1e-9), i = zi * 8 + (r.lane & 7); if (c < cost[i]) cost[i] = c; };
  for (let zi = 0; zi < N; zi++) for (let lane = 0; lane < 8; lane++) {
    const c = cost[zi * 8 + lane]; if (c >= INF || c >= best) continue;
    const z = zi / Q;
    relax(sim(track, z, lane, null, (zi + 1) / Q), c);
    for (const k of allowed) relax(sim(track, z, lane, k, z + .01), c + 1);
  }
  return best;
}
const fmt = v => v >= INF ? 'impossible' : v + ' presses';
const list = LEVELS.map((lv, i) => ['L' + (i + 1) + ' ' + lv.name, lv.seed, lv]);
if (process.argv[2] === 'daily') { list.length = 0; for (let k = 0; k < 6; k++) list.push(['daily+' + k, 20261122 + k, DAILY]); }
for (const [label, seed, lv] of list) {
  const t = new Track(seed, lv), pilot = t.events.filter(e => !e.opt).length;
  const all = solve(t, 'LRFJ');
  if (all < pilot * .8) { process.exitCode = 1; console.log('  ^ FAIL: this level can be finished with far fewer presses than intended'); }
  console.log(`${label}: pilot ${pilot} | laziest ${fmt(all)} | no flip: ${fmt(solve(t, 'LRJ'))} | no jump: ${fmt(solve(t, 'LRF'))} | no turning: ${fmt(solve(t, 'FJ'))}`);
}
