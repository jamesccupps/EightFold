const { metrics, LEVELS, Track, GROUP } = require('../test/curve.js');
const groups = m => Object.keys(Object.fromEntries(Object.keys(m).filter(k => GROUP[k] !== 'holes').map(k => [GROUP[k], 1]))).length;
const i = +process.argv[2] - 1, lv = LEVELS[i], need = +process.argv[5] || groups(lv.mix), rows = []; let tried = 0;
for (let k = 0; k < +process.argv[3]; k++) {
  const seed = (i + 1) * 1000 + 101 + k * 37, t = new Track(seed, lv); tried++;
  if (groups(t.kinds) < need) continue;
  const m = metrics(t, 0); if (m.perMin < 36) continue; rows.push({ seed, r: +m.perMin.toFixed(1), p: m.presses, sp: t.nSparks, fam: groups(t.kinds) });
}
rows.sort((a, b) => b.r - a.r); for (const r of rows) r.clear = metrics(new Track(r.seed, lv), 120).clear; rows.sort((a, b) => a.clear - b.clear);
console.log('L' + (i + 1), rows.length + '/' + tried, 'have every family; rate range', rows.length ? rows[rows.length - 1].r + '..' + rows[0].r : '-');
for (const r of rows.slice(0, +process.argv[4] || 6)) { r.clear = metrics(new Track(r.seed, lv), 150).clear; console.log(' ', JSON.stringify(r)); }
