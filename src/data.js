// ---------- feedback: a few words from the player, sent with the play data ----------
const NOTE_KINDS = [['idea', 'Suggestion'], ['bug', 'Problem'], ['other', 'Other']];
let noteKind = 'idea';
function buildNote() {
  const g = $('noteKind'); g.textContent = '';
  for (const [v, text] of NOTE_KINDS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-pressed', String(noteKind === v));
    b.addEventListener('click', () => { noteKind = v; buildNote(); $('noteText').focus(); });
    g.appendChild(b);
  }
  const full = telSess && telSess.notes && telSess.notes.length >= 10;
  $('noteInfo').textContent = !tel.on ? 'Recording is switched off, so nothing can be sent. Switch it on under Play data to send feedback.'
    : full ? 'That is ten notes this visit, which is the limit. Thank you.'
    : relayOn() ? 'It goes to the developer with your play data and is filed publicly, so leave out names and contact details. Up to 600 characters.'
    : telDb ? 'It is saved with your play data in this artifact’s storage. Up to 600 characters.'
    : 'This copy of the game cannot send anything: the note is kept in this browser and goes out with Play data > Copy or Download.';
  $('btnNoteSend').disabled = !tel.on || full;
}
function openNote() {
  if (state === 'play') setPause(true);
  buildNote(); $('noteDone').textContent = ''; openSheet('noteSheet'); $('noteText').focus();
}
function sendNote() {
  const text = $('noteText').value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 600);
  if (!text) { $('noteDone').textContent = 'Write a few words first.'; $('noteText').focus(); return; }
  if (!tel.on) return;
  const s = telSess || telSession(); if (!s.notes) s.notes = []; if (s.notes.length >= 10) return;
  // where the player was: the course, and how far into it
  const n = { t: Math.round((performance.now() - T0) / 1000), k: noteKind, x: text };
  if (mode != null) { n.m = telMode(); if (runner && track) n.pc = score(); }
  s.notes.push(n); telEv('note:' + noteKind); telSession(); saveTel(); telSync(); telSend(true);
  $('noteText').value = ''; buildNote();
  $('noteDone').textContent = relayOn() ? 'Sent. Thank you.' : telDb ? 'Saved. Thank you.' : 'Kept in this browser. Thank you.';
}

// ---------- play data sheet ----------
const kindName = k => k === 'floor' ? 'Open floor' : k === 'detour' ? 'Spark detour' : GROUP[k] && TYPES[GROUP[k]] ? TYPES[GROUP[k]][0] : k === 'other' ? 'Other' : k;
const courseName = m => m[0] === 'L' ? pad2(+m.slice(1)) + '  ' + (LEVELS[+m.slice(1) - 1] ? LEVELS[+m.slice(1) - 1].name : '') : m[0] === 'D' ? 'Daily ' + m.slice(1) : m === 'E' ? 'Endless' : 'Tutorial';
let dataArmed = false;
const dataExport = () => JSON.stringify({ eightfold: 'play-data', build: BUILD, exported: new Date().toISOString(), tune, sessions: tel.sessions, log: tel.log });
function buildData() {
  const log = tel.log, first = log.length ? new Date(log[0].t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  $('dataInfo').textContent = (tel.on ? 'Recording is on. ' : 'Recording is off. ') + log.length + (log.length === 1 ? ' attempt' : ' attempts') + ' kept in this browser' + (first ? ', the oldest from ' + first : '') + '. '
    + 'Each one notes where the run ended and on what, the time, score and sparks, every press and how early or late it came, pauses, and the frame rate; the visit as a whole notes the options in use, which screens were opened, and any error in the page. It is here for a while so the game can be tuned from real play. '
    + (telDb ? 'In this Claude artifact the same records are also saved to the artifact’s own storage, where Claude can read them when you ask it to tune the game.'
      : relayOn() ? 'While recording is on they are also sent to the game’s developer and filed in its public GitHub repository, with a random code kept in this browser (so your visits can be told from other players’), a rough description of the machine (browser and system by name, screen size and refresh rate, processor count, graphics card), the browser’s language, the site you came from and your country: no name, no address. Stop recording stops the sending; Erase clears this browser’s copy only.'
      : 'Nothing is sent anywhere: use Copy or Download to pass it on.');
  $('btnDataToggle').textContent = tel.on ? 'Stop recording' : 'Start recording';
  dataArmed = false; $('btnDataClear').textContent = 'Erase play data'; $('dataOut').hidden = true;
  const lv = {}, ob = {}, order = [];
  for (const r of log) {
    const a = lv[r.m] || (order.push(r.m), lv[r.m] = { n: 0, win: 0, ends: [], at: {} });
    a.n++; if (r.res === 'win') a.win++; else if (r.res === 'fall' || r.res === 'crash') { a.ends.push(r.pc); const k = kindName(r.k || 'floor'); a.at[k] = (a.at[k] || 0) + 1; (ob[k] || (ob[k] = { dead: 0, n: 0, f: 0, late: 0, min: 1e9 })).dead++; }
    for (const k in r.kk || {}) { const q = r.kk[k], o = ob[kindName(k)] || (ob[kindName(k)] = { dead: 0, n: 0, f: 0, late: 0, min: 1e9 }); o.n += q[0]; o.f += q[1] * q[0]; o.late += q[2]; if (q[4] < o.min) o.min = q[4]; }
  }
  const felt = {}; for (const x of tel.sessions) for (const [map, names] of [[x && x.fb, FEEL], [x && x.fun, FUN]]) for (const m in map || {}) { const t = (names.find(f => f[0] === map[m]) || [0, map[m]])[1]; (felt[m] || (felt[m] = [])).push(t); }
  const empty = (tb, cols) => { const tr = document.createElement('tr'); cell(tr, 'Nothing recorded yet'); for (let i = 1; i < cols; i++) cell(tr, ''); tb.appendChild(tr); };
  const a = $('dataLv'); a.textContent = ''; order.sort();
  for (const m of order) {
    const d = lv[m], tr = document.createElement('tr'), e = d.ends.slice().sort((x, y) => x - y), top = Object.keys(d.at).sort((x, y) => d.at[y] - d.at[x]).slice(0, 2);
    cell(tr, courseName(m)); cell(tr, String(d.n)); cell(tr, String(d.win), d.win ? 'done' : '');
    cell(tr, e.length ? e[e.length >> 1] + (m === 'E' ? ' m' : '%') : '—'); cell(tr, top.length ? top.map(k => k + ' ×' + d.at[k]).join(', ') : '—'); cell(tr, felt[m] ? felt[m].join(', ') : '—'); a.appendChild(tr);
  }
  if (!order.length) empty(a, 6);
  const b = $('dataOb'); b.textContent = ''; const keys = Object.keys(ob).sort((x, y) => ob[y].dead - ob[x].dead || ob[y].n - ob[x].n);
  for (const k of keys) {
    const o = ob[k], tr = document.createElement('tr');
    cell(tr, k); cell(tr, String(o.dead)); cell(tr, String(o.n)); cell(tr, o.n ? Math.round(o.f / o.n) + '%' : '—');
    cell(tr, o.n ? Math.round(100 * o.late / o.n) + '%' : '—'); cell(tr, o.n && o.min < 1e9 ? o.min + ' ms' : '—'); b.appendChild(tr);
  }
  if (!keys.length) empty(b, 6);
}

