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

### Scoring and speed

Points: sparks 100 (200 in the air, 300 for a red one), 50 for each perfect press, 10 per percent of progress, 1,000 for a clear, 100 per second under par, 1,000 for every spark.

Speed is where the skill shows. Three things make a run faster:

- **Sparks** add lasting speed, most of it from the first few, up to +25%.
- **Perfect timing.** A press in the last moment of a move's window (the last 0.09 s by default) is a perfect: a burst of speed that fades over three seconds. Each perfect in a row makes the burst bigger, up to +24%, so a streak keeps you flying and one early press drops you back.
- **Risk routes.** Three times a level, a calm stretch has three red sparks off the safe line: on a short strip along the far wall (flip over, flip back before it ends) or beside the floor (hop out, hop back). Each red spark adds 1% of speed beyond the cap, for the rest of the run. Staying on the safe line costs nothing but the time.

On level 1 the same course takes about 45 s on the safe line with early presses, 43 s with the risk routes, 42 s on the safe line with every press perfect, and under 40 s with both.

The level clock is not wall-clock time. It is stepped with the physics, so the same presses give the same time on any machine, and a run's time can be worked out again from its recording (`tools/replay.js` does this).

### Leaderboard

- **Levels and the Daily course:** fastest clear, to the hundredth of a second.
- **Endless:** how far you got. Endless is one course, the same for everyone and the same every day, so its board keeps from one day to the next. (The course is named by a date in `src/page.html`, `ENDLESS_COURSE`; changing that date starts a new course and a new board.) *Random course* on the result screen gives any other course for practice, unranked; the Daily course is the one that changes every day. Ties go to points.

A run that beats what the player has already posted is sent with its presses, under a name of up to three letters or digits. The best run not yet on its board is kept in the browser, whole, until the relay has taken it: if the player has not chosen a name yet, every result screen offers it until they do; if the relay is busy or the connection drops, it is sent again by itself (and on the next visit, if the tab was closed). Nothing is listed on trust: a GitHub Action on the `play-data` branch plays each run back on the real engine (`tools/boards.js`), and the time, distance and points shown are the ones the playback gives. That takes about a minute. Runs made with practice options or changed tuning do not count, and a board starts again when its course changes.

What is checked is the run, not the person. Each browser has one row per board, so changing the name relabels later runs instead of adding a row; names are not reserved, and when two players pick the same letters the board shows a short code after each so they can be told apart. Clearing the browser's storage makes a new player. Tying a name to one person would need sign-in, which the game does not have.

The version of the game and of its engine is shown at the bottom of the menu.

### Help for new players

**Legend** (on the menu, the briefing, the pause screen and the result screen) shows everything in one place: the three moves, each thing that can be picked up, the floor markings, every obstacle, what the readouts along the top mean, and how speed, points and the leaderboard work. The briefing before a level lists what matters in it, with the same pictures.

The first two times each kind of obstacle comes up outside the tutorial, a one-line reminder names it and the key that answers it. Risk routes get the same: that the red sparks are optional and how to reach them, then, once on the strip, how to get back. The strip is tinted red, turns full red after its last spark and ends at a white bar, so the moment to leave can be seen. Red sparks and their strip are the same red in every level. A shield, slow-mo and a red spark each say what they do the first couple of times one is picked up. After a fall, the result screen says what the run ended on and which move it needed.

Keys: a press acts at the next physics step (1/240 s), and a press made in the air is held until landing. On a keyboard set to another alphabet, W, A, S, D work by position. Each run records how long its key presses took to reach the game, so a slow machine or browser shows up in the play data.

## Tuning and play data (temporary)

Two tools are in the game for now, to find the right feel and then be taken out again.

**Tuning** (the menu or pause screen, or press `T`) is a drawer of sliders beside the tunnel: overall pace, how long a jump, flip and turn take, edge forgiveness, how long an early press is remembered, the top speed sparks give, and the camera distance, height, zoom and ball size. The view changes as you drag. Changing a move time lays the courses out again for it, and the drawer checks that the built-in pilot can still finish all eight levels. Runs with changed pace, moves or forgiveness are not scored; camera changes do not affect scoring. *Copy values* gives the numbers to bake in as defaults.

