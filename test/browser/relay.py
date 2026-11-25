import asyncio, json, os, subprocess, urllib.request
from playwright.async_api import async_playwright
# The whole path a tester's play data takes: the real page in a browser -> the real relay Worker code -> a stand-in for GitHub.
# Usage: python3 test/browser/relay.py      (needs: node build.js --test)
HERE = os.path.dirname(os.path.abspath(__file__)); PORT = 8791; BASE = 'http://127.0.0.1:%d' % PORT
S = 'window.__eightfold.state()'
def stored(): return json.loads(urllib.request.urlopen(BASE + '/files').read())
from _check import report, done
EXPECT = { 'notice_hidden_without_relay': True, 'notice_shown_with_relay': True, 'first_run_sent_at_once': lambda v: v[0] == 1 and v[1] is True, 'branch': 'play-data', 'keyboard_run': lambda v: v[0] == 'win',
  'held_back_inside_30s': (2, 2), 'sent_when_page_put_away': lambda v: v[0] == 3 and v[1] == 3, 'replay': lambda v: '3 replay to the recorded ending, 3 of 3 to the recorded time' in v, 'feedback_done': 'Sent. Thank you.',
  'same_player_code_after_reload': True, 'player': lambda v: len(v['pid']) == 16, 'unsent_while_offline': 0, 'notice_gone_when_off': True, 'nothing_sent_when_off': True,
  'errors': lambda v: len(v) == 2 and 'thrown on purpose' in v[0] }   # the two errors are the test's own: one thrown to be recorded, one from going offline
async def wait_state(pg, want, secs):
    for _ in range(int(secs * 10)):
        st = await pg.evaluate(S)
        if st['state'] in want: return st
        await pg.wait_for_timeout(100)
    return await pg.evaluate(S)
