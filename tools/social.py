#!/usr/bin/env python3
# Makes the picture a link to the game unfurls with (og.png) and the repository's social preview
# (.github/social-preview.png): the title, one tunnel per level in that level's colours, a line about the game, and
# the game itself mid-run. Everything in it is drawn by the game: the pictures are taken from the test build with the
# pilot playing, and the lettering is the page's own two fonts.
#   node build.js --test && python3 tools/social.py        (needs Playwright and its Chromium)
import asyncio, base64, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = 'file://' + os.path.join(ROOT, 'test', 'browser', 'build.html'); H = 'window.__eightfold'
OUT = os.path.join(ROOT, 'test', 'browser', 'out', 'social'); os.makedirs(OUT, exist_ok=True)
HIDE = '.hud, .corner, #hud, #tip, .tip, #verNote, .toast, #coach, #prog, .bar { display: none !important; }'
HERO = (0, 354, 760, 640)                                   # level, row, width, height
THUMBS = [(0, .34), (1, .18), (2, .34), (3, .34), (4, .7), (5, .7), (6, .34), (7, .7)]   # level, how far through
TW, TH = 76, 70                                             # a thumbnail on the card; taken at four times the size

async def shot(b, level, where, w, h, path, scale=1):
    pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=scale)
    await pg.add_init_script("localStorage.setItem('eightfold.opts', JSON.stringify({unlockAll: true, brief: false, sound: false}))")
    await pg.goto(GAME); await pg.wait_for_timeout(400)
    await pg.evaluate(f'{H}.demo({level})'); await pg.wait_for_timeout(300); await pg.add_style_tag(content=HIDE)
    info = await pg.evaluate(H + '.info()'); row = where if where > 1 else info['end'] * where
    for _ in range(8000):
        st = await pg.evaluate(H + '.state()')
        if st['state'] != 'play' or st['z'] >= row: break
        await pg.wait_for_timeout(10)
    await pg.screenshot(path=path); await pg.close()

def uri(path, kind): return 'data:%s;base64,%s' % (kind, base64.b64encode(open(path, 'rb').read()).decode())

CARD = '''<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Unbounded; font-weight: 200 900; src: url(%(unb)s) format('woff2'); }
@font-face { font-family: 'Chivo Mono'; font-weight: 100 900; src: url(%(chivo)s) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
body { width: 1280px; height: 640px; overflow: hidden; background: #231a55; color: #f7f4ff; font-family: 'Chivo Mono', monospace; position: relative; }
.hero { position: absolute; right: -34px; top: 0; width: 760px; height: 640px; -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 44%%); mask-image: linear-gradient(90deg, transparent 0, #000 44%%); }
.left { position: absolute; left: 76px; top: 62px; width: 640px; }
h1 { font: 900 96px/.92 Unbounded, sans-serif; letter-spacing: -.02em; color: #ffd15c; text-shadow: 5px 5px 0 #6b4fd8; }
h1 span { display: block; }
h1 svg { width: .76em; height: .76em; margin: 0 .03em 0 .02em; vertical-align: -.035em; overflow: visible; filter: drop-shadow(5px 5px 0 #6b4fd8); }
.sub { margin-top: 22px; font: 600 21px/1 'Chivo Mono', monospace; letter-spacing: .44em; color: #b3a6ff; text-transform: uppercase; }
.strip { margin-top: 30px; display: flex; gap: 4px; }
.strip img { width: %(tw)dpx; height: %(th)dpx; display: block; }
p { margin-top: 30px; font: 400 23.5px/1.5 'Chivo Mono', monospace; max-width: 585px; font-variant-ligatures: none; }
.tag { margin-top: 26px; font: 600 15.5px/1 'Chivo Mono', monospace; letter-spacing: .2em; color: #ffd15c; text-transform: uppercase; white-space: nowrap; }
</style>
<img class="hero" src="%(hero)s">
<div class="left">
  <h1><span>EIGHT</span><span>F<svg viewBox="0 0 100 100"><polygon points="92.5,32.4 92.5,67.6 67.6,92.5 32.4,92.5 7.5,67.6 7.5,32.4 32.4,7.5 67.6,7.5" fill="none" stroke="currentColor" stroke-width="17"/></svg>LD</span></h1>
  <div class="sub">A tunnel runner</div>
  <div class="strip">%(thumbs)s</div>
  <p>Eight walls, one way through: turn, jump and flip. Eight levels, a new course every day, and an endless run.</p>
  <div class="tag">Free in the browser &middot; No ads &middot; Nothing to install</div>
</div>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await shot(b, HERO[0], HERO[1], HERO[2], HERO[3], os.path.join(OUT, 'hero.png'), 2)
        for lv, where in THUMBS: await shot(b, lv, where, TW * 4, TH * 4, os.path.join(OUT, 'l%d.png' % (lv + 1)))
        html = CARD % { 'unb': uri(os.path.join(ROOT, 'src', 'fonts', 'Unbounded-latin.woff2'), 'font/woff2'), 'chivo': uri(os.path.join(ROOT, 'src', 'fonts', 'ChivoMono-latin.woff2'), 'font/woff2'),
                        'hero': uri(os.path.join(OUT, 'hero.png'), 'image/png'), 'tw': TW, 'th': TH,
                        'thumbs': ''.join('<img src="%s">' % uri(os.path.join(OUT, 'l%d.png' % (lv + 1)), 'image/png') for lv, _ in THUMBS) }
        open(os.path.join(OUT, 'card.html'), 'w').write(html)
        pg = await b.new_page(viewport={'width': 1280, 'height': 640}, device_scale_factor=1)
        await pg.goto('file://' + os.path.join(OUT, 'card.html')); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(300)
        for dest in ('og.png', os.path.join('.github', 'social-preview.png')): await pg.screenshot(path=os.path.join(ROOT, dest))
        await b.close()
    print('wrote og.png and .github/social-preview.png (1280 x 640)')
asyncio.run(main())
