# Developing Eightfold

Back to the [README](../README.md). How the levels are made, what is where, how to build and how it is tested.

## How the levels are made

Levels are generated, not hand-drawn, but each one is fixed: a level is a configuration plus a seed in `src/core.js`, so it is the same course every time.

The generator builds a course from sections (a jog sideways, a wall with one opening, a ring gap, and so on). Each section records the window in which its key press works, which gives a known-good route through the course. That route is what the tests fly.

Seeds were chosen with `tools/tune.js`, which searches for the course whose measured input rate and difficulty sit closest to a target that rises from level 1 to level 8.

## Layout

```
index.html            the built game (what you play, and what Pages serves)
og.png                the picture shown when a link to the game is shared (1280x720, a level mid-run)
.github/social-preview.png   the same view at 1280x640, for this repository's own social preview (Settings, General)
src/core.js           level configurations, course generator, physics
src/page.html         the page's markup and styles, and where each part of its script goes
src/setup.js          options, key bindings, saved scores, tuning values
src/telemetry.js      play recording, experiments, sending to the relay
src/palettes.js       colours of each level
src/sound.js          the synth: effects and music
src/game.js           a run from start to result: courses, briefing, reminders, tutorial
src/render.js         drawing the tunnel, the ball and everything on the floor
src/menus.js          the readouts, menu, legend, scores, controls and tuning sheets
src/board.js          the leaderboard: keeping, posting and showing runs
src/data.js           feedback and the play data sheet
src/input.js          keys, touch and mouse
src/loop.js           the frame loop, and start-up
src/fonts/            the two typefaces, inlined by the build
build.js              puts all of the above into one file
test/levels.js        every course can be finished; every spark can be collected
test/shortcuts.js     no course can be finished while skipping its intended moves
test/curve.js         prints speed, input rate, obstacle variety and difficulty per level
test/browser/         play-throughs in a real browser (Python + Playwright)
tools/                seed search used to pick each level's course; analyze.js reports on play data; replay.js plays recorded runs back; boards.js checks posted scores and builds the leaderboards; feedback.js lists player feedback
relay/                the Cloudflare Worker that files play data and scores in jamesccupps/EightFold-data, and its test
```

## Build

```
node build.js           # src/ -> index.html
```

Edit files in `src/`, then rebuild. `index.html` is committed so the repository is playable as it stands; the CI job fails if it is out of date with `src/`.

## Tests

```
npm test                # about 40 seconds, Node only
npm run curve           # the difficulty table
```

`npm test` checks, for all eight levels, the tutorial, 300 daily courses and 100 endless runs:

- a pilot following the recorded route finishes, pressing at the early, middle and late end of every window;
- that pilot collects every spark;
- restarting from any checkpoint can still be finished;
- an exhaustive search over the real physics finds no route that needs far fewer presses than intended, and reports which moves a level cannot be finished without.

The browser tests drive the real page through real key events:

```
node build.js --test                    # a build with a small test hook, not committed
python3 test/browser/play.py 1,2,3      # play levels with human-like timing error
python3 test/browser/flows.py           # tutorial, restart, pause, unlock, rebinding, endless, phone layout
python3 test/browser/tuning.py          # the tuning drawer and the play recording
python3 test/browser/relay.py           # play data from the page, through the relay, to a stand-in for GitHub
python3 test/browser/mechanics.py       # perfect timing, risk routes, reminders, the missed-move line
python3 test/browser/leaderboard.py     # play, post, check and read a board, end to end
python3 test/browser/posting.py         # a post with no name yet, a silent relay, colliding writes, a closed tab; play-data resends
python3 test/browser/experiments.py     # experiments, ratings, engine id, tap and swipe
```

They need Python with Playwright and its Chromium (`pip install playwright && playwright install chromium`).

### What the tests do not show

They show that every course is finishable, fair and progressively denser. They do not show how it feels: whether the speed, the timing windows and the music are right needs a person playing it. Touch input has only been tested with emulated touch.

## Notes on the build and the tests

- **Version label.** `BUILD` is the day (edited by hand when the game changes) plus four characters that `build.js` derives from the page and engine sources, so two different builds never carry the same label. `CORE_ID` is derived from `src/core.js` alone and names the engine: recorded runs and leaderboard entries belong to one engine, and **any change to `src/core.js`, even a comment, starts the leaderboards again**.
- **Fonts.** The two typefaces (Chivo Mono and Unbounded, both under the SIL Open Font License) are in `src/fonts/` and inlined by `build.js`, so the page asks no other site for anything and a saved copy looks the same.
- **Other files Pages serves:** `og.png` (link previews), `icon-180.png`, `icon-192.png`, `icon-512.png` and `site.webmanifest` (home-screen icon and install).
- **Browser suites fail.** Each suite in `test/browser/` compares what it sees with a table of expectations (`_check.py`) and exits non-zero on any difference, including page errors. CI runs all of them except `play.py` (which plays every level in real time) on every push, next to `npm test`.
- **Reading play data.** `node tools/analyze.js <folder>` ends with what the last press before each fall or crash was against the move that was needed (wrong key, right key at the wrong moment, nothing due, nothing pressed), and how many presses are quick double taps.
