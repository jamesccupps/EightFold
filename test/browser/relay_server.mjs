// For test/browser/relay.py: serves the test build of the game and the real relay Worker on one local port,
// with GitHub replaced by an in-memory stand-in. GET /files shows what would have been committed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../relay/worker.js';
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = +process.argv[2] || 8787, ORIGIN = 'http://127.0.0.1:' + PORT;
const files = {}; let shaN = 0, posts = 0;
globalThis.fetch = async (url, init) => {
  const u = new URL(url), p = decodeURIComponent(u.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
  const json = (status, obj) => new Response(JSON.stringify(obj), { status });
  if (init.method === 'GET') { if (files[p]) return json(200, { sha: files[p].sha, content: Buffer.from(JSON.stringify(files[p].data)).toString('base64') }); const kids = Object.keys(files).filter(k => k.startsWith(p + '/')); return kids.length ? json(200, kids.map(k => ({ path: k }))) : json(404, {}); }
  const body = JSON.parse(init.body);
  if (files[p] && files[p].sha !== body.sha) return json(409, {});
  files[p] = { sha: 's' + (++shaN), branch: body.branch, data: JSON.parse(Buffer.from(body.content, 'base64').toString()) };
  return json(200, {});
};
http.createServer(async (req, res) => {
  if (req.url === '/files') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ posts, files })); }
  if (req.url.startsWith('/relay')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    if (req.method === 'POST') posts++;
    const r = await worker.fetch(new Request(ORIGIN + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), { GITHUB_TOKEN: 'local', ORIGINS: ORIGIN });
    res.statusCode = r.status; r.headers.forEach((v, k) => res.setHeader(k, v)); return res.end(await r.text());
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(path.join(HERE, 'build.html')));
}).listen(PORT, '127.0.0.1', () => console.log('ready ' + ORIGIN));
