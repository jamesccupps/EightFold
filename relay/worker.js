// Eightfold play-data relay: a Cloudflare Worker.
//
// The game is a static page, so it cannot write to GitHub itself without carrying a token that anyone
// could read. This Worker holds the token instead. The game posts one session's play records here, and the
// Worker checks them and commits them as a JSON file on the `play-data` branch of the repository:
//
//     sessions/<YYYY-MM-DD>/<session id>.json
//
// The game sends only what is new since its last post; the Worker reads the session's file, adds the new
// attempts to it and writes it back. It only ever writes inside sessions/ on that one branch. It stores what
// it can verify the shape of and drops everything else, and it never stores the sender's address.
//
// Settings (Worker > Settings > Variables and Secrets):
//   GITHUB_TOKEN  secret, required. A fine-grained token: this repository only, Contents: Read and write.
//   REPO          optional, default "jamesccupps/EightFold"
//   BRANCH        optional, default "play-data"
//   ORIGINS       optional, comma-separated pages allowed to post, default "https://jamesccupps.github.io"
//   OFF           optional. Set to "1" to refuse everything without deleting the Worker.

const DEFAULTS = { REPO: 'jamesccupps/EightFold', BRANCH: 'play-data', ORIGINS: 'https://jamesccupps.github.io' };
const MAX_BODY = 64 * 1024;        // bytes per post
const MAX_ATTEMPTS = 400;          // attempts per session file
const MAX_FILE = 900 * 1024;       // bytes per session file (GitHub hands back file contents up to 1 MB)
const MAX_FILES_PER_DAY = 300;     // new session files per day, across everyone
const MAX_POSTS = 40, WINDOW_MS = 10 * 60 * 1000;   // posts per sender per ten minutes (best effort, per Worker instance)

// ---------- checking what was sent: keep known fields of the right type, drop the rest ----------
const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : undefined;
const str = (v, re) => typeof v === 'string' && re.test(v) ? v : undefined;
const bool = v => typeof v === 'boolean' ? v : undefined;
const KIND = /^[A-Za-z0-9]{1,16}$/;
function numMap(o, max) {   // { short name: number }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const out = {}; let n = 0;
  for (const k of Object.keys(o)) { if (n >= max) break; const v = num(o[k], -1e6, 1e6); if (KIND.test(k) && v !== undefined) { out[k] = v; n++; } }
  return n ? out : undefined;
}
function put(out, key, v) { if (v !== undefined) out[key] = v; }

const MODE = /^(L[1-9]|D\d{4}-\d{2}-\d{2}|E|T)$/;
const nums = (v, len, lo, hi) => Array.isArray(v) && v.length <= len && v.every(x => num(x, lo, hi) !== undefined) ? v : undefined;
const ATTEMPT_NUMS = { i: [0, 1e5], ln: [0, 7], am: [0, 3], pts: [0, 1e8], rt: [0, 600], fx: [0, 9999], sg: [0, 1e4], q: [0, 4], t: [1.6e9, 4e9], a: [0, 1e5], pc: [0, 1e6], z: [-10, 1e7], d: [0, 1e5], sp: [0, 1e5], pr: [0, 1e5], px: [0, 1e5], fps: [0, 1000], fj: [0, 1e6],
  ns: [0, 1e4], seed: [0, 4294967296], bo: [0, 100], cp: [0, 1e7], sh: [0, 1e4], sl: [0, 1e4], prac: [0, 1] };
