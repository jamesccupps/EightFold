// ================= rendering =================
const RC = 1 / Math.cos(Math.PI / 8);   // corner radius of an octagon with apothem 1
const RL = .86, NEAR = .3, TH = .09;
let CAMBACK = 4.4, CAMY = -.5, BR = .13;   // camera distance and height, ball size: the tuning drawer can change these
applyTune();
if (Object.keys(XP).length) TOTALS = LEVELS.map(lv => new Track(lv.seed, lv).nSparks);   // a variant may lay the courses out differently
let VIEW = 36, qScale = 1, slowFor = 0, ema = 1 / 60, idleFor = 0;   // draw distance and resolution adapt to the machine
const cxr = new Float64Array(9), cyr = new Float64Array(9), shade = new Float64Array(8);
let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, F = 1, camNow = 0;
function resize() {
  const q = opts.quality;
  VIEW = q === 'low' ? 28 : 36;
  let sc = Math.min(q === 'low' ? 1 : 2, window.devicePixelRatio || 1);
  const cw = cv.clientWidth || window.innerWidth, ch = cv.clientHeight || window.innerHeight;
  if (q !== 'high') sc = Math.min(sc, Math.sqrt((q === 'low' ? 1.2e6 : 3e6) / Math.max(1, cw * ch)));   // about 3 megapixels on Auto
  DPR = Math.max(.5, sc * (q === 'auto' ? qScale : 1)); idleFor = 0;
  W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
const streaks = [];
for (let i = 0; i < 44; i++) streaks.push({ a: Math.random() * 6.283, r: 1.8 + Math.random() * 2.8, z: Math.random() * VIEW, l: .6 + Math.random() * 1.6 });
const mixc = (c, d, t, k) => [c[0] * k + (d[0] - c[0] * k) * t, c[1] * k + (d[1] - c[1] * k) * t, c[2] * k + (d[2] - c[2] * k) * t];
const WHITE = [255, 255, 255], RISK = [255, 56, 84], RISKCSS = 'rgb(255,56,84)';   // red sparks and their strip: the same red in every level, whatever its palette
// Colour strings are cached by value (6 bits a channel), so the draw loop creates no garbage once warm.
const CSSTAB = new Array(262144);
function css(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0; g = g < 0 ? 0 : g > 255 ? 255 : g | 0; b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  const i = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
  return CSSTAB[i] || (CSSTAB[i] = 'rgb(' + (r & 252) + ',' + (g & 252) + ',' + (b & 252) + ')');
}
// colour c scaled by k, then blended toward d by t
function tint(c, d, t, k) { return css(c[0] * k + (d[0] - c[0] * k) * t, c[1] * k + (d[1] - c[1] * k) * t, c[2] * k + (d[2] - c[2] * k) * t); }
function quad(x1, y1, x2, y2, x3, y3, x4, y4) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); }
// a point on the tunnel wall at any lane position (lane centres are whole numbers), f = 1 on the wall, 0 on the axis.
// Written into the scratch buffer PT at index i, so nothing is allocated.
const PT = new Float64Array(8);
function lanePt(pos, f, i) {
  const fr = pos - Math.round(pos), rad = f / Math.cos(fr * Math.PI / 4), a = (pos - camNow) * Math.PI / 4 + Math.PI / 2;
  PT[i] = rad * Math.cos(a); PT[i + 1] = rad * Math.sin(a);
}
// a box standing on the wall: lane position, half width in lanes, near/far depth, height, colour
function drawBox(pos, half, dA, dB, h, col, far, fog, top) {
  if (dB <= NEAR) return;
  const sA = F / Math.max(NEAR, dA), sB = F / dB, q = 1 - h;
  lanePt(pos - half, 1, 0); lanePt(pos + half, 1, 2);
  const ax = PT[0], ay = PT[1], bx = PT[2], by = PT[3];
  const oax = cx + ax * sA, oay = cy + (ay - CAMY) * sA, iax = cx + ax * q * sA, iay = cy + (ay * q - CAMY) * sA;
  const obx = cx + bx * sA, oby = cy + (by - CAMY) * sA, ibx = cx + bx * q * sA, iby = cy + (by * q - CAMY) * sA;
  const oaxF = cx + ax * sB, oayF = cy + (ay - CAMY) * sB, iaxF = cx + ax * q * sB, iayF = cy + (ay * q - CAMY) * sB;
  const obxF = cx + bx * sB, obyF = cy + (by - CAMY) * sB, ibxF = cx + bx * q * sB, ibyF = cy + (by * q - CAMY) * sB;
  ctx.fillStyle = tint(col, far, fog, .55);
  ctx.beginPath(); ctx.moveTo(oax, oay); ctx.lineTo(iax, iay); ctx.lineTo(iaxF, iayF); ctx.lineTo(oaxF, oayF); ctx.closePath();
  ctx.moveTo(obx, oby); ctx.lineTo(ibx, iby); ctx.lineTo(ibxF, ibyF); ctx.lineTo(obxF, obyF); ctx.closePath(); ctx.fill();
  ctx.fillStyle = tint(top || col, far, fog, top ? 1 : .8);
  quad(iax, iay, ibx, iby, ibxF, ibyF, iaxF, iayF); ctx.fill();
  ctx.fillStyle = tint(col, far, fog, 1);
  quad(oax, oay, obx, oby, ibx, iby, iax, iay); ctx.fill(); ctx.stroke();
}
// a bar across the tunnel from one wall to the opposite one
function drawBeam(pos, dA, dB, col, far, fog) {
  if (dB <= NEAR) return;
  const sA = F / Math.max(NEAR, dA), sB = F / dB;
  lanePt(pos - .2, 1, 0); lanePt(pos + .2, 1, 2); lanePt(pos + 3.8, 1, 4); lanePt(pos + 4.2, 1, 6);
  const a1x = PT[0], a1y = PT[1] - CAMY, a2x = PT[2], a2y = PT[3] - CAMY, b1x = PT[4], b1y = PT[5] - CAMY, b2x = PT[6], b2y = PT[7] - CAMY;
  ctx.fillStyle = tint(col, far, fog, .6);
  ctx.beginPath(); ctx.moveTo(cx + a2x * sA, cy + a2y * sA); ctx.lineTo(cx + b1x * sA, cy + b1y * sA); ctx.lineTo(cx + b1x * sB, cy + b1y * sB); ctx.lineTo(cx + a2x * sB, cy + a2y * sB); ctx.closePath();
  ctx.moveTo(cx + b2x * sA, cy + b2y * sA); ctx.lineTo(cx + a1x * sA, cy + a1y * sA); ctx.lineTo(cx + a1x * sB, cy + a1y * sB); ctx.lineTo(cx + b2x * sB, cy + b2y * sB); ctx.closePath(); ctx.fill();
  ctx.fillStyle = tint(col, far, fog, 1);
  quad(cx + a1x * sA, cy + a1y * sA, cx + a2x * sA, cy + a2y * sA, cx + b1x * sA, cy + b1y * sA, cx + b2x * sA, cy + b2y * sA); ctx.fill(); ctx.stroke();
}
function drawItem(it, dm, fog) {
  const s = F / dm, high = it.t === 'high', risk = it.t === 'risk'; lanePt(it.lane, high ? .5 : .78, 0);
  const x = cx + PT[0] * s, y = cy + (PT[1] - CAMY) * s, u = s * .075;
  ctx.globalAlpha = 1 - fog * .85;
  if (risk) {   // a red spark: bigger, in the hazard colour, with a white heart
    const q = u * 1.5; ctx.fillStyle = RISKCSS; ctx.beginPath(); ctx.moveTo(x, y - q * 1.35); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q * 1.35); ctx.lineTo(x - q, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - q * .55); ctx.lineTo(x + q * .42, y); ctx.lineTo(x, y + q * .55); ctx.lineTo(x - q * .42, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = RISKCSS; ctx.lineWidth = Math.max(1, u * .3); ctx.beginPath(); ctx.arc(x, y, q * 1.9, 0, 6.2832); ctx.stroke();
  } else if (it.t === 'spark' || high) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - u * 1.35); ctx.lineTo(x + u, y); ctx.lineTo(x, y + u * 1.35); ctx.lineTo(x - u, y); ctx.closePath(); ctx.fill();
    if (high) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, u * .28); ctx.beginPath(); ctx.arc(x, y, u * 2.1, 0, 6.2832); ctx.stroke(); }
  } else {
    const c = it.t === 'shield' ? '#7fe7ff' : it.t === 'magnet' ? '#ffd166' : it.t === 'double' ? '#7dffb0' : '#d9b8ff';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x, y, u * 2.3, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, u * .5); ctx.beginPath(); ctx.arc(x, y, u * 2.3, 0, 6.2832); ctx.stroke();
    ctx.beginPath();
    if (it.t === 'shield') { ctx.moveTo(x - u, y - u * .9); ctx.lineTo(x + u, y - u * .9); ctx.lineTo(x + u, y + u * .2); ctx.lineTo(x, y + u * 1.2); ctx.lineTo(x - u, y + u * .2); ctx.closePath(); }
    else if (it.t === 'magnet') { ctx.moveTo(x - u * .9, y - u * 1.1); ctx.lineTo(x - u * .9, y + u * .1); ctx.arc(x, y + u * .1, u * .9, Math.PI, 0, true); ctx.lineTo(x + u * .9, y - u * 1.1); }   // a horseshoe
    else if (it.t === 'double') { ctx.moveTo(x - u * 1.2, y - u * .7); ctx.lineTo(x - u * .1, y + u * .7); ctx.moveTo(x - u * .1, y - u * .7); ctx.lineTo(x - u * 1.2, y + u * .7); ctx.moveTo(x + u * .3, y - u * .4); ctx.lineTo(x + u * .75, y - u * .75); ctx.lineTo(x + u * 1.2, y - u * .4); ctx.lineTo(x + u * .3, y + u * .7); ctx.lineTo(x + u * 1.25, y + u * .7); }   // x2
    else { ctx.moveTo(x, y - u * 1.2); ctx.lineTo(x, y); ctx.lineTo(x + u * .9, y + u * .5); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
}
function pattern(p, j, k) { return p === 1 ? j & 1 : p === 2 ? k & 1 : p === 3 ? ((j >> 1) + k) & 1 : p === 4 ? (j % 4 === 0 ? 1 : 0) : (j + k) & 1; }

