// ================= HUD + menu =================
let lastFlags = -1, lastProg = '', lastSlow = -1;
const lastTag = {};
// a tag for something that runs out: it is shown while time is left, counts down in tenths and empties as it goes
function timerTag(id, label, left, total) {
  const n = left > 0 ? Math.ceil(left * 10) : 0; if (n === lastTag[id]) return; lastTag[id] = n;
  const el = $(id); el.hidden = !n; if (!n) return;
  el.textContent = label + ' ' + (n / 10).toFixed(1); el.style.setProperty('--f', Math.min(100, n / total * 10).toFixed(1) + '%'); el.classList.toggle('last', n <= 10);
}
const EL = {};
for (const id of ['hudPc', 'hudSp', 'hudTm', 'hudPts', 'tgBoost', 'prog', 'tgShield', 'tgSlow', 'pad']) EL[id] = $(id);
let lastPts = '', lastBoost = -1, lastPerf = -1;
function hud() {
  if (state === 'menu' || state === 'brief') { if (lastFlags !== 0) { lastFlags = 0; $('pad').hidden = true; } return; }
  const endless = track.end === Infinity, s = score(), txt = endless ? s + ' m' : s + '%';
  if (txt !== lastPc) { lastPc = txt; EL.hudPc.textContent = txt; }
  const sp = '◆ ' + (endless ? runner.sparks : runner.sparks + '/' + track.nSparks);
  if (sp !== lastSp) { lastSp = sp; EL.hudSp.textContent = sp; }
  const tm = fmtT(runT); if (tm !== lastTm) { lastTm = tm; EL.hudTm.textContent = tm; }
  const pts = mode === 'tutorial' ? '' : fmtN(tally(false).total) + ' pts'; if (pts !== lastPts) { lastPts = pts; EL.hudPts.textContent = pts; }
  const ps = pace.streak > 0 && performance.now() - perfAt < 1600 ? pace.streak : 0;
  if (ps !== lastPerf) { const el = $('tgPerf'); lastPerf = ps; el.hidden = !ps; if (ps) { el.textContent = ps > 1 ? 'Perfect \u00D7' + ps : 'Perfect'; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
  const bp = mode === 'tutorial' ? 0 : Math.round(pace.gain() * 100); if (bp !== lastBoost) { const up = bp > lastBoost; lastBoost = bp; EL.tgBoost.hidden = !bp; EL.tgBoost.textContent = '+' + bp + '% speed'; if (bp && up) { EL.tgBoost.classList.remove('bump'); void EL.tgBoost.offsetWidth; EL.tgBoost.classList.add('bump'); } }
  const flags = (runner.shield ? 1 : 0) | (pace.slowT > 0 ? 2 : 0) | (touchSeen && (state === 'play' || state === 'dead') ? 4 : 0);
  if (flags !== lastFlags) { lastFlags = flags; EL.tgShield.hidden = !(flags & 1); EL.tgSlow.hidden = !(flags & 2); EL.pad.hidden = !(flags & 4); }
  timerTag('tgMag', 'Magnet', runner.mag, POWER.magnet); timerTag('tgDbl', 'Double', runner.dbl, POWER.double);
  const sl = pace.slowT > 0 ? Math.ceil(pace.slowT * 10) : 0;   // tenths of a second of slow-mo left
  if (sl !== lastSlow) { lastSlow = sl; if (sl) { EL.tgSlow.textContent = 'Slow-mo ' + (sl / 10).toFixed(1); EL.tgSlow.style.setProperty('--f', Math.min(100, sl / PACE.slowSecs * 10).toFixed(1) + '%'); EL.tgSlow.classList.toggle('last', sl <= 10); } }
  const top = stats.endless[0] ? stats.endless[0].m : 0;
  const pr = (endless ? clamp(runner.z / Math.max(80, top), 0, 1) : clamp(runner.z / track.end, 0, 1)).toFixed(3);
  if (pr !== lastProg) { lastProg = pr; EL.prog.style.transform = 'scaleX(' + pr + ')'; }
}
const TAG = 'Eight walls, one way through. Turn the tunnel, jump, flip to the far wall, and do not fall out.';
function menuRow(id, n, name, meta, done, onClick, cls, locked, hint) {
  const li = document.createElement('li'), b = document.createElement('button');
  b.type = 'button'; b.className = 'lv' + (cls ? ' ' + cls : ''); b.id = id; b.disabled = !!locked;
  b.innerHTML = '<span class="n"></span><span class="nm"></span><span class="bs' + (done ? ' done' : '') + '"></span>';
  b.children[0].textContent = n; b.children[1].textContent = name; b.children[2].textContent = meta;
  b.addEventListener('click', onClick); li.appendChild(b); $('levels').appendChild(li);
  if (hint) { const on = () => { $('tagline').textContent = hint; }, off = () => { $('tagline').textContent = TAG; }; li.addEventListener('mouseenter', on); li.addEventListener('mouseleave', off); b.addEventListener('focus', on); b.addEventListener('blur', off); }
}
function buildMenu() {
  $('telNote').hidden = !relayOn(); $('verNote').textContent = 'Version ' + BUILD + ' \u00B7 engine ' + CORE_ID;
  $('levels').textContent = '';
  $('tagline').textContent = TAG;
  menuRow('lvTut', '?', 'How to play', stats.tut ? 'done' : 'start here', !!stats.tut, startTutorial, 'alt', false, 'Every move, one at a time. The run waits for you at each obstacle.');
  LEVELS.forEach((lv, i) => {
    const st = stats.lv[i] || { best: 0, clears: 0, sparks: 0 }, open = unlocked(i);
    const meta = !open ? 'clear ' + pad2(i) + ' to unlock' : st.clears ? '★ ' + (st.time ? fmtT(st.time) : 'cleared') + (st.score ? ' · ' + fmtN(st.score) + ' pts' : '') + (st.perfect ? ' · ◆' : '') : st.best ? st.best + '%' + (st.score ? ' · ' + fmtN(st.score) + ' pts' : '') : '—';
    menuRow('lv' + (i + 1), pad2(i + 1), lv.name, meta, st.clears > 0, () => startLevel(i), '', !open, lv.hint);
  });
  const top = stats.endless[0];
  menuRow('lvEndless', '∞', 'Endless', top ? top.m + ' m' : '—', false, () => startEndless(), 'alt', false, 'No finish line. One course, the same for everyone: how far can you get?');
  const d = dailyS();
  menuRow('lvDaily', '☀', 'Daily · ' + today().label, d.cleared ? 'cleared' : d.best ? d.best + '%' : '—', !!d.cleared, () => startDaily(), 'alt', false, DAILY.hint + ' Sixty seconds, a bit of everything.');
}
function soundLabel() { $('btnSound').textContent = Snd.muted ? 'Sound off' : 'Sound on'; $('btnSound').setAttribute('aria-pressed', String(!Snd.muted)); }
function toggleSound() { Snd.setMuted(!Snd.muted); soundLabel(); telEv(Snd.muted ? 'mute' : 'unmute'); }

// ---------- scores sheet ----------
let overlay = null, wipeArmed = false;
function openSheet(id) { telEv('open:' + id.replace('Sheet', '')); overlay = id; $(id).hidden = false; $(id).scrollTop = 0; const b = $(id).querySelector('header button'); if (b) b.focus(); }
function closeSheet() { if (!overlay) return; if (overlay === 'tuneSheet') return closeTune(false); if (overlay === 'boardSheet' && stats.name) postAll(); $(overlay).hidden = true; overlay = null; listening = null; if (state === 'menu') buildMenu(); else if (state === 'pause') $('btnResume').focus(); else if (state === 'brief') $('btnGo').focus(); }
function cell(tr, t, cls) { const td = document.createElement('td'); td.textContent = t; if (cls) td.className = cls; tr.appendChild(td); }
function buildScores() {
  const tb = $('scoreBody'); tb.textContent = '';
  LEVELS.forEach((lv, i) => {
    const st = stats.lv[i] || { best: 0, clears: 0, tries: 0, sparks: 0 }, tr = document.createElement('tr');
    cell(tr, pad2(i + 1) + '  ' + lv.name);
    cell(tr, st.clears ? 'cleared' : st.best ? st.best + '%' : '—', st.clears ? 'done' : '');
    cell(tr, st.score ? fmtN(st.score) : '—'); cell(tr, st.time ? fmtT(st.time) : '—');
    cell(tr, st.sparks + '/' + TOTALS[i] + (st.perfect ? ' ★' : ''), st.perfect ? 'done' : '');
    cell(tr, String(st.clears)); cell(tr, String(st.tries)); tb.appendChild(tr);
  });
  const eb = $('endBody'); eb.textContent = '';
  if (!stats.endless.length) { const tr = document.createElement('tr'); cell(tr, 'No runs yet'); cell(tr, ''); cell(tr, ''); cell(tr, ''); cell(tr, ''); eb.appendChild(tr); }
  stats.endless.forEach((r, i) => { const tr = document.createElement('tr'); cell(tr, '#' + (i + 1)); cell(tr, r.m + ' m', i === 0 ? 'done' : ''); cell(tr, r.pts ? fmtN(r.pts) : '—'); cell(tr, String(r.sp || 0)); cell(tr, r.d || ''); eb.appendChild(tr); });
  const d = dailyS();
  $('dailyText').textContent = 'Today (' + today().label + '): ' + (d.cleared ? 'cleared' : d.best ? 'best ' + d.best + '%' : 'not played') + ', ' + (d.tries || 0) + ' attempts. Streak of days cleared: ' + (stats.daily.streak && (stats.daily.last === d.date || stats.daily.last === dayBefore(d.date)) ? stats.daily.streak : 0) + '.';
  if (d.score) $('dailyText').textContent += ' Best score today: ' + fmtN(d.score) + (d.time ? ', best time ' + fmtT(d.time) : '') + '.';
  $('dailyText').textContent += ' Sparks collected in total: ' + (stats.total || 0) + '.';
  wipeArmed = false; $('btnWipe').textContent = 'Erase scores';
}

// ---------- controls sheet ----------
let listening = null;
function buildControls() {
  const box = $('keys'); box.textContent = '';
  for (const [a, label] of ACTIONS) {
    const l = document.createElement('span'); l.className = 'lab'; l.textContent = label; box.appendChild(l);
    for (let s = 0; s < 2; s++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'bind'; b.textContent = keyLabel(opts.binds[a][s]);
      b.setAttribute('aria-label', label + ', key ' + (s + 1) + ': ' + keyLabel(opts.binds[a][s]));
      b.addEventListener('click', () => { buildControls(); listening = { a, s }; const nb = $('keys').querySelectorAll('.bind')[ACTIONS.findIndex(x => x[0] === a) * 2 + s]; nb.className = 'bind listen'; nb.textContent = 'press a key'; nb.focus(); });
      box.appendChild(b);
    }
  }
  const rows = $('optrows'); rows.textContent = '';
  const seg = (label, key, choices) => {
    const l = document.createElement('span'); l.textContent = label; rows.appendChild(l);
    const g = document.createElement('span'); g.className = 'seg'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
    for (const [val, text] of choices) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-pressed', String(opts[key] === val));
      b.addEventListener('click', () => { opts[key] = val; saveOpts(); telEv('opt:' + key + '=' + val); buildControls(); if (key === 'quality') { qScale = 1; resize(); } });
      g.appendChild(b);
    }
    rows.appendChild(g);
  };
  const slider = (label, key) => {
    const l = document.createElement('label'); l.textContent = label; l.htmlFor = 'opt-' + key; rows.appendChild(l);
    const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 100; r.step = 5; r.value = opts[key]; r.id = 'opt-' + key;
    r.addEventListener('input', () => { opts[key] = +r.value; saveOpts(); Snd.levels(); });
    r.addEventListener('change', () => telEv('opt:' + key + '=' + r.value));
    rows.appendChild(r);
  };
  seg('Turn keys', 'invert', [[false, 'Move the ball'], [true, 'Spin the tunnel']]);
  seg('Game speed', 'speed', [[1, '100%'], [.75, '75% practice']]);
  seg('Checkpoints', 'cp', [[false, 'Off'], [true, 'On (practice)']]);
  seg('After a fall', 'auto', [[false, 'Show result'], [true, 'Restart at once']]);
  seg('Levels', 'unlockAll', [[false, 'Unlock by clearing'], [true, 'All unlocked']]);
  seg('Level briefing', 'brief', [[true, 'Show'], [false, 'Skip']]);
  seg('Move hints on the floor', 'cues', [[true, 'Show'], [false, 'Hide']]);
  seg('Effects', 'calm', [[false, 'Full'], [true, 'Calm']]);
  seg('Graphics', 'quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']]);
  slider('Music volume', 'music'); slider('Effects volume', 'sfx');
  {   // ball styles: collecting sparks unlocks them
    const total = stats.total || 0, l = document.createElement('span'); l.textContent = 'Runner (' + total + ' sparks collected so far)'; rows.appendChild(l);
    const g = document.createElement('span'); g.className = 'seg'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Runner style');
    for (const [id, name, need] of SKINS) {
      const b = document.createElement('button'); b.type = 'button'; b.disabled = total < need; b.textContent = total < need ? name + ' \u25C6' + need : name;
      b.setAttribute('aria-pressed', String(skin() === id));
      b.addEventListener('click', () => { opts.skin = id; saveOpts(); telEv('opt:skin=' + id); buildControls(); });
      g.appendChild(b);
    }
    rows.appendChild(g);
  }
}
function setBind(k) {
  const { a, s } = listening; listening = null; telEv('bind:' + a);
  if (k !== 'Escape') {
    if (k === 'Backspace' || k === 'Delete') opts.binds[a][s] = null;
    else { for (const x in opts.binds) opts.binds[x] = opts.binds[x].map(v => v === k ? null : v); opts.binds[a][s] = k; }
    saveOpts();
  }
  buildControls();
}

