import asyncio, json, os, shutil, subprocess, urllib.request
from playwright.async_api import async_playwright
# The leaderboard end to end: play in a real browser, post through the real relay code, check the score with the real
# checker (tools/boards.js), and read the board back in the game.
# Usage: python3 test/browser/leaderboard.py      (needs: node build.js --test)
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..'); PORT = 8793; BASE = 'http://127.0.0.1:%d' % PORT
S = 'window.__eightfold.state()'; KEY = {'L': 'ArrowLeft', 'R': 'ArrowRight', 'F': 'ArrowUp', 'J': ' '}; TMP = os.path.join(HERE, 'out', 'lb')
def stored(): return json.loads(urllib.request.urlopen(BASE + '/files').read())
def build_boards():   # what the GitHub Action does: play every posted score back and write the boards
    shutil.rmtree(TMP, ignore_errors=True); f = stored()['files']
    for p, v in f.items():
        if p.startswith('scores/') or p.startswith('boards/'):
            os.makedirs(os.path.dirname(os.path.join(TMP, p)), exist_ok=True); json.dump(v['data'], open(os.path.join(TMP, p), 'w'))
    out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'boards.js'), TMP], capture_output=True, text=True).stdout.strip()
    for name in ('all.json', 'checked.json'):
        req = urllib.request.Request(BASE + '/setfile/boards%2F' + name, data=open(os.path.join(TMP, 'boards', name), 'rb').read(), method='POST'); urllib.request.urlopen(req).read()
    return out
async def play(pg, stop_at=None, frac=.5, opt=False):
    i = 0; ev = []
    for n in range(20000):
        if n % 40 == 0: ev = [e for e in (await pg.evaluate('window.__eightfold.info()'))['events'] if opt or not e['opt']]
        st = await pg.evaluate(S)
        if st['state'] != 'play': break
        if stop_at is not None and st['z'] > stop_at: await pg.wait_for_timeout(10); continue
        while i < len(ev) and st['z'] >= ev[i]['z0'] + (ev[i]['z1'] - ev[i]['z0']) * frac:
            await pg.keyboard.press(KEY[ev[i]['key']]); i += 1
        await pg.wait_for_timeout(5)
    await pg.wait_for_timeout(900); return (await pg.evaluate(S))
async def main():
    srv = subprocess.Popen(['node', os.path.join(HERE, 'relay_server.mjs'), str(PORT)], stdout=subprocess.PIPE, text=True); srv.stdout.readline()
    r = {}; errs = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1280, 'height': 720})).new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await pg.goto(BASE + '/'); await pg.wait_for_timeout(400); await pg.evaluate('window.__eightfold.relay("%s/relay")' % BASE)
            r['version_on_menu'] = await pg.evaluate('document.getElementById("verNote").textContent')
            # Endless, today's course: fall at about 150 m, name asked for once, typed with keys that would otherwise restart the run
            await pg.click('#lvEndless'); r['endless_brief'] = (await pg.evaluate('document.getElementById("brHint").textContent'))[:60]; await pg.click('#btnGo')
            st = await play(pg, stop_at=150); r['endless_run'] = (st['state'], round(st['z']))
            r['asks_for_name'] = await pg.evaluate('!!document.getElementById("postName")')
            await pg.click('#postName'); await pg.keyboard.type('r a'); await pg.wait_for_timeout(200)
            r['typing_does_not_restart'] = ((await pg.evaluate(S))['state'], await pg.evaluate('document.getElementById("postName").value'))
            await pg.fill('#postName', 'jmc'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(800)
            r['post_message'] = await pg.evaluate('document.getElementById("failPost").textContent')
            sf = [k for k in stored()['files'] if k.startswith('scores/')]; r['score_filed'] = len(sf)
            r['checker'] = build_boards()
            await pg.click('#failPost button'); await pg.wait_for_timeout(900)
            r['board_endless'] = await pg.evaluate('[...document.querySelectorAll("#boardBody tr")].map(t => [t.className, ...[...t.children].map(c => c.textContent)].join(" | "))')
            await pg.screenshot(path=os.path.join(HERE, 'out', 'leaderboard.png')); await pg.keyboard.press('Escape')
            # a shorter run is not posted; a longer one is, without asking again
            await pg.keyboard.press(' '); await pg.wait_for_timeout(300); st = await play(pg, stop_at=80)
            r['shorter_run_not_posted'] = (round(st['z']), await pg.evaluate('document.getElementById("failPost").hidden'))
            await pg.keyboard.press(' '); await pg.wait_for_timeout(300); st = await play(pg, stop_at=260); await pg.wait_for_timeout(600)
            r['longer_run_posted'] = (round(st['z']), (await pg.evaluate('document.getElementById("failPost").textContent'))[:40])
            # a random course is practice: nothing is posted
            await pg.click('#btnNew'); await pg.wait_for_timeout(300); st = await play(pg, stop_at=300)
            r['random_course_not_posted'] = (round(st['z']), await pg.evaluate('document.getElementById("failPost").hidden'), await pg.evaluate('document.getElementById("btnNew").textContent'))
            # level 1: a clear is posted as a time
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); await pg.click('#lv1'); await pg.click('#btnGo'); st = await play(pg, frac=.6, opt=True)
            r['level1'] = (st['state'], (await pg.evaluate('document.getElementById("winPost").textContent'))[:44])
            r['checker_2'] = build_boards()
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); await pg.click('#btnBoard'); await pg.wait_for_timeout(900)
            r['board_default_tab'] = await pg.evaluate('document.querySelector("#boardTabs button[aria-pressed=true]").textContent')
            await pg.click('#boardTabs button:nth-of-type(1)'); await pg.wait_for_timeout(300)
            r['board_level1'] = await pg.evaluate('[...document.querySelectorAll("#boardBody tr")].map(t => [...t.children].map(c => c.textContent).join(" | "))')
            await pg.click('#boardTabs button:nth-of-type(10)'); await pg.wait_for_timeout(300)
            r['board_endless_2'] = await pg.evaluate('[...document.querySelectorAll("#boardBody tr")].map(t => [...t.children].map(c => c.textContent).join(" | "))')
            await pg.click('#boardTabs button:nth-of-type(3)'); await pg.wait_for_timeout(200)
            r['board_empty'] = await pg.evaluate('document.querySelector("#boardBody tr").textContent'); r['board_note'] = (await pg.evaluate('document.getElementById("boardNote").textContent'))[:70]
            await b.close()
    finally:
        srv.terminate()
    r['errors'] = errs
    for k, v in r.items(): print('  ', k, '=', v)
asyncio.run(main())
