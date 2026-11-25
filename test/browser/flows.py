import asyncio, json
from playwright.async_api import async_playwright
# Drives the tutorial, restart, pause, unlock, rebinding, endless and phone flows through real input.
# Usage: python3 test/browser/flows.py
import os
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = 'file://' + os.path.join(HERE, 'build.html')      # made by: node build.js --test
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
URL = PAGE
S='window.__eightfold.state()'
from _check import report, done
EXPECT = {
  'tutorial+flows': { 'lv2_locked_at_start': True, 'tutorial_end': 'win', 'tutorial_presses': 11, 'wrong_key_ignored': True, 'win_keeps_from_a_stray_jump': 'win',
    'next_shows_briefing': ('brief', 0), 'space_starts_run': 'play', 'idle_fail': 'fail', 'space_restarts': lambda v: v[0] == 'play' and v[2] == 2, 'same_course': True,
    'pause_freezes': lambda v: v[0] == 'pause' and v[2] == 0, 'resumes': 'play', 'blur_pauses': 'pause', 'quit_to_menu': 'menu', 'l1': 'win', 'lv2_unlocked': True,
    'digit3_blocked_while_locked': True, 'reload_keeps_scores': True, 'menu_feedback_and_version_in_view': lambda v: all(x[0] <= x[2] and x[1] <= x[2] for x in v), 'mouse_click_does_not_turn': True },
  'rebinding': { 'esc_back_to_menu': 'menu', 'l3_with_rebound_keys_and_resize': 'win', 'brief_keys': 'J J' },
  'endless': { 'endless_50s': lambda v: v[0] == 'play' and v[1] > 300, 'new_course_btn': True, 'restart_same_course': True, 'new_course_differs': True },
  'phone': { 'menu_fits_width': True, 'pad_visible': True, 'pad_jump': 'jump', 'sound_button_reachable': 'btnSound' },
}
async def page(p, w=1280, h=720, **kw):
    b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': w, 'height': h}, **kw); pg = await ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    await pg.goto(URL); await pg.wait_for_timeout(400); return b, pg, errs
async def wait_state(pg, want, secs):
    for _ in range(int(secs*10)):
        st = await pg.evaluate(S)
        if st['state'] in want: return st
        await pg.wait_for_timeout(100)
    return await pg.evaluate(S)

