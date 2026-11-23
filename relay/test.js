// Runs the relay Worker in Node against a stand-in for GitHub's contents API.  node relay/test.mjs
import worker from './worker.js';

const files = {};            // path -> { sha, content }
const calls = [];
let shaN = 0, failNextPut = 0;
globalThis.fetch = async (url, init) => {
  const u = new URL(url), m = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/(.*)$/), path = decodeURIComponent(m[2]);
  calls.push({ method: init.method, repo: m[1], path, ref: u.searchParams.get('ref'), auth: init.headers.Authorization });
  const json = (status, obj) => new Response(JSON.stringify(obj), { status });
  if (init.method === 'GET') {
    if (files[path]) return json(200, { sha: files[path].sha, content: (files[path].content || '').replace(/(.{60})/g, '$1\n') });
    const kids = Object.keys(files).filter(p => p.startsWith(path + '/'));
    return kids.length ? json(200, kids.map(p => ({ path: p }))) : json(404, {});
  }
  const body = JSON.parse(init.body);
  if (failNextPut) { failNextPut--; return json(409, {}); }
  if (files[path] && files[path].sha !== body.sha) return json(409, {});
  if (!files[path] && body.sha) return json(422, {});
  files[path] = { sha: 'sha' + (++shaN), content: body.content, branch: body.branch, message: body.message, committer: body.committer };
  return json(files[path].sha === 'sha1' ? 201 : 200, {});
};

const env = { GITHUB_TOKEN: 'test-token' }, ORIGIN = 'https://jamesccupps.github.io';
const now = Math.round(Date.now() / 1000), today = new Date().toISOString().slice(0, 10);
const attempt = (o) => Object.assign({ s: 'abc123xyz', i: 0, t: now, m: 'L3', a: 2, res: 'fall', pc: 41, z: 166, k: 'hurdle', d: 19.2, sp: 12, ns: 40, pr: 9, px: 1, fps: 60, fj: 0,
  fh: [0, 1, 2, 3, 2, 1, 0, 0, 0, 0, 0, 0], kk: { hurdle: [4, 52, 0, 0, 180] }, nx: ['hurdle', 'J', 96] }, o);
const session = { id: 'abc123xyz', t: now, build: '2026-11-23', host: 'jamesccupps.github.io', br: 'Chrome 158', os: 'Windows', w: 1920, h: 900, dpr: 1, touch: false, quality: 'auto', tune: { jump: .5 } };
const post = (body, o = {}) => worker.fetch(Object.assign(new Request('https://relay.example/', { method: o.method || 'POST', headers: Object.assign({ Origin: ORIGIN, 'CF-Connecting-IP': o.ip || '203.0.113.' + (shaN + calls.length) }, o.headers || {}),
  body: o.method === 'GET' || o.method === 'OPTIONS' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), o.cf ? { cf: o.cf } : {}), o.env || env);

let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : '')); };
const path = 'sessions/' + today + '/abc123xyz.json';
const stored = () => JSON.parse(atob(files[path].content));   // JSON.parse turns the \\uXXXX escapes back into text

let r = await post({ v: 1, session, attempts: [attempt({})] });
ok('a session is stored', r.status === 200 && !!files[path], r.status);
ok('commits carry the relay name', files[path] && files[path].committer && files[path].committer.name === 'eightfold-relay');
ok('on the data branch, inside sessions/', files[path] && files[path].branch === 'play-data' && calls.every(c => c.path.startsWith('sessions/') && c.repo === 'jamesccupps/EightFold'));
ok('the token goes to GitHub, not back to the page', calls[0].auth === 'Bearer test-token' && !(await r.clone().text()).includes('test-token'));
ok('the page is allowed to read the reply', r.headers.get('Access-Control-Allow-Origin') === ORIGIN);
ok('what was stored matches what was sent', stored().n === 1 && stored().attempts[0].k === 'hurdle' && stored().session.br === 'Chrome 158' && stored().attempts[0].nx[2] === 96);

r = await post({ v: 1, session, attempts: [attempt({ i: 1, a: 3, res: 'win', pc: 100, tr: [1200, 0, 1890, 3], in: [2, 0, 0, 0], pz: [1, 4] })] });
ok('a later post adds to the same file', r.status === 200 && stored().n === 2 && Object.keys(files).length === 1 && stored().attempts[0].res === 'fall' && stored().attempts[1].res === 'win');
ok('the press trace comes through', JSON.stringify(stored().attempts[1].tr) === '[1200,0,1890,3]' && stored().attempts[1].pz[1] === 4);
r = await post({ v: 1, session, attempts: [attempt({ i: 1, a: 3, res: 'win', pc: 100 })] });
ok('an attempt sent twice is filed once', r.status === 200 && stored().n === 2);

