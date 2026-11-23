// Builds the single-file game: inlines src/core.js into src/page.html.
//   node build.js          -> index.html               (the public game; the test hook is left out)
//   node build.js --test   -> test/browser/build.html  (same game plus the hook the browser tests use)
const fs = require('fs'), path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src', 'core.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, 'src', 'page.html'), 'utf8');
const test = process.argv.includes('--test');
let out = page.replace('/*CORE*/', () => core);
const a = out.indexOf('/*TEST-HOOK-BEGIN*/'), b = out.indexOf('/*TEST-HOOK-END*/');
if (a < 0 || b < a) throw new Error('test hook markers not found in src/page.html');
out = test ? out.replace('/*TEST-HOOK-BEGIN*/\n', '').replace('/*TEST-HOOK-END*/\n', '') : out.slice(0, a) + out.slice(b + '/*TEST-HOOK-END*/\n'.length);
const dest = test ? path.join(__dirname, 'test', 'browser', 'build.html') : path.join(__dirname, 'index.html');
fs.writeFileSync(dest, out);
console.log('built', path.relative(__dirname, dest), fs.statSync(dest).size, 'bytes');