async def main():
    srv = subprocess.Popen(['node', os.path.join(HERE, 'relay_server.mjs'), str(PORT)], stdout=subprocess.PIPE, text=True); srv.stdout.readline()
    r = {}; errs = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1280, 'height': 720})).new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await pg.goto(BASE + '/'); await pg.wait_for_timeout(400)
            r['notice_hidden_without_relay'] = await pg.evaluate('document.getElementById("telNote").hidden')
            await pg.evaluate('window.__eightfold.relay("%s/relay")' % BASE)
            r['notice_shown_with_relay'] = not await pg.evaluate('document.getElementById("telNote").hidden')
            await pg.click('#lv1'); await pg.click('#btnGo'); await wait_state(pg, ['fail'], 15); await pg.wait_for_timeout(2400)   # a run's record goes a moment after it ends, behind its score
            f = stored(); name = list(f['files'].keys())[0] if f['files'] else None; d = f['files'][name]['data'] if name else {}
            r['first_run_sent_at_once'] = (f['posts'], name is not None and name.startswith('sessions/'), d.get('n'))
            r['branch'] = f['files'][name]['branch'] if name else None
            r['session_stored'] = d.get('session')
            r['attempt_stored'] = d.get('attempts', [None])[0]
            # inside the 30 s gap nothing more is sent: one more fall, then a full run by keyboard with a pause in it
            await pg.keyboard.press(' '); await wait_state(pg, ['play'], 3); await wait_state(pg, ['fail'], 15); await pg.wait_for_timeout(500)
            await pg.keyboard.press(' '); await wait_state(pg, ['play'], 3)
            info = await pg.evaluate('window.__eightfold.info()'); ev = info['events']; i = 0; keymap = {'L': 'ArrowLeft', 'R': 'ArrowRight', 'F': 'ArrowUp', 'J': ' '}; paused = False
            for _ in range(6000):
                st = await pg.evaluate(S)
                if st['state'] != 'play': break
                while i < len(ev) and st['z'] >= ev[i]['z0'] + (ev[i]['z1'] - ev[i]['z0']) * .5:
                    await pg.keyboard.press(keymap[ev[i]['key']]); i += 1
                if not paused and st['z'] > 120: paused = True; await pg.keyboard.press('p'); await pg.wait_for_timeout(1200); await pg.keyboard.press('p')
                await pg.wait_for_timeout(8)
            r['keyboard_run'] = ((await pg.evaluate(S))['state'], i)
            r['rating_row_on_win'] = await pg.evaluate('[...document.querySelectorAll("#winRate button")].map(b => b.textContent)')
            await pg.click('#winRate button:nth-of-type(3)'); r['rating_thanks'] = await pg.evaluate('document.getElementById("winRate").textContent')
            f = stored(); r['held_back_inside_30s'] = (f['posts'], f['files'][name]['data']['n'])
            await pg.evaluate('window.dispatchEvent(new Event("pagehide"))'); await pg.wait_for_timeout(800)
            f = stored(); d = f['files'][name]['data']; r['sent_when_page_put_away'] = (f['posts'], d['n'], len(f['files']))
            win = [a for a in d['attempts'] if a['res'] == 'win'][0]
            r['win_record'] = {k: win.get(k) for k in ('i', 'pr', 'in', 'pz', 'pts', 'sp', 'fx', 'rt')}; r['trace_len'] = len(win.get('tr', []))
            r['visit'] = {k: d['session'].get(k) for k in ('fb', 'cores', 'st', 'dur', 'muted', 'binds')}; r['trail'] = d['session'].get('ev')
            # the stored runs replay to the same endings in Node, from the trace alone
            tmp = os.path.join(HERE, 'out', 'relay-session.json'); os.makedirs(os.path.dirname(tmp), exist_ok=True); json.dump(d, open(tmp, 'w'))
            r['replay'] = subprocess.run(['node', os.path.join(HERE, '..', '..', 'tools', 'replay.js'), tmp], capture_output=True, text=True).stdout.strip()
            r['player'] = {k: d['session'].get(k) for k in ('pid', 'vn', 'first')}
            # feedback: from the result screen, typed, sent at once, and listed by the tool
            await pg.click('#btnNote4'); await pg.wait_for_timeout(200)
            r['feedback_info'] = await pg.evaluate('document.getElementById("noteInfo").textContent')
            await pg.click('#noteKind button:nth-of-type(2)'); await pg.fill('#noteText', 'The first turn comes too soon — très vite. p and t and space typed fine.')
            await pg.screenshot(path=os.path.join(HERE, 'out', 'feedback.png'))
            await pg.click('#btnNoteSend'); await pg.wait_for_timeout(800)
            r['feedback_done'] = await pg.evaluate('document.getElementById("noteDone").textContent')
            f = stored(); d = f['files'][name]['data']; r['feedback_stored'] = d['session'].get('notes')
            json.dump(d, open(tmp, 'w'))
            r['feedback_tool'] = subprocess.run(['node', os.path.join(HERE, '..', '..', 'tools', 'feedback.js'), tmp], capture_output=True, text=True).stdout.strip()
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
            # an error in the page is noted and sent; a tutorial run records how long each step waited
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.evaluate('window.__eightfold.boom()'); await pg.wait_for_timeout(200)
            await pg.click('#lvTut'); keys = {'←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', 'Space': ' ', '↓': 'ArrowDown'}; n = 0
            for _ in range(600):
                st = await pg.evaluate(S)
                if st['state'] != 'play' or n >= 3: break
                if st['frozen']:
                    k = await pg.evaluate('document.querySelector("#tip kbd").textContent')
                    if n == 1: await pg.keyboard.press('ArrowRight' if k != '→' else 'ArrowLeft'); await pg.wait_for_timeout(150)
                    await pg.keyboard.press(keys.get(k, k.lower())); n += 1; await pg.wait_for_timeout(150)
                else: await pg.wait_for_timeout(60)
            # the network drops as the tab is closed: these runs stay unsent
            await pg.route('**/relay', lambda route: route.abort())
            await pg.keyboard.press('p'); await pg.click('#btnQuit'); await pg.wait_for_timeout(300)
            await pg.evaluate('window.dispatchEvent(new Event("pagehide"))'); await pg.wait_for_timeout(500)
            before = stored(); r['unsent_while_offline'] = len([a for a in before['files'][name]['data']['attempts'] if a['m'] == 'T'])
            # next visit: same player code, visit 2, and the earlier visit's unsent runs go up
            await pg.unroute('**/relay'); await pg.reload(); await pg.wait_for_timeout(400)
            await pg.evaluate('window.__eightfold.relay("%s/relay")' % BASE); await pg.evaluate('window.dispatchEvent(new Event("pagehide"))')
            pid2 = (await pg.evaluate('window.__eightfold.tel()'))['pid']; r['same_player_code_after_reload'] = __import__('hashlib').sha256(('eightfold:' + pid2).encode()).hexdigest()[:16] == r['player']['pid']   # what is filed is a hash of the code
            await pg.reload(); await pg.wait_for_timeout(300)   # the catch-up runs at start-up, once the relay address is known
            r['note'] = 'catch-up needs the relay address at start-up; the test hook sets it after, so it is called by hand below'
            await pg.evaluate('window.__eightfold.relay("%s/relay")' % BASE); await pg.evaluate('window.__eightfold.catchUp()'); await pg.wait_for_timeout(5500)
            f = stored(); d1 = f['files'][name]['data']; tut = [a for a in d1['attempts'] if a['m'] == 'T']
            r['caught_up_on_next_visit'] = (len(tut), tut[0].get('tt') if tut else None, tut[0].get('res') if tut else None)
            r['error_stored'] = d1['session'].get('err')
            r['visit_numbers'] = sorted(x['data']['session'].get('vn') for x in f['files'].values() if x['data']['session'].get('pid') == r['player']['pid'])
            # switch recording off: notice goes, nothing more is sent
            await pg.click('#btnControls'); await pg.click('#btnData')
            r['sheet_says'] = (await pg.evaluate('document.getElementById("dataInfo").textContent'))[-230:]
            await pg.click('#btnDataToggle'); await pg.keyboard.press('Escape')
            r['notice_gone_when_off'] = await pg.evaluate('document.getElementById("telNote").hidden')
            await pg.click('#lv1'); await pg.click('#btnGo'); await wait_state(pg, ['fail'], 15); await pg.evaluate('window.dispatchEvent(new Event("pagehide"))'); await pg.wait_for_timeout(600)
            r['nothing_sent_when_off'] = stored()['posts'] == f['posts']
            await b.close()
    finally:
        srv.terminate()
    r['errors'] = errs
    report('', r, EXPECT); done()
asyncio.run(main())
