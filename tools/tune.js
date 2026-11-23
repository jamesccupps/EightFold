// Pick, for each level, the course seed whose measured input rate and difficulty sit closest to a rising target.
const { metrics, LEVELS, Track, GROUP } = require('../test/curve.js');
const groups = m => Object.keys(Object.fromEntries(Object.keys(m).filter(k => GROUP[k] !== 'holes').map(k => [GROUP[k], 1]))).length;
const TARGET = [[19, 1.00], [25, .99], [28, .93], [31, .90], [33, .87], [35, .84], [38, .80], [42, .72]];   // presses per minute, sloppy-player clear rate
const out = [];
const only = (process.argv[2] || '').split(',').filter(Boolean).map(Number);
LEVELS.forEach((lv, i) => {
  if (only.length && only.indexOf(i + 1) < 0) return;
  let best = null; const need = groups(lv.mix);
  for (let k = 0; k < 110; k++) {
    const seed = (i + 1) * 1000 + 101 + k * 37, t = new Track(seed, lv);
    if (groups(t.kinds) < need) continue;                   // every kind in the mix must actually appear
    const m = metrics(t, 0), dR = (m.perMin - TARGET[i][0]) / 4;
    if (Math.abs(dR) > 1.5) continue;
    const c = metrics(t, 120).clear, score = Math.abs(dR) + Math.abs(c - TARGET[i][1]) / .04;
    if (!best || score < best.score) best = { seed, score, perMin: m.perMin, clear: c, presses: m.presses };
  }
  out.push(best); console.log(i + 1, lv.name, JSON.stringify(best));
});
console.log(JSON.stringify(out.map(b => b && b.seed)));