async def tutorial(p):
    b, pg, errs = await page(p); r = {}
    r['lv2_locked_at_start'] = await pg.evaluate('document.getElementById("lv2").disabled')
    await pg.click('#lvTut'); keys = {'←':'ArrowLeft','→':'ArrowRight','↑':'ArrowUp','Space':' ','↓':'ArrowDown'}; pressed=0; wrong_ignored=True
    for _ in range(1500):
        st = await pg.evaluate(S)
        if st['state'] != 'play': break
        if st['frozen']:
            k = await pg.evaluate('document.querySelector("#tip kbd").textContent')
            if pressed == 0:   # a wrong key first: must be ignored and must not kill
                await pg.keyboard.press('ArrowRight' if k != '→' else 'ArrowLeft'); await pg.wait_for_timeout(120)
                wrong_ignored = (await pg.evaluate(S))['frozen']
            await pg.keyboard.press(keys.get(k, k.lower())); pressed += 1; await pg.wait_for_timeout(150)
        else: await pg.wait_for_timeout(60)
    st = await pg.evaluate(S)
    r.update(tutorial_end=st['state'], tutorial_presses=pressed, wrong_key_ignored=wrong_ignored, title=await pg.evaluate('document.getElementById("winTitle").textContent'))
    await pg.keyboard.press(' '); await pg.keyboard.press('ArrowUp'); await pg.wait_for_timeout(250); r['win_keeps_from_a_stray_jump'] = (await pg.evaluate(S))['state']   # still pressing as the line is crossed must not skip the result
    await pg.wait_for_timeout(800); await pg.click('#btnNext'); await pg.wait_for_timeout(300); st = await pg.evaluate(S); r['next_shows_briefing'] = (st['state'], st['mode']); await pg.keyboard.press(' '); await pg.wait_for_timeout(200); r['space_starts_run'] = (await pg.evaluate(S))['state']; l0 = (await pg.evaluate(S))['lane']; await pg.mouse.click(900, 400); await pg.wait_for_timeout(250); r['mouse_click_does_not_turn'] = (await pg.evaluate(S))['lane'] == l0
    # idle -> fail panel -> Space restarts same level -> Esc on fail returns to menu
    st = await wait_state(pg, ['fail'], 15); r['idle_fail'] = st['state']; sig1 = await pg.evaluate('window.__eightfold.sig()')
    await pg.wait_for_timeout(400); await pg.keyboard.press(' '); await pg.wait_for_timeout(200)
    st = await pg.evaluate(S); r['space_restarts'] = (st['state'], st['mode'], st['tries']); r['same_course'] = sig1 == await pg.evaluate('window.__eightfold.sig()')
    # pause in mid-jump for a second: nothing may move
    await pg.wait_for_timeout(500); await pg.keyboard.press(' '); await pg.wait_for_timeout(120); await pg.keyboard.press('p')
    a = await pg.evaluate(S); await pg.wait_for_timeout(1000); c = await pg.evaluate(S)
    r['pause_freezes'] = (a['state'], a['air'], round(c['z']-a['z'],3)); await pg.keyboard.press('p'); await pg.wait_for_timeout(100)
    r['resumes'] = (await pg.evaluate(S))['state']
    await pg.evaluate('window.dispatchEvent(new Event("blur"))'); await pg.wait_for_timeout(100); r['blur_pauses'] = (await pg.evaluate(S))['state']
    await pg.click('#btnQuit'); await pg.wait_for_timeout(200); r['quit_to_menu'] = (await pg.evaluate(S))['state']
    # clear level 1 with the pilot: level 2 must unlock and scores must show it
    await pg.click('#lv1'); await pg.click('#btnGo'); await pg.evaluate('window.__eightfold.pilot()'); st = await wait_state(pg, ['win','fail'], 60)
    r['l1'] = st['state']; r['win_text'] = await pg.evaluate('document.getElementById("winText").textContent')
    await pg.click('#btnQuit2'); await pg.wait_for_timeout(200)
    r['lv2_unlocked'] = not await pg.evaluate('document.getElementById("lv2").disabled'); r['menu_meta'] = await pg.evaluate('document.querySelector("#lv1 .bs").textContent')
    await pg.keyboard.press('3'); await pg.wait_for_timeout(200); r['digit3_blocked_while_locked'] = (await pg.evaluate(S))['state'] == 'menu'
    await pg.click('#btnScores'); r['score_row1'] = await pg.evaluate('document.querySelector("#scoreBody tr").textContent'); await pg.keyboard.press('Escape')
    r['reload_keeps_scores'] = None; await pg.reload(); await pg.wait_for_timeout(400); r['reload_keeps_scores'] = not await pg.evaluate('document.getElementById("lv2").disabled')
    sizes = []
    for w, h in [(1280, 720), (1366, 768)]:   # the version line and Feedback are on screen without scrolling on common laptop sizes
        b2, pg2, _ = await page(p, w, h)
        sizes.append(await pg2.evaluate('[Math.round(document.getElementById("btnNote").getBoundingClientRect().bottom), Math.round(document.getElementById("verNote").getBoundingClientRect().bottom), innerHeight]')); await b2.close()
    r['menu_feedback_and_version_in_view'] = sizes
    r['errors'] = errs; await b.close(); return ('tutorial+flows', r)

async def rebind(p):
    b, pg, errs = await page(p); r = {}
    await pg.click('#btnControls'); await pg.click('text=All unlocked'); await pg.click('text=Spin the tunnel')
    await pg.click('#keys .bind >> nth=6'); await pg.keyboard.press('j')       # jump -> J
    await pg.click('#keys .bind >> nth=4'); await pg.keyboard.press('k')       # flip -> K
    await pg.click('#keys .bind >> nth=0'); await pg.keyboard.press('j')       # try to give J to "left" as well: must move, not duplicate
    r['binds'] = await pg.evaluate('[...document.querySelectorAll("#keys .bind")].map(b=>b.textContent).join(" ")')
    await pg.click('#keys .bind >> nth=0'); await pg.keyboard.press('ArrowLeft'); await pg.click('#keys .bind >> nth=6'); await pg.keyboard.press('j')
    await pg.click('#btnCloseCtrl'); await pg.reload(); await pg.wait_for_timeout(400)
    await pg.click('#lv3'); r['brief_keys'] = await pg.evaluate('[...document.querySelectorAll("#brNew kbd")].map(k=>k.textContent).join(" ")'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150); r['esc_back_to_menu'] = (await pg.evaluate(S))['state']; await pg.click('#lv3'); await pg.click('#btnGo')
    # play level 3 with the rebound keys and swapped turning, through real key events
    await pg.evaluate("""() => { const H = window.__eightfold, ev = H.info().events, keyFor = {L:'ArrowRight', R:'ArrowLeft', F:'k', J:'j'}; let i = 0;
      (function loop(){ const st = H.state(); if (st.state !== 'play') return; while (i < ev.length) { const e = ev[i]; if (e.opt) { i++; continue; }
        if (st.z >= e.z0 + (e.z1 - e.z0) * .4) { window.dispatchEvent(new KeyboardEvent('keydown', {key: keyFor[e.key], bubbles: true})); i++; } else break; } requestAnimationFrame(loop); })(); }""")
    await pg.wait_for_timeout(5000); await pg.set_viewport_size({'width': 820, 'height': 480}); await pg.wait_for_timeout(3000); await pg.set_viewport_size({'width': 1280, 'height': 720})
    st = await wait_state(pg, ['win','fail'], 70); r['l3_with_rebound_keys_and_resize'] = st['state']
    r['hint_keys'] = await pg.evaluate('document.getElementById("hint").textContent')
    r['errors'] = errs; await b.close(); return ('rebinding', r)

