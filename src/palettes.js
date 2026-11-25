// ================= palettes =================
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PALS = [
  ['#231a55', '#6b4fd8', '#ffd15c', '#ffb347', '#ff4f7b'],
  ['#0c3547', '#1f8a9e', '#e9fff4', '#bfeedd', '#ff7a3d'],
  ['#0f2d2a', '#2f9c7c', '#c9f26b', '#9fdc4f', '#ff5c8a'],
  ['#4a0f2c', '#c2356a', '#ffb38a', '#ff8f6b', '#fff07a'],
  ['#1a2a6c', '#4f7bff', '#ff9ecf', '#ff78b9', '#fff27a'],
  ['#3a1a0a', '#d9652b', '#ffe8c2', '#ffd08a', '#3fd0ff'],
  ['#2b0f4f', '#a044ff', '#7ef0e0', '#4fd6c8', '#ff5c5c'],
  ['#141a22', '#5d7388', '#ffffff', '#d5dce3', '#ff3b3b']
].map(p => ({ bg: hex(p[0]), glow: hex(p[1]), a: hex(p[2]), b: hex(p[3]), hz: hex(p[4]) }));
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
let hue0 = 250;
function endlessPal(z) {
  const h = hue0 + z * .28;
  return { bg: hsl(h, .56, .17), glow: hsl(h + 25, .6, .5), a: hsl(h + 170, .95, .75), b: hsl(h + 186, .9, .65), hz: hsl(h + 75, 1, .6) };
}
const rgb = c => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
let pal = PALS[0], cssAt = -1, cssPal = null;
function syncCss(force) {
  if (!force && pal === cssPal) return;
  const now = performance.now();
  if (!force && now - cssAt < 400) return;
  cssAt = now; cssPal = pal;
  const st = document.documentElement.style;
  st.setProperty('--bgc', (pal.bg[0] | 0) + ' ' + (pal.bg[1] | 0) + ' ' + (pal.bg[2] | 0));
  st.setProperty('--tile', rgb(pal.a)); st.setProperty('--hazard', rgb(pal.hz));
}

