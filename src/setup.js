// ================= setup =================
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d', { alpha: false });
const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const calm = () => RM || opts.calm;   // fewer effects: no shake, flash, streaks or beat pulse
const pad2 = n => String(n).padStart(2, '0');
// Opened with #test on the address, the game keeps its saved state apart, so checking it never touches a player's own scores, name or settings.
const PFX = location.hash === '#test' ? 'eightfold.test.' : 'eightfold.';
const store = {
  get(k, d) { try { const v = localStorage.getItem(PFX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) {} }
};
// anything that goes wrong in the page, as short plain text with where it happened (for the play recording)
const errLog = [], T00 = performance.now();
function noteErr(msg, line, col) {
  if (errLog.length >= 40) return;
  errLog.push(Math.round((performance.now() - T00) / 1000), (String(msg || 'error').replace(/[^A-Za-z0-9 .,:_()'\/-]/g, ' ').replace(/ +/g, ' ').trim().slice(0, 130) + (line ? ' @' + (line | 0) + ':' + (col | 0) : '')) || 'error');
}
window.addEventListener('error', e => noteErr(e && e.message, e && e.lineno, e && e.colno));
window.addEventListener('unhandledrejection', e => noteErr('rejected: ' + (e && e.reason && (e.reason.message || e.reason))));

// ---------- options and key bindings ----------
const ACTIONS = [['left', 'Turn left'], ['right', 'Turn right'], ['flip', 'Flip to the far wall'], ['jump', 'Jump'], ['pause', 'Pause'], ['restart', 'Restart'], ['sound', 'Sound on / off']];
const DEF_BINDS = { left: ['ArrowLeft', 'a'], right: ['ArrowRight', 'd'], flip: ['ArrowUp', 'w'], jump: [' ', 'ArrowDown'], pause: ['p', 'Escape'], restart: ['r', null], sound: ['m', null] };
const cloneBinds = b => { const o = {}; for (const [a] of ACTIONS) o[a] = [b[a] ? b[a][0] : null, b[a] ? b[a][1] : null]; return o; };
let opts = Object.assign({ cues: true, brief: true, invert: false, speed: 1, unlockAll: false, auto: false, cp: false, calm: false, quality: 'auto', music: 80, sfx: 90 }, store.get('opts', {}) || {});
opts.binds = cloneBinds(Object.assign({}, DEF_BINDS, opts.binds || {}));
const saveOpts = () => store.set('opts', opts);
const keyNorm = e => e.key.length === 1 ? e.key.toLowerCase() : e.key;
const KEYNAMES = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' };
const keyLabel = k => k == null ? '—' : KEYNAMES[k] || (k.length === 1 ? k.toUpperCase() : k);
function actionOf(k) { for (const a in opts.binds) if (opts.binds[a].indexOf(k) >= 0) return a; return null; }
function labelFor(a) { const b = opts.binds[a].filter(x => x != null); return b.length ? keyLabel(b[0]) : 'unset'; }
// which action produces a given runner move, allowing for the swapped-turn option
const actionForMove = m => m === 'F' ? 'flip' : m === 'J' ? 'jump' : (m === 'L') !== opts.invert ? 'left' : 'right';

// ---------- scores ----------
let stats = store.get('stats', null);
if (!stats || typeof stats !== 'object') stats = {};
if (!Array.isArray(stats.lv)) stats.lv = [];
if (!Array.isArray(stats.endless)) stats.endless = [];
if (!stats.daily || typeof stats.daily !== 'object') stats.daily = {};
if (!stats.know || typeof stats.know !== 'object') stats.know = {};   // how many times the player has made each kind of move: reminders stop after two
if (!stats.posted || typeof stats.posted !== 'object') stats.posted = {};   // per board: the best run already posted, and the course it was on
if (!stats.pending || typeof stats.pending !== 'object') stats.pending = {};   // per board: this player's best run that is not on the board yet, kept whole until it is
if (typeof stats.name !== 'string' || !/^[A-Z0-9]{1,3}$/.test(stats.name)) stats.name = '';   // the three letters or digits this player posts scores under
const lvS = i => stats.lv[i] || (stats.lv[i] = { best: 0, clears: 0, tries: 0, sparks: 0, perfect: false, pclear: false });
{ const old = store.get('best', null); if (Array.isArray(old)) old.forEach((b, i) => { if (b && i < LEVELS.length) { const s = lvS(i); s.best = Math.max(s.best, b); if (b >= 100) s.clears = Math.max(1, s.clears); } }); }
const saveStats = () => store.set('stats', stats);
const SKINS = [['pearl', 'Pearl', 0], ['ember', 'Ember', 30], ['mint', 'Mint', 80], ['void', 'Void', 160], ['prism', 'Prism', 300]];
const skin = () => { const s = SKINS.find(x => x[0] === opts.skin); return s && (stats.total || 0) >= s[2] ? s[0] : 'pearl'; };
let TOTALS = LEVELS.map(lv => new Track(lv.seed, lv).nSparks);
const unlocked = i => i === 0 || opts.unlockAll || (stats.lv[i - 1] && (stats.lv[i - 1].clears > 0 || stats.lv[i - 1].pclear));

// ---------- tuning (a temporary tool for finding the right feel) ----------
// [key, label, min, max, step, default, unit, what it touches, hint]. 'course' values re-lay the courses, 'play' ones change
// how a run goes, 'cam' ones only change the picture. A bare string starts a group.
const TUNE = [
  'Pace and moves',
  ['pace', 'Overall pace', .8, 1.25, .01, 1, 'x', 'play', 'Everything faster or slower. Courses keep their shape.'],
  ['jump', 'Jump', .30, .60, .01, .44, 's', 'course', 'Time in the air. Longer jumps carry further.'],
  ['flip', 'Flip', .28, .56, .01, .40, 's', 'course', 'Time to cross to the far wall.'],
  ['hop', 'Turn', .06, .18, .01, .10, 's', 'course', 'Time to hop one lane over.'],
  'Forgiveness',
  ['coyote', 'Edge forgiveness', .03, .14, .005, .06, 's', 'play', 'How long you can run past the end of the floor and still act.'],
  ['buffer', 'Early-press memory', .15, .80, .01, .45, 's', 'play', 'How long a press made in the air waits for you to land.'],
  ['boost', 'Top speed from sparks', 0, .5, .01, .25, '%', 'play', 'How much faster a full run of sparks makes you.'],
  ['pwin', 'Perfect window', .04, .2, .005, .09, 's', 'play', 'How close to the last moment a press must come to count as perfect.'],
  ['surge', 'Speed from a perfect', 0, .2, .01, .12, '%', 'play', 'The burst a perfect press gives. Each one in a row adds a little more.'],
  'View',
  ['camBack', 'Camera distance', 3, 6.5, .1, 4.4, '', 'cam', 'How far behind the ball the camera sits.'],
  ['camUp', 'Camera height', 0, .9, .02, .5, '', 'cam', 'How far above the centre of the tunnel.'],
  ['zoom', 'Zoom', .8, 1.3, .01, 1, 'x', 'cam', 'Narrower or wider view.'],
  ['ball', 'Ball size', .08, .19, .005, .13, '', 'cam', '']
];
const TUNE_BASE = {}; for (const t of TUNE) if (typeof t !== 'string') TUNE_BASE[t[0]] = t[5];   // the game's own defaults
const TUNE0 = Object.assign({}, TUNE_BASE);   // this player's defaults: the same, unless an experiment puts them in a variant
let tune = Object.assign({}, TUNE0);
// what the player changed in the drawer is stored as differences from their defaults
function loadTune() {
  tune = Object.assign({}, TUNE0);
  const sv = store.get('tune', null);
  if (sv && typeof sv === 'object') for (const t of TUNE) if (typeof t !== 'string') { const v = sv[t[0]]; if (typeof v === 'number' && isFinite(v) && Math.abs(v - TUNE_BASE[t[0]]) > 1e-9) tune[t[0]] = clamp(v, t[2], t[3]); }
}
const saveTune = () => store.set('tune', tuneDiff());
// every value that differs from the game's own defaults, whoever set it: what a recording needs to be played back
const tuneFromBase = () => { const o = {}; for (const k in TUNE_BASE) if (Math.abs(tune[k] - TUNE_BASE[k]) > 1e-9) o[k] = tune[k]; return o; };
const tuneSame = k => Math.abs(tune[k] - TUNE0[k]) < 1e-9;
const tuneDiff = () => { const o = {}; for (const k in TUNE0) if (!tuneSame(k)) o[k] = tune[k]; return o; };
// changed values that alter how a run plays (not just how it looks): such runs are not scored
const tunedPlay = () => TUNE.some(t => typeof t !== 'string' && t[7] !== 'cam' && !tuneSame(t[0]));
function applyTune() {
  setFeel({ hop: tune.hop, flip: tune.flip, jump: tune.jump, coyote: tune.coyote, buffer: tune.buffer });
  CAMBACK = tune.camBack; CAMY = -tune.camUp; BR = tune.ball;
  setPace({ boostMax: tune.boost, perfect: tune.pwin, surge: tune.surge, surgeMax: tune.surge > 0 ? tune.surge + .12 : 0 });
}

