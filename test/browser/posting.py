import asyncio, json, os, subprocess, urllib.request
from playwright.async_api import async_playwright
# What happens to a leaderboard run when things go wrong: no name yet, a relay that does not answer, writes that collide
# at GitHub, a tab closed with a run still waiting. In every case the player's best run must end up filed, once.
# Also: switching tabs sends no play data on its own, and a play-data send that fails is sent again.
# Usage: python3 test/browser/posting.py      (needs: node build.js --test)
HERE = os.path.dirname(os.path.abspath(__file__)); PORT = 8794; BASE = 'http://127.0.0.1:%d' % PORT
S = 'window.__eightfold.state()'; KEY = {'L': 'ArrowLeft', 'R': 'ArrowRight', 'F': 'ArrowUp', 'J': ' '}
def get(path): return urllib.request.urlopen(BASE + path).read().decode()
def stored(): return json.loads(get('/files'))
def scores(): return sorted((v['data']['run']['z'], v['data']['name']) for k, v in stored()['files'].items() if k.startswith('scores/'))
async def play(pg, stop_at):
    i = 0; ev = []
    for n in range(20000):
        if n % 40 == 0: ev = [e for e in (await pg.evaluate('window.__eightfold.info()'))['events'] if not e['opt']]
        st = await pg.evaluate(S)
        if st['state'] != 'play': break
        if st['z'] > stop_at: await pg.wait_for_timeout(10); continue
        while i < len(ev) and st['z'] >= ev[i]['z0'] + (ev[i]['z1'] - ev[i]['z0']) * .5:
            await pg.keyboard.press(KEY[ev[i]['key']]); i += 1
        await pg.wait_for_timeout(5)
    await pg.wait_for_timeout(900); return (await pg.evaluate(S))
async def open_game(ctx, errs):
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE + '/'); await pg.wait_for_timeout(300); await pg.evaluate('window.__eightfold.relay("%s/relay")' % BASE)
    return pg
row = 'document.getElementById("failPost").hidden ? "(hidden)" : document.getElementById("failPost").textContent'
async def main():
    srv = subprocess.Popen(['node', os.path.join(HERE, 'relay_server.mjs'), str(PORT)], stdout=subprocess.PIPE, text=True); srv.stdout.readline()
    r = {}; errs = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1280, 'height': 720}); pg = await open_game(ctx, errs)
            # 1. no name yet: a good run, the prompt ignored, then a worse run. The good one is still the one on offer.
            await pg.click('#lvEndless'); await pg.click('#btnGo'); st = await play(pg, 250); far = round(st['z'])
            r['1_prompt_after_good_run'] = (far, (await pg.evaluate(row))[:44])
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.click('#lvEndless'); await pg.click('#btnGo'); st = await play(pg, 70)
            r['1_prompt_after_worse_run'] = (round(st['z']), (await pg.evaluate(row))[:80])
            r['1_nothing_filed_yet'] = scores()
            # 2. the relay does not answer the first time: the run is kept and sent again without being asked
            get('/down/1')
            await pg.fill('#postName', 'abc'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(700)
            r['2_relay_silent'] = (await pg.evaluate(row))[:90]
            await pg.wait_for_timeout(4600)
            r['2_sent_again'] = ((await pg.evaluate(row))[:34], scores())
            # 3. GitHub refuses the write three times running (other writes got in first): the relay keeps trying
            get('/failputs/3')
            await pg.keyboard.press(' '); await pg.wait_for_timeout(300); st = await play(pg, 330); await pg.wait_for_timeout(2500)
            r['3_collisions'] = ((await pg.evaluate(row))[:34], scores())
            # 4. the relay is down, and the tab is closed with the run still waiting: it goes up on the next visit
            get('/down/99')
            await pg.keyboard.press(' '); await pg.wait_for_timeout(300); st = await play(pg, 420); await pg.wait_for_timeout(800)
            r['4_waiting'] = ((await pg.evaluate(row))[:60], len(scores()), list((await pg.evaluate('window.__eightfold.stats().pending')).keys())[0][:1])
            await pg.close(); get('/down/0')
            pg = await open_game(ctx, errs); await pg.wait_for_timeout(4200)
            r['4_next_visit'] = (scores(), await pg.evaluate('Object.keys(window.__eightfold.stats().pending).length'))
            await pg.click('#btnBoard'); await pg.wait_for_timeout(400)
            r['4_board_note_mine'] = (await pg.evaluate('document.getElementById("boardNote").textContent'))[:38]
            await pg.keyboard.press('Escape')
            # 5. play data: leaving the tab sends what is new, once; coming and going after that sends nothing
            hide = '''(n => { let h = false; Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
              for (let i = 0; i < n; i++) { h = true; document.dispatchEvent(new Event('visibilitychange')); h = false; document.dispatchEvent(new Event('visibilitychange')); } })'''
            await pg.wait_for_timeout(1500); p0 = stored()['posts']; await pg.evaluate(hide + '(1)'); await pg.wait_for_timeout(900); p1 = stored()['posts']
            await pg.evaluate(hide + '(4)'); await pg.wait_for_timeout(1200)
            r['5_leaving_sends_once_then_nothing'] = (p1 - p0, stored()['posts'] - p1)
            # 6. a play-data send that fails is sent again by itself
            sess = lambda: sorted(len(v['data']['attempts']) for k, v in stored()['files'].items() if k.startswith('sessions/'))
            await pg.click('#lvEndless'); await pg.click('#btnGo'); await pg.wait_for_timeout(1500); get('/busy/1'); await pg.evaluate('window.__eightfold.kill()'); await pg.wait_for_timeout(800)
            await pg.evaluate(hide + '(1)'); await pg.wait_for_timeout(2500)
            r['6_send_failed'] = sess()
            await pg.wait_for_timeout(15500)
            r['6_sent_again'] = sess()
            await b.close()
    finally:
        srv.terminate()
    r['errors'] = errs
    for k, v in r.items(): print('  ', k, '=', v)
asyncio.run(main())
