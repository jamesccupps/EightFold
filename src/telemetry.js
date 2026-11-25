// ---------- play recording (temporary: so the game can be tuned from how it is really played) ----------
// One small record per attempt: where it ended and on what, the time, sparks, how early or late each press came inside
// the window the course allows for it, and the frame rate. Kept in this browser; see the Play data sheet.
const BUILD = '2026-11-25' + '.' + '/*BUILDID*/', CORE_ID = '/*COREID*/';   // BUILD: the day, and a short id of exactly these sources that build.js stamps, so two different builds never carry one label. CORE_ID: which engine (generator + physics) this page was built from
// Where play records are sent from the public copy of the game: a small relay that files them in a repository of
// their own, jamesccupps/EightFold-data (see relay/ in this repository). Empty = nothing is sent.
let RELAY = 'https://eightfold-relay.jamesccupps.workers.dev/', relayAnywhere = false;
const relayUp = () => !!RELAY && (relayAnywhere || (location.protocol === 'https:' && !window.claude));   // this copy of the game can reach the relay
const relayOn = () => relayUp() && tel.on && !relayDead;
const relayUrl = what => RELAY.replace(/\/+$/, '') + '/' + what;
function browserName() {   // "Chrome 158" and "Windows": enough to tell machines apart, without the full browser string
  const u = String(navigator.userAgent || ''), m = u.match(/(Edg|OPR|Firefox|Chrome|CriOS|FxiOS)\/(\d+)/) || (/Safari/.test(u) && u.match(/(Version)\/(\d+)/));
  const names = { Edg: 'Edge', OPR: 'Opera', CriOS: 'Chrome', FxiOS: 'Firefox', Version: 'Safari' };
  return { br: m ? (names[m[1]] || m[1]) + ' ' + m[2] : 'Other',
    os: /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /CrOS/.test(u) ? 'ChromeOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Other' };
}
let tel = store.get('tel', null);
if (!tel || tel.v !== 1 || !Array.isArray(tel.log) || !Array.isArray(tel.sessions)) tel = { v: 1, on: true, sessions: [], log: [] };
for (const x of tel.sessions) if (x && x.ua) delete x.ua;
if (!tel.ack || typeof tel.ack !== 'object') tel.ack = {};         // per visit: how many attempts the relay has confirmed
if (!tel.ackn || typeof tel.ackn !== 'object') tel.ackn = {};      // per visit: how many feedback notes the relay has confirmed
const newPid = () => { let p = ''; while (p.length < 12) p += Math.floor(Math.random() * 36).toString(36); return p; };
if (typeof tel.pid !== 'string' || !/^[a-z0-9]{12}$/.test(tel.pid)) { tel.pid = newPid(); tel.first = new Date().toISOString().slice(0, 10); tel.visits = 0; tel.rot = 1; }
// Codes made before 2026-11-25 were filed as they were, in public. The relay now files only a hash, and each browser takes a fresh code once, so nothing already public can be used to post under anyone's row.
if (!tel.rot) { tel.pid = newPid(); tel.rot = 1; }
// what the relay files in place of the code: the start of it is how the board marks your own row
let meTag = '';
try { crypto.subtle.digest('SHA-256', new TextEncoder().encode('eightfold:' + tel.pid)).then(d => { meTag = [...new Uint8Array(d)].slice(0, 3).map(b => b.toString(16).padStart(2, '0')).join(''); }, () => {}); } catch (e) {}
tel.visits = (tel.visits | 0) + 1;
store.set('tel', tel);
const refHost = (() => { try { const h = new URL(document.referrer).hostname; return h && h !== location.hostname ? h.slice(0, 60) : ''; } catch (e) { return ''; } })();
// ---------- experiments ----------
// To find out which of two settings plays better, give each to part of the players and compare what the play data says.
// Each entry: { id: 'jump-1', variants: [{ name: 'a', tune: {} }, { name: 'b', tune: { jump: .48 } }] }. A player stays in
// one variant (chosen from their player code), its values become that player's defaults, their runs are scored as
// normal, and every visit records which variant it was. An empty list means no experiment is running.
const EXPERIMENTS = [];
const XP = {};   // experiment id -> the variant this player is in
{
  const hash = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
  const dev = store.get('xp', null);   // a list of the same shape under eightfold.xp in this browser's storage tries one out locally
  for (const x of (Array.isArray(dev) ? dev : EXPERIMENTS)) {
    if (!x || typeof x.id !== 'string' || !Array.isArray(x.variants) || !x.variants.length) continue;
    const v = x.variants[hash(tel.pid + ':' + x.id) % x.variants.length]; if (!v) continue;
    XP[x.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16)] = String(v.name).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
    for (const t of TUNE) if (typeof t !== 'string' && v.tune && typeof v.tune[t[0]] === 'number' && isFinite(v.tune[t[0]])) { TUNE0[t[0]] = clamp(v.tune[t[0]], t[2], t[3]); t[5] = TUNE0[t[0]]; }
  }
}
loadTune();
let firstFrame = 0;
const storageOk = (() => { try { localStorage.setItem('eightfold.ok', '1'); return localStorage.getItem('eightfold.ok') === '1'; } catch (e) { return false; } })();
function keysChanged() {   // which actions have keys other than the defaults, and what they are
  const out = [], nm = k => k == null ? '' : k === ' ' ? 'Space' : String(k).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'key';
  for (const [a] of ACTIONS) if (JSON.stringify(opts.binds[a]) !== JSON.stringify(DEF_BINDS[a])) out.push(a + ':' + nm(opts.binds[a][0]) + '|' + nm(opts.binds[a][1]));
  return out.join(',').slice(0, 240);
}
const SID = Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
let telCur = null, telSess = null, telDb = null, telBusy = false, telAgain = false, relayDead = false, relayAt = 0, relayTimer = 0;
const saveTel = () => store.set('tel', tel);
const T0 = performance.now();
let telSeq = 0, telLast = null, relayAck = 0, relayEv = 0, pauseAt = 0, fullUsed = false;
let evNews = 0, relayLen = 0, relayBusy = false, relayAgain = false, relayKey = '', relayFails = 0, telLater = 0;
// the visit: the machine in broad terms, the options in use, progress so far, and a trail of what was opened and started
function telSession() {
  if (!telSess) {
    const kept = store.get('tel', null); if (kept && typeof kept.pid === 'string' && /^[a-z0-9]{12}$/.test(kept.pid)) { tel.pid = kept.pid; tel.rot = 1; if (kept.first) tel.first = kept.first; }
  }
  if (!telSess) { telSess = { id: SID, t: Math.round(Date.now() / 1000), build: BUILD, core: CORE_ID, host: String(location.hostname || 'file').slice(0, 60), fun: {}, pid: tel.pid, vn: tel.visits, first: tel.first, ev: [], fb: {} }; if (refHost) telSess.ref = refHost; tel.sessions.push(telSess); if (tel.sessions.length > 30) tel.sessions.shift(); }
  const st = []; LEVELS.forEach((lv, i) => { const x = stats.lv[i] || {}; st.push(x.best || 0, x.clears || 0, x.tries || 0); });
  Object.assign(telSess, browserName(), { w: W, h: H, dpr: +(window.devicePixelRatio || 1).toFixed(2), touch: touchSeen, cores: navigator.hardwareConcurrency | 0, mem: +navigator.deviceMemory || 0,
    quality: opts.quality, qscale: +qScale.toFixed(2), speed: opts.speed, cp: !!opts.cp, auto: !!opts.auto, invert: !!opts.invert, calm: !!opts.calm, brief: opts.brief !== false, unlockAll: !!opts.unlockAll,
    err: errLog.slice(), kb: keysChanged(), hz: dispHz(), px: [cv.width | 0, cv.height | 0], gpu: gpuName(),
    music: opts.music | 0, sfx: opts.sfx | 0, muted: !!Snd.muted, skin: skin(), binds: JSON.stringify(opts.binds) !== JSON.stringify(cloneBinds(DEF_BINDS)), full: fullUsed,
    tut: !!stats.tut, tot: stats.total || 0, st, dur: Math.round((performance.now() - T0) / 1000), tune: tuneFromBase(),
    load: Math.round(T00), ff: Math.round(firstFrame), lang: String(navigator.language || '').slice(0, 12), rmo: RM, ls: storageOk });
  for (const k in XP) { telSess.xp = XP; break; }
  if (location.hash === '#test') telSess.test = true;   // a visit made to check the game, not to play it: kept, but left out of reports
  return telSess;
}
// the display's refresh rate, judged from the gaps between frames while the page is in view
const hzGaps = [];
function dispHz() { if (hzGaps.length < 20) return 0; const a = hzGaps.slice().sort((x, y) => x - y); return Math.round(1000 / a[a.length >> 1]); }
let gpuText = null;
function gpuName() {   // the graphics card as the browser names it, for telling slow machines from fast ones
  if (gpuText != null) return gpuText;
  gpuText = '';
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpuText = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').replace(/[^A-Za-z0-9 .,:_()\/+-]/g, ' ').replace(/ +/g, ' ').trim().slice(0, 100);
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    }
  } catch (e) {}
  return gpuText;
}
// one step of the trail: seconds into the visit, then what happened (menu, brief:L3, run:L3, open:score, opt:speed=0.75 ...)
function telEv(code) {
  if (!tel.on || document.prerendering) return;   // a page the browser loads ahead of time, unseen, is not a visit
  const s = telSess || telSession();
  if (s.ev.length < 1600) s.ev.push(Math.round((performance.now() - T0) / 1000), String(code).slice(0, 32));
  if (code !== 'hide' && code !== 'show' && code !== 'leave') evNews++;   // switching tabs is noted, but is not worth a send on its own
}
const telMode = () => typeof mode === 'number' ? 'L' + (mode + 1) : mode === 'daily' ? 'D' + today().key : mode === 'endless' ? 'E' : 'T';
function telStart(cp) {
  const now = performance.now();
  telCur = !bot ? { cp: cp ? Math.floor(cp.z) : 0, pr: 0, px: 0, fh: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], kk: {}, sh: 0, sl: 0, sg: 0, mg: 0, x2: 0, fn: 0, ft: 0, fj: 0, fx: 0, fb: [0, 0, 0, 0, 0, 0, 0], rs: 0, rn: 0,
    tr: [], inp: [0, 0, 0, 0, 0], tt: [], tw: 0, th: 0, pzN: 0, pzT: 0, il: [0, 0, 0, 0, 0], iq: [], rt: telLast && mode != null && telLast.m === telMode() ? Math.min(600, +((now - telLast.at) / 1000).toFixed(1)) : -1 } : null;
  pauseAt = 0;
}
// a press: find the move on the course's own route it belongs to, and note where in that move's window it came.
// src: 0 keyboard, 1 tap on the tunnel, 2 on-screen button, 3 mouse, 4 swipe on the tunnel
function telPress(m, src, hit) {
  const c = telCur; if (!c) return; c.pr++; c.inp[src | 0]++;
  // the trace: every press as position (hundredths of a row) and move, so the run can be replayed against its course
  if (c.tr.length < 6000) c.tr.push(Math.floor(runner.z * 100), 'LRFJ'.indexOf(m)); else c.cut = true;
  if (!hit) { c.px++; return; }   // a press the route did not call for
  const e = hit.e, f = hit.f, ms = Math.round(hit.left / timeScale() * 1000);
  c.fh[f < 0 ? 0 : f >= 1 ? 11 : 1 + Math.floor(f * 10)]++;
  const k = e.kind || (e.opt ? 'detour' : 'other'), a = c.kk[k] || (c.kk[k] = [0, 0, 0, 0, 1e9]);
  a[0]++; a[1] += clamp(f, -1, 2); if (f >= 1) a[2]++; else if (f < 0) a[3]++; if (ms < a[4]) a[4] = ms;
}
function telEnd(res) {
  const c = telCur; if (!c) return; telCur = null;
  if (mode == null || !track || !runner || bot) return;
  const z = c.dz != null ? c.dz : runner.z, row = Math.floor(z), v = track.speedAt(z), ev = track.events, win = res === 'win';   // dz: where the ball was when the run ended
  if (pauseAt) { c.pzT += performance.now() - pauseAt; pauseAt = 0; }
  const rec = { s: SID, i: telSeq++, cs: track.checksum(), t: Math.round(Date.now() / 1000), m: telMode(), a: tries, res, pc: score(), z: row, d: +runT.toFixed(2), sp: runner.sparks, pts: tally(win).total, pr: c.pr, px: c.px, fh: c.fh,
    fps: c.ft > 0 ? Math.round(c.fn / c.ft) : 0, fj: c.fj, fx: Math.min(9999, Math.round(c.fx)),
    ft: c.fb, rm: c.rn ? +(c.rs / c.rn).toFixed(2) : 0 };   // ft: frames taking under 9, 13, 18, 25, 35, 50 and over 50 ms; rm: ms spent drawing each frame
  if (!win) {
    rec.k = track.kindAt(row); rec.ln = runner.lane & 7;
    if (runner.dead) rec.am = Math.max(0, ['ground', 'hop', 'flip', 'jump'].indexOf(runner.dead.was));   // on the floor, or mid turn / flip / jump
    // the required move that was due and never made, and how long past its last moment the run ended (ms; negative = still time)
    const due = pace.missed(z); if (due) rec.nx = [due.kind || 'other', due.key, Math.round((z - due.z1) / v * 1000)];
  }
  const kk = {}; let any = false; for (const k in c.kk) { const a = c.kk[k]; kk[k] = [a[0], Math.round(a[1] / a[0] * 100), a[2], a[3], a[4]]; any = true; }
  if (any) rec.kk = kk;
  if (c.tr.length) rec.tr = c.tr.length > 400 ? c.tr.slice(-400) : c.tr;
  if (c.pr) rec.in = c.inp;
  if (track.end !== Infinity) rec.ns = track.nSparks; else rec.seed = track.seed;
  if (pace.boost > 0) rec.bo = Math.round(pace.boost * 100);
  if (pace.perfects) rec.pf = [pace.perfects, pace.best];                 // perfect presses, and the longest run of them
  if (track.nRisk || runner.risk) rec.rk = [runner.risk | 0, track.end === Infinity ? 0 : track.nRisk | 0];   // red sparks taken, of how many
  if (c.cp) rec.cp = c.cp; if (c.sh) rec.sh = c.sh; if (c.sl) rec.sl = c.sl; if (c.sg) rec.sg = c.sg; if (c.mg) rec.mg = c.mg; if (c.x2) rec.x2 = c.x2;
  if (c.tt.length) rec.tt = c.tt;                                   // tutorial: step, ms the step waited for its key, wrong keys first
  if (c.il[0]) rec.il = [+(c.il[1] / c.il[0]).toFixed(1), Math.round(c.il[2]), c.il[3] ? +(c.il[4] / c.il[3]).toFixed(1) : 0];   // key presses: typical and worst ms from the key going down to the game acting on it, and typical ms from there to the next frame drawn
  if (c.pzN) rec.pz = [c.pzN, Math.round(c.pzT / 1000)];          // pauses, and seconds spent paused
  if (c.rt >= 0) rec.rt = c.rt;                                     // seconds between the last run ending and this one starting
  if (qScale < 1) rec.q = +qScale.toFixed(2);
  if (practice()) rec.prac = 1;
  const td = tuneFromBase(); for (const k in td) { rec.tu = td; break; }
  telLast = { m: rec.m, at: performance.now() };
  lastRun = c.cut ? null : Object.assign({}, rec, { tr: c.tr });   // whole, in case it goes on a leaderboard
  if (!tel.on) { keepBest(); return; }   // recording is off: the run is kept only for the leaderboard, if it earns a place
  tel.log.push(rec); if (tel.log.length > 400) tel.log.splice(0, tel.log.length - 400);
  telSession(); saveTel(); telSync(); keepBest(); telSoon();
}
// Send what is new to the relay: at most every 30 seconds, and once more when the page is put away.
// Sends what is new to the relay. last: true when the page is being hidden (do not wait for the half-minute spacing),
// 'bye' when it is being closed (send the trail even if switching tabs is all that happened since), 'again' for a
// send that failed and is being repeated.
// A send that fails is tried again later, and the same news is never sent twice at once.
function telSend(last) {
  if (!relayOn() || !telSess) return;
  const s = telSess, fresh = tel.log.filter(r => r.s === SID && r.i >= relayAck), marks = evNews + Object.keys(s.fb).length + Object.keys(s.fun || {}).length + (s.notes ? s.notes.length : 0);
  const bye = last === 'bye' && s.ev.length !== relayLen;
  if (!fresh.length && marks === relayEv && !bye) return;
  if (!fresh.length && !(s.notes && s.notes.length) && !Object.keys(s.fb).length && performance.now() - T0 < 5000) return;   // opened and gone at once: not a visit
  const now = Date.now(), wait = 30000 - (now - relayAt);
  if (!last && wait > 0) { if (!relayTimer) relayTimer = setTimeout(() => { relayTimer = 0; telSend(false); }, wait + 100); return; }
  const key = (fresh.length ? fresh[fresh.length - 1].i : -1) + ':' + marks + ':' + (bye ? s.ev.length : 0);
  if (relayBusy) { if (key === relayKey) return; if (!last) { relayAgain = true; return; } }
  relayAt = now; telSession();
  let take = fresh.slice(0, 60), body;
  for (;;) { body = JSON.stringify({ v: 1, session: s, attempts: take }); if (body.length <= 60000 || take.length <= 1) break; take = take.slice(0, take.length >> 1); }
  const ack = take.length ? take[take.length - 1].i + 1 : relayAck, len = s.ev.length;
  relayBusy = true; relayKey = key;
  const after = () => { relayBusy = false; if (relayAgain) { relayAgain = false; telSend(false); } };
  const again = () => { relayFails++; if (relayFails <= 6 && !relayTimer) relayTimer = setTimeout(() => { relayTimer = 0; telSend('again'); }, [15, 30, 60, 120, 240, 480][relayFails - 1] * 1000); };
  // plain text keeps this a simple request; keepalive lets the last one finish after the page is gone
  try {
    fetch(RELAY, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
      .then(r => {
        if (r.ok) { relayAck = Math.max(relayAck, ack); relayEv = marks; relayLen = len; relayFails = 0; tel.ack[SID] = relayAck; tel.ackn[SID] = s.notes ? s.notes.length : 0; saveTel(); }
        else if (r.status === 429 || r.status === 502) again();   // busy, or too many at once: it keeps
        else relayDead = true;
        after();
      }, () => { again(); after(); });
  } catch (e) { relayBusy = false; }
}
// a run has just ended: send its record in a moment, so it is not racing the run's score, which goes at once
const telSoon = () => { if (!telLater) telLater = setTimeout(() => { telLater = 0; telSend(false); }, 1500); };
// Runs an earlier visit recorded but could not send (the tab was closed first, or the network dropped): send them now.
function telCatchUp() {
  if (!relayOn()) return;
  const todo = [];
  for (const x of tel.sessions) {
    if (!x || x.id === SID || x.host !== location.hostname || todo.length >= 3) continue;
    const rows = tel.log.filter(r => r.s === x.id && typeof r.i === 'number' && r.i >= (tel.ack[x.id] || 0)).slice(0, 40);
    const notes = x.notes ? x.notes.length : 0;
    if (rows.length || notes > (tel.ackn[x.id] || 0)) todo.push([x, rows]);
  }
  todo.forEach(([x, rows], n) => setTimeout(() => {
    try {
      fetch(RELAY, { method: 'POST', body: JSON.stringify({ v: 1, session: x, attempts: rows }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
        .then(r => { if (r.ok) { if (rows.length) tel.ack[x.id] = rows[rows.length - 1].i + 1; tel.ackn[x.id] = x.notes ? x.notes.length : 0; saveTel(); } }, () => {});
    } catch (e) {}
  }, 4000 + n * 3000));
  for (const id in tel.ack) if (!tel.sessions.some(x => x && x.id === id)) { delete tel.ack[id]; delete tel.ackn[id]; }
}
// Inside Claude's artifact viewer the same records also go to the artifact's own storage, so they can be read back
// for tuning without copying anything by hand. Forty attempts to a document.
function telSync() {
  if (!telDb || !tel.on || !telSess) return;
  if (telBusy) { telAgain = true; return; }
  const mine = tel.log.filter(r => r.s === SID);
  const part = mine.length ? Math.floor(mine[mine.length - 1].i / 40) : 0, rows = mine.filter(r => Math.floor(r.i / 40) === part);
  telBusy = true; telAgain = false;
  let p;
  try { p = telDb.doc('play/' + SID + '-' + part).set({ t: telSess.t, session: telSess, part, n: rows.length, attempts: rows }); } catch (e) { telDb = null; telBusy = false; return; }
  Promise.resolve(p).then(() => { telBusy = false; if (telAgain) telSync(); }, e => { telBusy = false; if (!e || e.code !== 'unavailable') telDb = null; });
}
function telTune() {   // the values currently set in the tuning drawer, saved the same way
  if (!telDb || !tel.on) return;
  try { Promise.resolve(telDb.doc('tune/current').set({ t: Math.round(Date.now() / 1000), build: BUILD, values: Object.assign({}, tune), changed: tuneDiff() })).catch(() => {}); } catch (e) {}
}
// one tap on the result screen, asked once per course per visit: how hard the level felt, and (after clearing it) whether it was fun
const FEEL = [['easy', 'Too easy'], ['right', 'About right'], ['hard', 'Too hard'], ['unfair', 'Unfair']];
const FUN = [['love', 'Loved it'], ['ok', 'It was fine'], ['no', 'Not for me']];
function rateRow(el, show, field, question, choices) {
  el.textContent = ''; el.hidden = true;
  if (!show || !tel.on || mode == null || mode === 'tutorial') return;
  const key = telMode(), s = telSess || telSession(); if (!s[field]) s[field] = {}; if (s[field][key]) return;
  const l = document.createElement('span'); l.textContent = question; el.appendChild(l);
  for (const [v, text] of choices) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = text;
    b.addEventListener('click', () => { s[field][key] = v; telEv(field + ':' + key + '=' + v); saveTel(); telSync(); telSend(false); el.textContent = 'Noted, thanks.'; });
    el.appendChild(b);
  }
  el.hidden = false;
}
const feelQ = () => typeof mode === 'number' ? 'How hard did this level feel?' : 'How hard did this course feel?';
try {
  if (window.claude && typeof window.claude.use === 'function') Promise.resolve(window.claude.use('db')).then(d => { telDb = d || null; telSync(); if (overlay === 'dataSheet') buildData(); }, () => {});
} catch (e) {}

function today() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
  return { key: y + '-' + pad2(m) + '-' + pad2(dd), seed: y * 10000 + m * 100 + dd, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
}
function dayBefore(key) { const p = key.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] - 1); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function dailyS() { const t = today(); if (stats.daily.date !== t.key) { stats.daily.date = t.key; stats.daily.best = 0; stats.daily.cleared = false; stats.daily.tries = 0; stats.daily.score = 0; stats.daily.time = 0; } return stats.daily; }

