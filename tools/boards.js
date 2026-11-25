// Builds the leaderboards from the scores players posted. Run by a GitHub Action in the play-data repository
// (jamesccupps/EightFold-data), which checks out this one for the code:
//   node tools/boards.js <folder with the play-data repository checked out>
// Every posted run carries its presses. Each one is played back here on the real engine: only a run that really ends
// the way it claims gets on a board, and the time, distance and points listed are the ones the playback gives, not the
// ones claimed. A board only lists runs made on the course as it is now; when a level changes, its board starts again.
//   scores/<date>/<file>.json   what the relay filed, one per posted run
//   boards/checked.json         what each score file came to, so each is only played back once
//   boards/all.json             the boards the game shows
const fs = require('fs'), path = require('path');
const { replay, courseFor, engine, NOW } = require('./replay.js');
const dir = process.argv[2]; if (!dir) { console.error('usage: node tools/boards.js <folder>'); process.exit(2); }
const E = engine(NOW), TOP = 50, DAYS = 7;
// Endless is one fixed course, named by the date it was laid out for. The game says which; read it from there.
const ENDLESS = 'E' + ((fs.readdirSync(path.join(__dirname, '..', 'src')).filter(f => /\.(js|html)$/.test(f)).map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n').match(/const ENDLESS_COURSE = '(\d{4}-\d\d-\d\d)'/) || [])[1] || '');
if (ENDLESS.length !== 11) { console.error('cannot tell which Endless course is ranked'); process.exit(2); }
const plain = n => String(n).replace(/[4@]/g, 'A').replace(/1/g, 'I').replace(/0/g, 'O').replace(/3/g, 'E').replace(/5/g, 'S').replace(/7/g, 'T').replace(/8/g, 'B');   // digits standing in for letters
// Names that are not listed (the row shows ??? instead). EXACT: short ones, matched whole, so that ASS does not catch CASSIE.
// INSIDE: longer words with no innocent neighbours, matched anywhere in the name. Words that are also what people call
// themselves (GAY, JEW) are not here: an identity is not an insult.
const EXACT = new Set(['ASS', 'FAG', 'FUK', 'FUC', 'FCK', 'KKK', 'NIG', 'NGR', 'CUM', 'JIZ', 'SEX', 'TIT', 'COK', 'COCK', 'CNT', 'DIK', 'DIC', 'DICK', 'HOE', 'PIS', 'POO', 'VAG', 'WOP', 'KYS', 'SUK', 'FAP', 'NAZ', 'SS', 'SPIC', 'RAPE', 'ANAL', 'ANUS', 'HELL', 'DAMN', 'CRAP', 'PISS', 'KIKE', 'COON', 'GOOK', 'DYKE', 'TWAT', 'WANK', 'PORN', 'TITS', 'SLUT']);
const INSIDE = ['FUCK', 'FUK', 'SHIT', 'CUNT', 'NIGG', 'NIGA', 'FAGG', 'FAGOT', 'BITCH', 'PENIS', 'VAGINA', 'WHORE', 'PUSSY', 'NAZI', 'HITLER', 'CHINK', 'RETARD', 'BASTARD', 'ASSHOLE', 'DILDO', 'JIZZ', 'RAPIST', 'PEDO', 'KKK', 'WANKER', 'TRANNY', 'BLOWJOB', 'HANDJOB', 'BONER', 'CUMSHOT', 'KYS'];
const bad = name => { const n = plain(name); return EXACT.has(n) || INSIDE.some(w => n.includes(w)); };
const files = d => fs.existsSync(d) ? [].concat(...fs.readdirSync(d).map(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? files(p) : f.endsWith('.json') ? [p] : []; })) : [];
const dayNum = date => +date.replace(/-/g, '');
// the course a board is for, as the engine lays it out today, and its checksum
const courses = {};
function boardCourse(board) {
  if (!(board in courses)) {
    let t = null;
    try { t = board[0] === 'L' ? courseFor({ m: board }, E) : board[0] === 'D' ? courseFor({ m: board }, E) : board === ENDLESS && E.endlessSeed ? courseFor({ m: 'E', seed: E.endlessSeed(dayNum(board.slice(1))) }, E) : null; } catch (e) { t = null; }
    courses[board] = t ? { cs: t.checksum(), seed: t.seed } : null;
  }
  return courses[board];
}
// one posted score -> what it really came to, or why it does not count
function check(s) {
  const board = s.board, run = s.run || {}, c = boardCourse(board);
  if (!c) return { no: 'no such course' };
  if (run.tu || run.prac || run.cp) return { no: 'not a standard run' };
  if (board[0] === 'E' ? run.m !== 'E' || run.seed !== c.seed : run.m !== board) return { no: 'run is not on this board\'s course' };
  if (board[0] === 'D') {   // the daily course: posted on or around that day (players' own dates run up to a day either side of the server's)
    const day = Date.parse(board.slice(1) + 'T00:00:00Z'), at = s.at || 0;
    if (!(at > day - 14 * 3600e3 && at < day + 50 * 3600e3)) return { no: 'posted on another day' };
  }
  if (s.core !== NOW) return { no: 'played on another version of the game', retry: true };
  let r = null; try { r = replay(Object.assign({}, run, { _core: s.core, _speed: 1 })); } catch (e) { r = null; }
  if (!r) return { no: 'could not be played back' };
  if (r.track.checksum() !== c.cs) return { no: 'course changed' };
  if (board[0] === 'E') { if (r.res !== 'fall' && r.res !== 'crash') return { no: 'playback does not end' }; }
  else if (r.res !== 'win') return { no: 'playback does not finish the course' };
  const name = String(s.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || '???';
  if (s.test) return { no: 'a test: checked and found good, not listed (' + (board[0] === 'E' ? r.z + ' m' : r.time.toFixed(2) + ' s') + ')', test: true };
  // every press at the last possible moment, over a long run, is a script's signature and not a person's: checked and found good, but held back
  if ((s.run.pr | 0) >= 30 && (r.perfects | 0) >= .9 * (s.run.pr | 0)) return { no: 'held: nearly every press at the last moment (' + (r.perfects | 0) + ' of ' + (s.run.pr | 0) + ')', held: true };
  return { board, n: bad(name) ? '???' : name, p: String(s.pid || '').slice(0, 6), at: s.at || 0, cs: c.cs,
    t: +r.time.toFixed(2), m: r.z, pts: r.pts | 0, pf: r.perfects | 0, sp: r.sparks | 0 };
}
const cachePath = path.join(dir, 'boards', 'checked.json');
let cache = {}; try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) { cache = {}; }
if (cache._core !== NOW) { for (const k in cache) if (cache[k] && cache[k].retry) delete cache[k]; cache._core = NOW; }   // a new version of the game: scores that were waiting for it get another look
let fresh = 0, counted = 0;
for (const f of files(path.join(dir, 'scores')).sort()) {
  const key = path.relative(dir, f).replace(/\\/g, '/');
  if (!cache[key]) { let s = null; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} cache[key] = s ? check(s) : { no: 'unreadable' }; fresh++; }
}
// best run per player per board, on today's version of each course
const boards = {};
for (const key in cache) {
  const e = cache[key]; if (!e || e.no || !e.board) continue;
  const c = boardCourse(e.board); if (!c || c.cs !== e.cs) continue;
  const endless = e.board[0] === 'E', better = (a, b) => endless ? (a.m - b.m || a.pts - b.pts || b.at - a.at) > 0 : (b.t - a.t || a.pts - b.pts || b.at - a.at) > 0;
  const B = boards[e.board] || (boards[e.board] = {});
  if (!B[e.p] || better(e, B[e.p])) B[e.p] = e;
  counted++;
}
const dated = Object.keys(boards).filter(b => b[0] === 'D').map(b => b.slice(1)).sort().reverse(), keep = new Set([...new Set(dated)].slice(0, DAYS));   // the last few daily courses; levels and Endless always
const out = { updated: new Date().toISOString(), core: NOW, boards: {} };
for (const b of Object.keys(boards).sort()) {
  if (b[0] === 'D' && !keep.has(b.slice(1))) continue;
  const endless = b[0] === 'E';
  out.boards[b] = Object.values(boards[b]).sort((x, y) => endless ? (y.m - x.m || y.pts - x.pts || x.at - y.at) : (x.t - y.t || y.pts - x.pts || x.at - y.at)).slice(0, TOP)
    .map(e => endless ? { n: e.n, m: e.m, pts: e.pts, pf: e.pf, p: e.p, at: e.at } : { n: e.n, t: e.t, pts: e.pts, pf: e.pf, p: e.p, at: e.at });
}
fs.mkdirSync(path.join(dir, 'boards'), { recursive: true });
const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'boards', 'all.json'), 'utf8')); } catch (e) { return null; } })();
if (!prev || JSON.stringify(prev.boards) !== JSON.stringify(out.boards) || prev.core !== out.core) fs.writeFileSync(path.join(dir, 'boards', 'all.json'), JSON.stringify(out));
fs.writeFileSync(cachePath, JSON.stringify(cache));
const refused = Object.values(cache).filter(e => e && e.no).length;
console.log(`${fresh} new scores checked; ${counted} count on today's courses, ${refused} refused; ${Object.keys(out.boards).length} boards`);
for (const k in cache) if (cache[k] && cache[k].no && fresh) console.log('   refused ' + k + ': ' + cache[k].no);