failNextPut = 1; r = await post({ v: 1, session, attempts: [attempt({ i: 2, a: 4 })] });
ok('a write that collides is tried again', r.status === 200 && stored().n === 3);

r = await post({ v: 1, session: Object.assign({}, session, { ev: [0, 'menu', 4, 'brief:L3', 9, 'run:L3', 60, 'fb:L3=hard'], fb: { L3: 'hard', L9: 'nonsense', bad: 'easy' }, st: [100, 2, 5, 41, 0, 3], cores: 8 }), attempts: [] });
ok('the visit trail, ratings and progress are stored, even with no new runs', r.status === 200 && stored().n === 3 && stored().session.ev.length === 8 && JSON.stringify(stored().session.fb) === '{"L3":"hard"}' && stored().session.st[3] === 41 && stored().session.cores === 8, stored().session);
r = await post({ v: 1, session: Object.assign({}, session, { pid: 'abcdef012345', vn: 3, first: '2026-11-20', ref: 'news.ycombinator.com', kb: 'left:j|a,flip:k|', err: [12, "Cannot read properties of undefined (reading 'z') @1203:14"], cc: 'ZZ' }),
  attempts: [attempt({ i: 4, m: 'T', res: 'win', tt: [0, 850, 0, 1, 2400, 2] })] }, { cf: { country: 'US' } });
