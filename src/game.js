// ================= game state =================
let state = 'menu';            // menu | play | dead | fail | win | pause
let mode = null;               // level index, 'endless', 'daily' or 'tutorial'
let track, runner, bot = null, deadT = 0, failT = 0, winT = 0, lastPress = null, tries = 0, runT = 0, shake = 0, flash = 0;
let tutI = 0, tutNote = 0, frozen = false, lastZone = 0;
let shards = [], ballAt = { x: 0, y: 0, R: 10 }, lastPc = '', lastSp = '', lastTm = '';
// The run's clock and speed live in the engine (Pace): sparks add lasting speed, a press at the last moment adds a surge.
let pace = null, perfAt = 0, perfFlash = 0, deathZ = 0, coachI = 0, coachOn = null;
let boostVis = 0, kick = 0;   // eased copy of the speed-up for the view, music and streaks; kick is a brief pulse on each pickup
const fmtN = n => Math.round(n).toLocaleString('en-US');
const parOf = parTime;
// points for the run so far (or the finished run): what each part is worth. The sums are the engine's, so the leaderboard's checker gets the same.
function tally(win) {
  const parts = scoreParts(track, runner, pace, win, runner.dead ? deathZ : runner.z);
  let total = 0; for (const p of parts) total += p[1];
  return { total, parts };
}
const practice = () => opts.speed < 1 || opts.cp || tunedPlay();
// how much faster or slower than real time the run is going right now
const timeScale = () => state === 'menu' || !pace ? 1 : pace.scale();
let resumeCp = null, touchSeen = false;
// An earlier day's daily course can be played from its leaderboard, but a daily counts only on its own day: such a run is
// not ranked, not posted, and leaves today's best, attempts and streak alone.
const pastDaily = () => mode === 'daily' && !!track && !!track.past;
const scored = () => mode !== 'tutorial' && !practice() && !pastDaily();

