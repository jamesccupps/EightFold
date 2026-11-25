// A report on how the game is being played, from the session files in the play-data repository (jamesccupps/EightFold-data).
//   git clone https://github.com/jamesccupps/EightFold-data /tmp/pd
//   node tools/analyze.js /tmp/pd/sessions [--skip id,id,...] [--since 2026-11-24]
// Visits listed in sessions/exclude.txt in that repository, or opened with #test on the address, are left out.
// Sections: who played, how far they got, each course, where runs end, press timing per obstacle, the tutorial,
// how the game ran on each machine, what players said, errors. Feedback text is whatever a stranger typed.
const fs = require('fs'), path = require('path');
const { replay, courseFor, engine } = require('./replay.js');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ''; };
const skip = new Set(opt('--skip').split(',').filter(Boolean)), since = opt('--since');
function files(p) { return fs.statSync(p).isDirectory() ? [].concat(...fs.readdirSync(p).map(f => files(path.join(p, f)))) : p.endsWith('.json') ? [p] : []; }
// visits to leave out: --skip, any exclude.txt in the folders given (one visit id per line, # for notes), and visits marked as tests
for (const dir of args) for (const f of [path.join(dir, 'exclude.txt'), path.join(dir, '..', 'exclude.txt')]) if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) { const id = line.replace(/#.*/, '').trim(); if (id) skip.add(id); }
let visits = [].concat(...args.map(files)).map(f => JSON.parse(fs.readFileSync(f, 'utf8'))).filter(d => d.session && !skip.has(d.session.id) && !d.session.test);
if (since) visits = visits.filter(d => new Date((d.session.t || 0) * 1000).toISOString().slice(0, 10) >= since);
const ghost = d => !d.attempts.length && !(d.session.notes || []).length && (d.session.dur || 0) < 5;
const ghosts = visits.filter(ghost).length; visits = visits.filter(d => !ghost(d));
const runs = [].concat(...visits.map(d => d.attempts.map(a => Object.assign({ _s: d.session, _core: d.session.core, _speed: d.session.speed }, a))));
const who = s => s.pid || s.id, uniq = a => [...new Set(a)];
const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
const count = a => { const m = {}; for (const x of a) m[x] = (m[x] || 0) + 1; return Object.entries(m).sort((x, y) => y[1] - x[1]); };
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
const out = s => console.log(s), head = s => out('\n== ' + s + ' ==');
const NAME = { step: 'shifting floor', stairs: 'shifting floor (stairs)', zigzag: 'zigzag', spiral: 'spiral', flipGate: 'floor overhead', pingpong: 'floor overhead (repeated)', dodge1: 'tall block', dodge2: 'two tall blocks',
  slalom: 'slalom', blockFlip: 'blocked side', hurdle: 'low bar', hurdles: 'low bars', laneGap: 'short gap', stones: 'stepping stones', ringGap: 'ring gap', sweep: 'sliding block', beam: 'beam', fan: 'fan', fans: 'fans',
  launch: 'launch pad', sprint: 'sprint zone', crawl: 'slow zone', field: 'scattered floor', riskFar: 'risk route (far wall)', riskSide: 'risk route (side strip)', floor: 'open floor', detour: 'spark detour', other: 'other' };
const nm = k => NAME[k] || k;
const course = m => m[0] === 'L' ? 'Level ' + m.slice(1) : m[0] === 'D' ? 'Daily ' + m.slice(1) : m === 'E' ? 'Endless' : 'Tutorial';
const order = m => m[0] === 'T' ? '0' : m[0] === 'L' ? '1' + m : m === 'E' ? '3' : '2' + m;

head('Who played');
const players = uniq(visits.map(d => who(d.session))), days = uniq(visits.map(d => new Date((d.session.t || 0) * 1000).toISOString().slice(0, 10))).sort();
out(`${visits.length} visits by ${players.length} players, ${days[0] || '-'} to ${days[days.length - 1] || '-'}` + (ghosts ? `  (${ghosts} empty page loads left out)` : ''));
out(`${runs.length} runs, ${Math.round(runs.reduce((t, a) => t + (a.d || 0), 0) / 60)} minutes of play`);
const back = players.filter(p => visits.filter(d => who(d.session) === p).some(d => (d.session.vn || 1) > 1) || uniq(visits.filter(d => who(d.session) === p).map(d => new Date(d.session.t * 1000).toISOString().slice(0, 10))).length > 1);
out(`came back for another visit: ${back.length} of ${players.length}`);
out('never started a run: ' + visits.filter(d => !d.attempts.length).length + ' visits');
out('from: ' + (count(visits.map(d => d.session.ref || 'direct')).map(e => e[0] + ' ' + e[1]).join(', ') || '-') + '   countries: ' + (count(visits.map(d => d.session.cc || '?')).map(e => e[0] + ' ' + e[1]).join(', ')));
out('playing with: ' + count(runs.filter(a => a.in).map(a => ['keyboard', 'taps', 'on-screen buttons', 'mouse', 'swipes'][a.in.indexOf(Math.max(...a.in))])).map(e => e[0] + ' ' + e[1] + ' runs').join(', '));

head('How far players got');
const modes = uniq(runs.map(a => a.m)).sort((a, b) => order(a) < order(b) ? -1 : 1);
for (const m of modes) {
  const r = runs.filter(a => a.m === m), ps = uniq(r.map(a => who(a._s))), won = uniq(r.filter(a => a.res === 'win').map(a => who(a._s)));
  out(`${pad(course(m), 18)} played by ${lpad(ps.length, 3)}   cleared by ${lpad(won.length, 3)} (${pct(won.length, ps.length)})`);
}

head('Each course');
out(pad('', 18) + ['runs', 'clears', 'tries to 1st clear', 'typical end', 'clear time / par', 'sparks', 'replays', 'gave up'].map((h, i) => lpad(h, [6, 8, 20, 13, 18, 8, 9, 9][i])).join('') + '   felt / fun');
for (const m of modes) {
  const r = runs.filter(a => a.m === m), wins = r.filter(a => a.res === 'win'), fails = r.filter(a => a.res === 'fall' || a.res === 'crash');
  const firsts = []; for (const p of uniq(r.map(a => who(a._s)))) { const mine = r.filter(a => who(a._s) === p).sort((a, b) => a.t - b.t || a.i - b.i), k = mine.findIndex(a => a.res === 'win'); if (k >= 0) firsts.push(k + 1); }
  let par = NaN; try { const tr = courseFor({ m, seed: 1 }); if (tr && tr.end !== Infinity) { par = 0; for (let i = 0; i < tr.end; i++) par += 1 / tr.V[i]; } } catch (e) {}
  const felt = count([].concat(...visits.map(d => d.session.fb && d.session.fb[m] ? [d.session.fb[m]] : []))).map(e => e[0] + ' ' + e[1]).join(', ');
  const fun = count([].concat(...visits.map(d => d.session.fun && d.session.fun[m] ? [({ love: 'loved it', ok: 'fine', no: 'not for me' })[d.session.fun[m]]] : []))).map(e => e[0] + ' ' + e[1]).join(', ');
  // runs a player chose to make after they had already cleared the course: the plainest sign they liked it
  let again = 0; for (const p of uniq(r.map(a => who(a._s)))) { const mine = r.filter(a => who(a._s) === p).sort((a, b) => a.t - b.t || a.i - b.i), k = mine.findIndex(a => a.res === 'win'); if (k >= 0) again += mine.length - k - 1; }
  const sparks = wins.filter(a => a.ns).map(a => Math.round(100 * a.sp / a.ns));
  // gave up: the player's last run on this course in a visit ended in a fall or crash, and they never cleared it
  const gave = visits.filter(d => { const mine = d.attempts.filter(a => a.m === m); return mine.length && !mine.some(a => a.res === 'win') && mine[mine.length - 1].res !== 'win'; }).length;
  out(pad(course(m), 18) + lpad(r.length, 6) + lpad(wins.length, 8) + lpad(firsts.length ? 'median ' + med(firsts) : '-', 20) + lpad(fails.length ? med(fails.map(a => a.pc)) + (m === 'E' ? ' m' : '%') : '-', 13)
    + lpad(wins.length ? med(wins.map(a => a.d)).toFixed(1) + (par ? ' / ' + par.toFixed(1) : '') : '-', 18) + lpad(sparks.length ? med(sparks) + '%' : '-', 8) + lpad(again, 9) + lpad(gave, 9) + '   ' + (felt || '-') + ' / ' + (fun || '-'));
}

head('Where runs end');
for (const m of modes) {
  const f = runs.filter(a => a.m === m && (a.res === 'fall' || a.res === 'crash')); if (!f.length) continue;
  out(course(m) + ` (${f.length} runs ended early; ${f.filter(a => a.res === 'crash').length} hit something, ${f.filter(a => a.res === 'fall').length} fell)`);
  out('   on: ' + count(f.map(a => nm(a.k || 'floor'))).slice(0, 6).map(e => `${e[0]} ${e[1]} (${pct(e[1], f.length)})`).join(', '));
  if (m !== 'E') { const b = new Array(10).fill(0); for (const a of f) b[Math.min(9, Math.floor((a.pc || 0) / 10))]++; out('   by tenth of the course: ' + b.map((n, i) => `${i * 10}%:${n}`).join('  ')); }
  const miss = count(f.filter(a => a.nx).map(a => nm(a.nx[0]) + ' needs ' + ({ L: 'a turn', R: 'a turn', F: 'a flip', J: 'a jump' })[a.nx[1]])).slice(0, 4);
  if (miss.length) out('   move not made: ' + miss.map(e => `${e[0]} ${e[1]}`).join(', ') + `   (run ended a median ${med(f.filter(a => a.nx).map(a => a.nx[2]))} ms after its last moment)`);
  const air = f.filter(a => a.am > 0).length; if (air) out(`   ${air} of them ended in the air (mid turn, flip or jump)`);
}

head('Level profile: every obstacle in order, who reached it, who ended there');
for (const m of modes.filter(x => x[0] === 'L')) {
  // only runs made on today's version of the course are counted here; older ones are still in the tables above
  let tr; try { tr = courseFor({ m }); } catch (e) { tr = null; } if (!tr || !tr.segs) continue;
  const cs = tr.checksum ? tr.checksum() : null, r = runs.filter(a => a.m === m && !a.tu && (a.cs == null || cs == null || a.cs === cs)); if (!r.length) continue;
  out(course(m) + ` (${r.length} runs on the current course)`);
  for (const [r0, r1, kind] of tr.segs) {
    const reached = r.filter(a => a.res === 'win' || a.z >= r0).length, ended = r.filter(a => (a.res === 'fall' || a.res === 'crash') && a.z >= r0 && a.z < r1 + 5).length;
    if (!reached) break;
    out(`   ${lpad(Math.round(100 * r0 / tr.end), 3)}%  ${pad(nm(kind), 26)} reached ${lpad(reached, 4)}   ended here ${lpad(ended, 4)}  ${ended ? '#'.repeat(Math.max(1, Math.round(20 * ended / reached))) + ' ' + pct(ended, reached) : ''}`);
  }
}

head('Press timing by obstacle  (0% = first moment a press works, 100% = last)');
const kk = {};
for (const a of runs) for (const k in a.kk || {}) { const q = a.kk[k], o = kk[k] || (kk[k] = { n: 0, f: 0, late: 0, early: 0, min: 1e9, dead: 0 }); o.n += q[0]; o.f += q[1] * q[0]; o.late += q[2]; o.early += q[3]; o.min = Math.min(o.min, q[4]); }
for (const a of runs) if ((a.res === 'fall' || a.res === 'crash') && a.k) (kk[a.k] || (kk[a.k] = { n: 0, f: 0, late: 0, early: 0, min: 1e9, dead: 0 })).dead++;
out(pad('', 26) + ['presses', 'typical', 'early', 'late', 'tightest', 'runs ended'].map(h => lpad(h, 11)).join(''));
for (const [k, o] of Object.entries(kk).sort((a, b) => b[1].dead - a[1].dead || b[1].n - a[1].n))
  out(pad(nm(k), 26) + lpad(o.n, 11) + lpad(o.n ? Math.round(o.f / o.n) + '%' : '-', 11) + lpad(pct(o.early, o.n), 11) + lpad(pct(o.late, o.n), 11) + lpad(o.n && o.min < 1e9 ? o.min + ' ms' : '-', 11) + lpad(o.dead, 11));
const extra = runs.reduce((t, a) => t + (a.px || 0), 0), all = runs.reduce((t, a) => t + (a.pr || 0), 0);
out(`presses the course did not call for: ${extra} of ${all} (${pct(extra, all)})`);

const tut = runs.filter(a => a.m === 'T' && a.tt && a.tt.length);
if (tut.length) {
  head('Tutorial');
  const st = {}; for (const a of tut) for (let i = 0; i < a.tt.length; i += 3) { const o = st[a.tt[i]] || (st[a.tt[i]] = { w: [], x: 0, n: 0 }); o.w.push(a.tt[i + 1]); o.x += a.tt[i + 2]; o.n++; }
  out(`${tut.length} tutorial runs, ${tut.filter(a => a.res === 'win').length} finished`);
  for (const k of Object.keys(st).sort((a, b) => a - b)) out(`   step ${+k + 1}: reached ${st[k].n} times, waited a median ${(med(st[k].w) / 1000).toFixed(1)} s for the key, ${st[k].x} wrong keys`);
}

head('How it ran');
out(pad('machine', 64) + ['runs', 'fps', 'screen Hz', 'draw ms', 'worst ms', 'slow frames'].map(h => lpad(h, 12)).join(''));
const mach = {};
for (const a of runs) { if (!a.fps) continue; const s = a._s, key = [s.os, s.br, (s.px ? s.px.join('x') : s.w + 'x' + s.h) + (s.dpr && s.dpr !== 1 ? ' @' + s.dpr : ''), s.cores ? s.cores + ' cores' : '', (s.gpu || '').replace(/^ANGLE \(|, D3D11\)$|Direct3D11.*$|\(0x[0-9A-Fa-f]+\)/g, '').replace(/ +/g, ' ').trim().slice(0, 28)].filter(Boolean).join(', ');
  const o = mach[key] || (mach[key] = { fps: [], rm: [], fx: [], slow: 0, fr: 0, hz: s.hz || 0, q: 1 }); o.fps.push(a.fps); if (a.rm) o.rm.push(a.rm); o.fx.push(a.fx || 0); o.slow += a.fj || 0; o.fr += a.ft ? a.ft.reduce((x, y) => x + y, 0) : Math.round(a.fps * (a.d || 0)); if (a.q) o.q = Math.min(o.q, a.q); }
for (const [k, o] of Object.entries(mach).sort((a, b) => med(a[1].fps) - med(b[1].fps)))
  out(pad(k.slice(0, 62), 64) + lpad(o.fps.length, 12) + lpad(med(o.fps), 12) + lpad(o.hz || '-', 12) + lpad(o.rm.length ? med(o.rm).toFixed(1) : '-', 12) + lpad(Math.max(...o.fx), 12) + lpad(pct(o.slow, o.fr), 12) + (o.q < 1 ? `   resolution dropped to ${Math.round(o.q * 100)}%` : ''));
const below = runs.filter(a => a.fps && a._s.hz && a.fps < a._s.hz * .8).length, known = runs.filter(a => a.fps && a._s.hz).length;
if (known) out(`runs well below the screen's refresh rate: ${below} of ${known}`);
// key presses: how long from the key going down to the game acting on it, and on to the next frame (recorded from build 2026-11-23m)
{
  const il = runs.filter(a => Array.isArray(a.il));
  if (il.length) {
    const by = {}; for (const a of il) { const k = a._s.os + ', ' + a._s.br + (a._s.hz ? ', ' + a._s.hz + ' Hz' : ''); (by[k] || (by[k] = [])).push(a.il); }
    out('key presses, ms from the key to the game acting on it (typical / worst), then on to the next frame:');
    for (const [k, v] of Object.entries(by)) out('   ' + pad(k, 40) + lpad(med(v.map(x => x[0])).toFixed(1), 8) + ' /' + lpad(Math.max(...v.map(x => x[1])), 5) + lpad(med(v.map(x => x[2])).toFixed(1), 10) + `   (${v.length} runs)`);
  }
}
// leaderboard posts: sent, held back for another try, refused for good
{
  const ev = [].concat(...visits.map(d => (d.session.ev || []).filter((x, i) => i % 2 && /^post/.test(x)))), n = re => ev.filter(x => re.test(x)).length;
  if (ev.length) out(`leaderboard posts: ${n(/^post:/)} filed, ${n(/^postwait:/)} held for another try, ${n(/^postno:/)} refused`);
}

const notes = [].concat(...visits.map(d => (d.session.notes || []).map(n => [d.session, n])));
head(`What players said (${notes.length})`);
for (const [s, n] of notes) out(`   [${({ idea: 'suggestion', bug: 'problem', other: 'other' })[n.k] || 'note'}${n.m ? ', ' + course(n.m) + (n.pc != null ? ' at ' + n.pc + (n.m === 'E' ? ' m' : '%') : '') : ''}; ${[s.os, s.touch ? 'touch' : ''].filter(Boolean).join(' ')}] ${JSON.stringify(n.x)}`);
const fb = count([].concat(...visits.map(d => Object.entries(d.session.fb || {}).map(e => course(e[0]) + ': ' + e[1]))));
if (fb.length) out('   ratings: ' + fb.map(e => e[0] + ' x' + e[1]).join(', '));

const errs = count([].concat(...visits.map(d => (d.session.err || []).filter((x, i) => i % 2))));
head(`Errors in the page (${errs.length})`);
for (const e of errs.slice(0, 15)) out(`   x${e[1]}  ${e[0]}`);

head('Menus');
const ui = count([].concat(...visits.map(d => (d.session.ev || []).filter((x, i) => i % 2 && /^(ui|open|opt|bind|full|mute|unmute)/.test(x)).map(x => x.replace(/=.*/, '')))));
out('   ' + (ui.slice(0, 24).map(e => e[0] + ' ' + e[1]).join(', ') || '-'));

const xps = uniq([].concat(...visits.map(d => Object.keys(d.session.xp || {}))));
if (xps.length) {
  head('Experiments');
  for (const id of xps) {
    out(id);
    for (const v of uniq(visits.map(d => (d.session.xp || {})[id]).filter(Boolean)).sort()) {
      const vs = visits.filter(d => (d.session.xp || {})[id] === v), rr = [].concat(...vs.map(d => d.attempts)), fails = rr.filter(a => a.res === 'fall' || a.res === 'crash');
      const fb = count([].concat(...vs.map(d => Object.values(d.session.fb || {})))).map(e => e[0] + ' ' + e[1]).join(', '), fun = count([].concat(...vs.map(d => Object.values(d.session.fun || {})))).map(e => e[0] + ' ' + e[1]).join(', ');
      out(`   ${pad(v, 10)} ${uniq(vs.map(d => who(d.session))).length} players, ${rr.length} runs, ${pct(rr.filter(a => a.res === 'win').length, rr.length)} cleared, ${(rr.length ? fails.length / Math.max(1, rr.filter(a => a.res === 'win').length) : 0).toFixed(1)} failed runs per clear, `
        + `${Math.round(rr.reduce((t, a) => t + (a.d || 0), 0) / 60 / Math.max(1, uniq(vs.map(d => who(d.session))).length))} min played per player   felt: ${fb || '-'}   fun: ${fun || '-'}`);
    }
  }
}

head('Replay check');
let can = 0, same = 0; const played = [];
for (const a of runs) { const r = replay(a); if (r) { can++; if (r.exact) { same++; played.push([a, r]); } } }
out(`${can} runs have a full press trace; ${same} play back to the recorded ending`);
const lost = uniq(runs.map(a => a._core).filter(c => c && !engine(c)));
if (lost.length) out('engine versions not found in this repository: ' + lost.join(', '));

// What the last press before each fall or crash was, against the move the course was waiting for. A wrong key means the
// floor did not say which move it wanted (readability); the right key too late means the cue came late or was missed.
{
  const KEYNAME = { L: 'turn', R: 'turn', F: 'flip', J: 'jump' }, tally = {}; let n = 0, wrong = 0, late = 0, none = 0, silent = 0;
  for (const [a, r] of played) {
    if (a.res !== 'fall' && a.res !== 'crash') continue;
    n++;
    const tr = a.tr || [], v = r.track.speedAt(a.z), zEnd = r.z, zp = tr.length ? tr[tr.length - 2] / 100 : -1e9, key = tr.length ? 'LRFJ'[tr[tr.length - 1]] : '';
    const due = r.track.events.find(e => !e.opt && e.z1 + v * .25 >= Math.min(zp, zEnd) && e.z0 - v * .8 <= zEnd);   // the move the course was waiting for when the run ended
    if (zEnd - zp > v * .8) { silent++; continue; }   // nothing pressed in the last 0.8 s
    if (!due) { none++; continue; }
    if (key === due.key) { late++; continue; }
    wrong++; const k = (KEYNAME[key] === KEYNAME[due.key] ? 'turn the other way' : KEYNAME[key]) + ' pressed, ' + KEYNAME[due.key] + ' needed'; tally[k] = (tally[k] || 0) + 1;
  }
  if (n) {
    head('Last press before a fall or crash');
    out(`${n} ended runs with a full trace: ${wrong} on the wrong key, ${late} on the right key at the wrong moment, ${none} on a press with no move due, ${silent} with nothing pressed in the last 0.8 s`);
    for (const [k, c] of Object.entries(tally).sort((x, y) => y[1] - x[1])) out('   ' + pad(k, 34) + c);
  }
  // presses the course did not call for: how many are the second of a quick double tap (the press buffer keeps two)
  let all = 0, dbl = 0;
  for (const [a, r] of played) { const tr = a.tr || []; for (let i = 0; i < tr.length; i += 2) { all++; if (i >= 2 && tr[i + 1] === tr[i - 1] && (tr[i] - tr[i - 2]) / 100 < r.track.speedAt(tr[i] / 100) * .15) dbl++; } }
  if (all) out(`double taps: ${dbl} of ${all} presses repeat the same key within 0.15 s`);
}