// ---------- tuning drawer ----------
// It sits beside the tunnel rather than over it, with the run paused, so camera changes show as you drag.
let tuneFrom = null, tuneDirty = false, tuneTouched = false;
const fmtTune = (unit, v) => unit === 'x' ? '×' + v.toFixed(2) : unit === 's' ? v.toFixed(3).replace(/0$/, '') + ' s' : unit === '%' ? '+' + Math.round(v * 100) + '%' : String(+v.toFixed(3));
function tuneText() { $('tuneOut').value = JSON.stringify({ eightfold: 'tuning', build: BUILD, changed: tuneDiff(), all: tune }); }
// can the built-in pilot still finish every level, pressing early, on time and late?
function tuneCheck() {
  const bad = [], el = $('tuneCheck');
  LEVELS.forEach((lv, i) => {
    let ok = true;
    try {
      const tr = new Track(lv.seed, lv);
      for (const f of [.05, .5, .95]) {
        const r = new Runner(tr), b = new Bot(tr, f, false); let g = 0;
        while (r.z < tr.end + 1 && !r.dead && g++ < 4e5) { b.update(r); r.step(1 / 240); }
        if (r.dead) { ok = false; break; }
      }
    } catch (e) { ok = false; }
    if (!ok) bad.push(i + 1);
  });
  el.className = bad.length ? 'bad' : 'ok';
  el.textContent = bad.length ? 'With these values level ' + bad.join(', ') + ' cannot be finished. Move jump, flip or turn back towards where they were.'
    : 'Checked: all ' + LEVELS.length + ' levels can be finished with these values.' + (tuneDirty ? ' The courses are laid out again for the new move times, so a run in progress starts over.' : '');
  return !bad.length;
}
function buildTune() {
  const box = $('tuneRows'); box.textContent = '';
  for (const t of TUNE) {
    if (typeof t === 'string') { const h = document.createElement('h3'); h.textContent = t; box.appendChild(h); continue; }
    const [key, label, min, max, step, def, unit, kind, hint] = t, id = 'tu-' + key;
    const l = document.createElement('label'), o = document.createElement('output'), r = document.createElement('input'), sm = document.createElement('small');
    l.htmlFor = id; l.textContent = label; r.type = 'range'; r.id = id; r.min = min; r.max = max; r.step = step; r.value = tune[key]; sm.textContent = hint;
    const show = () => { o.textContent = fmtTune(unit, tune[key]) + (tuneSame(key) ? '' : '  (was ' + fmtTune(unit, def) + ')'); o.className = tuneSame(key) ? 'same' : ''; };
    r.addEventListener('input', () => { tune[key] = +r.value; tuneTouched = true; if (kind === 'course') tuneDirty = true; applyTune(); show(); tuneText(); idleFor = 0; });
    r.addEventListener('change', () => { saveTune(); if (kind === 'course') tuneCheck(); });
    show(); box.appendChild(l); box.appendChild(o); box.appendChild(r); box.appendChild(sm);
  }
  tuneText(); tuneCheck();
}
function openTune() {
  if (overlay || !(state === 'menu' || state === 'play' || state === 'pause' || state === 'fail')) return false;
  tuneFrom = state; tuneTouched = false; telEv('open:tune');
  if (state === 'play') setPause(true);
  $('pausePanel').hidden = true; $('failPanel').hidden = true; $('menu').hidden = true;
  buildTune(); overlay = 'tuneSheet'; $('tuneSheet').hidden = false; $('tuneSheet').scrollTop = 0; $('btnCloseTune').focus(); idleFor = 0;
  return true;
}
// play: go straight into a run with the new values. Otherwise go back to where the drawer was opened from.
function closeTune(play) {
  if (overlay !== 'tuneSheet') return;
  $('tuneSheet').hidden = true; overlay = null; idleFor = 0; saveTune();
  if (pace && mode != null && mode !== 'tutorial') pace.base = opts.speed * tune.pace;
  if (tuneTouched) telTune();
  const dirty = tuneDirty; tuneDirty = false;
  if (state === 'menu') {
    if (play) { startLevel(unlocked(store.get('last', 0) | 0) ? store.get('last', 0) | 0 : 0, true); return; }
    if (dirty) startAttract();
    buildMenu(); $('menu').hidden = false; return;
  }
  if (dirty) {   // move times changed: the course is laid out again for them, and the run starts over
    if (state === 'pause') record(false);
    track = new Track(track.seed, track.level); resumeCp = null; Snd.wake(); begin(false); return;
  }
  if (state === 'fail') { if (play) retry(); else { $('failPanel').hidden = false; $('btnRetry').focus(); } return; }
  if (play || tuneFrom === 'play') setPause(false); else { $('pausePanel').hidden = false; $('btnResume').focus(); }
}
function copyText(text, area, btn, label) {   // clipboard if allowed; otherwise show the text selected, ready to copy by hand
  const done = ok => { btn.textContent = ok ? 'Copied' : 'Select all and copy'; setTimeout(() => { btn.textContent = label; }, 1800); };
  const byHand = () => { area.hidden = false; area.value = text; area.focus(); area.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} done(ok); };
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), byHand); else byHand(); } catch (e) { byHand(); }
}

