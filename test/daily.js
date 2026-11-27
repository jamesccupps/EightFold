// The daily course is meant to be a different thing every day, hard, and busy. Measured over nine weeks of days:
//   - the theme changes every day, and every theme turns up;
//   - on a day about one kind of obstacle, that kind really is a large part of the day;
//   - two days are not made of the same ingredients (before the themes, any two days were 85% alike by this measure);
//   - there is more to do than in any level: more presses a minute than level 8, mostly turns, never mostly jumps,
//     and no long stretch with nothing to do;
//   - nobody walks through it: the same sloppy-player measure test/curve.js uses for the levels.
//   node test/daily.js
const { metrics, GROUP, LEVELS, Track } = require('./curve.js');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'core.js'), 'utf8');
const { dailyTrack, DAILY_THEMES } = new Function(src + '; return { dailyTrack, DAILY_THEMES };')();
const DAYS = 63, rows = [];
for (let i = 0; i < DAYS; i++) {
  const d = new Date(Date.UTC(2026, 10, 27 + i)), seed = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const t = dailyTrack(seed), m = metrics(t, 80), fam = {}; let pieces = 0, led = 0;
  for (const k in t.kinds) { fam[GROUP[k]] = (fam[GROUP[k]] || 0) + t.kinds[k]; pieces += t.kinds[k]; if (t.level.lead.indexOf(k) >= 0) led += t.kinds[k]; }
  const ev = t.events.filter(e => !e.opt), keys = { L: 0, R: 0, F: 0, J: 0 }; let wait = 0, at = 0; for (const e of ev) { keys[e.key]++; wait = Math.max(wait, e.z0 - at); at = e.z1; }
  rows.push({ seed, theme: t.level.theme, pace: t.level.pace, speed: t.level.speed, perMin: m.perMin, clear: m.clear, fam, led: t.level.lead.length ? led / pieces : null, want: t.level.share,
    side: (keys.L + keys.R) / ev.length, jump: keys.J / ev.length, wait: wait / t.level.speed });
}
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const p = a[k] || 0, q = b[k] || 0; d += p * q; x += p * p; y += q * q; } return d / Math.sqrt(x * y); };
let alike = 0, n = 0; for (let i = 0; i < DAYS; i++) for (let j = i + 1; j < DAYS; j++) { alike += cos(rows[i].fam, rows[j].fam); n++; } alike /= n;
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
const L8 = LEVELS[LEVELS.length - 1], m8 = metrics(new Track(L8.seed, L8), 400);
const themes = new Set(rows.map(r => r.theme)), led = rows.filter(r => r.led != null), pct = x => (x * 100).toFixed(0) + '%';
const lo = f => Math.min(...rows.map(f)), hi = f => Math.max(...rows.map(f));
const checks = [
  ['a different theme from the day before, every day', rows.every((r, i) => !i || r.theme !== rows[i - 1].theme)],
  ['every theme turns up (' + themes.size + ' of ' + DAILY_THEMES.length + ')', themes.size === DAILY_THEMES.length],
  ['on a themed day the theme is as much of the day as it should be (' + led.filter(r => r.led >= r.want - .001).length + ' of ' + led.length + ' days)', led.filter(r => r.led >= r.want - .001).length >= led.length * .9],
  ['two days are not made of the same things (alike ' + alike.toFixed(2) + ', where 1 is identical; it was 0.85)', alike < .68],
  ['never slower than the last level, which runs at 12 (' + lo(r => r.speed) + ' to ' + hi(r => r.speed) + ')', rows.every(r => r.speed >= 12)],
  ['more to do than the last level, every day: ' + lo(r => r.perMin).toFixed(0) + ' to ' + hi(r => r.perMin).toFixed(0) + ' presses a minute, typically ' + med(rows.map(r => r.perMin)).toFixed(0) + ', against ' + m8.perMin.toFixed(0), lo(r => r.perMin) >= m8.perMin + 5],
  ['the ball has to move: turns are ' + pct(lo(r => r.side)) + ' to ' + pct(hi(r => r.side)) + ' of the presses, typically ' + pct(med(rows.map(r => r.side))), lo(r => r.side) >= .38 && med(rows.map(r => r.side)) >= .6],
  ['never mostly jumping: at most ' + pct(hi(r => r.jump)) + ' of a day is jumps, typically ' + pct(med(rows.map(r => r.jump))), hi(r => r.jump) <= .47],
  ['no long stretch with nothing to do: the longest is ' + hi(r => r.wait).toFixed(1) + ' s', hi(r => r.wait) <= 5.5],
  ['no walkover on timing alone: a sloppy player clears the typical day ' + pct(med(rows.map(r => r.clear))) + ' of the time (the last level ' + pct(m8.clear) + '), the easiest day ' + pct(hi(r => r.clear)), med(rows.map(r => r.clear)) <= .9]
];
let bad = 0; for (const [what, ok] of checks) { console.log((ok ? 'ok   ' : 'not ok ') + what); if (!ok) bad++; }
if (bad) { console.log('daily: ' + bad + ' failed'); process.exit(1); }
console.log('daily: all checks passed');