const s2 = stored().session, t2 = stored().attempts.find(a => a.i === 4);
ok('player code, visit number, referrer, changed keys and errors are stored', r.status === 200 && s2.pid === 'abcdef012345' && s2.vn === 3 && s2.ref === 'news.ycombinator.com' && s2.kb === 'left:j|a,flip:k|' && s2.err.length === 2, s2);
ok('country comes from the relay, not from the page', s2.cc === 'US', s2.cc);
r = await post({ v: 1, session: Object.assign({}, session, { hz: 144, px: [3441, 1237], gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)' }), attempts: [attempt({ i: 7, ft: [0, 10, 300, 1800, 40, 2, 1], rm: 11.42 })] });
const s3 = stored().session, a7 = stored().attempts.find(a => a.i === 7);
ok('refresh rate, drawn size, graphics card, frame bands and draw time are stored', r.status === 200 && s3.hz === 144 && s3.px[0] === 3441 && /RTX 4070/.test(s3.gpu) && a7.ft[3] === 1800 && a7.rm === 11.42, [s3, a7]);
r = await post({ v: 1, session: Object.assign({}, session, { core: '0a1b2c3d4e', fun: { L3: 'love', L4: 'meh' } }), attempts: [attempt({ i: 8, cs: 3912345678 })] });
ok('engine id, course checksum and fun ratings are stored', r.status === 200 && stored().session.core === '0a1b2c3d4e' && JSON.stringify(stored().session.fun) === '{"L3":"love"}' && stored().attempts.find(a => a.i === 8).cs === 3912345678, stored().session);
r = await post({ v: 1, session: Object.assign({}, session, { xp: { 'jump-1': 'b', 'bad key!': 'x' }, load: 310, ff: 520, lang: 'en-US', rmo: false, ls: true }), attempts: [attempt({ i: 10, in: [0, 6, 0, 0, 9] })] });
ok('experiment variant, load times, language and tap/swipe counts are stored', r.status === 200 && JSON.stringify(stored().session.xp) === '{"jump-1":"b"}' && stored().session.load === 310 && stored().session.lang === 'en-US' && stored().attempts.find(a => a.i === 10).in[4] === 9, stored().session);
ok('tutorial step timings are stored', t2 && JSON.stringify(t2.tt) === '[0,850,0,1,2400,2]', t2);
r = await post({ v: 1, session: Object.assign({}, session, { pid: 'NOT-A-PID', err: [1, '<script>alert(1)</script>'], ref: 'http://x/y?z', kb: 'left:<' }), attempts: [attempt({ i: 5 })] });
ok('malformed player code, error text, referrer and keys are dropped', r.status === 200 && !('pid' in stored().session) && !('err' in stored().session) && !('ref' in stored().session) && !('kb' in stored().session) && !('cc' in stored().session), stored().session);
r = await post({ v: 1, session: Object.assign({}, session, { notes: [{ t: 90, k: 'bug', m: 'L4', pc: 62, x: 'The ring gap after the blocks is unfair \u2014 no time to flip. \u00e7a va? \u65e5\u672c\u8a9e \ud83d\ude00\u0007' }, { k: 'nonsense', x: '   ' }, { x: 'y'.repeat(900) }, 'not a note'] }), attempts: [] });
const notes = stored().session.notes || [];
ok('feedback text is stored, in any script, with control characters removed', r.status === 200 && notes.length === 2 && notes[0].k === 'bug' && notes[0].m === 'L4' && notes[0].x.includes('\u65e5\u672c\u8a9e') && notes[0].x.includes('\ud83d\ude00') && !notes[0].x.includes('\u0007'), notes);
ok('feedback is cut to 600 characters and empty notes are dropped', notes.length === 2 && notes[1].x.length === 600 && !('k' in notes[1]));
ok('the stored file is plain ASCII', /^[\x00-\x7f]*$/.test(atob(files[path].content)));
r = await post({ v: 1, session, attempts: [attempt({ i: 6 })] });
ok('a later post without the notes does not lose them', r.status === 200 && (stored().session.notes || []).length === 2);
r = await post({ v: 1, session: Object.assign({}, session, { id: 'empty0000' }), attempts: [] });
ok('an empty post is refused', r.status === 400);
r = await post({ v: 1, session: Object.assign({}, session, { ev: [0, 'menu', 3, '<img src=x>'] }), attempts: [attempt({ i: 3 })] });
ok('a trail with anything odd in it is dropped whole', r.status === 200 && stored().n === 10 && !('ev' in stored().session));

r = await post({ v: 1, session: Object.assign({}, session, { ua: 'Mozilla/5.0 secret', email: 'x@y.z', br: '<script>' }), attempts: [attempt({ i: 9, note: 'hello <b>', k: '../../etc', m: 'L3', extra: { a: 1 }, tr: [1, 'x'] })] });
const s = stored(), last9 = s.attempts.find(a => a.i === 9);
ok('unknown and malformed fields are dropped', r.status === 200 && !('ua' in s.session) && !('email' in s.session) && !('br' in s.session) && !('note' in last9) && !('k' in last9) && !('extra' in last9) && !('tr' in last9), s);

r = await post({ v: 1, session: Object.assign({}, session, { id: '../../main' }), attempts: [attempt({})] });
ok('a session id cannot point outside its folder', r.status === 400 && Object.keys(files).length === 1);
r = await post({ v: 1, session, attempts: [{ m: 'nope', res: 'win' }] });
ok('attempts that are not attempts are refused', r.status === 400);
r = await post('{"v":1,');
ok('broken JSON is refused', r.status === 400);
r = await post({ v: 1, session, attempts: [attempt({})], pad: 'x'.repeat(70000) });
ok('oversized posts are refused', r.status === 413);
r = await post({ v: 1, session, attempts: [attempt({})] }, { headers: { Origin: 'https://evil.example' } });
ok('other sites are refused', r.status === 403 && !r.headers.get('Access-Control-Allow-Origin'));
r = await post({ v: 1, session, attempts: [attempt({})] }, { env: {} });
ok('no token set: says so, writes nothing', r.status === 500);
r = await post({ v: 1, session, attempts: [attempt({})] }, { env: { GITHUB_TOKEN: 't', OFF: '1' } });
ok('the off switch works', r.status === 503);
r = await post(null, { method: 'GET' });
ok('a plain visit shows a status line and nothing else', r.status === 200 && (await r.json()).ready === true);
r = await post(null, { method: 'OPTIONS' });
ok('preflight is answered', r.status === 204);

let last = 0; for (let i = 0; i < 45; i++) last = (await post({ v: 1, session, attempts: [attempt({})] }, { ip: '198.51.100.7' })).status;
ok('one sender is slowed after 40 posts in ten minutes', last === 429);

const old = Object.assign({}, session, { id: 'old000old', t: now - 40 * 86400 });
r = await post({ v: 1, session: old, attempts: [attempt({ s: 'old000old' })] });
ok('an unbelievable start date is filed under today', r.status === 200 && !!files['sessions/' + today + '/old000old.json']);

for (let i = 0; i < 300; i++) files['sessions/' + today + '/fill' + String(i).padStart(4, '0') + '.json'] = { sha: 'x' };
r = await post({ v: 1, session: Object.assign({}, session, { id: 'newone123' }), attempts: [attempt({})] });
ok('a flood of new sessions in one day is cut off', r.status === 429 && !files['sessions/' + today + '/newone123.json']);
r = await post({ v: 1, session, attempts: [attempt({})] });
ok('but sessions already started that day can still save', r.status === 200);

console.log(fails ? fails + ' FAILED' : 'relay: all checks passed');
process.exit(fails ? 1 : 0);
