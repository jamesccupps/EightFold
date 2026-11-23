// Plays recorded runs back against the course they were played on, from the press trace in the play data.
//   node tools/replay.js <file-or-folder> [...]     session files from the play-data branch, or a Play data download
// For each attempt it rebuilds the course (level, daily or endless seed, and any tuning in force), presses the same
// moves at the same places, and reports whether the run ends the way it was recorded. Also used by the browser tests.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const { LEVELS, DAILY, TUTORIAL, Track, Runner, setFeel } = new Function(src + '; return {LEVELS,DAILY,TUTORIAL,Track,Runner,setFeel};')();

function courseFor(rec) {
  const m = rec.m;
  if (m[0] === 'L') { const lv = LEVELS[+m.slice(1) - 1]; return lv ? new Track(lv.seed, lv) : null; }
  if (m[0] === 'D') { const p = m.slice(1).split('-').map(Number), seed = p[0] * 10000 + p[1] * 100 + p[2]; return new Track(seed, Object.assign({}, DAILY, { pat: seed % 5 })); }
  if (m === 'E') return rec.seed != null ? new Track(rec.seed, null) : null;
  return new Track(1, TUTORIAL);
}
// returns { res, z, sparks, exact } or null when the run cannot be replayed (no trace, or too long for its trace)
function replay(rec) {
  const tr = rec.tr || [];
  if ((rec.pr || 0) * 2 !== tr.length || rec.m === 'T') return null;
  const tu = rec.tu || {};
  setFeel({ hop: tu.hop, flip: tu.flip, jump: tu.jump, coyote: tu.coyote, buffer: tu.buffer });
  let out = null;
  try {
    const track = courseFor(rec); if (!track) return null;
    const r = new Runner(track);
    if (rec.cp) { const cp = track.cps.find(c => Math.floor(c.z) === rec.cp); if (!cp) return null; r.z = cp.z; r.lane = r.from = r.cam = cp.lane; }
    const ended = rec.res === 'fall' || rec.res === 'crash' || rec.res === 'win', stopAt = ended ? Infinity : rec.z + 1;
    let i = 0, guard = 0;
    while (!r.dead && r.z < track.end && r.z < stopAt && guard++ < 4e6) {
      while (i < tr.length && r.z * 100 >= tr[i]) { r.press('LRFJ'[tr[i + 1]]); i += 2; }
      r.step(1 / 240);
    }
    const res = r.dead ? r.dead.kind : r.z >= track.end ? 'win' : rec.res;
    out = { res, z: Math.floor(r.z), sparks: r.sparks, exact: res === rec.res && (!ended || res === 'win' || Math.abs(Math.floor(r.z) - rec.z) <= 1) };
  } finally { setFeel({}); }
  return out;
}
function load(p) {   // -> list of attempts
  if (fs.statSync(p).isDirectory()) return [].concat(...fs.readdirSync(p).map(f => load(path.join(p, f))));
  if (!p.endsWith('.json')) return [];
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return d.attempts || d.log || [];
}
module.exports = { replay, courseFor, load };
if (require.main === module) {
  const all = [].concat(...process.argv.slice(2).map(load));
  let can = 0, same = 0; const off = [];
  for (const rec of all) { const r = replay(rec); if (!r) continue; can++; if (r.exact) same++; else off.push(`${rec.s} #${rec.i} ${rec.m}: recorded ${rec.res} at row ${rec.z}, replay ${r.res} at row ${r.z}`); }
  console.log(`${all.length} attempts, ${can} with a full trace, ${same} replay to the recorded ending`);
  for (const line of off.slice(0, 40)) console.log('  differs: ' + line);
}
