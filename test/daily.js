// The daily course is meant to be a different thing every day, and hard. Measured over nine weeks of days:
//   - the theme changes every day, and every theme turns up;
//   - on a day about one kind of obstacle, that kind really is most of the day;
//   - two days are not made of the same ingredients (before the themes, any two days were 85% alike by this measure);
//   - it is about as hard as the last level, by the same sloppy-player measure test/curve.js uses for the levels.
//   node test/daily.js
const { metrics, GROUP, LEVELS, Track } = require('./curve.js');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'core.js'), 'utf8');
const { dailyTrack, DAILY_THEMES } = new Function(src + '; return { dailyTrack, DAILY_THEMES };')();
const DAYS = 63, rows = [];
for (let i = 0; i < DAYS; i++) {
  const d = new Date(Date.UTC(2026, 10, 27 + i)), seed = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const t = dailyTrack(seed), m = metrics(t, 80), fam = {}; let pieces = 0, led = 0;
  for (const k in t.kinds) { fam[GROUP[k]] = (fam[GROUP[k]] || 0) + t.kinds[k]; pieces += t.kinds[k]; if (t.level.lead.indexOf(k) >= 0) led += t.kinds[k]; }
  rows.push({ seed, theme: t.level.theme, pace: t.level.pace, speed: t.level.speed, perMin: m.perMin, clear: m.clear, fam, led: t.level.lead.length ? led / pieces : null });
}
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const p = a[k] || 0, q = b[k] || 0; d += p * q; x += p * p; y += q * q; } return d / Math.sqrt(x * y); };
let alike = 0, n = 0; for (let i = 0; i < DAYS; i++) for (let j = i + 1; j < DAYS; j++) { alike += cos(rows[i].fam, rows[j].fam); n++; } alike /= n;
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
const L8 = LEVELS[LEVELS.length - 1], last = metrics(new Track(L8.seed, L8), 400).clear;
const themes = new Set(rows.map(r => r.theme)), led = rows.filter(r => r.led != null);
const checks = [
  ['a different theme from the day before, every day', rows.every((r, i) => !i || r.theme !== rows[i - 1].theme)],
  ['every theme turns up (' + themes.size + ' of ' + DAILY_THEMES.length + ')', themes.size === DAILY_THEMES.length],
  ['on a themed day the theme is at least 40% of the obstacles (' + led.filter(r => r.led >= .4).length + ' of ' + led.length + ' days)', led.filter(r => r.led >= .4).length >= led.length * .9],
  ['two days are not made of the same things (alike ' + alike.toFixed(2) + ', where 1 is identical; it was 0.85)', alike < .65],
  ['never slower than 11.6, where the last level runs at 12 (' + Math.min(...rows.map(r => r.speed)) + ' to ' + Math.max(...rows.map(r => r.speed)) + ')', rows.every(r => r.speed >= 11.6)],
  ['at least 30 presses a minute (' + Math.min(...rows.map(r => r.perMin)).toFixed(0) + ' to ' + Math.max(...rows.map(r => r.perMin)).toFixed(0) + ')', rows.every(r => r.perMin >= 29.5)],
  ['about as hard as the last level: a sloppy player clears the typical day ' + (med(rows.map(r => r.clear)) * 100).toFixed(0) + '% of the time, the last level ' + (last * 100).toFixed(0) + '%', med(rows.map(r => r.clear)) <= last + .08],
  ['no walkover: the easiest day is cleared ' + (Math.max(...rows.map(r => r.clear)) * 100).toFixed(0) + '% of the time', Math.max(...rows.map(r => r.clear)) <= .97]
];
let bad = 0; for (const [what, ok] of checks) { console.log((ok ? 'ok   ' : 'not ok ') + what); if (!ok) bad++; }
if (bad) { console.log('daily: ' + bad + ' failed'); process.exit(1); }
console.log('daily: all checks passed');