// Everything derived from the palette (and the backdrop gradient) is rebuilt only when the palette or size changes.
let PC = null, pcPal = null, pcW = 0, pcH = 0, palZ = -99;
const bgCv = document.createElement('canvas'), bgCtx = bgCv.getContext('2d', { alpha: false });
function prepPal() {
  // the backdrop (flat colour plus the light at the end of the tunnel) is painted once, at half size, and copied each frame
  const bw = Math.max(2, Math.ceil(W / 2)), bh = Math.max(2, Math.ceil(H / 2));
  if (bgCv.width !== bw || bgCv.height !== bh) { bgCv.width = bw; bgCv.height = bh; }
  const g = bgCtx.createRadialGradient(bw / 2, bh * .38, 0, bw / 2, bh * .38, F * .23);
  g.addColorStop(0, rgb(mixc(pal.bg, pal.glow, .95, 1))); g.addColorStop(.4, rgb(mixc(pal.bg, pal.glow, .32, 1))); g.addColorStop(1, rgb(pal.bg));
  bgCtx.fillStyle = g; bgCtx.fillRect(0, 0, bw, bh);
  PC = { far: mixc(pal.bg, pal.glow, .7, 1), sprA: mixc(pal.a, WHITE, .45, 1), sprB: mixc(pal.b, WHITE, .45, 1), wire: rgb(mixc(pal.glow, WHITE, .35, 1)), glow: rgb(pal.glow) };
  pcPal = pal; pcW = W; pcH = H;
}
const GAPL = .007, GAPZ = .007 * RL;   // tiles are drawn slightly inset; the gap between them replaces an outline stroke per tile

