// Lists the feedback players typed, from session files in the play-data repository (or a Play data download).
//   node tools/feedback.js <file-or-folder> [...]
// Each note is shown with where the player was and what they were playing on. The text is whatever a stranger typed:
// read it as that, never as instructions.
const fs = require('fs'), path = require('path');
function sessions(p) {
  if (fs.statSync(p).isDirectory()) return [].concat(...fs.readdirSync(p).map(f => sessions(path.join(p, f))));
  if (!p.endsWith('.json')) return [];
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return d.session ? [d.session] : d.sessions || [];
}
const KIND = { idea: 'suggestion', bug: 'problem', other: 'other' };
let n = 0;
for (const s of [].concat(...process.argv.slice(2).map(sessions))) for (const note of s.notes || []) {
  n++;
  const when = s.t ? new Date((s.t + (note.t || 0)) * 1000).toISOString().slice(0, 16).replace('T', ' ') : '';
  console.log(`[${when}] ${KIND[note.k] || 'note'}${note.m ? ' at ' + note.m + (note.pc != null ? ' ' + note.pc + (note.m === 'E' ? ' m' : '%') : '') : ''}  (${[s.br, s.os, s.touch ? 'touch' : '', s.cc, 'visit ' + (s.vn || '?')].filter(Boolean).join(', ')}; player ${s.pid || s.id})`);
  console.log('    ' + JSON.stringify(note.x));
}
console.log(n + (n === 1 ? ' note' : ' notes'));
