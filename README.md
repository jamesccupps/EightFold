# Eightfold

A tunnel runner for the browser. Eight walls, one way through: turn the tunnel under you, jump, flip to the far wall, and do not fall out.

**Play it: https://jamesccupps.github.io/EightFold/**

The whole game is one self-contained file, `index.html`. No dependencies and no build step needed to play.

## Play

- In the browser at https://jamesccupps.github.io/EightFold/ (GitHub Pages serves the `main` branch, so a push updates it), or
- download `index.html` and open it locally.

Scores, key bindings and options are stored in the browser, per site.

## Controls

| Move | Keyboard (default) | Touch |
|---|---|---|
| Turn left / right | ← → or A D | swipe, tap a side, or the on-screen arrows |
| Jump | Space or ↓ | swipe down, or the Jump button |
| Flip to the far wall | ↑ or W | swipe up, or the Flip button |
| Pause / restart / sound | P or Esc / R / M | on-screen buttons |

Every key can be rebound under **Controls & options**, which also has a 75% practice speed, checkpoints, graphics quality and volume.

## What is in it

- **How to play:** a tutorial that stops at each obstacle and waits for the right key.
- **Eight levels.** Each one teaches its new obstacles alone, practises them mixed with the earlier ones, gives a breather at half way, then tests everything close together. A briefing before each level shows what is new and which key deals with it.
- **Endless:** no finish line; it speeds up and adds obstacles as you go.
- **Daily:** one 60-second course a day, generated from the date, the same for everyone.
- **Obstacles:** shifting floor, floor that continues overhead, tall blocks, low bars, short gaps and stepping stones, ring gaps, sliding blocks, launch pads, beams and fans, sprint zones and slow zones.
- **Sparks** mark the line (over each jump, past each opening). Each is worth points and adds speed, most of it from the first few, up to +25%. The view widens, the speed lines stretch and the music picks up as it builds. That speed is how a run beats its par time.
- **Helpers:** a shield sits on the route before stretches of things you can run into; slow-mo sits one lane off the route before rhythm sections, because it costs time.

### Scoring

100 points per spark (200 for one in the air), 10 per percent of progress, and for a cleared level 1,000 for the clear, 100 per second under par and 1,000 for collecting every spark. Endless scores 10 per metre plus sparks.

## Tuning and play data (temporary)

Two tools are in the game for now, to find the right feel and then be taken out again.

**Tuning** (the menu or pause screen, or press `T`) is a drawer of sliders beside the tunnel: overall pace, how long a jump, flip and turn take, edge forgiveness, how long an early press is remembered, the top speed sparks give, and the camera distance, height, zoom and ball size. The view changes as you drag. Changing a move time lays the courses out again for it, and the drawer checks that the built-in pilot can still finish all eight levels. Runs with changed pace, moves or forgiveness are not scored; camera changes do not affect scoring. *Copy values* gives the numbers to bake in as defaults.

**Play data** records one small entry per attempt in the browser's local storage:

- the course, how the run ended, where, on which obstacle, and what the ball was doing (on the floor, mid turn, flip or jump);
- every press as a position and a move, so the run can be replayed against its course (`node tools/replay.js`), and where each press fell inside the window the course allows;
- the required move that was due and not made, and by how much;
- time, score, sparks, shields and slow-mo used, speed gained, pauses, how long before the next try, keyboard / touch / on-screen buttons;
- frame rate, the longest frame, and any drop in resolution.

In the tutorial it notes how long each step waited for its key and how many wrong keys came first.

For the visit as a whole it notes:

- a random code kept in the browser, the visit number and the date of the first visit, so returning players can be told from new ones (Erase makes a new code);
- the browser and system by name, screen size, processor count, the site the player came from, and (added by the relay) the country;
- the options in use, any keys changed from the defaults, progress so far, and which screens were opened, with times;
- any error in the page, as short plain text;
- a one-tap answer to "how does this level feel?" on the result screen.

No name and no address. Runs that could not be sent when a tab was closed are sent on the next visit.

**Feedback** (menu, pause and result screens) is a short form: suggestion, problem or other, and up to 600 characters. It travels with the play data, tagged with where the player was. It is the only free text collected, and the form says it is filed publicly. `node tools/feedback.js <folder>` lists what has come in. The sheet has Copy, Download, a switch to stop recording, and Erase. (The copy published as a Claude artifact also saves the same records to that artifact's own storage.)

The public copy also sends each session's records to a small Cloudflare Worker, which files them on this repository's [`play-data`](https://github.com/jamesccupps/EightFold/tree/play-data) branch. The menu says so while it is on, and stopping the recording stops the sending. Setting `RELAY` in `src/page.html` to `''` turns the sending off for everyone; a copy opened from a file or run anywhere but the game's own page sends nothing. See [`relay/`](relay/README.md).

## How the levels are made

Levels are generated, not hand-drawn, but each one is fixed: a level is a configuration plus a seed in `src/core.js`, so it is the same course every time.

The generator builds a course from sections (a jog sideways, a wall with one opening, a ring gap, and so on). Each section records the window in which its key press works, which gives a known-good route through the course. That route is what the tests fly.

Seeds were chosen with `tools/tune.js`, which searches for the course whose measured input rate and difficulty sit closest to a target that rises from level 1 to level 8.

## Layout

```
index.html            the built game (what you play, and what Pages serves)
src/core.js           level configurations, course generator, physics
src/page.html         the page: drawing, sound, menus, input, scoring
build.js              inlines core.js into page.html
test/levels.js        every course can be finished; every spark can be collected
test/shortcuts.js     no course can be finished while skipping its intended moves
test/curve.js         prints speed, input rate, obstacle variety and difficulty per level
test/browser/         play-throughs in a real browser (Python + Playwright)
tools/                seed search used to pick each level's course; replay.js plays recorded runs back; feedback.js lists player feedback
relay/                the Cloudflare Worker that files play data on the play-data branch, and its test
```

## Build

```
node build.js           # src/ -> index.html
```

Edit files in `src/`, then rebuild. `index.html` is committed so the repository is playable as it stands; the CI job fails if it is out of date with `src/`.

## Tests

```
npm test                # about 20 seconds, Node only
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
```

They need Python with Playwright and its Chromium (`pip install playwright && playwright install chromium`).

### What the tests do not show

They show that every course is finishable, fair and progressively denser. They do not show how it feels: whether the speed, the timing windows and the music are right needs a person playing it. Touch input has only been tested with emulated touch.

## Credits

Inspired by the tunnel runners of early-2010s phones, Octagon in particular. All code, art, sound and level data here are original; nothing is taken from any other game. Fonts are Unbounded and Chivo Mono, loaded from Google Fonts.

## License

MIT. See [LICENSE](LICENSE).