async def endless(p):
    b, pg, errs = await page(p); r = {}
    await pg.click('#lvEndless'); await pg.click('#btnGo'); await pg.evaluate('window.__eightfold.pilot()'); s1 = await pg.evaluate('window.__eightfold.sig()')
    await pg.wait_for_timeout(50000); st = await pg.evaluate(S); r['endless_50s'] = (st['state'], round(st['z']))
    await pg.evaluate('window.__eightfold.kill()'); st = await wait_state(pg, ['fail'], 3)
    r['fail_text'] = await pg.evaluate('document.getElementById("failBig").textContent + " | " + document.getElementById("failStat").textContent'); r['new_course_btn'] = not await pg.evaluate('document.getElementById("btnNew").hidden')
    await pg.wait_for_timeout(400); await pg.keyboard.press('r'); await pg.wait_for_timeout(200); r['restart_same_course'] = s1 == await pg.evaluate('window.__eightfold.sig()')
    await pg.evaluate('window.__eightfold.kill()'); await wait_state(pg, ['fail'], 3); await pg.wait_for_timeout(300); await pg.click('#btnNew'); await pg.wait_for_timeout(200)
    r['new_course_differs'] = s1 != await pg.evaluate('window.__eightfold.sig()')
    await pg.keyboard.press('p'); await pg.click('#btnQuit'); await pg.click('#btnScores'); r['endless_rows'] = await pg.evaluate('document.getElementById("endBody").textContent')
    r['errors'] = errs; await b.close(); return ('endless', r)

async def phone(p):
    b, pg, errs = await page(p, 390, 844, has_touch=True, is_mobile=True, device_scale_factor=2); r = {}
    await pg.screenshot(path=os.path.join(OUT, 'm_menu.png'))
    r['menu_fits_width'] = await pg.evaluate('document.documentElement.scrollWidth <= innerWidth')
    r['sound_button_reachable'] = await pg.evaluate('(() => { const r = document.getElementById("btnSound").getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && t.id; })()')
    await pg.tap('#btnControls'); await pg.tap('text=All unlocked'); await pg.tap('#btnCloseCtrl'); await pg.tap('#lv6'); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(OUT, 'm_brief.png')); await pg.tap('#btnGo'); await pg.wait_for_timeout(600)
    await pg.touchscreen.tap(300, 500); await pg.wait_for_timeout(150)      # tap right half -> turn; makes the pad appear
    r['pad_visible'] = not await pg.evaluate('document.getElementById("pad").hidden')
    st = await wait_state(pg, ['fail','play'], 1)
    if st['state'] != 'play':
        await pg.wait_for_timeout(500); await pg.tap('#btnRetry'); await pg.wait_for_timeout(700)
    await pg.tap('#pad button[data-m=jump]'); await pg.wait_for_timeout(100); r['pad_jump'] = (await pg.evaluate(S))['air']
    await pg.screenshot(path=os.path.join(OUT, 'm_play.png'))
    await wait_state(pg, ['fail'], 20); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(OUT, 'm_fail.png'))
    r['errors'] = errs; await b.close(); return ('phone', r)

async def main():
    async with async_playwright() as p:
        for name, r in await asyncio.gather(tutorial(p), rebind(p), endless(p), phone(p)):
            report(name, r, EXPECT.get(name, {}))
    done()
asyncio.run(main())