function toast(t) { const el = $('toast'); el.className = 'toast'; el.textContent = t; void el.offsetWidth; el.className = 'toast show'; }
function showBig(html) { const el = $('big'); el.className = 'big'; el.innerHTML = html; void el.offsetWidth; el.className = 'big show'; }
function attach() {
  runner = new Runner(track); pace = new Pace(track, 1, true);
  runner.on = name => {
    if (state !== 'play') return;
    if (telCur) { if (name === 'shieldhit') telCur.sh++; else if (name === 'slow') telCur.sl++; else if (name === 'shield') telCur.sg++; else if (name === 'magnet') telCur.mg++; else if (name === 'double') telCur.x2++; }
    Snd.fx(name);
    if ((name === 'spark' || name === 'risk') && mode !== 'tutorial') {
      const was = pace.boost; if (name === 'risk') pace.risk(); else pace.spark(1); kick = 1;
      if (pace.boost > was && pace.boost >= PACE.boostMax) toast('Top speed');
    }
    if (name === 'shield') toast(firstFew('i-shield', 2) ? 'Shield: saves you from one hit' : 'Shield');
    else if (name === 'slow') { pace.slow(); toast(firstFew('i-slow', 2) ? 'Slow-mo: time runs slower for a moment' : 'Slow-mo'); }
    else if (name === 'magnet') toast(firstFew('i-magnet', 2) ? 'Magnet: every spark you pass comes to you' : 'Magnet');
    else if (name === 'double') toast(firstFew('i-double', 2) ? 'Double: sparks are worth twice as much' : 'Double');
    else if (name === 'risk' && mode !== 'tutorial' && firstFew('i-risk', 3)) toast('Red spark: 300 points, extra top speed');
    else if (name === 'shieldhit') { toast('Shield used'); if (!calm()) shake = .6; burst(10); }
    else if (name === 'crash') burst(16);
  };
}
// true the first n times it is asked about k (kept with the scores), so a thing is explained while it is new and not after
function firstFew(k, n) { const c = stats.know[k] | 0; if (c >= n) return false; stats.know[k] = c + 1; return true; }
function burst(n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 140 + Math.random() * 420; shards.push({ x: ballAt.x, y: ballAt.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, r: Math.random() * 6.283, s: ballAt.R * (.25 + Math.random() * .45), t: 0 }); } }
function startAttract() {
  hue0 = Math.random() * 360; palZ = -99;
  track = new Track((Math.random() * 1e9) | 0, null); attach(); bot = new Bot(track, .5, false);
}
function modeName() { return mode === 'endless' ? 'Endless' : mode === 'daily' ? (track && track.level.theme) || 'Daily' : mode === 'tutorial' ? 'How to play' : LEVELS[mode].name; }
function hidePanels() { for (const id of ['menu', 'pausePanel', 'failPanel', 'winPanel', 'scoreSheet', 'ctrlSheet', 'briefSheet', 'tuneSheet', 'dataSheet', 'noteSheet', 'boardSheet', 'guideSheet']) $(id).hidden = true; overlay = null; }
function begin(first, cp) {
  telEnd('restart'); attach(); bot = null; state = 'play'; telStart(cp); for (const k in postMsg) delete postMsg[k];
  pace = new Pace(track, mode === 'tutorial' ? 1 : opts.speed * tune.pace, mode === 'tutorial'); coachI = 0; coachOn = null; cueI = 0; rkI = 0; rkOn = null; rkSeen = null; perfFlash = 0; lastPerf = -1;
  if (cp) { runner.z = cp.z; runner.lane = runner.from = runner.cam = cp.lane; } shards.length = 0; shake = 0; flash = 0; lastPc = lastSp = lastTm = '';
  lastProg = ''; lastPts = ''; lastBoost = -1; lastFlags = -1; boostVis = 0; kick = 0; runT = 0; tutI = 0; tutNote = 0; frozen = false; lastZone = cp ? (track.Z[Math.floor(cp.z)] || 0) : 0; tries++;
  hidePanels(); $('tip').hidden = true;
  $('hud').hidden = false; $('bar').hidden = false; $('btnPause').hidden = false;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  $('hudNo').textContent = typeof mode === 'number' ? pad2(mode + 1) : mode === 'endless' ? '∞' : mode === 'daily' ? (track.day || today()).label : '?';
  $('hudNm').textContent = modeName();
  $('tgPrac').hidden = !practice() || mode === 'tutorial'; $('tgPrac').textContent = tunedPlay() ? 'Tuned' : 'Practice';
  if (scored()) { if (typeof mode === 'number') lvS(mode).tries++; else if (mode === 'daily') dailyS().tries++; saveStats(); }
  if (first && mode !== 'tutorial') {
    const hint = mode === 'endless' ? 'How far can you get? Restart replays the same course.' : track.level.hint;
    showBig(esc(modeName()) + '<small>' + esc(hint) + '</small>');
  } else $('big').className = 'big';
  if (first) {   // remind which keys do what
    const h = $('hint'); h.className = 'hint';
    h.innerHTML = '<kbd>' + esc(labelFor('left')) + '</kbd><kbd style="margin-left:3px">' + esc(labelFor('right')) + '</kbd>turn<kbd>' + esc(labelFor('jump')) + '</kbd>jump<kbd>' + esc(labelFor('flip')) + '</kbd>flip';
    void h.offsetWidth; if (mode !== 'tutorial' && !touchSeen) h.className = 'hint show';
  }
  const bm = $('bestMark'), bst = typeof mode === 'number' && stats.lv[mode] ? stats.lv[mode].best : mode === 'daily' && !track.past ? (dailyS().best || 0) : 0;
  bm.hidden = !(bst > 0 && bst < 100); bm.style.left = bst + '%'; bestRow = bm.hidden ? -1 : Math.floor(bst / 100 * track.end);
  syncCss(true);
}
let bestRow = -1;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function launchRun(m, tr, song) { mode = m; track = tr; tries = 0; resumeCp = null; telEv('run:' + telMode()); Snd.wake(); Snd.song(song); begin(true); }
function startLevel(i, skip) { if (!unlocked(i)) return; store.set('last', i); pal = PALS[i]; enter(i, new Track(LEVELS[i].seed, LEVELS[i]), i, skip); }
// Endless is one course, the same for everyone and the same every day, so distances can be compared and its board
// keeps. It is named by the date it was laid out for; a new date here would be a new course with a new, empty board.
// (tools/boards.js reads this line, so the checker and the game cannot disagree about which course is ranked.)
const ENDLESS_COURSE = '2026-11-25';
const ENDLESS = { key: ENDLESS_COURSE, seed: +ENDLESS_COURSE.replace(/-/g, '') };
// random: any other course, for practice; it is not ranked.
function startEndless(skip, random) {
  const d = ENDLESS, tr = new Track(random ? (Math.random() * 1e9) | 0 : endlessSeed(d.seed), null); if (!random) tr.rankDay = d.key;
  hue0 = random ? Math.random() * 360 : d.seed * 47 % 360; palZ = -99; enter('endless', tr, random ? 3 + ((Math.random() * 5) | 0) : 3 + d.seed % 5, skip);
}
// what a day's course is like, in a sentence or two
const PACE_WORDS = { hard: 'Hard: as fast as the last level and busier, with one shield on the way.', harder: 'Harder: faster than any level, and no shield.', hardest: 'Hardest: as fast as the daily gets, with no shield and no slow-mo.' };
const dailyWords = sp => sp.about + ' ' + PACE_WORDS[sp.pace] + ' ' + DAILY.hint;
// day: an earlier day's course (from dayOf); none for today's
function startDaily(skip, day) {
  const d = day || today(), tr = dailyTrack(d.seed); tr.day = d; tr.past = d.key !== today().key;
  pal = PALS[d.seed % 8]; enter('daily', tr, d.seed % 8, skip);
}
// ---------- level briefing: what the level is, what is new in it, and how to deal with each thing ----------
const GROUP = KGROUP;   // which kind of obstacle each section of a course is (the engine's own table)
const ORDER = ['turns', 'overhead', 'blocks', 'bars', 'gaps', 'ringgap', 'blockflip', 'sweepers', 'pads', 'beams', 'sprint', 'slow'];
const FL = 'fill="var(--tile)"', HZ = 'fill="var(--hazard)"', PATH = 'fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 3" stroke-linecap="round"', BALL = 'r="4" fill="#fff"';
const svg = body => '<svg viewBox="0 0 64 40" aria-hidden="true">' + body + '</svg>';
const TYPES = {   // name, what to do, which move, picture
  turns: ['Shifting floor', 'The floor jogs sideways. Turn to follow it.', 'turn', svg('<rect x="4" y="22" width="26" height="9" rx="1" ' + FL + '/><rect x="30" y="9" width="30" height="9" rx="1" ' + FL + '/><path d="M16 26.5H26L36 13.5H52" ' + PATH + '/><circle cx="12" cy="26.5" ' + BALL + '/>')],
  overhead: ['Floor overhead', 'Your floor ends while another runs along the far wall. Flip up to it.', 'flip', svg('<rect x="4" y="31" width="30" height="5" rx="1" ' + FL + '/><rect x="24" y="4" width="36" height="5" rx="1" ' + FL + '/><path d="M18 26Q30 24 44 13" ' + PATH + '/><circle cx="13" cy="26.5" ' + BALL + '/>')],
  blocks: ['Tall blocks', 'A wall with one opening. Go around: you cannot jump these.', 'turn', svg('<rect x="4" y="5" width="56" height="30" rx="1" ' + FL + '/><rect x="34" y="5" width="9" height="10" ' + HZ + '/><rect x="34" y="25" width="9" height="10" ' + HZ + '/><path d="M16 10H26L33 20H54" ' + PATH + '/><circle cx="12" cy="10" ' + BALL + '/>')],
  bars: ['Low bars', 'A thin bar across the floor. Jump it.', 'jump', svg('<rect x="4" y="31" width="56" height="5" rx="1" ' + FL + '/><rect x="31" y="24" width="4" height="7" ' + HZ + '/><path d="M17 26Q33 0 49 26" ' + PATH + '/><circle cx="12" cy="26.5" ' + BALL + '/>')],
  gaps: ['Short gaps', 'A break in a single-file floor with nothing overhead. Jump it.', 'jump', svg('<rect x="4" y="31" width="23" height="5" rx="1" ' + FL + '/><rect x="38" y="31" width="22" height="5" rx="1" ' + FL + '/><path d="M17 26Q33 2 49 26" ' + PATH + '/><circle cx="12" cy="26.5" ' + BALL + '/>')],
  ringgap: ['Ring gaps', 'Every wall drops away and the floor resumes overhead. Flip across.', 'flip', svg('<rect x="4" y="31" width="22" height="5" rx="1" ' + FL + '/><rect x="38" y="4" width="22" height="5" rx="1" ' + FL + '/><path d="M18 26Q32 22 46 13" ' + PATH + '/><circle cx="13" cy="26.5" ' + BALL + '/>')],
  blockflip: ['Blocked side', 'Blocks across your whole side of the tunnel. Flip over them.', 'flip', svg('<rect x="4" y="31" width="56" height="5" rx="1" ' + FL + '/><rect x="34" y="18" width="9" height="13" ' + HZ + '/><rect x="20" y="4" width="40" height="5" rx="1" ' + FL + '/><path d="M18 26Q26 22 36 13" ' + PATH + '/><circle cx="13" cy="26.5" ' + BALL + '/>')],
  sweepers: ['Sliding blocks', 'They slide in and stop on the marked tile. Be on another one.', 'turn', svg('<rect x="4" y="16" width="56" height="20" rx="1" ' + FL + '/><rect x="34" y="16" width="10" height="10" fill="var(--hazard)" opacity=".45"/><rect x="34" y="2" width="10" height="9" ' + HZ + '/><path d="M39 11V19M36 16l3 3 3-3" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M16 21H28L34 31H54" ' + PATH + '/><circle cx="12" cy="21" ' + BALL + '/>')],
  pads: ['Launch pads', 'White pads throw you over a long gap. Nothing to press.', null, svg('<rect x="4" y="31" width="12" height="5" rx="1" ' + FL + '/><rect x="16" y="31" width="9" height="5" fill="#fff"/><rect x="48" y="31" width="12" height="5" rx="1" ' + FL + '/><path d="M20 27Q36 -8 53 26" ' + PATH + '/><circle cx="12" cy="26.5" ' + BALL + '/>')],
  beams: ['Beams and fans', 'Bars swing across the tunnel and settle. Slip past, and never flip through one.', 'turn', svg('<polygon points="44.8,5 55.6,15.8 55.6,31 44.8,37 19.2,37 8.4,31 8.4,15.8 19.2,5" transform="translate(0 -1)" fill="none" stroke="var(--tile)" stroke-width="2"/><rect x="29" y="2" width="6" height="36" transform="rotate(38 32 20)" ' + HZ + '/><circle cx="41" cy="31" ' + BALL + '/>')],
  sprint: ['Sprint zones', 'Bright floor: everything speeds up, with long gaps to clear.', null, svg('<rect x="4" y="14" width="56" height="12" rx="1" fill="#fff" opacity=".85"/><path d="M14 9l9 11-9 11M28 9l9 11-9 11M42 9l9 11-9 11" fill="none" stroke="var(--hazard)" stroke-width="3"/>')],
  slow: ['Slow zones', 'Dark floor: slower, single file, with quick turns one after another.', 'turn', svg('<path d="M4 30H16V20H28V30H40V20H52V10H60" fill="none" stroke="var(--tile)" stroke-width="7" opacity=".6"/><path d="M6 30H16V20H28V30H40V20H52V10H58" ' + PATH + '/>')]
};
// pictures of the things that are picked up or painted on the floor, drawn to match the game
const IC = {
  spark: svg('<path d="M32 8l9 12-9 12-9-12z" fill="#fff"/>'),
  high: svg('<circle cx="32" cy="20" r="16" fill="none" stroke="#fff" stroke-width="2"/><path d="M32 11l7 9-7 9-7-9z" fill="#fff"/>'),
  risk: svg('<circle cx="32" cy="20" r="17" fill="none" stroke="#ff3854" stroke-width="2.4"/><path d="M32 6l10 14-10 14-10-14z" fill="#ff3854"/><path d="M32 14l4.4 6-4.4 6-4.4-6z" fill="#fff"/>'),
  shield: svg('<circle cx="32" cy="20" r="15" fill="rgba(0,0,0,.35)" stroke="#7fe7ff" stroke-width="3"/><path d="M25 13h14v8l-7 7-7-7z" fill="none" stroke="#7fe7ff" stroke-width="3" stroke-linejoin="round"/>'),
  slow: svg('<circle cx="32" cy="20" r="15" fill="rgba(0,0,0,.35)" stroke="#d9b8ff" stroke-width="3"/><path d="M32 11v9l7 4" fill="none" stroke="#d9b8ff" stroke-width="3" stroke-linecap="round"/>'),
  magnet: svg('<circle cx="32" cy="20" r="15" fill="rgba(0,0,0,.35)" stroke="#ffd166" stroke-width="3"/><path d="M25 12v8a7 7 0 0 0 14 0v-8" fill="none" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>'),
  double: svg('<circle cx="32" cy="20" r="15" fill="rgba(0,0,0,.35)" stroke="#7dffb0" stroke-width="3"/><path d="M22 15l8 10M30 15l-8 10M34 17l3-2.5 3 2.5-6 8h7" fill="none" stroke="#7dffb0" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  perfect: svg('<circle cx="32" cy="20" r="6" fill="#fff"/><circle cx="32" cy="20" r="13" fill="none" stroke="#fff" stroke-width="2.4" opacity=".75"/>'),
  strip: svg('<rect x="4" y="24" width="56" height="10" rx="1" ' + FL + '/><rect x="14" y="8" width="20" height="10" fill="var(--tile)"/><rect x="14" y="8" width="20" height="10" fill="#ff3854" opacity=".35"/><rect x="34" y="8" width="14" height="10" fill="#ff3854"/><rect x="46.5" y="6" width="3" height="14" fill="#fff"/><path d="M12 29Q16 13 22 13H40Q44 13 50 29" ' + PATH + '/><circle cx="8" cy="29" ' + BALL + '/>'),
  cue: svg('<rect x="4" y="6" width="56" height="28" rx="1" ' + FL + '/><path d="M12 12l8 8-8 8M27 26l5-6 5 6M27 18l5-6 5 6M45 20h12" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  mark: svg('<rect x="4" y="12" width="56" height="16" rx="1" ' + FL + '/><rect x="26" y="12" width="14" height="16" fill="var(--hazard)" opacity=".55"/>'),
  best: svg('<polygon points="44.8,5 55.6,15.8 55.6,31 44.8,37 19.2,37 8.4,31 8.4,15.8 19.2,5" transform="translate(0 -1)" fill="none" stroke="#fff" stroke-width="3"/>'),
  finish: svg('<rect x="4" y="12" width="56" height="16" fill="#fff"/><path d="M4 12h8v8h-8zM20 12h8v8h-8zM36 12h8v8h-8zM52 12h8v8h-8zM12 20h8v8h-8zM28 20h8v8h-8zM44 20h8v8h-8z" fill="rgb(var(--bgc))"/>')
};
// a card like the obstacle cards: picture, name, what it means, and the keys if it takes a move
function info(pic, name, text, move, cls) {
  const el = document.createElement('div'); el.className = 'card' + (cls ? ' ' + cls : '');
  el.innerHTML = pic + '<div><b></b><span></span></div>';
  el.querySelector('b').textContent = name; const sp = el.querySelector('span'); sp.textContent = text + ' ';
  for (const k of moveKeys(move)) { const kb = document.createElement('kbd'); kb.textContent = k; sp.appendChild(kb); }
  return el;
}
const pct = x => Math.round(x * 100) + '%';
function buildGuide() {
  const fill = (id, list) => { const box = $(id); box.textContent = ''; for (const c of list) box.appendChild(c); };
  fill('gdMoves', [
    info(TYPES.turns[3], 'Turn', 'Hop one lane to the side. The tunnel turns with you, so your floor is always at the bottom.', 'turn'),
    info(TYPES.bars[3], 'Jump', 'Over low bars and short gaps, and through sparks that hang in the air.', 'jump'),
    info(TYPES.overhead[3], 'Flip', 'Cross to the wall straight overhead: for when your floor ends, or your whole side is blocked.', 'flip')]);
  $('gdAir').textContent = 'Running off the floor ends the run, and so does touching a block, bar or beam: those are all drawn in one colour that stands out from the floor, a different one in each level. You cannot act in the air: a press made during a jump, flip or hop is remembered and happens the moment you land, so press as early as you like, and do not jump when there is nothing to jump.'
    + (touchSeen ? ' Touch: swipe sideways to turn, up to flip, down to jump, or use the buttons.' : ' On a touch screen: swipe sideways to turn, up to flip, down to jump.');
  fill('gdItems', [
    info(IC.spark, 'Spark', '100 points and a little more speed. They mark the best line through the level.'),
    info(IC.high, 'Ringed spark', 'Hangs in the air over a bar or a gap. Jump through it: 200 points.', 'jump'),
    info(IC.risk, 'Red spark', 'Optional, on a strip off the safe line. 300 points, and speed beyond the usual top speed. Three at a time.'),
    info(IC.shield, 'Shield', 'Saves you from one hit. A blue ring shows around the ball while you have it. It does not stop a fall.'),
    info(IC.slow, 'Slow-mo', 'Time runs slower for ' + PACE.slowSecs + ' seconds. A purple ring around the ball empties as it runs out and flickers white for the last second; the tag at the top counts down too. Easier, but the clock keeps going, so it costs time.'),
    info(IC.magnet, 'Magnet (Endless)', 'For ' + POWER.magnet + ' seconds every ordinary and ringed spark you pass comes to you, whatever lane it is in. Red sparks still have to be fetched. One lane off the route.'),
    info(IC.double, 'Double (Endless)', 'For ' + POWER.double + ' seconds sparks are worth twice the points, red ones included. One lane off the route.')]);
  fill('gdFloor', [
    info(IC.cue, 'White marks on your floor', 'The next move you need, painted on your own lane just before it is due. An arrowhead to the side: turn that way (two: turn twice). Two arrowheads pointing ahead: flip, and the tile you will land on, overhead, is outlined. A bar across: jump. Shown in How to play and on the first level; Controls & options can show them on every level, or never.'),
    info(IC.strip, 'Red strip', 'Where red sparks sit: beside the floor (turn out to it) or overhead (flip to it). It turns full red after the last spark and ends at the white bar. Be back on the main floor by then.'),
    info(IC.mark, 'Marked tile', 'A sliding block or a swinging bar is about to stop here. Be on another tile.'),
    card('pads', false), card('sprint', false), card('slow', false),
    info(IC.best, 'Bright ring', 'How far you have got before on this level.'),
    info(IC.finish, 'Chequered floor', 'The finish line.')]);
  fill('gdObs', ORDER.filter(t => t !== 'pads' && t !== 'sprint' && t !== 'slow').map(t => card(t, false)));
  const hudRows = [
    ['37%  or  412 m', 'How far you are: percent of a level, metres in Endless. The bar across the very top shows the same; its white tick is your best.'],
    ['\u25C6 12/40', 'Sparks collected, out of how many the level has.'],
    ['21.4 s', 'The run clock. Levels and the daily course are ranked by it.'],
    ['4,200 pts', 'Points so far.'],
    ['+18% SPEED', 'How much faster than the starting pace you are going, from sparks and perfects.'],
    ['PERFECT \u00D73', 'Perfect presses in a row.'],
    ['SHIELD, SLOW-MO 2.6, MAGNET 4.1, DOUBLE 6.0', 'You are holding a shield. The others count down the seconds left; a ring round the ball empties with each.'],
    ['PRACTICE, TUNED', 'A practice option or changed tuning is on: this run is not scored.']];
  const tb = $('gdHud'); tb.textContent = ''; for (const [a, b] of hudRows) { const tr = document.createElement('tr'); cell(tr, a); cell(tr, b); tb.appendChild(tr); }
  const pts = [
    ['Sparks make you faster.', ' Each adds a little speed, most of it from the first few, up to +' + pct(PACE.boostMax) + '. Faster is how you beat par and other players.'],
    ['A perfect is a press at the last moment', ' before it would be too late. It gives a burst of speed that fades over ' + PACE.surgeSecs + ' seconds and is stronger with each perfect in a row, plus 50 points.'],
    ['Red sparks go past the limit.', ' Each adds ' + pct(PACE.risk) + ' speed on top of the usual top speed, for the rest of the run.'],
    ['Points.', ' Sparks 100, ringed 200, red 300. Perfects 50. In Endless, 10 a metre. In a level: 10 a percent, 1,000 for clearing it, 100 for every second under par, 1,000 for taking every spark.'],
    ['Leaderboard.', ' Levels and the daily course rank the fastest clear. A daily course counts on its own day only; earlier days are under Leaderboard, Daily, with their boards, and can be played again unranked. Endless ranks how far you got; it is one course, the same for everyone and the same every day, so its board keeps. Points settle a tie. Runs are played back and checked before they are listed.']];
  const ul = $('gdScore'); ul.textContent = ''; for (const [a, b] of pts) { const li = document.createElement('li'), st = document.createElement('b'); st.textContent = a; li.appendChild(st); li.appendChild(document.createTextNode(b)); ul.appendChild(li); }
}
function openGuide() { if (state === 'play') setPause(true); buildGuide(); openSheet('guideSheet'); }
const typesOf = mix => { const has = {}; for (const k in mix) if (GROUP[k]) has[GROUP[k]] = 1; return ORDER.filter(t => has[t]); };
let pending = null;
function moveKeys(m) { return m === 'turn' ? [labelFor('left'), labelFor('right')] : m ? [labelFor(m)] : []; }
function card(t, isNew) {
  const d = TYPES[t], el = document.createElement('div'); el.className = 'card' + (isNew ? ' new' : '');
  el.innerHTML = d[3] + '<div><b></b><span></span></div>';
  el.querySelector('b').textContent = d[0]; const sp = el.querySelector('span'); sp.textContent = d[1] + ' ';
  for (const k of moveKeys(d[2])) { const kb = document.createElement('kbd'); kb.textContent = k; sp.appendChild(kb); }
  return el;
}
function showBrief(m, tr, song) {
  mode = m; track = tr; attach(); bot = null; state = 'brief'; pending = { m, tr, song }; hidePanels(); telEv('brief:' + telMode());
  $('hud').hidden = true; $('bar').hidden = true; $('btnPause').hidden = true; $('big').className = 'big'; $('tip').hidden = true; $('hint').className = 'hint';
  const lv = typeof m === 'number', types = lv || m === 'daily' ? typesOf(tr.kinds || tr.level.mix) : ORDER;
  let seen = {}; if (lv) for (let i = 0; i < m; i++) for (const t of typesOf(LEVELS[i].mix)) seen[t] = 1;
  const fresh = lv ? types.filter(t => !seen[t]) : [], old = types.filter(t => fresh.indexOf(t) < 0);
  $('brNo').textContent = lv ? 'Level ' + pad2(m + 1) + ' of ' + pad2(LEVELS.length) : m === 'daily' ? 'Daily course · ' + (tr.day || today()).label + (tr.level.pace ? ' · ' + tr.level.pace : '') + (tr.past ? ' · an earlier day, not ranked' : '') : 'Endless';
  $('brName').textContent = modeName();
  $('brHint').textContent = m === 'endless' ? (tr.rankDay ? 'No finish line. The course is the same for everyone and does not change from day to day, so distances can be compared and the leaderboard keeps. ' : 'No finish line. A random course, for practice: it is not ranked. ') + 'It starts with turns, flips and blocks, then adds everything else as it speeds up.' : m === 'daily' && tr.level.theme ? dailyWords(tr.level) : tr.level.hint;
  const st = $('brStats'); st.textContent = '';
  const stat = (k, v, html) => { const d = document.createElement('div'), a = document.createElement('dt'), b = document.createElement('dd'); a.textContent = k; if (html) b.innerHTML = v; else b.textContent = v; d.appendChild(a); d.appendChild(b); st.appendChild(d); };
  const sp = tr.speedAt(0), on = clamp(Math.round((sp - 6.8) / .75), 1, 8); let pips = '<span class="pips" role="img" aria-label="' + on + ' of 8">'; for (let i = 0; i < 8; i++) pips += '<i' + (i < on ? ' class="on"' : '') + '></i>'; stat('Speed', pips + '</span>', true);
  if (tr.end !== Infinity) {
    let secs = 0; for (let r = 0; r < tr.end; r++) secs += 1 / tr.V[r];
    stat('Par time', Math.round(secs) + ' s'); stat('Moves needed', String(tr.events.filter(e => !e.opt).length)); stat('Sparks', String(tr.nSparks));
    if (tr.past) stat('Ranked', 'no: only on its day'); else { const b = lv ? (stats.lv[m] || {}) : dailyS(); stat('Your best', ((lv ? b.clears : b.cleared) ? (b.time ? fmtT(b.time) : 'cleared') : b.best ? b.best + '%' : 'not yet') + (b.score ? '  ·  ' + fmtN(b.score) + ' pts' : '')); }
  } else stat('Your best', stats.endless[0] ? stats.endless[0].m + ' m' : 'not yet');
  $('brNewH').hidden = !fresh.length; $('brNew').hidden = !fresh.length; $('brNew').textContent = ''; for (const t of fresh) $('brNew').appendChild(card(t, true));
  $('brAlsoH').textContent = !lv ? 'What is in it' : fresh.length ? 'Also in it, from earlier levels' : 'Nothing new. Everything from the earlier levels:';
  $('brAlsoH').hidden = !old.length; const also = $('brAlso'); also.textContent = ''; also.className = fresh.length ? 'chips' : 'cards';
  for (const t of old) { if (fresh.length) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = TYPES[t][0]; also.appendChild(c); } else also.appendChild(card(t, false)); }
  let nSh = 0, nSl = 0; if (tr.end !== Infinity) for (const r in tr.I) { if (tr.I[r].t === 'shield') nSh++; else if (tr.I[r].t === 'slow') nSl++; }
  let nHigh = 0; if (tr.end !== Infinity) for (const r in tr.I) if (tr.I[r].t === 'high') nHigh++;
  const note = $('brNote'); note.textContent = '';
  const row = (pic, name, text) => { const a = document.createElement('span'), b = document.createElement('span'), st = document.createElement('b'); a.innerHTML = pic; st.textContent = name; b.appendChild(st); b.appendChild(document.createTextNode(text)); note.appendChild(a); note.appendChild(b); };
  row(IC.spark, 'Sparks', ' mark the line. 100 points each, and each makes you a little faster, up to +' + pct(PACE.boostMax) + '. That is how you beat par.');
  if (nHigh || tr.end === Infinity) row(IC.high, 'Ringed sparks', ' hang in the air: jump through them. 200 points.');
  if (tr.nRisk || tr.end === Infinity) row(IC.risk, 'Red sparks', ' are optional, on a red strip off the safe line: 300 points and speed beyond the usual top speed. Get back before the strip ends at the white bar.');
  row(IC.perfect, 'Perfect:', ' press at the last moment for a burst of speed. Each one in a row is stronger.');
  if (nSh || tr.end === Infinity) row(IC.shield, nSh > 1 ? nSh + ' shields' : 'A shield', tr.end === Infinity ? ' turns up now and then: it saves you from one hit.' : (nSh > 1 ? ' sit' : ' sits') + ' on your route before the walls: each saves you from one hit.');
  if (tr.end === Infinity) row(IC.magnet, 'Magnet and Double', ' sit one lane off the route now and then: a magnet draws in every spark you pass for ' + POWER.magnet + ' seconds, Double makes sparks worth twice as much for ' + POWER.double + '.');
  if (nSl || tr.end === Infinity) row(IC.slow, 'Slow-mo', tr.end === Infinity ? ' turns up before the fiddly sections: time runs slower for a moment.' : ' sits one lane off the route before ' + (nSl > 1 ? 'the rhythm sections' : 'a rhythm section') + ': it helps, but it costs time.');
  $('brKey').textContent = (practice() ? 'Practice options are on: this run will not be recorded. ' : '') + (touchSeen ? '' : 'Press ' + labelFor('jump') + ' or Enter to start, Esc to go back.');
  $('briefSheet').hidden = false; $('btnGo').focus({ preventScroll: true }); $('briefSheet').scrollTop = 0; syncCss(true);
}
function go() { if (!pending) return; const p = pending; pending = null; launchRun(p.m, p.tr, p.song); }
function enter(m, tr, song, skip) { if (skip || opts.brief === false) launchRun(m, tr, song); else showBrief(m, tr, song); }
function startTutorial() { pal = PALS[1]; launchRun('tutorial', new Track(1, TUTORIAL), 0); }
// Restart always replays the course you were on: the same track object is kept, only the runner is new.
function retry(fromStart) { begin(false, fromStart ? null : resumeCp); }
function lastCp() {
  if (!opts.cp || track.end === Infinity || mode === 'tutorial') return null;
  let c = null; for (const p of track.cps) { if (p.z <= runner.z - 2) c = p; else break; } return c;
}
function score() { const z = runner.dead && state !== 'menu' ? deathZ : runner.z; return track.end === Infinity ? Math.floor(z) : Math.min(100, Math.floor(100 * z / track.end)); }   // a fall is measured where the ball left the floor
const fmtT = t => t.toFixed(1) + ' s';

function record(win) {   // returns { best, rec, total, parts, newScore, newTime }
  telEnd(win ? 'win' : runner.dead ? runner.dead.kind : 'restart');
  const s = score(), sp = runner.sparks, tl = tally(win); let best = s, rec = false, newScore = false, newTime = false;
  if (!scored()) {
    if (win && typeof mode === 'number' && !lvS(mode).pclear) { lvS(mode).pclear = true; saveStats(); }
    saveStats(); return { best: null, rec: false, total: tl.total, parts: tl.parts };
  }
  stats.total = (stats.total || 0) + sp;
  const marks = st => {   // best score and, for a finished run, best time
    if (tl.total > (st.score || 0)) { newScore = (st.score || 0) > 0; st.score = tl.total; }
    if (win && (!st.time || runT < st.time)) { newTime = !!st.time; st.time = +runT.toFixed(2); }
  };
  if (typeof mode === 'number') {
    const st = lvS(mode); rec = s > st.best && st.tries > 1;
    st.best = Math.max(st.best, s); st.sparks = Math.max(st.sparks, sp); marks(st);
    if (win) { st.clears++; if (sp >= track.nSparks) st.perfect = true; }
    best = st.best;
  } else if (mode === 'endless') {
    const top = stats.endless[0] ? stats.endless[0].m : 0; rec = s > top && top > 0;
    if (s >= 30) { stats.endless.push({ m: s, sp, pts: tl.total, d: today().key }); stats.endless.sort((a, b) => b.m - a.m); stats.endless.length = Math.min(8, stats.endless.length); }
    best = Math.max(top, s);
  } else if (mode === 'daily') {
    const st = dailyS(); rec = s > st.best && st.tries > 1; st.best = Math.max(st.best || 0, s); best = st.best; marks(st);
    if (win && !st.cleared) { st.cleared = true; stats.daily.streak = stats.daily.last === dayBefore(st.date) ? (stats.daily.streak || 0) + 1 : 1; stats.daily.last = st.date; }
  }
  saveStats(); return { best, rec, total: tl.total, parts: tl.parts, newScore, newTime };
}
function sparkText() { return track.end === Infinity ? runner.sparks + ' sparks' : runner.sparks + '/' + track.nSparks + ' sparks'; }
function showFail() {
  state = 'fail'; failT = 0;
  const s = score(), r = record(false), endless = track.end === Infinity;
  $('big').className = 'big'; $('tip').hidden = true; $('btnPause').hidden = true;
  $('failBig').textContent = endless ? s + ' m' : s + '%';
  $('failMeter').hidden = endless;
  $('failBar').style.width = (endless ? 0 : s) + '%';
  $('failBest').hidden = r.best == null; if (r.best != null) $('failBest').style.left = 'calc(' + clamp(r.best, 0, 100) + '% - 1px)';
  resumeCp = lastCp();
  $('btnRetry').textContent = resumeCp ? 'Restart from ' + Math.floor(100 * resumeCp.z / track.end) + '%' : 'Restart';
  $('btnFromStart').hidden = !resumeCp;
  const bits = [runner.dead && runner.dead.kind === 'crash' ? 'Hit an obstacle' : 'Fell through a gap', fmtN(r.total) + ' points', fmtT(runT), sparkText()];
  if (r.best != null) bits.push(r.rec ? 'new best' : 'best ' + r.best + (endless ? ' m' : '%'));
  if (pace.perfects) bits.push(pace.perfects + ' perfect');
  bits.push('attempt ' + tries);
  // what the run ended on, and the move it needed
  const need = mode === 'tutorial' ? null : pace.missed(deathZ), ng = need && GROUP[need.kind], NT = ng && TYPES[ng], fn = $('failNeed');
  fn.hidden = !(NT && NT[2]);
  if (!fn.hidden) {
    fn.innerHTML = esc(NT[0]) + ': ' + esc(NT[1]) + ' <kbd>' + keyHtml(need.key) + '</kbd>';
    // the last press was a different move: that is the commonest way a run ends, so name it
    const lp = lastPress; if (lp && lp.m !== need.key && deathZ - lp.z < track.speedAt(deathZ) * .9 && lp.z > need.z0 - track.speedAt(deathZ) * .9)
      fn.innerHTML += '<br>You pressed <kbd>' + keyHtml(lp.m) + '</kbd>' + (MOVE[lp.m] === MOVE[need.key] ? ' (the other way)' : moveWord(lp.m)) + '. This needed <kbd>' + keyHtml(need.key) + '</kbd>' + moveWord(need.key) + '.';
  }
  $('failStat').textContent = bits.join('  ·  ');
  $('btnNew').hidden = mode !== 'endless'; $('btnNew').textContent = track.rankDay ? 'Random course' : 'Ranked course';
  $('failHint').textContent = (pastDaily() ? 'The daily course of ' + track.day.label + ': it counted on its day only. ' : practice() && mode !== 'tutorial' ? 'Practice run: not recorded. ' : '') + (touchSeen ? 'Restart replays' : 'Press ' + labelFor('restart') + ' or ' + labelFor('jump') + ' to restart') + (resumeCp ? ' from the checkpoint.' : ' the same course.');
  postRow($('failPost'));
  rateRow($('failRate'), tries >= 4, 'fb', feelQ(), FEEL);
  $('failPanel').hidden = false; $('btnRetry').focus();
}
function onWin() {
  state = 'win'; winT = 0; Snd.fx('win'); telEv('win:' + telMode()); $('big').className = 'big'; $('tip').hidden = true; $('btnPause').hidden = true;
  const res = record(true);
  const tut = mode === 'tutorial', lv = typeof mode === 'number', perfect = runner.sparks >= track.nSparks;
  if (tut) { stats.tut = true; for (const g of ['turns', 'overhead', 'blocks', 'bars', 'gaps', 'ringgap', 'beams', 'sweepers']) stats.know[g] = Math.max(2, stats.know[g] | 0); saveStats(); }
  $('winTitle').textContent = tut ? 'You are set.' : lv && mode === LEVELS.length - 1 ? 'All eight. Done.' : 'Through.';
  $('winStat').textContent = tut ? '' : [fmtN(res.total) + ' points' + (res.newScore ? ' (new best)' : ''), fmtT(runT) + (res.newTime ? ' (new best)' : '') + ', par ' + fmtT(parOf(track)), sparkText() + (perfect ? ', all of them' : ''), (pace.perfects ? pace.perfects + ' perfect' + (pace.best > 1 ? ' (best run of ' + pace.best + ')' : '') : 'no perfects'), 'attempt ' + tries].join('  ·  ');
  $('winParts').textContent = tut ? '' : res.parts.filter(p => p[1] > 0).map(p => p[0] + ' ' + fmtN(p[1])).join('  +  ');
  $('winText').textContent = tut ? 'That is every move. Legend, on the menu and when paused, shows every item and marking. Key bindings and a practice speed are under Controls & options.'
    : pastDaily() ? 'The daily course of ' + track.day.label + ', cleared. It counted on its day only, so this run is not ranked.'
    : practice() ? 'Cleared in practice: the next level unlocks, but the score is not recorded.'
    : lv && mode < LEVELS.length - 1 ? LEVELS[mode + 1].name + ' is unlocked.' : mode === 'daily' ? 'Daily cleared. Streak: ' + (stats.daily.streak || 1) + '.' : '';
  $('btnNext').hidden = !(tut || (lv && mode < LEVELS.length - 1));
  $('btnNext').textContent = tut ? 'Start level 1' : 'Next level';
  $('btnAgain').hidden = tut;
  rateRow($('winRate'), true, 'fb', feelQ(), FEEL); rateRow($('winFun'), true, 'fun', 'Was it fun?', FUN); postRow($('winPost'));
  $('winPanel').hidden = false; ($('btnNext').hidden ? $('btnAgain') : $('btnNext')).focus();
}
function toMenu() {
  telEnd('quit'); telEv('menu'); state = 'menu'; mode = null; Snd.stop(); startAttract(); hidePanels(); buildMenu();
  $('menu').hidden = false; $('hud').hidden = true; $('bar').hidden = true; $('btnPause').hidden = true;
  $('big').className = 'big'; $('tip').hidden = true;
}
function setPause(p) {
  if (p && state === 'play') { state = 'pause'; if (telCur) { telCur.pzN++; pauseAt = performance.now(); } $('pausePanel').hidden = false; Snd.sleep(); $('btnResume').focus(); }
  else if (!p && state === 'pause') { hidePanels(); state = 'play'; if (telCur && pauseAt) { telCur.pzT += performance.now() - pauseAt; pauseAt = 0; } Snd.wake(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
}

// ---------- risk routes ----------
// The optional strips the red sparks sit on, worked out from the course: which lane, which rows, where the way out is
// taken and where the strip ends. Used to draw the strip so its end can be seen, and for the reminder below.
function riskMap(tr) {
  const m = tr._rk || (tr._rk = { i: 0, rows: {}, list: [], out: [], home: [] }), ev = tr.events;
  for (; m.i < ev.length; m.i++) {
    const e = ev[m.i]; if (!e.opt || (e.kind !== 'riskFar' && e.kind !== 'riskSide')) continue;
    // a route's events come as the presses out (all at nearly the same place), then as many presses home
    if (!m.out.length || (!m.home.length && e.z0 - m.out[0].e.z0 < .5)) { m.out.push({ e, i: m.i }); continue; }
    m.home.push({ e, i: m.i }); if (m.home.length < m.out.length) continue;
    const o = m.out[0].e, h = m.home[0].e, b = Math.round(h.z1 - .6); let lane = -1;
    for (let r = Math.floor(h.z0); r >= Math.floor(h.z0) - 4 && lane < 0; r--) if (tr.I[r] && tr.I[r].t === 'risk') lane = tr.I[r].lane;
    if (lane >= 0) {
      const st = { i0: m.out[0].i, n: m.out.length, far: e.kind === 'riskFar', key: o.key, home: h.key, z0: o.z0, z1: o.z1, back: h.z0, b, lane, first: b };
      for (let r = b; r >= Math.floor(o.z0) && (tr.S[r] & (1 << lane)); r--) { m.rows[r] = st; st.first = r; }
      m.list.push(st);
    }
    m.out = []; m.home = [];
  }
  return m;
}
// The first few times a risk route comes up: say that it is optional and how to take it, then, once on it, how to get back.
let rkI = 0, rkOn = null, rkSeen = null, cueI = 0;
function riskTip() {
  const list = riskMap(track).list, z = runner.z;
  while (rkI < list.length && list[rkI].b + 1.2 < z) rkI++;
  const st = list[rkI]; if (!st) return '';
  const did = st.far ? 'riskFar' : 'riskSide', shown = did + 'Tip';   // counted for each kind: the strip beside the floor and the one overhead are different moves
  if ((stats.know[did] | 0) >= 2 || (stats.know[shown] | 0) >= 6) return '';
  const keys = (k, n) => { let h = ''; for (let i = 0; i < n; i++) h += '<kbd>' + keyHtml(k) + '</kbd>'; return h; };
  const on = (runner.lane & 7) === st.lane && z >= st.first - 2;
  if (on) { rkOn = st; return 'Back before the red strip ends: ' + keys(st.home, st.n) + moveWord(st.home); }
  if (rkOn === st) { rkOn = null; if (!st.done) { st.done = 1; stats.know[did] = (stats.know[did] | 0) + 1; } return ''; }   // out and back: that is the whole move
  if (!st.done && z >= st.z0 - track.speedAt(z) * 1.6 && z <= st.z1 + .4) {
    if (rkSeen !== st) { rkSeen = st; stats.know[shown] = (stats.know[shown] | 0) + 1; }
    return 'Red sparks, optional: ' + keys(st.key, st.n) + (st.far ? (touchSeen ? '' : ' flip') + ' up to the strip' : ' turn out to the strip');
  }
  return '';
}

// ---------- tutorial: the run freezes at each obstacle until the right key is pressed ----------
const keyHtml = k => touchSeen ? ({ L: '\u25C0', R: '\u25B6', F: 'Flip', J: 'Jump' })[k] : esc(labelFor(actionForMove(k)));
const MOVE = { L: 'turn', R: 'turn', F: 'flip', J: 'jump' };
const moveWord = k => touchSeen && (k === 'F' || k === 'J') ? '' : ' ' + MOVE[k];   // on touch the label already says Flip or Jump
// Outside the tutorial: the first two times a kind of obstacle comes up, say what it is and which key answers it.
function coach() {
  const ev = track.events, z = runner.z;
  while (coachI < ev.length && (ev[coachI].opt || ev[coachI].z1 + 1 < z || pace.hit[coachI])) coachI++;
  const e = ev[coachI], g = e && GROUP[e.kind], T = g && TYPES[g], tip = $('tip');
  let key = null, html = '';
  if (T && T[2] && (stats.know[g] | 0) < 2 && z >= e.z0 - track.speedAt(z) * 1.5) { key = e; html = esc(T[0]) + ': <kbd>' + keyHtml(e.key) + '</kbd>' + moveWord(e.key); }
  else { html = riskTip(); key = html || null; }
  if (key) { if (coachOn !== key) { coachOn = key; tip.innerHTML = html; tip.className = 'tip coach'; tip.hidden = false; } }
  else if (coachOn) { coachOn = null; tip.hidden = true; }
}
function tipHtml(e) {
  if (touchSeen) return esc(e.tip.replace('Press {K}', 'Tap {K}').replace('press {K}', 'tap {K}')).replace('{K}', '<kbd>' + ({ L: '\u25C0', R: '\u25B6', F: 'Flip', J: 'Jump' })[e.key] + '</kbd>');
  return esc(e.tip).replace('{K}', '<kbd>' + esc(labelFor(actionForMove(e.key))) + '</kbd>');
}
function tutorialTick() {
  const ev = track.events, tip = $('tip');
  while (tutNote < track.notes.length && runner.z >= track.notes[tutNote].z - 7) { tip.innerHTML = esc(track.notes[tutNote].text); tip.className = 'tip'; tip.hidden = false; tutNote++; tutHide = runner.z + 12; }
  if (tutI >= ev.length) { if (runner.z > tutHide) tip.hidden = true; return false; }
  const e = ev[tutI];
  if (runner.z >= e.z0 - 7) { tip.innerHTML = tipHtml(e); tip.hidden = false; tutHide = e.z1 + 4; }
  else if (runner.z > tutHide) tip.hidden = true;
  const hold = runner.z >= e.z0 + (e.z1 - e.z0) * .4;
  if (hold && telCur && !telCur.th) telCur.th = performance.now();
  tip.className = 'tip' + (hold ? ' wait' : '');
  return hold;
}
let tutHide = 0;

function tick(dt) {
  if (state === 'play' && mode === 'tutorial') { frozen = tutorialTick(); if (frozen) return; }
  if (bot) bot.update(runner);
  runner.step(dt);
  if (state === 'menu') { if (runner.dead || runner.z > 700) startAttract(); }
  else if (state === 'play') {
    if (runner.dead) { state = 'dead'; deadT = 0; deathZ = runner.z; if (telCur) telCur.dz = runner.z; if (!calm()) { shake = 1; flash = .5; } }
    else if (runner.z >= track.end) onWin();
    else {
      if (mode !== 'tutorial') coach();
      const zn = track.Z[Math.floor(runner.z)] || 0;
      if (zn !== lastZone) { lastZone = zn; if (zn === 1) toast('Sprint'); else if (zn === 2) toast('Slow zone'); }
    }
  } else if (state === 'dead') { deadT += dt; if (deadT > .55) { if (opts.auto || mode === 'tutorial') { record(false); resumeCp = lastCp(); retry(); } else showFail(); } }
}

