// Builds the single-file game: src/page.html (markup and styles) with the engine (src/core.js) and the page's script (src/*.js) inlined.
//   node build.js          -> index.html               (the public game; the test hook is left out)
//   node build.js --test   -> test/browser/build.html  (same game plus the hook the browser tests use)
const fs = require('fs'), path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src', 'core.js'), 'utf8');
// The page's script is kept in parts (src/setup.js, telemetry.js, ... loop.js) so each can be read and changed on its own.
// They are one program: page.html says where each goes with an /*INCLUDE name*/ line, and they are put back in that order.
const page = fs.readFileSync(path.join(__dirname, 'src', 'page.html'), 'utf8')
  .replace(/^\/\*INCLUDE ([a-z]+\.js)\*\/\n/gm, (m, name) => fs.readFileSync(path.join(__dirname, 'src', name), 'utf8'));
const test = process.argv.includes('--test');
// a short id for this exact engine (generator + physics), recorded with the play data
const coreId = require('crypto').createHash('sha1').update(core).digest('hex').slice(0, 10);
// a short id of exactly these sources, for the version label: any change to the page or the engine changes it
const buildId = require('crypto').createHash('sha1').update(page).update(core).digest('hex').slice(0, 4);
// the two typefaces, inlined so the page asks no other site for anything and a saved copy looks the same
const font = (file, family, weights) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weights};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'src', 'fonts', file)).toString('base64')}) format('woff2')}`;
const fonts = font('ChivoMono-latin.woff2', 'Chivo Mono', '100 700') + font('Unbounded-latin.woff2', 'Unbounded', '200 900');
let out = page.replace('/*FONTS*/', () => fonts).replace('/*CORE*/', () => core).replace('/*COREID*/', coreId).replace('/*BUILDID*/', buildId);
const a = out.indexOf('/*TEST-HOOK-BEGIN*/'), b = out.indexOf('/*TEST-HOOK-END*/');
if (a < 0 || b < a) throw new Error('test hook markers not found in src/page.html');
out = test ? out.replace('/*TEST-HOOK-BEGIN*/\n', '').replace('/*TEST-HOOK-END*/\n', '') : out.slice(0, a) + out.slice(b + '/*TEST-HOOK-END*/\n'.length);
const dest = test ? path.join(__dirname, 'test', 'browser', 'build.html') : path.join(__dirname, 'index.html');
fs.writeFileSync(dest, out);
console.log('built', path.relative(__dirname, dest), fs.statSync(dest).size, 'bytes');