function cleanAttempt(a, sid) {
  if (!a || typeof a !== 'object') return null;
  const out = { s: sid };
  put(out, 'm', str(a.m, MODE));
  put(out, 'res', str(a.res, /^(win|fall|crash|restart|quit|left)$/));
  if (!out.m || !out.res || num(a.i, 0, 1e5) === undefined) return null;
  for (const k in ATTEMPT_NUMS) put(out, k, num(a[k], ATTEMPT_NUMS[k][0], ATTEMPT_NUMS[k][1]));
  put(out, 'k', str(a.k, KIND));
  if (Array.isArray(a.fh) && a.fh.length === 12 && a.fh.every(x => num(x, 0, 1e5) !== undefined)) out.fh = a.fh;
  if (a.kk && typeof a.kk === 'object' && !Array.isArray(a.kk)) {
    const kk = {}; let n = 0;
    for (const k of Object.keys(a.kk)) {
      const q = a.kk[k];
      if (n < 30 && KIND.test(k) && Array.isArray(q) && q.length === 5 && q.every(x => num(x, -1e9, 1e9) !== undefined)) { kk[k] = q; n++; }
    }
    if (n) out.kk = kk;
  }
  if (Array.isArray(a.nx) && a.nx.length === 3 && str(a.nx[0], KIND) && str(a.nx[1], /^[LRFJ]$/) && num(a.nx[2], -1e6, 1e6) !== undefined) out.nx = a.nx;
  put(out, 'tu', numMap(a.tu, 16));
  if (Array.isArray(a.tr) && a.tr.length % 2 === 0) put(out, 'tr', nums(a.tr, 400, -1000, 1e9));   // the press trace: position, move, position, move ...
  if (Array.isArray(a.in) && a.in.length === 4) put(out, 'in', nums(a.in, 4, 0, 1e5));
  if (Array.isArray(a.pz) && a.pz.length === 2) put(out, 'pz', nums(a.pz, 2, 0, 1e6));
  if (Array.isArray(a.ft) && a.ft.length === 7) put(out, 'ft', nums(a.ft, 7, 0, 1e7));   // frames by how long they took
  put(out, 'rm', num(a.rm, 0, 1000));                                                      // ms spent drawing a frame
  if (Array.isArray(a.tt) && a.tt.length % 3 === 0) put(out, 'tt', nums(a.tt, 90, 0, 1e7));   // tutorial: step, ms waited, wrong keys
  return out;
}
function cleanSession(s, sid) {
  const out = { id: sid };
  if (!s || typeof s !== 'object') return out;
  put(out, 't', num(s.t, 1.6e9, 4e9));
  put(out, 'build', str(s.build, /^[A-Za-z0-9.\-]{1,24}$/));
  put(out, 'host', str(s.host, /^[a-z0-9.\-]{1,60}$/));
  put(out, 'br', str(s.br, /^[A-Za-z0-9 .]{1,24}$/));
  put(out, 'os', str(s.os, /^[A-Za-z0-9 ]{1,16}$/));
  put(out, 'w', num(s.w, 0, 20000)); put(out, 'h', num(s.h, 0, 20000)); put(out, 'dpr', num(s.dpr, 0, 16)); put(out, 'qscale', num(s.qscale, 0, 4)); put(out, 'speed', num(s.speed, 0, 4));
  put(out, 'quality', str(s.quality, /^(auto|high|low)$/));
  for (const k of ['touch', 'cp', 'auto', 'invert', 'calm', 'brief', 'unlockAll', 'muted', 'binds', 'full', 'tut']) put(out, k, bool(s[k]));
  put(out, 'tune', numMap(s.tune, 16));
  put(out, 'hz', num(s.hz, 0, 1000)); if (Array.isArray(s.px) && s.px.length === 2) put(out, 'px', nums(s.px, 2, 0, 40000));   // display refresh rate; the size the picture is drawn at
  put(out, 'gpu', str(s.gpu, /^[A-Za-z0-9 .,:_()\/+\-]{1,100}$/));                                                              // graphics card, as the browser names it
  put(out, 'cores', num(s.cores, 0, 1024)); put(out, 'mem', num(s.mem, 0, 1024)); put(out, 'music', num(s.music, 0, 100)); put(out, 'sfx', num(s.sfx, 0, 100));
  put(out, 'tot', num(s.tot, 0, 1e7)); put(out, 'dur', num(s.dur, 0, 1e7)); put(out, 'skin', str(s.skin, /^[a-z]{1,12}$/));
  put(out, 'st', nums(s.st, 36, 0, 1e6));   // per level: best %, clears, attempts
  put(out, 'pid', str(s.pid, /^[a-z0-9]{12}$/));   // a random code kept in the player's browser: tells returning players from new ones
  put(out, 'vn', num(s.vn, 0, 1e6)); put(out, 'first', str(s.first, /^\d{4}-\d{2}-\d{2}$/));
  put(out, 'ref', str(s.ref, /^[a-z0-9.\-]{1,60}$/));   // the site the player came from, by name only
  put(out, 'kb', str(s.kb, /^[A-Za-z0-9:|,]{1,240}$/));  // keys changed from the defaults
  // feedback the player typed: up to ten notes of up to 600 characters, control characters removed. This is the one
  // place free text is kept. Whoever reads it should treat it as something a stranger wrote.
  if (Array.isArray(s.notes)) {
    const notes = [];
    for (const n of s.notes.slice(0, 10)) {
      if (!n || typeof n !== 'object' || typeof n.x !== 'string') continue;
      const x = n.x.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 600); if (!x) continue;
      const o = { x }; put(o, 't', num(n.t, 0, 1e7)); put(o, 'k', str(n.k, /^(idea|bug|other)$/)); put(o, 'm', str(n.m, MODE)); put(o, 'pc', num(n.pc, 0, 1e6));
      notes.push(o);
    }
    if (notes.length) out.notes = notes;
  }
  // errors in the page: seconds into the visit, short plain text, ...
  if (Array.isArray(s.err) && s.err.length && s.err.length <= 80 && s.err.length % 2 === 0 && s.err.every((x, i) => i % 2 ? str(x, /^[A-Za-z0-9 .,:_()'\/@\-]{1,160}$/) !== undefined : num(x, 0, 1e7) !== undefined)) out.err = s.err;
  if (s.fb && typeof s.fb === 'object' && !Array.isArray(s.fb)) {   // how each course felt
    const fb = {}; let n = 0;
    for (const k of Object.keys(s.fb)) if (n < 40 && MODE.test(k) && str(s.fb[k], /^(easy|right|hard|unfair)$/)) { fb[k] = s.fb[k]; n++; }
    if (n) out.fb = fb;
  }
  // the trail through the menus: seconds into the visit, what happened, seconds, what happened ...
  if (Array.isArray(s.ev) && s.ev.length && s.ev.length <= 1600 && s.ev.length % 2 === 0 && s.ev.every((x, i) => i % 2 ? str(x, /^[A-Za-z0-9:=.\-]{1,32}$/) !== undefined : num(x, 0, 1e7) !== undefined)) out.ev = s.ev;
  return out;
}
// returns { sid, date, body } or a string saying what is wrong
function check(data, now, country) {
  if (!data || typeof data !== 'object' || data.v !== 1) return 'not play data';
  const sid = str(data.session && data.session.id, /^[a-z0-9]{6,16}$/);
  if (!sid) return 'no session id';
  if (!Array.isArray(data.attempts)) return 'no attempts';
  const attempts = [];
  for (const a of data.attempts.slice(-MAX_ATTEMPTS)) { const c = cleanAttempt(a, sid); if (c) attempts.push(c); }
  const session = cleanSession(data.session, sid);
  put(session, 'cc', str(country, /^[A-Z]{2}$/));   // country, as Cloudflare reports it for the request; the address itself is never kept
  // a visit with no runs still counts if it left a trail (someone who looked and left is worth knowing about)
  if (!attempts.length && !session.ev && !session.notes) return 'nothing usable';
  // file the session under the day it started, as long as that is believable; otherwise under today
  const t = session.t && Math.abs(session.t * 1000 - now) < 3 * 86400e3 ? session.t * 1000 : now;
  return { sid, date: new Date(t).toISOString().slice(0, 10), body: { v: 1, session, n: attempts.length, attempts } };
}

// ---------- GitHub ----------
function gh(env, path, init) {
  const repo = env.REPO || DEFAULTS.REPO;
  return fetch('https://api.github.com/repos/' + repo + '/contents/' + path, Object.assign({}, init, {
    headers: { 'Authorization': 'Bearer ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'eightfold-relay', 'Content-Type': 'application/json' }
  }));
}
// what is already filed for this session, plus what just arrived (an attempt sent twice replaces itself)
function merge(old, neu) {
  const by = new Map();
  if (old && Array.isArray(old.attempts)) for (const a of old.attempts) if (a && typeof a.i === 'number') by.set(a.i, a);
  for (const a of neu.attempts) by.set(a.i, a);
  let attempts = [...by.values()].sort((a, b) => a.i - b.i).slice(-MAX_ATTEMPTS);
  const session = neu.session;
  if (old && old.session && typeof old.session.t === 'number') session.t = old.session.t;
  // a later post never loses feedback already filed
  if (old && old.session && Array.isArray(old.session.notes) && (!session.notes || session.notes.length < old.session.notes.length)) session.notes = old.session.notes;
  let body = { v: 1, session, n: attempts.length, attempts };
  while (JSON.stringify(body).length > MAX_FILE && attempts.length > 1) { attempts = attempts.slice(20); body = { v: 1, session, n: attempts.length, attempts }; }
  return body;
}
async function save(env, ok) {
  const branch = env.BRANCH || DEFAULTS.BRANCH, dir = 'sessions/' + ok.date, path = dir + '/' + ok.sid + '.json';
  for (let attempt = 0; attempt < 2; attempt++) {
    let sha, old = null;
    const cur = await gh(env, path + '?ref=' + encodeURIComponent(branch), { method: 'GET' });
    if (cur.status === 200) {
      const j = await cur.json(); sha = j.sha;
      try { old = JSON.parse(atob(String(j.content || '').replace(/\s/g, ''))); } catch (e) { old = null; }
    } else if (cur.status === 404) {   // a new session: make sure today's folder is not being flooded
      const list = await gh(env, dir + '?ref=' + encodeURIComponent(branch), { method: 'GET' });
      if (list.status === 200) { const files = await list.json(); if (Array.isArray(files) && files.length >= MAX_FILES_PER_DAY) return { status: 429, error: 'enough for today' }; }
    } else return { status: 502, error: 'storage said ' + cur.status };
    // feedback can hold any script; written as \\uXXXX the file stays plain ASCII, which is what btoa needs
    const body = merge(old, ok.body), content = btoa(JSON.stringify(body).replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
    const res = await gh(env, path, { method: 'PUT', body: JSON.stringify({ message: 'play data ' + ok.sid + ' (' + body.n + ')', content, branch, sha, committer: { name: 'eightfold-relay', email: 'eightfold-relay@users.noreply.github.com' } }) });
    if (res.status === 200 || res.status === 201) return { status: 200, n: body.n };
    if (res.status !== 409 && res.status !== 422) return { status: 502, error: 'storage said ' + res.status };
    // 409/422: the file changed between reading and writing; read it again and try once more
  }
  return { status: 502, error: 'storage busy' };
}

// ---------- the Worker ----------
const seen = new Map();   // sender -> times of recent posts. Lives only as long as this Worker instance: a brake, not a wall.
function tooFast(who, now) {
  const a = (seen.get(who) || []).filter(t => now - t < WINDOW_MS);
  if (a.length >= MAX_POSTS) { seen.set(who, a); return true; }
  a.push(now); seen.set(who, a);
  if (seen.size > 5000) seen.clear();
  return false;
}
function reply(status, obj, origin) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(obj), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ORIGINS || DEFAULTS.ORIGINS).split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.indexOf(origin) >= 0 ? origin : '';
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: okOrigin ? 204 : 403, headers: okOrigin ? { 'Access-Control-Allow-Origin': okOrigin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' } : {} });
    }
    if (request.method === 'GET') return reply(200, { ok: true, what: 'Eightfold play-data relay', ready: !!env.GITHUB_TOKEN && env.OFF !== '1' }, okOrigin);
    if (request.method !== 'POST') return reply(405, { error: 'POST only' }, okOrigin);
    if (env.OFF === '1') return reply(503, { error: 'switched off' }, okOrigin);
    if (!okOrigin) return reply(403, { error: 'not from the game' }, '');
    if (!env.GITHUB_TOKEN) return reply(500, { error: 'no token set' }, okOrigin);
    const now = Date.now();
    if (tooFast(request.headers.get('CF-Connecting-IP') || 'unknown', now)) return reply(429, { error: 'slow down' }, okOrigin);
    if (+(request.headers.get('Content-Length') || 0) > MAX_BODY) return reply(413, { error: 'too large' }, okOrigin);
    let text; try { text = await request.text(); } catch (e) { return reply(400, { error: 'unreadable' }, okOrigin); }
    if (text.length > MAX_BODY) return reply(413, { error: 'too large' }, okOrigin);
    let data; try { data = JSON.parse(text); } catch (e) { return reply(400, { error: 'not JSON' }, okOrigin); }
    const ok = check(data, now, request.cf && request.cf.country);
    if (typeof ok === 'string') return reply(400, { error: ok }, okOrigin);
    let res; try { res = await save(env, ok); } catch (e) { res = { status: 502, error: 'storage unreachable' }; }
    return reply(res.status, res.status === 200 ? { ok: true, n: res.n } : { error: res.error }, okOrigin);
  }
};