**Play data** records one small entry per attempt in the browser's local storage:

- the course, how the run ended, where, on which obstacle, and what the ball was doing (on the floor, mid turn, flip or jump);
- every press as a position and a move, so the run can be replayed against its course (`node tools/replay.js`), and where each press fell inside the window the course allows;
- the required move that was due and not made, and by how much;
- time, score, sparks, red sparks taken, perfect presses and the longest run of them, shields and slow-mo used, speed gained, pauses, how long before the next try, and how it was played (keyboard, taps, swipes, on-screen buttons, mouse);
- a checksum of the course, so a recording is only ever played back against the course it was made on;
- frame rate, how long frames took (in seven bands), the longest frame, the time spent drawing, and any drop in resolution.

In the tutorial it notes how long each step waited for its key and how many wrong keys came first.

For the visit as a whole it notes:

- a random code kept in the browser, the visit number and the date of the first visit, so returning players can be told from new ones (Erase makes a new code);
- the browser and system by name, screen size and refresh rate, the size the picture is drawn at, processor count, graphics card, the site the player came from, and (added by the relay) the country;
- which version of the engine the page was built from, how long the page took to start, the browser's language, and whether storage works;
- the options in use, any keys changed from the defaults, progress so far, and every screen opened and button pressed in the menus, with times;
- any error in the page, as short plain text;
- two one-tap answers on the result screen: how hard the level felt and, after a clear, whether it was fun;
- which variant of any running experiment the player is in.

No name and no address. Runs that could not be sent when a tab was closed are sent on the next visit.

**Feedback** (menu, pause and result screens) is a short form: suggestion, problem or other, and up to 600 characters. It travels with the play data, tagged with where the player was. It is the only free text collected, and the form says it is filed publicly. `node tools/feedback.js <folder>` lists what has come in.

`node tools/analyze.js <folder>` turns the session files into a report: who played and who came back, how far they got, attempts and clear times per course, sparks collected and replays after a clear, where runs end and on what, every obstacle of each level in order with how many reached it and how many ended there, press timing per obstacle, the tutorial step by step, how the game ran on each machine, experiments by variant, feedback, ratings, errors, and menu use.

Visits made to check the game are left out of the report: open the page with `#test` on the address, or list a visit's id in `sessions/exclude.txt` on the `play-data` branch.

**Experiments.** `EXPERIMENTS` in `src/page.html` is a list, empty unless one is running. An entry names two or more variants, each with tuning values; every player is put in one variant for good (from their player code), plays it as the normal, scored game, and has the variant recorded with each visit, so the report can compare them. A list in the same shape under `eightfold.xp` in a browser's local storage tries one out on that browser only.

**Keeping old data usable.** The generator will change as levels are tuned. Each visit records an id for the engine it ran on and each run a checksum of its course; `tools/replay.js` fetches the matching engine from this repository's history, so old runs still play back on the courses they were made on. The sheet has Copy, Download, a switch to stop recording, and Erase. (The copy published as a Claude artifact also saves the same records to that artifact's own storage.)

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
tools/                seed search used to pick each level's course; analyze.js reports on play data; replay.js plays recorded runs back; boards.js checks posted scores and builds the leaderboards; feedback.js lists player feedback
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
python3 test/browser/mechanics.py       # perfect timing, risk routes, reminders, the missed-move line
python3 test/browser/leaderboard.py     # play, post, check and read a board, end to end
python3 test/browser/posting.py         # a post with no name yet, a silent relay, colliding writes, a closed tab; play-data resends
python3 test/browser/experiments.py     # experiments, ratings, engine id, tap and swipe
```

They need Python with Playwright and its Chromium (`pip install playwright && playwright install chromium`).

### What the tests do not show

They show that every course is finishable, fair and progressively denser. They do not show how it feels: whether the speed, the timing windows and the music are right needs a person playing it. Touch input has only been tested with emulated touch.

## Credits

Inspired by the tunnel runners of early-2010s phones, Octagon in particular. All code, art, sound and level data here are original; nothing is taken from any other game. Fonts are Unbounded and Chivo Mono, loaded from Google Fonts.

## License

MIT. See [LICENSE](LICENSE).
