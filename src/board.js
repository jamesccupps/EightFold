// ---------- leaderboard ----------
// A run that beats what this player has already posted is sent to the relay with its presses. It is played back on the
// real engine before it is listed, so what the boards show is what the presses really give.
// The best run not yet on its board is kept in this browser, whole, until the relay has taken it: it survives a missing
// name, a busy relay, a dropped connection and a closed tab, and is sent again until it lands.
let lastRun = null, boardsData = null, boardsAt = 0, boardSel = 'E';
const fmtTime = t => t.toFixed(2) + ' s';
const LEVEL_CS = [], levelCs = i => LEVEL_CS[i] || (LEVEL_CS[i] = new Track(LEVELS[i].seed, LEVELS[i]).checksum());
// the board a run on the current course goes on, or null (a random Endless course and the tutorial have none)
const modeBoard = () => typeof mode === 'number' ? 'L' + (mode + 1) : mode === 'daily' ? 'D' + today().key : mode === 'endless' && track && track.rankDay ? 'E' + track.rankDay : null;
const boardLabel = id => id[0] === 'L' ? 'Level ' + (+id.slice(1)) : id[0] === 'D' ? 'Daily' : 'Endless';
const boardWhen = id => id[0] === 'L' ? 'clear' : id[0] === 'E' ? 'run' : 'today';
const showV = (id, v) => id[0] === 'E' ? fmtN(v) + ' m' : fmtTime(v);
const beats = (far, v, pts, o) => far ? v > o.v || (v === o.v && pts > (o.pts | 0)) : v < o.v || (v === o.v && pts > (o.pts | 0));   // further, or faster; points settle a tie
const postBusy = {}, postWhy = {}, postMsg = {}; let postTimer = 0, postFails = 0;
// runs kept for a course that has since changed, or for a daily course whose day is over, are let go
function prunePending() {
  const t = today().key; let cut = false;
  for (const id in stats.pending) {
    const q = stats.pending[id], n = +id.slice(1) - 1;
    if (!(q && q.run && (id[0] === 'L' ? LEVELS[n] && q.cs === levelCs(n) : id.slice(1) === (id[0] === 'E' ? ENDLESS.key : t)))) { delete stats.pending[id]; cut = true; }
  }
  if (cut) saveStats();
}
// a run has just ended: if it is this player's best on its board, keep it; post it at once if they have a name
function keepBest() {
  const run = lastRun, id = modeBoard();
  if (!id || !run || !relayUp() || !scored() || !run.tr || run.pr * 2 !== run.tr.length) return;
  const far = id[0] === 'E';
  if (far ? !(run.res === 'fall' || run.res === 'crash') || run.z < 30 : run.res !== 'win') return;
  const v = far ? run.z : run.d, pts = run.pts | 0, was = stats.posted[id], pen = stats.pending[id];
  if ((was && was.cs === run.cs && !beats(far, v, pts, was)) || (pen && pen.cs === run.cs && !beats(far, v, pts, pen))) return;
  stats.pending[id] = { v, pts, cs: run.cs, run }; postWhy[id] = ''; saveStats();
  if (stats.name) postBest(id);
}
function postBest(id) {
  const q = stats.pending[id];
  if (!q || !stats.name || !relayUp() || postBusy[id]) return;
  const name = stats.name; postBusy[id] = true; postUi();
  // ok: it is filed. final: the relay will never take this run, so it is let go. Otherwise it keeps, and is sent again.
  const end = (ok, why, final) => {
    postBusy[id] = false;
    if (ok) {
      stats.posted[id] = { cs: q.cs, v: q.v, pts: q.pts }; if (stats.pending[id] === q) delete stats.pending[id];
      postMsg[id] = 'Posted as ' + name + ': ' + showV(id, q.v) + '. It shows once it has been checked, in about a minute. ';
      postWhy[id] = ''; postFails = 0; saveStats(); telEv('post:' + id); boardsAt = 0;
      if (stats.pending[id]) postBest(id);   // a better run finished while this one was on its way
    } else if (final) {
      if (stats.pending[id] === q) delete stats.pending[id];
      postMsg[id] = 'Could not post this run' + (why ? ': ' + why : '') + '.'; postWhy[id] = ''; saveStats(); telEv('postno:' + id);
    } else {
      postWhy[id] = why || 'no answer'; postFails++; telEv('postwait:' + id);
      if (!postTimer && postFails <= 8) postTimer = setTimeout(() => { postTimer = 0; postAll(); }, [4, 10, 25, 60, 120, 300, 600, 900][postFails - 1] * 1000);
    }
    postUi();
  };
  try {
    fetch(relayUrl('score'), { method: 'POST', body: JSON.stringify({ v: 1, board: id, name, pid: tel.pid, core: CORE_ID, run: q.run, test: location.hash === '#test' || undefined }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
      .then(r => r.ok ? end(true) : r.json().then(j => (j && j.error) || '', () => '').then(why => end(false, why, r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429)), () => end(false, 'no connection'));
  } catch (e) { end(false, ''); }
}
function postAll() { prunePending(); for (const id in stats.pending) postBest(id); }
// redraw whatever is showing the state of a post, unless the player is in the middle of typing a name into it
function postUi() {
  if (!(document.activeElement && document.activeElement.id === 'postName')) { if (state === 'fail') postRow($('failPost')); else if (state === 'win') postRow($('winPost')); }
  if (overlay === 'boardSheet') drawPending();
}
// the line on the result screen: where this course's best unposted run stands
function postRow(el) {
  el.textContent = ''; el.hidden = true;
  const id = modeBoard(); if (!id || !relayUp()) return;
  const q = stats.pending[id];
  const say = (text, label, fn) => {
    el.hidden = false; el.textContent = text; if (!label) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = label; b.addEventListener('click', fn); el.appendChild(b);
  };
  if (!q) { if (postMsg[id]) say(postMsg[id], postMsg[id].indexOf('Posted') === 0 ? 'Leaderboard' : '', () => openBoard(id)); return; }
  if (!stats.name) {   // no name yet: ask, on every result screen, until the run is posted or beaten
    el.hidden = false;
    const mine = lastRun && lastRun.s === q.run.s && lastRun.i === q.run.i;
    const l = document.createElement('label'); l.htmlFor = 'postName';
    l.textContent = mine ? showV(id, q.v) + '. Put it on the leaderboard as ' : 'Your best ' + boardWhen(id) + ', ' + showV(id, q.v) + ', is not on the leaderboard yet. Put it there as ';
    const inp = document.createElement('input'); inp.id = 'postName'; inp.className = 'nm3'; inp.maxLength = 8; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', 'Up to eight letters or digits');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn sm'; btn.id = 'btnPost'; btn.textContent = 'Post';
    btn.addEventListener('click', () => { const n = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); if (!n) { inp.focus(); return; } stats.name = n; saveStats(); inp.blur(); postAll(); postUi(); });
    el.appendChild(l); el.appendChild(inp); el.appendChild(btn);
    return;
  }
  if (postBusy[id]) say('Posting ' + showV(id, q.v) + ' to the leaderboard as ' + stats.name + '\u2026');
  else if (postWhy[id]) say('Not posted yet (' + postWhy[id] + '). Your ' + showV(id, q.v) + ' is kept and will be sent again. ', 'Try now', () => postBest(id));
  else postBest(id);
}
// on the leaderboard sheet: runs still waiting to go up
function drawPending() {
  const el = $('boardPend'); el.textContent = ''; prunePending();
  const ids = Object.keys(stats.pending); el.hidden = !ids.length || !relayUp(); if (el.hidden) return;
  const list = ids.map(id => boardLabel(id) + ' ' + showV(id, stats.pending[id].v)).join(', '), busy = ids.some(id => postBusy[id]), why = ids.map(id => postWhy[id]).find(Boolean);
  el.textContent = busy ? 'Posting: ' + list + '\u2026' : !stats.name ? 'Not on the boards yet: ' + list + '. Enter a name above, then ' : why ? 'Not posted yet (' + why + '): ' + list + '. It is kept and will be sent again. ' : 'Waiting to be posted: ' + list + '. ';
  if (busy) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.id = 'btnPostAll'; b.textContent = 'Post'; el.appendChild(b);
  b.addEventListener('click', () => { if (!stats.name) { $('boardName').focus(); return; } postAll(); drawPending(); });
}
const BOARD_TABS = () => LEVELS.map((lv, i) => ['L' + (i + 1), pad2(i + 1)]).concat([['D', 'Daily'], ['E', 'Endless']]);
function drawBoard() {
  const tabs = $('boardTabs'); tabs.textContent = '';
  for (const [id, text] of BOARD_TABS()) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-pressed', String(boardSel === id));
    if (id[0] === 'L') b.setAttribute('aria-label', 'Level ' + (+id.slice(1)) + ': ' + LEVELS[+id.slice(1) - 1].name);
    b.addEventListener('click', () => { boardSel = id; drawBoard(); });
    tabs.appendChild(b);
  }
  const far = boardSel === 'E', key = far ? 'E' + ENDLESS.key : boardSel.length === 1 ? boardSel + today().key : boardSel, rows = boardsData && boardsData.boards ? boardsData.boards[key] || [] : null;
  $('boardInfo').textContent = !relayUp() ? 'The leaderboard is on the public game, at jamesccupps.github.io/EightFold.'
    : far ? 'Endless: how far you got. One course, the same every day, so this board does not start again each morning. Ties go to points.'
    : boardSel === 'D' ? 'Daily course, ' + today().label + ': fastest clear.'
    : 'Level ' + (+boardSel.slice(1)) + ', ' + LEVELS[+boardSel.slice(1) - 1].name + ': fastest clear.';
  const head = $('boardHead'); head.textContent = ''; for (const h of ['#', 'Name', far ? 'Distance' : 'Time', 'Perfects', 'Points']) { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); }
  const body = $('boardBody'); body.textContent = '';
  const line = t => { const tr = document.createElement('tr'); cell(tr, ''); cell(tr, t); cell(tr, ''); cell(tr, ''); cell(tr, ''); body.appendChild(tr); };
  if (!relayUp()) line('—');
  else if (!rows) line(boardsData === false ? 'The boards could not be reached. Try again in a moment.' : 'Fetching…');
  else if (!rows.length) line('Nobody yet. ' + (far ? 'Play Endless to be first.' : 'Clear it to be first.'));
  else {
    const same = {}; for (const e of rows) same[e.n] = (same[e.n] || 0) + 1;   // names are not reserved: two players with the same one each get a short tag
    rows.forEach((e, i) => {
    const tr = document.createElement('tr'), me = !!meTag && e.p === meTag; if (me) tr.className = 'me';
    cell(tr, String(i + 1)); cell(tr, String(e.n) + (same[e.n] > 1 ? ' \u00B7' + String(e.p).slice(0, 3) : '') + (me ? ' (you)' : '')); cell(tr, far ? (e.m | 0) + ' m' : fmtTime(+e.t)); cell(tr, String(e.pf | 0)); cell(tr, fmtN(e.pts | 0)); body.appendChild(tr);
    });
  }
  const mine = stats.posted[key];
  $('boardNote').textContent = (mine ? 'Your best posted here: ' + showV(key, mine.v) + '. ' : '')
    + 'Only a run that beats your own best is posted. Each one is played back from its presses before it is listed, which takes about a minute: that checks the run, not who pressed the keys. '
    + 'Each browser gets one row per board: changing your name relabels your later runs, it does not add a row. Names are not reserved, so two players can pick the same letters; when they do, a short code after the name tells them apart. A board starts again when its course changes.'
    + (tel.on ? '' : ' Recording is off, so runs are not posted: switch it on under Play data.');
  const nm = $('boardName'); if (document.activeElement !== nm) nm.value = stats.name;
  drawPending();
}
function loadBoards() {
  if (!relayUp()) return;
  if (boardsData && performance.now() - boardsAt < 20000) return;
  boardsAt = performance.now();
  try { fetch(relayUrl('boards')).then(r => r.json()).then(j => { boardsData = j && j.boards ? j : { boards: {} }; if (overlay === 'boardSheet') drawBoard(); }, () => { if (!boardsData) boardsData = false; if (overlay === 'boardSheet') drawBoard(); }); } catch (e) { boardsData = false; }
}
function openBoard(id) {
  if (state === 'play') setPause(true);
  if (id) boardSel = id[0] === 'L' ? id : id[0]; else if (typeof mode === 'number') boardSel = 'L' + (mode + 1); else if (mode === 'daily') boardSel = 'D'; else if (mode === 'endless') boardSel = 'E';
  if (boardsData === false) boardsData = null;
  drawBoard(); openSheet('boardSheet'); loadBoards();
}

