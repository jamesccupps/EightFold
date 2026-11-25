// ================= input =================
function act(m, src, ts) {   // m: 'L' | 'R' | 'F' | 'J'; src: 0 keyboard, 1 touch on the tunnel, 2 on-screen button, 3 mouse; ts: when the key or touch happened
  if (state !== 'play') return;
  lastPress = { m, z: runner.z, at: performance.now() };
  if (telCur && ts > 0) { const nowMs = performance.now(), d = nowMs - ts; if (d >= 0 && d < 2000) { const q = telCur.il; q[0]++; q[1] += d; if (d > q[2]) q[2] = d; if (telCur.iq.length < 8) telCur.iq.push(nowMs); } }
  if (mode === 'tutorial') {
    const e = track.events[tutI];
    const c = telCur; if (c) { c.pr++; c.inp[src | 0]++; }
    if (e && m === e.key && runner.z >= e.z0) {
      if (c && c.tt.length < 90) c.tt.push(tutI, c.th ? Math.round(performance.now() - c.th) : 0, c.tw);
      if (c) { c.tw = 0; c.th = 0; }
      runner.press(m); tutI++; frozen = false;
    } else if (c) c.tw++;
    return;
  }
  const hit = pace.press(m, runner.z);
  if (hit) {
    const g = !hit.e.opt && GROUP[hit.e.kind]; if (g) stats.know[g] = Math.min(9, (stats.know[g] | 0) + 1);
    if (hit.perfect) { perfAt = performance.now(); perfFlash = 1; kick = Math.max(kick, .8); Snd.fx('perfect'); }
  }
  telPress(m, src, hit); runner.press(m);
}
const turn = left => (left !== opts.invert) ? 'L' : 'R';
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = keyNorm(e);
  if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') {   // typing a name is typing, not playing
    if (k === 'Enter' && e.target.id === 'postName') { e.preventDefault(); const b = $('btnPost'); if (b) b.click(); }
    else if (k === 'Escape') e.target.blur();
    return;
  }
  if (listening) { e.preventDefault(); setBind(k); return; }
  if (overlay) { if (k === 'Escape' || (k === 't' && overlay === 'tuneSheet')) { e.preventDefault(); closeSheet(); } return; }
  // a keyboard set to another alphabet still has W, A, S, D where they always are: go by the key's place when its letter means nothing here
  const a = actionOf(k) || (k.length === 1 && k.charCodeAt(0) > 127 && /^Key[A-Z]$/.test(e.code || '') ? actionOf(e.code.slice(3).toLowerCase()) : null);
  if (k === 't' && a == null && !e.repeat && openTune()) { e.preventDefault(); return; }
  if (state === 'menu') { if (k.length === 1 && k >= '1' && k <= '8') startLevel(+k - 1); else if (a === 'sound') toggleSound(); return; }
  if (a === 'sound') { toggleSound(); return; }
  if (state === 'brief') { if (k === 'Escape') { e.preventDefault(); toMenu(); } else if ((k === 'Enter' || a === 'jump' || a === 'flip') && !e.repeat) { e.preventDefault(); go(); } return; }
  if (state === 'pause') { if (a === 'pause') { e.preventDefault(); setPause(false); } return; }
  if (state === 'win') {   // players are still pressing as they cross the line: a move key never leaves this screen, and Enter or jump only after a moment
    if (k === 'Escape') toMenu();
    else if (a === 'jump' || a === 'flip' || a === 'left' || a === 'right' || a === 'restart' || k === 'Enter' || k === ' ') { e.preventDefault(); if ((k === 'Enter' || a === 'jump') && !e.repeat && winT > .9 && !$('btnNext').hidden) $('btnNext').click(); }
    return;
  }
  if (state === 'fail') {
    if (k === 'Escape') { e.preventDefault(); toMenu(); }
    else if ((a === 'restart' || a === 'jump' || a === 'flip' || k === 'Enter') && !e.repeat) { e.preventDefault(); if (failT > .3) retry(); }
    else if (a === 'left' || a === 'right') e.preventDefault();
    return;
  }
  if (a === 'left' || a === 'right' || a === 'flip' || a === 'jump') { e.preventDefault(); if (!e.repeat) act(a === 'flip' ? 'F' : a === 'jump' ? 'J' : turn(a === 'left'), 0, e.timeStamp); return; }
  if (a === 'pause') { e.preventDefault(); setPause(true); }
  else if (a === 'restart' && !e.repeat && state === 'play') { record(false); retry(true); }
});
let ptr = null;
cv.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touchSeen = true; if (state === 'menu' || overlay) return; ptr = { x: e.clientX, y: e.clientY, t: performance.now(), done: false, touch: e.pointerType === 'touch' }; Snd.wake(); });
cv.addEventListener('pointermove', e => {
  if (!ptr || ptr.done) return;
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
  if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
  ptr.done = true; act(Math.abs(dx) > Math.abs(dy) ? turn(dx < 0) : dy < 0 ? 'F' : 'J', ptr.touch ? 4 : 3);
});
const ptrEnd = e => { if (ptr && !ptr.done && ptr.touch && performance.now() - ptr.t < 350) act(turn(e.clientX < W / 2), 1); ptr = null; };   // a tap turns; a mouse click (to bring the window forward, say) does not
cv.addEventListener('pointerup', ptrEnd);
cv.addEventListener('pointercancel', () => { ptr = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());

const on = (id, fn) => $(id).addEventListener('click', fn);
on('btnSound', e => { toggleSound(); e.currentTarget.blur(); });
for (const b of $('pad').querySelectorAll('button')) b.addEventListener('pointerdown', e => { e.preventDefault(); const m = b.dataset.m; act(m === 'flip' ? 'F' : m === 'jump' ? 'J' : turn(m === 'left'), 2); });
on('btnFull', e => {
  const b = e.currentTarget; b.blur();
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => { b.hidden = true; }); }
  } catch (err) { b.hidden = true; }
});
document.addEventListener('click', e => { const b = e.target && e.target.closest ? e.target.closest('button') : null; if (b && b.id) telEv('ui:' + b.id); }, true);
document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) { fullUsed = true; telEv('full'); } $('btnFull').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
on('btnPause', () => setPause(state !== 'pause'));
on('btnResume', () => setPause(false));
on('btnRestart', () => { Snd.wake(); record(false); retry(true); });
on('btnFromStart', () => retry(true));
on('btnQuit', toMenu); on('btnQuit2', toMenu); on('btnQuit3', toMenu);
on('btnRetry', () => { if (failT > .15) retry(); });
on('btnNew', () => startEndless(true, !!track.rankDay));
on('btnAgain', () => { if (mode === 'daily') startDaily(true); else if (mode === 'endless') startEndless(true); else startLevel(mode, true); });
on('btnGo', go); on('btnBack', toMenu);
on('btnNext', () => { if (winT < .5) return; if (mode === 'tutorial') startLevel(0); else startLevel(Math.min(LEVELS.length - 1, mode + 1)); });
on('btnScores', () => { buildScores(); openSheet('scoreSheet'); });
for (const id of ['btnGuide', 'btnGuide2', 'btnGuide3', 'btnGuide4']) on(id, openGuide);
on('btnCloseGuide', closeSheet); on('btnGuideTut', startTutorial);
on('btnGuideKeys', () => { $('guideSheet').hidden = true; overlay = null; buildControls(); openSheet('ctrlSheet'); });
on('btnControls', () => { buildControls(); openSheet('ctrlSheet'); });
on('btnControls2', () => { buildControls(); openSheet('ctrlSheet'); });
on('btnCloseScores', closeSheet); on('btnCloseCtrl', closeSheet);
on('btnDefaults', () => { opts.binds = cloneBinds(DEF_BINDS); saveOpts(); buildControls(); });
on('btnTut', startTutorial);
on('btnTune', () => { closeSheet(); openTune(); }); on('btnTune2', openTune);
on('btnCloseTune', () => closeTune(false)); on('btnTuneTry', () => closeTune(true));
on('btnTuneReset', () => { for (const t of TUNE) if (typeof t !== 'string' && !tuneSame(t[0])) { if (t[7] === 'course') tuneDirty = true; tuneTouched = true; tune[t[0]] = t[5]; } applyTune(); saveTune(); buildTune(); idleFor = 0; });
on('btnTuneCopy', e => { tuneText(); copyText($('tuneOut').value, $('tuneOut'), e.currentTarget, 'Copy values'); });
on('btnData', () => { $('ctrlSheet').hidden = true; overlay = null; buildData(); openSheet('dataSheet'); });
on('btnCloseData', closeSheet);
on('btnBoard', () => openBoard()); on('btnCloseBoard', closeSheet);
$('boardName').addEventListener('input', e => { const n = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); stats.name = n; saveStats(); drawPending(); });
$('boardName').addEventListener('keydown', e => { if (e.key === 'Enter' && stats.name) { e.target.blur(); postAll(); drawPending(); } });
for (const id of ['btnNote', 'btnNote2', 'btnNote3', 'btnNote4']) on(id, openNote);
on('btnCloseNote', closeSheet); on('btnNoteSend', sendNote);
on('btnDataCopy', e => copyText(dataExport(), $('dataOut'), e.currentTarget, 'Copy'));
on('btnDataSave', () => {
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([dataExport()], { type: 'application/json' })); a.download = 'eightfold-play-data.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (err) { $('dataOut').hidden = false; $('dataOut').value = dataExport(); $('dataOut').select(); }
});
if (window.claude) $('btnDataSave').hidden = true;   // Claude's artifact viewer does not allow downloads; Copy still works there
on('btnDataToggle', () => { tel.on = !tel.on; saveTel(); buildData(); $('telNote').hidden = !relayOn(); });
on('btnDataClear', () => {
  if (!dataArmed) { dataArmed = true; $('btnDataClear').textContent = 'Erase it all? Click again'; return; }
  tel.log = []; tel.sessions = []; tel.ack = {}; tel.ackn = {}; tel.pid = newPid(); tel.first = new Date().toISOString().slice(0, 10); tel.visits = 1; telSess = null; saveTel();   // a fresh player code too
  if (telDb) { try { Promise.resolve(telDb.collection('play').get()).then(q => { for (const d of (q && q.docs) || []) { try { telDb.doc('play/' + d.id).delete(); } catch (e) {} } }, () => {}); } catch (e) {} }
  buildData();
});
on('btnWipe', () => {
  if (!wipeArmed) { wipeArmed = true; $('btnWipe').textContent = 'Erase everything? Click again'; return; }
  stats = { lv: [], endless: [], daily: {}, know: {}, posted: {}, pending: {}, name: stats.name || '' }; saveStats(); store.set('best', null); buildScores();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { setPause(true); telEv('hide'); saveTel(); telSend(true); } else telEv('show'); });
window.addEventListener('blur', () => setPause(true));
window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touchSeen = true; }, true);
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => { if (state === 'play' || state === 'pause' || state === 'dead') telEnd('left'); telEv('leave'); saveTel(); telSend('bye'); });

