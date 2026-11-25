// The right key is never a trap. Every flip and jump the course requires is tried from every lane a player could be
// standing in as it comes up, pressed early, in the middle and late in its window: the ball has to land on floor.
// (A flip from a side lane of a three-lane floor once landed beside a one-lane floor overhead, in levels 7 and 8 and
// in Endless. Turns are tried the same way in test/browser/mechanics.py, where the hint on the floor is checked too.)
//   node test/fair.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const { LEVELS, DAILY, Track, Runner, endlessSeed } = new Function(src + '; return { LEVELS, DAILY, Track, Runner, endlessSeed };')();
const DT = 1 / 240;
function audit(name, tr, rows) {
  if (tr.end === Infinity) tr.cell(rows, 0);
  const end = tr.end === Infinity ? rows : tr.end, n = { F: 0, J: 0 }, bad = [];
  tr.events.forEach((e, i) => {
    if (e.opt || (e.key !== 'F' && e.key !== 'J') || e.z1 > end - 30) return;
    for (let p = 0; p < 8; p++) {
      let stand = true; for (let r = Math.floor(e.z0) - 1; r <= Math.floor((e.z0 + e.z1) / 2); r++) if (tr.cell(r, p) !== 1) stand = false;
      if (!stand) continue;
      for (const f of [.15, .5, .85]) {
        const rn = new Runner(tr); rn.lane = rn.from = p; rn.z = e.z0 - .5;
        let pressed = false, landed = 0, guard = 0;
        while (!rn.dead && guard++ < 5000) {
          if (!pressed && rn.z >= e.z0 + (e.z1 - e.z0) * f) { rn.press(e.key); pressed = true; }
          rn.step(DT);
          if (pressed && rn.mode === 'ground' && !rn.q.length) { if (!landed) landed = rn.z; else if (rn.z > landed + .6) break; }
        }
        n[e.key]++;
        if (rn.dead) bad.push(`${name}: ${e.kind || '?'} at row ${Math.round(e.z0)}, ${e.key === 'F' ? 'flip' : 'jump'} from lane ${p} at ${Math.round(f * 100)}% of its window ends in a ${rn.dead.kind}`);
      }
    }
  });
  console.log(`${bad.length ? 'not ok' : 'ok  '} ${name}: ${n.F} flips and ${n.J} jumps tried from every lane, ${bad.length} failed`);
  return bad;
}
let bad = [];
LEVELS.forEach((lv, i) => { bad = bad.concat(audit('L' + (i + 1), new Track(lv.seed, lv))); });
const day = new Date(), dayNum = d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
for (let k = 0; k < 14; k++) { const s = dayNum(new Date(day.getTime() + k * 864e5)); bad = bad.concat(audit('daily ' + s, new Track(s, Object.assign({}, DAILY, { pat: s % 5 })))); }
for (const s of [endlessSeed(20261125), 11, 222, 3333, 44444]) bad = bad.concat(audit('endless ' + s, new Track(s, null), 6000));
for (const b of bad.slice(0, 30)) console.log('   ' + b);
if (bad.length) { console.log(`fair: ${bad.length} failed`); process.exit(1); }
console.log('fair: all checks passed');
