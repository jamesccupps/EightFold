// Plays recorded runs back against the course they were played on, from the press trace in the play data.
//   node tools/replay.js <file-or-folder> [...]     session files from the play-data repository, or a Play data download
// For each attempt it rebuilds the course (level, daily or endless seed, and any tuning in force), presses the same
// moves at the same places, and reports whether the run ends the way it was recorded. Each visit names the engine it
// was played on, so runs made on an earlier version of the generator are played back on that version, taken from git.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NAMES = 'LEVELS,DAILY,TUTORIAL,Track,Runner';
const compile = src => new Function(src + `; return {${NAMES}, setFeel: typeof setFeel === 'function' ? setFeel : null, dailyTrack: typeof dailyTrack === 'function' ? dailyTrack : null, Pace: typeof Pace === 'function' ? Pace : null, setPace: typeof setPace === 'function' ? setPace : null, scoreParts: typeof scoreParts === 'function' ? scoreParts : null, endlessSeed: typeof endlessSeed === 'function' ? endlessSeed : null};`)();
const idOf = src => crypto.createHash('sha1').update(src).digest('hex').slice(0, 10);
const nowSrc = fs.readFileSync(path.join(ROOT, 'src', 'core.js'), 'utf8'), NOW = idOf(nowSrc);
const engines = { [NOW]: compile(nowSrc) };
let history = null;
// Visits recorded before the game started noting its engine (builds up to 2026-11-23f) all ran on the same courses:
// the engine as it stood at this commit.
const LEGACY_REV = '9aad03d';
let legacy;
function legacyEngine() {
  if (legacy === undefined) { try { legacy = compile(execFileSync('git', ['show', LEGACY_REV + ':src/core.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { legacy = engines[NOW]; } }
  return legacy;
}
function engine(id) {   // the engine with this id: today's, or an earlier one from the repository's history
  if (!id) return legacyEngine();
  if (engines[id] !== undefined) return engines[id];
  if (!history) {
    history = {};
    try {
      for (const c of execFileSync('git', ['log', '--format=%H', '--', 'src/core.js'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)) {
        try { const src = execFileSync('git', ['show', c + ':src/core.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }); const k = idOf(src); if (!history[k]) history[k] = src; } catch (e) {}
      }
    } catch (e) {}
  }
  let e = null; try { if (history[id]) e = compile(history[id]); } catch (err) { e = null; }
  return engines[id] = e;
}
function courseFor(rec, E) {
  E = E || engines[NOW]; const m = rec.m;
  if (m[0] === 'L') { const lv = E.LEVELS[+m.slice(1) - 1]; return lv ? new E.Track(lv.seed, lv) : null; }
  if (m[0] === 'D') { const p = m.slice(1).split('-').map(Number), seed = p[0] * 10000 + p[1] * 100 + p[2]; return E.dailyTrack ? E.dailyTrack(seed) : new E.Track(seed, Object.assign({}, E.DAILY, { pat: seed % 5 })); }   // engines from before the daily had themes built it straight from the one recipe
  if (m === 'E') return rec.seed != null ? new E.Track(rec.seed, null) : null;
  return new E.Track(1, E.TUTORIAL);
}
// returns { res, z, sparks, exact, time, timeOk } or null when the run cannot be replayed: no trace, a trace too short for the run,
// an engine that cannot be found, or a course that does not match the one recorded
function replay(rec, core) {
  const tr = rec.tr || [];
  if ((rec.pr || 0) * 2 !== tr.length || rec.m === 'T') return null;
  const E = engine(core || rec._core || (rec.cs != null || rec.pf || rec.rk ? NOW : '')); if (!E) return null;   // a run with a course checksum but no engine named (a Play data download, a test) is taken to be on today's
  const tu = rec.tu || {};
  if (E.setFeel) E.setFeel({ hop: tu.hop, flip: tu.flip, jump: tu.jump, coyote: tu.coyote, buffer: tu.buffer });
  if (E.setPace) E.setPace({ boostMax: tu.boost, perfect: tu.pwin, surge: tu.surge, surgeMax: tu.surge == null ? undefined : tu.surge > 0 ? tu.surge + .12 : 0 });
  let out = null;
  try {
    const track = courseFor(rec, E); if (!track) return null;
    if (rec.cs != null && track.checksum && track.checksum() !== rec.cs) return null;   // not the course this run was made on
    const r = new E.Runner(track);
    if (rec.cp) { const cp = track.cps.find(c => Math.floor(c.z) === rec.cp); if (!cp) return null; r.z = cp.z; r.lane = r.from = r.cam = cp.lane; }
    const ended = rec.res === 'fall' || rec.res === 'crash' || rec.res === 'win', stopAt = ended ? Infinity : rec.z + 1;
    // the run's clock, worked out the way the game does it: stepped with the physics and fed the same sparks and presses
    const pace = E.Pace ? new E.Pace(track, (tu.pace || 1) * (rec._speed || 1), false) : null;
    if (pace) r.on = name => { if (name === 'spark') pace.spark(1); else if (name === 'risk') pace.risk(); else if (name === 'slow') pace.slow(); };
    let i = 0, guard = 0;
    while (!r.dead && r.z < track.end && r.z < stopAt && guard++ < 4e6) {
      while (i < tr.length && r.z * 100 >= tr[i]) { const m = 'LRFJ'[tr[i + 1]]; if (pace) pace.press(m, r.z); r.press(m); i += 2; }
      r.step(1 / 240);
      if (pace && !r.dead && r.z < track.end) pace.step(1 / 240);
    }
    const res = r.dead ? r.dead.kind : r.z >= track.end ? 'win' : rec.res;
    out = { res, z: Math.floor(r.z), sparks: r.sparks, track, exact: res === rec.res && (!ended || res === 'win' || Math.abs(Math.floor(r.z) - rec.z) <= 1) };
    if (pace && E.scoreParts) out.pts = E.scoreParts(track, r, pace, res === 'win', r.z).reduce((t, p) => t + p[1], 0);
    if (pace && ended) { out.time = pace.t; out.perfects = pace.perfects; out.timeOk = rec.pf !== undefined || rec.rk !== undefined || pace.perfects === 0 ? Math.abs(pace.t - rec.d) < .011 : null; }
  } finally { if (E.setFeel) E.setFeel({}); if (E.setPace) E.setPace({}); }
  return out;
}
function load(p) {   // -> list of attempts, each knowing which engine its visit ran on
  if (fs.statSync(p).isDirectory()) return [].concat(...fs.readdirSync(p).map(f => load(path.join(p, f))));
  if (!p.endsWith('.json')) return [];
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (d.attempts) return d.attempts.map(a => Object.assign({ _core: d.session && d.session.core, _speed: d.session && d.session.speed }, a));
  const cores = {}, speeds = {}; for (const s of d.sessions || []) { cores[s.id] = s.core; speeds[s.id] = s.speed; }
  return (d.log || []).map(a => Object.assign({ _core: cores[a.s], _speed: speeds[a.s] }, a));
}
module.exports = { replay, courseFor, load, engine, NOW };
if (require.main === module) {
  const all = [].concat(...process.argv.slice(2).map(load));
  let can = 0, same = 0, timed = 0, timeSame = 0; const off = [];
  for (const rec of all) {
    const r = replay(rec); if (!r) continue; can++;
    if (r.exact) same++; else off.push(`${rec.s} #${rec.i} ${rec.m}: recorded ${rec.res} at row ${rec.z}, replay ${r.res} at row ${r.z}`);
    if (r.timeOk != null) { timed++; if (r.timeOk) timeSame++; else off.push(`${rec.s} #${rec.i} ${rec.m}: recorded time ${rec.d}, replay ${r.time.toFixed(2)}`); }
  }
  console.log(`${all.length} attempts, ${can} with a full trace, ${same} replay to the recorded ending` + (timed ? `, ${timeSame} of ${timed} to the recorded time` : ''));
  for (const line of off.slice(0, 40)) console.log('  differs: ' + line);
}
