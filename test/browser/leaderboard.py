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
from _check import report, done
EXPECT = { 'version_on_menu': lambda v: v.startswith('Version 20') and 'engine' in v, 'asks_for_name': True, 'typing_does_not_restart': lambda v: v[0] == 'fail', 'post_message': lambda v: v.startswith('Posted as JMC'),
  'score_filed': 1, 'checker': lambda v: '1 count' in v and '0 refused' in v, 'board_endless': lambda v: len(v) == 1 and 'JMC (you)' in v[0], 'shorter_run_not_posted': lambda v: v[1] is True,
  'longer_run_posted': lambda v: v[1].startswith('Posted as JMC'), 'random_course_not_posted': lambda v: v[1] is True, 'level1': lambda v: v[0] == 'win' and v[1].startswith('Posted as JMC'),
  'checker_2': lambda v: '0 refused' in v and '2 boards' in v, 'board_default_tab': 'Endless', 'earlier_daily': lambda v: v['today_label'] == 'Today,' and v['later_off_today'] and not v['play_offered_today'] and v['earlier_info'] and v['earlier_rows'] == 'Nobody posted a clear that day.' and v['later_on'] and v['stops_going_back']
   and v['brief'] and v['plays_that_day'] == ('play', 'daily', True, True) and v['result_says'] and v['no_post_offered'] and v['again_is_the_same_day'] == (True, True) and v['todays_attempts_untouched'] and v['nothing_new_filed'] and v['todays_course_is_another'] == (False, True),
  'earlier_version_runs': lambda v: v['posted'] >= 3 and v['kept'] == ['SAME'] and v['dropped'] == ['place', 'time'] and v['second_pass_checks'].startswith('0 new') and v['after_an_engine_change_checks'].startswith('%d new' % (v['posted'] * 3)),
  'board_level1': lambda v: len(v) == 1 and 'JMC (you)' in v[0], 'board_empty': lambda v: v.startswith('Nobody yet') }
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
            # Earlier daily courses: their boards can be stepped back through, and the course played again, unranked.
            await pg.goto(BASE + '/'); await pg.wait_for_timeout(400); await pg.evaluate('window.__eightfold.relay("%s/relay")' % BASE)
            yest = await pg.evaluate('(() => { const d = new Date(); d.setDate(d.getDate() - 1); const z = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); })()')
            tries0 = (await pg.evaluate(S))['dailyTries']
            filed0 = len([k for k in stored()['files'] if k.startswith('scores/')])
            await pg.click('#btnBoard'); await pg.click('#boardTabs button:nth-of-type(9)'); await pg.wait_for_timeout(600)
            dv = {'today_label': (await pg.evaluate('document.getElementById("boardDayLabel").textContent'))[:6], 'later_off_today': await pg.evaluate('document.getElementById("btnDayOn").disabled'), 'play_offered_today': await pg.evaluate('!!document.getElementById("btnDayPlay")')}
            await pg.click('#btnDayBack'); await pg.wait_for_timeout(200)
            dv['earlier_info'] = 'not ranked' in await pg.evaluate('document.getElementById("boardInfo").textContent'); dv['earlier_rows'] = await pg.evaluate('document.querySelector("#boardBody tr").textContent')
            dv['later_on'] = not await pg.evaluate('document.getElementById("btnDayOn").disabled')
            for _ in range(40): await pg.click('#btnDayBack', force=True)
            dv['stops_going_back'] = await pg.evaluate('document.getElementById("btnDayBack").disabled')
            await pg.click('#boardTabs button:nth-of-type(9)'); await pg.click('#btnDayBack'); await pg.click('#btnDayPlay'); await pg.wait_for_timeout(300)
            dv['brief'] = 'not ranked' in await pg.evaluate('document.getElementById("brNo").textContent')
            if await pg.evaluate('!document.getElementById("briefSheet").hidden'): await pg.click('#btnGo')
            await pg.wait_for_timeout(300); st = await pg.evaluate(S); dv['plays_that_day'] = (st['state'], st['mode'], st['past'], st['day'] == yest); cs1 = st['cs']
            await pg.evaluate('window.__eightfold.kill()'); await pg.wait_for_timeout(1500)
            dv['result_says'] = 'counted on its day only' in await pg.evaluate('document.getElementById("failHint").textContent'); dv['no_post_offered'] = await pg.evaluate('document.getElementById("failPost").hidden')
            await pg.click('#btnRetry'); await pg.wait_for_timeout(300); st = await pg.evaluate(S); dv['again_is_the_same_day'] = (st['past'], st['cs'] == cs1)
            await pg.evaluate('window.__eightfold.kill()'); await pg.wait_for_timeout(1500)
            dv['todays_attempts_untouched'] = (await pg.evaluate(S))['dailyTries'] == tries0
            dv['nothing_new_filed'] = len([k for k in stored()['files'] if k.startswith('scores/')]) == filed0
            await pg.goto(BASE + '/'); await pg.wait_for_timeout(400); await pg.click('#lvDaily'); await pg.wait_for_timeout(300)
            if await pg.evaluate('!document.getElementById("briefSheet").hidden'): await pg.click('#btnGo')
            await pg.wait_for_timeout(300); st = await pg.evaluate(S); dv['todays_course_is_another'] = (st['past'], st['cs'] != cs1)
            r['earlier_daily'] = dv
            await b.close()
            # A fix to the game must not empty the boards. The same posted runs, marked as made on an earlier version: they stay
            # while the same presses still come to the same run on this one, and drop when they do not.
            V = os.path.join(HERE, 'out', 'lbv'); shutil.rmtree(V, ignore_errors=True); n = 0
            for root, _, fs_ in os.walk(os.path.join(TMP, 'scores')):
                for f in sorted(fs_):
                    sc = json.load(open(os.path.join(root, f))); n += 1
                    for tag, change in (('same', None), ('time', ('d', 1.0)), ('place', ('z', 7))):
                        c = json.loads(json.dumps(sc)); c['core'] = 'aaaaaaaaaa'; c['pid'] = ('%s%d' % (tag, n)).ljust(16, '0')[:16]; c['name'] = tag.upper()
                        if change: c['run'][change[0]] = c['run'].get(change[0], 0) + change[1]
                        d = os.path.join(V, 'scores', '2026-11-25'); os.makedirs(d, exist_ok=True); json.dump(c, open(os.path.join(d, '%s-%d.json' % (tag, n)), 'w'))
            out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'boards.js'), V], capture_output=True, text=True).stdout
            allb = json.load(open(os.path.join(V, 'boards', 'all.json')))['boards']; chk = json.load(open(os.path.join(V, 'boards', 'checked.json')))
            again = subprocess.run(['node', os.path.join(ROOT, 'tools', 'boards.js'), V], capture_output=True, text=True).stdout.strip().split('\n')[0]
            chk['_core'] = 'bbbbbbbbbb'; json.dump(chk, open(os.path.join(V, 'boards', 'checked.json'), 'w'))
            renew = subprocess.run(['node', os.path.join(ROOT, 'tools', 'boards.js'), V], capture_output=True, text=True).stdout.strip().split('\n')[0]
            r['earlier_version_runs'] = {'posted': n, 'kept': sorted(set(e['n'] for rows in allb.values() for e in rows)),
              'dropped': sorted(set(k.split('/')[-1].split('-')[0] for k, v in chk.items() if isinstance(v, dict) and 'no longer come to the same run' in v.get('no', ''))),
              'second_pass_checks': again.split(';')[0], 'after_an_engine_change_checks': renew.split(';')[0]}
    finally:
        srv.terminate()
    r['errors'] = errs
    report('', r, EXPECT); done()
asyncio.run(main())
