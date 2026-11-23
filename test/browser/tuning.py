import asyncio, json, os
from playwright.async_api import async_playwright
# Drives the tuning drawer and the play recording through real input.
# Usage: python3 test/browser/tuning.py      (needs: node build.js --test)
HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'file://' + os.path.join(HERE, 'build.html')
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
S = 'window.__eightfold.state()'
async def wait_state(pg, want, secs):
    for _ in range(int(secs * 10)):
        st = await pg.evaluate(S)
        if st['state'] in want: return st
        await pg.wait_for_timeout(100)
    return await pg.evaluate(S)
async def slide(pg, key, value):   # move a slider the way a person does: focus it and set it, firing input then change
    await pg.evaluate('''([k, v]) => { const r = document.getElementById('tu-' + k); r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); }''', [key, value])

async def main():
    r = {}; errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1280, 'height': 720}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(400)
        # --- drawer from the menu: defaults, check line, camera slider changes the picture ---
        await pg.click('#btnTune'); await pg.wait_for_timeout(300)
        r['drawer_open'] = not await pg.evaluate('document.getElementById("tuneSheet").hidden')
        r['menu_hidden_behind'] = await pg.evaluate('document.getElementById("menu").hidden')
        r['check_default'] = await pg.evaluate('document.getElementById("tuneCheck").textContent')
        r['sliders'] = await pg.evaluate('document.querySelectorAll("#tuneRows input").length')
        await pg.screenshot(path=os.path.join(OUT, 'tune-default.png'))
        px0 = await pg.evaluate('(() => { const c = document.getElementById("c"); return c.toDataURL().length; })()')
        await slide(pg, 'camBack', 6.2); await slide(pg, 'camUp', .8); await pg.wait_for_timeout(300)
        px1 = await pg.evaluate('(() => { const c = document.getElementById("c"); return c.toDataURL().length; })()')
        r['camera_redraws_live'] = px0 != px1
        await pg.screenshot(path=os.path.join(OUT, 'tune-camera.png'))
        r['out_changed'] = json.loads(await pg.evaluate('document.getElementById("tuneOut").value'))['changed']
        # camera-only changes do not turn scoring off
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        r['esc_back_to_menu'] = (await pg.evaluate(S))['state'] == 'menu' and not await pg.evaluate('document.getElementById("menu").hidden')
        await pg.click('#lv1'); await pg.click('#btnGo'); await pg.wait_for_timeout(300)
        r['camera_only_still_scored'] = await pg.evaluate('document.getElementById("tgPrac").hidden')
        # --- T in a run: pauses, the run does not move, move times re-lay the course and restart ---
        await pg.wait_for_timeout(600); sig0 = await pg.evaluate('window.__eightfold.sig()')
        await pg.keyboard.press('t'); await pg.wait_for_timeout(200); a = await pg.evaluate(S); await pg.wait_for_timeout(600); c = await pg.evaluate(S)
        r['t_pauses_run'] = (a['state'], round(c['z'] - a['z'], 3))
        await slide(pg, 'jump', .56); await slide(pg, 'flip', .46); await slide(pg, 'pace', 1.1); await pg.wait_for_timeout(200)
        r['check_after_jump'] = await pg.evaluate('document.getElementById("tuneCheck").textContent')
        await pg.click('#btnTuneTry'); await pg.wait_for_timeout(300); st = await pg.evaluate(S)
        r['try_restarts_run'] = (st['state'], st['z'] < 6, st['tries'])
        r['course_relaid'] = sig0 != await pg.evaluate('window.__eightfold.sig()')
        r['tuned_tag'] = await pg.evaluate('(() => { const e = document.getElementById("tgPrac"); return e.hidden ? "" : e.textContent; })()')
        # play the re-laid level by keyboard from its own route, a little late in each window
        info = await pg.evaluate('window.__eightfold.info()'); ev = [e for e in info['events'] if not e['opt']]; i = 0
        keymap = {'L': 'ArrowLeft', 'R': 'ArrowRight', 'F': 'ArrowUp', 'J': ' '}
        for _ in range(4000):
            st = await pg.evaluate(S)
            if st['state'] != 'play': break
            while i < len(ev) and st['z'] >= ev[i]['z0'] + (ev[i]['z1'] - ev[i]['z0']) * .45:
                await pg.keyboard.press(keymap[ev[i]['key']]); i += 1
            await pg.wait_for_timeout(8)
        st = await pg.evaluate(S); r['tuned_level_cleared_by_keyboard'] = (st['state'], i, len(ev))
        r['tuned_win_text'] = await pg.evaluate('document.getElementById("winText").textContent')
        await pg.click('#btnQuit2'); await pg.wait_for_timeout(200)
        r['tuned_run_not_scored'] = await pg.evaluate('document.querySelector("#lv1 .bs").textContent')
        # --- recording: a fall, a restart and the win are all there, with press timing ---
        await pg.click('#lv1'); await pg.click('#btnGo'); st = await wait_state(pg, ['fail'], 15)   # idle: fall off the first step
        await pg.wait_for_timeout(400); await pg.keyboard.press(' '); await pg.wait_for_timeout(500); await pg.keyboard.press('r'); await pg.wait_for_timeout(300)
        await pg.keyboard.press('p'); await pg.click('#btnQuit'); await pg.wait_for_timeout(200)
        tel = await pg.evaluate('window.__eightfold.tel()'); log = tel['log']
        r['records'] = [(x['m'], x['res'], x['pc'], x.get('k', ''), x['pr']) for x in log]
        win = [x for x in log if x['res'] == 'win'][0]
        r['win_press_timing'] = win.get('kk'); r['win_hist'] = win['fh']; r['win_tune'] = win.get('tu'); r['win_fps'] = win['fps']
        fall = [x for x in log if x['res'] == 'fall'][0]; r['fall_missed_move'] = fall.get('nx')
        r['session'] = {k: tel['sessions'][-1][k] for k in ('build', 'host', 'w', 'h', 'tune')}
        await pg.click('#btnData'); await pg.wait_for_timeout(200)
        r['data_info'] = await pg.evaluate('document.getElementById("dataInfo").textContent')
        r['data_levels'] = await pg.evaluate('[...document.querySelectorAll("#dataLv tr")].map(t => [...t.children].map(c => c.textContent).join(" | "))')
        r['data_obstacles'] = await pg.evaluate('[...document.querySelectorAll("#dataOb tr")].map(t => [...t.children].map(c => c.textContent).join(" | "))')
        await pg.screenshot(path=os.path.join(OUT, 'play-data.png'))
        await pg.click('#btnDataToggle'); r['toggle_off'] = await pg.evaluate('document.getElementById("btnDataToggle").textContent')
        await pg.click('#btnDataToggle')
        # reload: values and records survive; reset puts everything back and scoring returns
        await pg.reload(); await pg.wait_for_timeout(400)
        r['reload_keeps_tune'] = (await pg.evaluate('window.__eightfold.tune()'))['jump']
        r['reload_keeps_records'] = len((await pg.evaluate('window.__eightfold.tel()'))['log'])
        await pg.click('#btnTune'); await pg.click('#btnTuneReset'); await pg.wait_for_timeout(200)
        r['reset_changed'] = json.loads(await pg.evaluate('document.getElementById("tuneOut").value'))['changed']
        await pg.click('#btnCloseTune'); await pg.click('#lv1'); await pg.click('#btnGo'); await pg.wait_for_timeout(200)
        r['scored_again_after_reset'] = await pg.evaluate('document.getElementById("tgPrac").hidden')
        r['default_course_back'] = sig0 == await pg.evaluate('window.__eightfold.sig()')
        # extreme combination: the check must speak up if a level becomes impossible, and never throw
        await pg.keyboard.press('t'); await slide(pg, 'jump', .30); await slide(pg, 'flip', .56); await slide(pg, 'hop', .18); await pg.wait_for_timeout(300)
        r['check_extreme'] = await pg.evaluate('document.getElementById("tuneCheck").textContent')
        await pg.click('#btnTuneReset'); await pg.click('#btnCloseTune'); await pg.wait_for_timeout(200)
        r['erase'] = None; await pg.keyboard.press('p'); await pg.click('#btnQuit'); await pg.click('#btnData'); await pg.click('#btnDataClear'); await pg.click('#btnDataClear')
        r['erase'] = len((await pg.evaluate('window.__eightfold.tel()'))['log'])
        await pg.keyboard.press('Escape')
        await b.close()
        # --- phone: the drawer is a bottom sheet and leaves the tunnel in view ---
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(400); await pg.tap('#btnTune'); await pg.wait_for_timeout(300)
        box = await pg.evaluate('(() => { const b = document.getElementById("tuneSheet").getBoundingClientRect(); return [Math.round(b.top), Math.round(b.width), Math.round(b.height)]; })()')
        r['phone_drawer_top_width_height'] = box
        await pg.screenshot(path=os.path.join(OUT, 'tune-phone.png')); await b.close()
    r['errors'] = errs
    for k, v in r.items(): print('  ', k, '=', v)
asyncio.run(main())
