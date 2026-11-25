import asyncio, json, os, subprocess
from playwright.async_api import async_playwright
# Experiments, the fun rating, the engine id and course checksum, and tap / swipe counting.
# Usage: python3 test/browser/experiments.py      (needs: node build.js --test)
HERE = os.path.dirname(os.path.abspath(__file__)); URL = 'file://' + os.path.join(HERE, 'build.html'); S = 'window.__eightfold.state()'
XP = [{'id': 'jump-1', 'variants': [{'name': 'a', 'tune': {'jump': .47}}, {'name': 'b', 'tune': {'jump': .5}}]}]
from _check import report, done
EXPECT = { 'no_experiment_no_xp': True, 'value_matches_variant': True, 'same_variant_after_reload': True, 'variant_runs_are_scored': True, 'course_laid_out_for_variant': True,
  'level3_under_variant': lambda v: v[0] == 'win', 'asked_once': [True, True], 'replay_under_variant': lambda v: '2 replay to the recorded ending' in v }
async def main():
    r = {}; errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1280, 'height': 720}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(300); sig0 = None
        await pg.click('#lv1'); await pg.click('#btnGo'); await pg.wait_for_timeout(200); sig0 = await pg.evaluate('window.__eightfold.sig()')
        r['no_experiment_no_xp'] = 'xp' not in (await pg.evaluate('window.__eightfold.tel()'))['sessions'][-1]
        # an experiment defined in this browser's storage: the player lands in one variant and stays there
        await pg.evaluate('localStorage.setItem("eightfold.xp", JSON.stringify(%s)); localStorage.setItem("eightfold.opts", JSON.stringify({unlockAll: true}))' % json.dumps(XP))
        await pg.reload(); await pg.wait_for_timeout(300)
        t = await pg.evaluate('window.__eightfold.tune()'); tel = await pg.evaluate('window.__eightfold.tel()'); xp = tel['sessions'][-1].get('xp')
        r['variant'] = xp; r['variant_value_in_force'] = t['jump']; want = .47 if xp == {'jump-1': 'a'} else .5
        r['value_matches_variant'] = abs(t['jump'] - want) < 1e-9
        await pg.reload(); await pg.wait_for_timeout(300)
        r['same_variant_after_reload'] = (await pg.evaluate('window.__eightfold.tel()'))['sessions'][-1].get('xp') == xp
        # the drawer shows the variant's value as the default, and the run is scored
        await pg.click('#btnControls'); await pg.click('#btnTune'); r['drawer_shows_variant_as_default'] = await pg.evaluate('document.getElementById("tu-jump").nextElementSibling ? document.querySelector("#tuneRows output:nth-of-type(2)").className : ""')
        r['drawer_changed'] = json.loads(await pg.evaluate('document.getElementById("tuneOut").value'))['changed']; await pg.keyboard.press('Escape')
        await pg.keyboard.press('3'); await pg.wait_for_timeout(300); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        r['variant_runs_are_scored'] = await pg.evaluate('document.getElementById("tgPrac").hidden')
        r['course_laid_out_for_variant'] = sig0 != await pg.evaluate('window.__eightfold.sig()')
        info = await pg.evaluate('window.__eightfold.info()'); ev = info['events']; i = 0; keymap = {'L': 'ArrowLeft', 'R': 'ArrowRight', 'F': 'ArrowUp', 'J': ' '}
        for _ in range(8000):
            st = await pg.evaluate(S)
            if st['state'] != 'play': break
            while i < len(ev) and st['z'] >= ev[i]['z0'] + (ev[i]['z1'] - ev[i]['z0']) * .45:
                await pg.keyboard.press(keymap[ev[i]['key']]); i += 1
            await pg.wait_for_timeout(6)
        r['level3_under_variant'] = ((await pg.evaluate(S))['state'], i)
        # after a clear: two questions, how hard and was it fun
        r['questions'] = await pg.evaluate('[document.querySelector("#winRate span").textContent, document.querySelector("#winFun span").textContent]')
        await pg.click('#winFun button:nth-of-type(1)'); await pg.click('#winRate button:nth-of-type(2)'); await pg.wait_for_timeout(200)
        tel = await pg.evaluate('window.__eightfold.tel()'); s = tel['sessions'][-1]; a = [x for x in tel['log'] if x['m'] == 'L3'][-1]
        r['ratings'] = (s.get('fb'), s.get('fun')); r['engine_id'] = s.get('core'); r['course_checksum'] = a.get('cs'); r['tuning_recorded_with_run'] = a.get('tu'); r['load_ms'] = (s.get('load'), s.get('ff'), s.get('lang'), s.get('ls'))
        r['asked_once'] = None; await pg.click('#btnAgain'); await pg.wait_for_timeout(200); await pg.evaluate('window.__eightfold.pilot()')
        for _ in range(700):
            if (await pg.evaluate(S))['state'] != 'play': break
            await pg.wait_for_timeout(100)
        r['asked_once'] = await pg.evaluate('[document.getElementById("winRate").hidden, document.getElementById("winFun").hidden]')
        tmp = os.path.join(HERE, 'out', 'xp-data.json'); os.makedirs(os.path.dirname(tmp), exist_ok=True); json.dump({'sessions': tel['sessions'], 'log': tel['log']}, open(tmp, 'w'))
        r['replay_under_variant'] = subprocess.run(['node', os.path.join(HERE, '..', '..', 'tools', 'replay.js'), tmp], capture_output=True, text=True).stdout.strip()
        await b.close()
        # phone: taps and swipes on the tunnel are counted apart
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(300); await pg.tap('#lv1'); await pg.tap('#btnGo'); await pg.wait_for_timeout(600)
        ptr = '''([type, x, y]) => document.getElementById('c').dispatchEvent(new PointerEvent(type, {pointerType: 'touch', clientX: x, clientY: y, bubbles: true}))'''
        await pg.evaluate(ptr, ['pointerdown', 300, 400]); await pg.evaluate(ptr, ['pointerup', 300, 400]); await pg.wait_for_timeout(300)                      # a tap
        await pg.evaluate(ptr, ['pointerdown', 200, 500]); await pg.evaluate(ptr, ['pointermove', 200, 440]); await pg.evaluate(ptr, ['pointerup', 200, 440])     # a swipe up
        await pg.wait_for_timeout(400); await pg.tap('#pad button[data-m="jump"]'); await pg.wait_for_timeout(300)
        for _ in range(200):
            if (await pg.evaluate(S))['state'] == 'fail': break
            await pg.wait_for_timeout(100)
        log = (await pg.evaluate('window.__eightfold.tel()'))['log']; r['phone_presses_by_source'] = log[-1].get('in') if log else None
        await b.close()
    r['errors'] = errs
    report('', r, EXPECT); done()
asyncio.run(main())
