Back to the [README](../README.md).

# Tuning and play data

Two tools are in the game for now, to find the right feel and then be taken out again.

**Tuning** (under Controls & options, on the pause screen, or press `T`) is a drawer of sliders beside the tunnel: overall pace, how long a jump, flip and turn take, edge forgiveness, how long an early press is remembered, the top speed sparks give, and the camera distance, height, zoom and ball size. The view changes as you drag. Changing a move time lays the courses out again for it, and the drawer checks that the built-in pilot can still finish all eight levels. Runs with changed pace, moves or forgiveness are not scored; camera changes do not affect scoring. *Copy values* gives the numbers to bake in as defaults.

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

Visits made to check the game are left out of the report: open the page with `#test` on the address, or list a visit's id in `sessions/exclude.txt` in the data repository.

**Experiments.** `EXPERIMENTS` in `src/telemetry.js` is a list, empty unless one is running. An entry names two or more variants, each with tuning values; every player is put in one variant for good (from their player code), plays it as the normal, scored game, and has the variant recorded with each visit, so the report can compare them. A list in the same shape under `eightfold.xp` in a browser's local storage tries one out on that browser only.

**Keeping old data usable.** The generator will change as levels are tuned. Each visit records an id for the engine it ran on and each run a checksum of its course; `tools/replay.js` fetches the matching engine from this repository's history, so old runs still play back on the courses they were made on. The sheet has Copy, Download, a switch to stop recording, and Erase. (The copy published as a Claude artifact also saves the same records to that artifact's own storage.)

The public copy also sends each session's records to a small Cloudflare Worker, which files them in a repository of their own, [jamesccupps/EightFold-data](https://github.com/jamesccupps/EightFold-data). The menu says so while it is on, and stopping the recording stops the sending. Setting `RELAY` in `src/telemetry.js` to `''` turns the sending off for everyone; a copy opened from a file or run anywhere but the game's own page sends nothing. See [`relay/`](../relay/README.md).

## What identifies a player

Each browser makes itself a random code. The relay never files the code: it files a one-way hash of it (`pid` in the session and score files is that hash), so the public files do not contain anything that could be sent back to post under someone else's leaderboard row. Codes made before 2026-11-25 were filed as they were; each browser replaced its code once when it loaded that build, so those are dead.
