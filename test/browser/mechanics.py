import asyncio, json, os, subprocess
from playwright.async_api import async_playwright
# Perfect timing, risk routes, the reminder for a move not yet learned, and the result screen naming the move that was missed.
# Usage: python3 test/browser/mechanics.py      (needs: node build.js --test)
HERE = os.path.dirname(os.path.abspath(__file__)); URL = 'file://' + os.path.join(HERE, 'build.html'); S = 'window.__eightfold.state()'
KEY = {'L': 'ArrowLeft', 'R': 'ArrowRight', 'F': 'ArrowUp', 'J': ' '}
async def play(pg, frac, take_opt=True, stop_at=None):
    info = await pg.evaluate('window.__eightfold.info()'); ev = [e for e in info['events'] if take_opt or not e['opt']]; i = 0; seen = {'tip': [], 'perf': 0, 'maxscale': 0}
    for _ in range(12000):
        st = await pg.evaluate('''(() => { const s = window.__eightfold.state(), p = window.__eightfold.pace(), t = document.getElementById('tip'), g = document.getElementById('tgPerf'); return [s.state, s.z, p.perfects, p.scale, t.hidden ? '' : t.textContent, g.hidden ? '' : g.textContent]; })()''')
        if st[0] != 'play': break
        if st[4] and st[4] not in seen['tip']: seen['tip'].append(st[4])
        if st[5]: seen['tag'] = st[5]
        seen['perf'] = st[2]; seen['maxscale'] = max(seen['maxscale'], st[3])
        if stop_at is not None and st[1] > stop_at: await pg.wait_for_timeout(8); continue
        while i < len(ev) and st[1] >= ev[i]['z0'] + (ev[i]['z1'] - ev[i]['z0']) * frac:
            await pg.keyboard.press(KEY[ev[i]['key']]); i += 1
        await pg.wait_for_timeout(5)
    return seen, i, len(ev)
async def main():
    r = {}; errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1280, 'height': 720}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.add_init_script("if (!localStorage.getItem('eightfold.opts')) localStorage.setItem('eightfold.opts', JSON.stringify({unlockAll: true}))")
        await pg.goto(URL); await pg.wait_for_timeout(300)
        # a new player who skipped the tutorial: reminders name each kind of obstacle and its key, the first two times only
        await pg.keyboard.press('1'); await pg.wait_for_timeout(300); r['brief_mentions'] = ['perfect' in (await pg.evaluate('document.getElementById("brNote").textContent')), 'Red sparks' in (await pg.evaluate('document.getElementById("brNote").textContent'))]
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        seen, n, total = await play(pg, .5, take_opt=True)
        r['early_presses'] = {'state': (await pg.evaluate(S))['state'], 'pressed': (n, total), 'perfects': seen['perf'], 'top_speed_scale': round(seen['maxscale'], 3)}
        r['reminders_shown'] = seen['tip']
        r['win_stat_mid'] = await pg.evaluate('document.getElementById("winStat").textContent'); t_mid = (await pg.evaluate('window.__eightfold.pace()'))['t']
        # the same level again, pressing at the last moment: perfects, a surge, a faster time
        await pg.click('#btnAgain'); await pg.wait_for_timeout(300)
        seen, n, total = await play(pg, .93, take_opt=True)
        r['late_presses'] = {'state': (await pg.evaluate(S))['state'], 'perfects': seen['perf'], 'top_speed_scale': round(seen['maxscale'], 3), 'hud_tag': seen.get('tag')}
        r['no_reminders_second_time'] = seen['tip']
        t_late = (await pg.evaluate('window.__eightfold.pace()'))['t']; r['times_mid_vs_late'] = (round(t_mid, 2), round(t_late, 2))
        r['win_stat_late'] = await pg.evaluate('document.getElementById("winStat").textContent'); r['win_parts'] = await pg.evaluate('document.getElementById("winParts").textContent')
        # skipping the risk routes is safe and slower; the sparks left behind show in the count
        await pg.click('#btnAgain'); await pg.wait_for_timeout(300)
        seen, n, total = await play(pg, .5, take_opt=False)
        r['safe_line_only'] = ((await pg.evaluate(S))['state'], await pg.evaluate('document.getElementById("winStat").textContent'))
        # level 3, stop pressing part way: the result screen names what was needed
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); await pg.keyboard.press('3'); await pg.wait_for_timeout(300); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await play(pg, .5, take_opt=False, stop_at=60); await pg.wait_for_timeout(900)
        r['fail_names_the_move'] = await pg.evaluate('(() => { const e = document.getElementById("failNeed"); return e.hidden ? "" : e.textContent; })()')
        await pg.screenshot(path=os.path.join(HERE, 'out', 'fail-need.png'))
        # recordings: perfects and red sparks are in them, and each run's time can be worked out again from its presses
        tel = await pg.evaluate('window.__eightfold.tel()'); r['records'] = [(a['m'], a['res'], a['d'], a.get('pf'), a.get('rk'), a['sp']) for a in tel['log']]
        tmp = os.path.join(HERE, 'out', 'mechanics-data.json'); json.dump({'sessions': tel['sessions'], 'log': tel['log']}, open(tmp, 'w'))
        r['replay'] = subprocess.run(['node', os.path.join(HERE, '..', '..', 'tools', 'replay.js'), tmp], capture_output=True, text=True).stdout.strip()
        # a risk route up close
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); await pg.keyboard.press('2'); await pg.wait_for_timeout(300); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        info = await pg.evaluate('window.__eightfold.info()'); risk = [e for e in info['events'] if e['opt']]
        r['risk_events_in_level2'] = len(risk)
        await b.close()
    r['errors'] = errs
    for k, v in r.items(): print('  ', k, '=', v)
asyncio.run(main())
