// ================= main loop =================
const STEP = 1 / 240, pf = { ms: 0, n: 0 };
let frameNo = 0;
let last = 0, acc = 0;
function frame(ts) {
  if (!firstFrame) firstFrame = performance.now();
  const now = ts / 1000; let dt = now - last; last = now;
  if (!document.hidden && dt > .002 && dt < .1 && hzGaps.length < 240) hzGaps.push(dt * 1000);
  if (telCur && state === 'play' && dt > 0) {
    const ms = dt * 1000; if (ms > telCur.fx) telCur.fx = ms;   // the longest single frame of the run
    telCur.fb[ms < 9 ? 0 : ms < 13 ? 1 : ms < 18 ? 2 : ms < 25 ? 3 : ms < 35 ? 4 : ms < 50 ? 5 : 6]++;
  }
  if (!(dt > 0)) dt = 0; if (dt > .05) dt = .05;
  if (cv.clientWidth !== W || cv.clientHeight !== H) resize();
  if (opts.quality === 'auto' && dt > 0 && dt < .05) {   // drop resolution a notch if the machine cannot hold ~45 fps
    ema += (dt - ema) * .05;
    if (ema > 1 / 45 && qScale > .5) { slowFor += dt; if (slowFor > 1.5) { qScale *= .8; slowFor = 0; ema = 1 / 60; resize(); } } else slowFor = 0;
  }
  if (state === 'fail') failT += dt; else if (state === 'win') winT += dt;
  if (telCur && state === 'play' && dt > 0) { telCur.fn++; telCur.ft += dt; if (dt > .025) telCur.fj++; }
  if (telCur && telCur.iq.length) { const q = telCur.il; for (const t of telCur.iq) { const d = ts - t; if (d >= 0 && d < 500) { q[3]++; q[4] += d; } } telCur.iq.length = 0; }
  boostVis += ((pace ? pace.gain() : 0) - boostVis) * Math.min(1, dt * 5); if (kick > 0) kick = Math.max(0, kick - dt * 3);
  Snd.rate = 1 + (state === 'play' && mode !== 'tutorial' ? boostVis : 0) * .6;   // the music speeds up with you
  // screens where nothing moves (paused, result, briefing, or a sheet covering the tunnel) are drawn for a moment, then left alone
  const still = state === 'pause' || state === 'fail' || state === 'brief' || overlay !== null;
  if (still) idleFor += dt; else idleFor = 0;
  if (!still) {
    // practice speed and slow-mo stretch time itself, so every jump and gap keeps its proportions
// Practice speed, sparks, perfect presses and slow-mo all stretch time itself, so every jump and gap keeps its proportions.
    // Each physics step costs STEP / scale of real time, and the level clock is the sum of those costs, so the same
    // presses give the same time on any machine, however smoothly it runs.
    acc += dt;
    for (let n = 0; n < 96; n++) {
      const sc = state === 'menu' ? 1 : pace.scale();
      if (acc < STEP / sc) break;
      const playing = state === 'play';
      tick(STEP);
      if (playing && state === 'play' && !frozen) { acc -= pace.step(STEP); runT = pace.t; } else acc -= STEP / sc;
      if (state === 'fail' || state === 'win') { acc = 0; break; }
    }
  }
  Snd.pump();
  if (!still || idleFor < 1.2) {
    const lead = !still && !frozen && !runner.dead && (state === 'play' || state === 'menu' || state === 'win') ? acc * (state === 'menu' ? 1 : pace.scale()) : 0;
    const t0 = performance.now(); render(state === 'pause' ? 0 : dt, lead); const rms = performance.now() - t0; pf.ms += rms; pf.n++;
    if (telCur && state === 'play') { telCur.rs += rms; telCur.rn++; }
    if ((++frameNo & 3) === 0 || still) hud();
  }
  requestAnimationFrame(frame);
}
function start(saved) {
  telCatchUp(); setTimeout(() => { if (stats.name) postAll(); else prunePending(); }, 3000);
  resize(); soundLabel(); toMenu(); syncCss(true);
  if (saved && typeof saved.focus === 'number') { const b = $('lv' + (saved.focus + 1)); if (b && !b.disabled) b.focus(); }
  requestAnimationFrame(frame);
}
