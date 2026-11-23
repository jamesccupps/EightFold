# Plays levels in the real page through real keydown events, with human-like timing, in real time.
# Usage: python3 test/browser/play.py 1,2,3 [timing error in seconds, default 0.045]   (9 = the daily course)
import os
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = 'file://' + os.path.join(HERE, 'build.html')      # made by: node build.js --test
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
import asyncio, sys, json
from playwright.async_api import async_playwright
levels = [int(x) for x in sys.argv[1].split(',')]
SIGMA = float(sys.argv[2]) if len(sys.argv) > 2 else 0.045
PLAYER = """
(sigma) => {
  const H = window.__eightfold, info = H.info(), ev = info.events, keyFor = {L:'ArrowLeft', R:'ArrowRight', F:'ArrowUp', J:' '};
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) / Math.sqrt(.5); };
  let i = 0, last = performance.now(); const P = window.__p = { done: false, presses: 0, frames: 0, slow: 0, maxdt: 0 };
  for (const e of ev) e.t = e.z0 + (e.z1 - e.z0) * (.3 + .25 * Math.random()) + gauss() * sigma * e.v;
  function loop(now) {
    const dt = now - last; last = now; P.frames++; if (dt > 25) P.slow++; if (dt > P.maxdt) P.maxdt = dt;
    const st = H.state();
    if (st.state !== 'play' && st.state !== 'dead') { P.done = true; P.end = st.state; return; }
    while (i < ev.length) { const e = ev[i]; if (e.opt) { i++; continue; }
      if (st.z >= e.t) { window.dispatchEvent(new KeyboardEvent('keydown', { key: keyFor[e.key], bubbles: true })); P.presses++; i++; } else break; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1280, 'height': 720}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(PAGE); await pg.wait_for_timeout(400)
        await pg.click('#btnControls'); await pg.click('text=All unlocked'); await pg.click('#btnCloseCtrl')
        out = []; brief = []
        for lv in levels:
            await pg.click('#lvDaily' if lv == 9 else f'#lv{lv}')
            if lv in (4, 7): await pg.screenshot(path=os.path.join(OUT, f'brief{lv}.png'))
            brief.append(await pg.evaluate('document.getElementById("briefSheet").hidden ? "NO BRIEF" : document.getElementById("brNo").textContent + " | new: " + [...document.querySelectorAll("#brNew b")].map(b=>b.textContent).join(", ") + " | also: " + [...document.querySelectorAll("#brAlso .chip, #brAlso b")].map(b=>b.textContent).join(", ")'))
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
            info = await pg.evaluate('window.__eightfold.info()')
            shots = sorted(info['objs'], key=lambda o: o['r']); attempts = 0; deaths = []
            while attempts < 5:
                attempts += 1
                await pg.evaluate(PLAYER, SIGMA)
                todo = list(shots) if attempts == 1 else []
                while True:
                    st = await pg.evaluate('({s: window.__eightfold.state(), p: window.__p})')
                    if st['p']['done']: break
                    if todo:
                        o = todo[0]; lead = 9 if o['t'] in ('sweeper', 'beam', 'fan') else 6
                        if st['s']['z'] >= o['r'] - lead:
                            await pg.screenshot(path=os.path.join(OUT, f"L{lv}_{o['t']}.png")); todo.pop(0)
                    await pg.wait_for_timeout(25)
                perf = st['p']
                if perf['end'] == 'win': break
                deaths.append(await pg.evaluate('document.getElementById("failBig").textContent + " " + document.getElementById("failStat").textContent.split("·")[0].trim()'))
                await pg.wait_for_timeout(450); await pg.keyboard.press('Space'); await pg.wait_for_timeout(150)
            win = await pg.evaluate('document.getElementById("winStat").textContent') if perf['end'] == 'win' else ''
            pf = await pg.evaluate('window.__eightfold.perf()')
            out.append(dict(renderMs=round(pf['renderMs'],2), scale=pf['scale'], level=lv, name=info['name'], attempts=attempts, cleared=perf['end'] == 'win', deaths=deaths, win=win, frames=perf['frames'], slowFrames=perf['slow'], maxdt=round(perf['maxdt'])))
            print(json.dumps(out[-1]), flush=True)
            await pg.evaluate('(document.getElementById("winPanel").hidden ? document.getElementById("btnQuit3") : document.getElementById("btnQuit2")).click()')
            await pg.wait_for_timeout(300)
        [print('BRIEF', x) for x in brief]
        print('page errors:', errs or 'none'); await b.close()
asyncio.run(main())