// lead: simulated time not yet stepped this frame. Drawing that far ahead keeps motion even on 120/144 Hz screens.
// The move the player needs next, for the hints drawn on the floor: which tiles to press on, and which move. (A quarter of
// real runs ended on the wrong key, mostly a flip pressed for a turn or a jump for a flip; the shape of the floor did not say.)
// What kind of move it is comes from the course's route. Which way a turn goes does not: the route is one lane, and on a
// wide floor the player is often in another, where the route's own direction would point at a wall or off the edge. So a
// turn is read from the floor itself: the row where the old floor ends or the blocks stand, and the nearest lane that goes
// through it from the lane the player is in. Nothing is shown to a player who is already in such a lane.
function cueNow() {
  if (opts.cues === false || state !== 'play' || bot || !pace) return null;
  const ev = track.events, z = runner.z, p = runner.lane & 7, v = track.speedAt(z), rows = track.S.length;
  while (cueI < ev.length && (ev[cueI].opt || ev[cueI].z1 < z - .3)) cueI++;
  const live = (k, r) => { const b = 1 << (k & 7); return r >= 0 && r < rows && !!(track.S[r] & b) && !(track.B[r] & b); };
  const floor = (k, r) => r >= 0 && r < rows && !!(track.S[r] & (1 << (k & 7)));
  for (let i = cueI; i < ev.length && ev[i].z0 - z < v * 2.5; i++) {
    const e = ev[i]; if (e.opt || e.z1 < z - .3) continue;
    if (e.key !== 'L' && e.key !== 'R') {
      if (pace.hit[i]) continue;
      const r1 = Math.floor(e.z1 - .05);
      return { r0: Math.max(Math.ceil(e.z0), r1 - 2), r1, key: e.key, lane: p, far: (p + 4) & 7, n: 1 };
    }
    let last = i; while (last + 1 < ev.length && !ev[last + 1].opt && ev[last + 1].key === e.key && ev[last + 1].z0 < ev[last].z1) last++;   // a dodge two lanes wide is two presses
    const rd = Math.floor(ev[last].z1) + 1;   // the first row the old lane does not go through
    if (rd <= z || live(p, rd)) { i = last; continue; }
    let dir = e.key === 'L' ? 1 : -1, n = 0;
    for (let d = 1; d <= 3 && !n; d++) {
      let a = live(p + d, rd), b = live(p - d, rd);
      for (let q = 1; q < d; q++) { a = a && floor(p + q, rd - 1); b = b && floor(p - q, rd - 1); }   // the lanes crossed on the way have to be there to land on
      if (a || b) { if (!(a && b)) dir = a ? 1 : -1; n = d; }
    }
    if (!n) { i = last; continue; }   // no turn gets there from here (on a red strip overhead, say, where the way back is a flip): better no arrow than a wrong one
    const z1 = ev[last].z1 - (n - 1) * (HOP * v + .35), r1 = Math.floor(z1 - .05);   // the last moment for the first of n hops
    return { r0: Math.max(Math.ceil(ev[i].z0), r1 - 2), r1, key: dir > 0 ? 'L' : 'R', lane: p, far: (p + 4) & 7, n };
  }
  return null;
}
function render(fdt, lead) {
  const z = runner.z + track.speedAt(runner.z) * lead, v = runner.vis(lead), cam = camNow = runner.cam;
  if (!track.level && Math.abs(z - palZ) > 9) { pal = endlessPal(z); palZ = z; }
  F = Math.min(W * 1.25, H * 1.4) * tune.zoom;
  if (pal !== pcPal || W !== pcW || H !== pcH) prepPal();
  const top = PACE.boostMax + PACE.surgeMax + .09, rush = calm() || top <= 0 || state !== 'play' && state !== 'dead' ? 0 : Math.min(1, boostVis / top);   // 0..1: how much of the boost is in play
  F *= 1 - rush * .1 - (calm() ? 0 : kick * .012);   // wider view at speed, with a small punch on each spark
  syncCss(false);
  const pulse = Snd.pulse(), pat = track.level ? track.level.pat : 0;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = shake > 0 ? (Math.random() - .5) * shake * 16 : 0, sy = shake > 0 ? (Math.random() - .5) * shake * 16 : 0;
  cx = W / 2 + sx; cy = H * .38 + sy;

  ctx.drawImage(bgCv, 0, 0, W, H);

  if (!calm()) {   // speed streaks outside the tunnel, drawn as three batches by distance
    ctx.lineWidth = 1.5 + rush * 1.5; ctx.strokeStyle = PC.glow;
    const third = VIEW / 3, n = streaks.length;
    for (let b = 0; b < 3; b++) {
      ctx.globalAlpha = Math.min(1, (b === 0 ? .6 : b === 1 ? .36 : .14) * (1 + rush * 1.6)); ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = streaks[i], rel = (((s.z - z) % VIEW) + VIEW) % VIEW;
        if (rel < b * third || rel >= (b + 1) * third) continue;
        const d = (rel + .4) * RL, a = s.a - cam * Math.PI / 4, x = s.r * Math.cos(a), y = s.r * Math.sin(a) - CAMY, s1 = F / d, s2 = F / (d + s.l * RL * (1 + rush * 4));
        ctx.moveTo(cx + x * s1, cy + y * s1); ctx.lineTo(cx + x * s2, cy + y * s2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < 9; i++) { const a = (i - .5 - cam) * Math.PI / 4 + Math.PI / 2; cxr[i] = RC * Math.cos(a); cyr[i] = RC * Math.sin(a); }
  {   // wire frame of the whole tunnel, so its shape reads even where the floor is one lane wide
    const sA = F / .7, sB = F / ((VIEW + CAMBACK) * RL);
    ctx.strokeStyle = PC.wire; ctx.globalAlpha = .2; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 8; i++) { ctx.moveTo(cx + cxr[i] * sA, cy + (cyr[i] - CAMY) * sA); ctx.lineTo(cx + cxr[i] * sB, cy + (cyr[i] - CAMY) * sB); }
    ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  for (let k = 0; k < 8; k++) shade[k] = .66 + .34 * (.5 + .5 * Math.sin((k - cam) * Math.PI / 4 + Math.PI / 2));
  const far = PC.far, lit = 1 + .09 * pulse;
  const j0 = Math.floor(z - CAMBACK + NEAR / RL), j1 = Math.floor(z) + VIEW, zb = Math.floor(z);
  track.cell(j1, 0);   // make sure the endless track is generated this far
  const RKM = riskMap(track).rows;
  const CUE = cueNow();   // the next move needed, drawn on the floor it is needed on
  const rows = Math.min(track.end, track.S.length);
  const speed = track.speedAt(z), settle = Math.max(2.5, speed * .35), travel = speed * 1.1;
  ctx.lineWidth = 1; ctx.lineJoin = 'round';

  for (let j = j1; j >= j0; j--) {
    const dn = (j - z + CAMBACK) * RL, df = dn + RL;
    if (df > NEAR) {
      const sN = F / Math.max(NEAR, dn), sNi = F / Math.max(NEAR, dn + GAPZ), sFi = F / (df - GAPZ), ok = j >= 0 && j < rows;
      let fog = clamp((dn - 6) / (VIEW * RL - 4), 0, 1); fog = fog * (2 - fog);
      const S = ok ? track.S[j] : 255, B = ok ? track.B[j] : 0, Hh = ok ? track.H[j] : 0, PD = ok ? track.PD[j] : 0, zone = ok ? track.Z[j] : 0;
      const Sp = j >= 1 && j - 1 < rows ? track.S[j - 1] : 255, fin = j >= track.end, G = ok ? track.G[j] : null;
      const RK = ok ? RKM[j] : null;   // a risk strip runs through this row
      let mark = 0;   // lanes where a moving obstacle will come to rest
      if (G) { if (G.t === 'sweep') for (const it of G.items) mark |= 1 << (it.lane & 7); else for (const a of G.arms) mark |= (1 << (a & 7)) | (1 << ((a + 4) & 7)); }
      if (j % 4 === 0 || j === bestRow) {   // tunnel ribs; a brighter one marks your best distance
        const mine = j === bestRow;
        ctx.strokeStyle = mine ? '#fff' : PC.wire; ctx.globalAlpha = (mine ? .9 : .28) * (1 - fog); ctx.lineWidth = mine ? 3 : 1.5;
        ctx.beginPath(); ctx.moveTo(cx + cxr[0] * sN, cy + (cyr[0] - CAMY) * sN);
        for (let i = 1; i < 8; i++) ctx.lineTo(cx + cxr[i] * sN, cy + (cyr[i] - CAMY) * sN);
        ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
      const dark = zone === 2 ? .6 : 1;
      for (let k = 0; k < 8; k++) {
        const kb = 1 << k; if (!(S & kb)) continue;
        const k1 = k + 1, ex = (cxr[k1] - cxr[k]) * GAPL, ey = (cyr[k1] - cyr[k]) * GAPL;
        const ax = cxr[k] + ex, ay = cyr[k] + ey - CAMY, bx = cxr[k1] - ex, by = cyr[k1] - ey - CAMY;
        const xa = cx + ax * sNi, ya = cy + ay * sNi, xb = cx + bx * sNi, yb = cy + by * sNi, xc = cx + bx * sFi, yc = cy + by * sFi, xd = cx + ax * sFi, yd = cy + ay * sFi;
        // nothing of this tile is on screen: skip it
        if ((xa < 0 && xb < 0 && xc < 0 && xd < 0) || (xa > W && xb > W && xc > W && xd > W) || (ya < 0 && yb < 0 && yc < 0 && yd < 0) || (ya > H && yb > H && yc > H && yd > H)) continue;
        let base = fin ? (((j + k) & 1) ? WHITE : pal.bg) : pattern(pat, j, k) ? (zone === 1 ? PC.sprA : pal.a) : (zone === 1 ? PC.sprB : pal.b);
        if (PD & kb) base = WHITE;
        if (mark & kb) base = mixc(base, pal.hz, .55, 1);
        // the strip is tinted; after its last spark it reddens tile by tile to full red at its end: how long is left can be seen
        const rk = RK && k === RK.lane; if (rk) base = mixc(base, RISK, j > RK.back ? Math.min(.92, .5 + .42 * (j - RK.back) / Math.max(1, RK.b - RK.back)) : .32, 1);
        if (!(Sp & kb)) {   // slab edge facing the camera
          ctx.fillStyle = tint(base, far, fog, shade[k] * .42 * dark);
          quad(xa, ya, xb, yb, cx + cxr[k1] * (1 + TH) * sN, cy + (cyr[k1] * (1 + TH) - CAMY) * sN, cx + cxr[k] * (1 + TH) * sN, cy + (cyr[k] * (1 + TH) - CAMY) * sN);
          ctx.fill();
        }
        ctx.fillStyle = tint(base, far, fog, Math.min(1, shade[k] * lit) * dark);
        quad(xa, ya, xb, yb, xc, yc, xd, yd); ctx.fill();
        if (mark & kb) {   // where a moving block or bar will stop: outlined and crossed, with a slow pulse, so it does not rest on colour alone
          ctx.strokeStyle = rgb(mixc(pal.hz, pal.bg, fog * .7, 1)); ctx.lineWidth = Math.max(1.5, Math.hypot(xb - xa, yb - ya) * .06); ctx.globalAlpha = calm() ? .9 : .65 + .35 * Math.sin(performance.now() / 150);
          ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.lineTo(xc, yc); ctx.lineTo(xd, yd); ctx.closePath(); ctx.moveTo(xa, ya); ctx.lineTo(xc, yc); ctx.moveTo(xb, yb); ctx.lineTo(xd, yd); ctx.stroke();
          ctx.globalAlpha = 1; ctx.lineWidth = 1;
        }
        if (CUE && j >= CUE.r0 && j <= CUE.r1 && (k === CUE.lane || (CUE.key === 'F' && k === CUE.far))) {
          // u runs across the tile towards the next lane up, v away from the camera
          const pt = (u, v) => { const x0 = xa + (xb - xa) * u, y0 = ya + (yb - ya) * u, x1 = xd + (xc - xd) * u, y1 = yd + (yc - yd) * u; return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v]; };
          // white with a dark edge, so it reads on a pale floor as well as a dark one
          const lw = Math.max(2, Math.hypot(xb - xa, yb - ya) * .06);
          const line = pts => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = pt(q[0], q[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.strokeStyle = 'rgb(10 12 28 / .7)'; ctx.lineWidth = lw * 2; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.stroke(); };
          ctx.globalAlpha = 1 - fog; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          if (k !== CUE.lane) line([[.08, .08], [.92, .08], [.92, .92], [.08, .92], [.08, .08]]);                 // flip: the floor to land on, overhead, is outlined
          else if (CUE.key === 'L' || CUE.key === 'R') {                                                         // turn: an arrowhead pointing the way to go, two of them for two hops
            const m = CUE.key === 'L' ? u => u : u => 1 - u;
            if (CUE.n > 1) { line([[m(.16), .2], [m(.5), .5], [m(.16), .8]]); line([[m(.5), .2], [m(.84), .5], [m(.5), .8]]); }
            else line([[m(.3), .2], [m(.7), .5], [m(.3), .8]]);
          }
          else if (CUE.key === 'F') { line([[.22, .12], [.5, .42], [.78, .12]]); line([[.22, .5], [.5, .8], [.78, .5]]); }   // flip: two arrowheads, up and away
          else line([[.15, .5], [.85, .5]]);                                                                     // jump: a bar across, like the thing to clear
          ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
        }
        if (rk && j === RK.b) {   // a white bar across the strip's last tile: it ends here
          ctx.strokeStyle = '#fff'; ctx.globalAlpha = 1 - fog * .8; ctx.lineWidth = Math.max(2, Math.hypot(xc - xd, yc - yd) * .1);
          ctx.beginPath(); ctx.moveTo(xd, yd); ctx.lineTo(xc, yc); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
        }
        if (PD & kb) {   // launch pad: arrow pointing down the tunnel
          ctx.fillStyle = tint(pal.glow, far, fog, 1);
          ctx.beginPath(); ctx.moveTo(xa + (xb - xa) * .22, ya + (yb - ya) * .22); ctx.lineTo(xa + (xb - xa) * .78, ya + (yb - ya) * .78); ctx.lineTo((xc + xd) / 2, (yc + yd) / 2); ctx.closePath(); ctx.fill();
        }
      }
      if (B || Hh || G) {
        const thin = (G && G.t === 'beam') || (Hh && !B);   // beams and low bars sit mid-row
        const passed = clamp(1 - (z - (j + (thin ? .72 : 1))) * 3.5, 0, 1);
        if (passed > 0) {
          ctx.globalAlpha = passed; ctx.strokeStyle = tint(pal.bg, far, fog, 1);
          if (Hh) for (let k = 0; k < 8; k++) if (Hh & (1 << k)) drawBox(k, .5, dn + HZ0 * RL, dn + HZ1 * RL, .18, pal.hz, far, fog, WHITE);
          if (G) {
            const p = clamp((j - z - settle) / travel, 0, 1);
            if (G.t === 'sweep') for (const it of G.items) drawBox(it.lane - it.dir * it.span * p, .5, dn, df, .4, pal.hz, far, fog);
            else for (const a of G.arms) drawBeam(a + G.spin * p, dn + .3 * RL, dn + .7 * RL, pal.hz, far, fog);
          } else if (B) for (let k = 0; k < 8; k++) if (B & (1 << k)) drawBox(k, .5, dn, df, .4, pal.hz, far, fog);
          ctx.globalAlpha = 1;
        }
      }
      const it = ok ? track.I[j] : null;
      if (it && !runner.taken[j] && dn + RL / 2 > NEAR) drawItem(it, dn + RL / 2, fog);
    }
    if (j === zb) drawRunner(v, cam);
  }
  if (perfFlash > 0) {   // a ring off the ball on a perfect press
    if (!calm()) { ctx.globalAlpha = perfFlash; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, ballAt.R * .22); ctx.beginPath(); ctx.arc(ballAt.x, ballAt.y, ballAt.R * (1.25 + (1 - perfFlash) * 1.7), 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
    perfFlash = Math.max(0, perfFlash - fdt * 3.2);
  }

  if (shards.length) {
    ctx.fillStyle = '#fff';
    for (const s of shards) {
      s.t += fdt; s.vy += 900 * fdt; s.x += s.vx * fdt; s.y += s.vy * fdt; s.r += 9 * fdt;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.r); ctx.globalAlpha = clamp(1 - s.t / .9, 0, 1); ctx.fillRect(-s.s / 2, -s.s / 2, s.s, s.s); ctx.restore();
    }
    shards = shards.filter(s => s.t < .9);
  }
  if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash.toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - fdt * 2.4); }
  if (shake > 0) shake = Math.max(0, shake - fdt * 3);
}
function drawRunner(v, cam) {
  const a = (v.lane - cam) * Math.PI / 4 + Math.PI / 2, s = F / (CAMBACK * RL);
  const rr = v.r * (1 - BR), bx = cx + rr * Math.cos(a) * s, by = cy + (rr * Math.sin(a) - CAMY) * s, R = BR * s;
  ballAt.x = bx; ballAt.y = by; ballAt.R = R;
  const d = runner.dead;
  if (d && d.kind === 'crash') return;
  if (Math.abs(v.r) <= 1.02) {   // contact shadow on whichever wall is nearer
    const side = v.r >= 0 ? 1 : -1, h = 1 - Math.abs(v.r);
    ctx.save(); ctx.translate(cx + side * Math.cos(a) * s, cy + (side * Math.sin(a) - CAMY) * s); ctx.rotate(a - Math.PI / 2); ctx.scale(1, .3);
    ctx.globalAlpha = .38 * (1 - h); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, -R * .4, R * (1.05 + h * .6), 0, 6.2832); ctx.fill(); ctx.restore();
  }
  ctx.save();
  if (d) ctx.globalAlpha = clamp(1 - d.t * 2, 0, 1);
  else if (runner.inv > 0) ctx.globalAlpha = .55;
  const g = ctx.createRadialGradient(bx - R * .3, by - R * .38, R * .08, bx, by, R);
  const sk = skin(); let c0 = '#fff', c1 = rgb(mixc(pal.a, WHITE, .6, 1));
  if (sk === 'ember') { c0 = '#fff3c4'; c1 = '#ff7a2f'; } else if (sk === 'mint') { c0 = '#f2fff9'; c1 = '#39d6a4'; } else if (sk === 'void') { c0 = '#5d6280'; c1 = '#0b0c15'; } else if (sk === 'prism') c1 = rgb(hsl(runner.z * 9, .9, .66));
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, R, 0, 6.2832); ctx.fill();
  ctx.lineWidth = Math.max(1.5, R * .09); ctx.strokeStyle = sk === 'void' ? '#fff' : rgba(pal.bg, .55); ctx.stroke();
  if (runner.shield) { ctx.strokeStyle = '#7fe7ff'; ctx.lineWidth = Math.max(2, R * .14); ctx.beginPath(); ctx.arc(bx, by, R * 1.45, 0, 6.2832); ctx.stroke(); }
  // things that run out: a ring each round the ball, emptying as the time goes and flickering white in the last second
  const ring = (left, total, k, col) => {
    if (!(left > 0)) return;
    const f = Math.min(1, left / total), rr = R * k, last = left < 1;
    ctx.lineWidth = Math.max(2, R * .16); ctx.globalAlpha = .22; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(bx, by, rr, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = last && !calm() ? .55 + .45 * Math.cos(left * 25) : 1; ctx.strokeStyle = last ? '#fff' : col; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(bx, by, rr, -1.5708, -1.5708 + 6.2832 * f); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  };
  ring(pace.slowT, PACE.slowSecs, 1.82, '#d9b8ff'); ring(runner.mag, POWER.magnet, 2.14, '#ffd166'); ring(runner.dbl, POWER.double, 2.46, '#7dffb0');
  ctx.restore(); ctx.lineWidth = 1;
}

