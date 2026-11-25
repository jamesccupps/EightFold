# Play-data relay

The game is a static page on GitHub Pages, so it cannot write to GitHub by itself: it would have to carry a token, and anyone can read a public page's source. This small Cloudflare Worker holds the token instead.

```
game (browser)  --POST one session's records-->  Worker  --commit-->  jamesccupps/EightFold-data: sessions/<date>/<session>.json
```

It has three addresses: `/` takes play data, `/score` takes a run for the leaderboard (filed under `scores/`), and `/boards` hands the game the boards that the checker wrote to `boards/all.json`. The checker is a GitHub Action on the `play-data` branch running `tools/boards.js`; a free Worker does not get enough processor time to play a run back itself.

What it does with a post:

- accepts it only from the game's own page (`https://jamesccupps.github.io`), up to 64 KB;
- keeps the fields it knows, of the right type and size, and drops everything else. The one piece of free text is player feedback: up to ten notes a visit, 600 characters each, control characters removed;
- writes one JSON file per session, replacing it as the session goes on, only under `sessions/` in the data repository;
- adds the country Cloudflare reports for the request, and nothing else about the sender: the address is never stored;
- commits as `eightfold-relay`, and never sends the token anywhere but GitHub.

Every write is a commit, and two commits at the same moment collide, so a refused write is tried again (up to five times, with short uneven pauses) before the game is told the store is busy; the game then sends it again itself.

Limits against misuse: 240 posts per sender per ten minutes (a household shares one address, so this has to fit several people playing at once), 400 attempts per session, 300 new session files per day in total. The address is public, so junk is possible within those limits; it lands on the data branch only and is easy to delete.

## Set up (about ten minutes, once)

**1. A GitHub token that can write to the data repository and nothing else**

GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.

- Name: `Eightfold relay data`. Expiration: up to a year.
- Repository access: *Only select repositories* > `EightFold-data`.
- Permissions > Repository permissions > **Contents: Read and write**. Nothing else.
- Generate, and copy the token. It is shown once.

**2. The Worker**

Sign up at cloudflare.com (the free plan is enough), then in the dashboard:

- Workers & Pages > Create application > start with **Hello World** > name it `eightfold-relay` > Deploy.
- Edit code > replace everything with the contents of [`worker.js`](worker.js) > Deploy.
- Settings > Variables and Secrets > Add > type **Secret**, name `DATA_TOKEN`, value: the token from step 1 > Deploy.

**3. Check it and hand over the address**

Open the Worker's address (it looks like `https://eightfold-relay.<your-name>.workers.dev`). It should show `{"ok":true,"what":"Eightfold play-data relay","version":"...","ready":true,"store":"jamesccupps/EightFold-data@main"}`. `store` is where it is filing.

That address goes into `RELAY` near the top of `src/telemetry.js`; then `node build.js`, commit and push. From then on the public game sends play data, and says so on its menu.

## Updating the Worker

**Automatically (recommended).** Connect the Worker to this repository once, and every push to `main` that touches `relay/` deploys it:

- Worker > Settings > Builds > Connect > GitHub > repository `EightFold`, branch `main`.
- Root directory: `relay`. Build command: none. Deploy command: `npx wrangler deploy` (the default).
- Branch control: turn **off** builds for non-production branches. Only pushes to `main` that touch `relay/` should start a build.
- Build watch paths: include `relay/*`, so game-only changes do not redeploy the Worker.

`wrangler.jsonc` here names the Worker and its entry file. The `DATA_TOKEN` secret stays in the dashboard and is untouched by deploys.

**By hand.** Worker > Edit code > replace everything with the new `worker.js` > Deploy.

Either way, an older Worker keeps working with a newer game; it just drops the fields it does not know yet.

## Turning it off

- For a while: add a variable `OFF` with value `1` to the Worker. The game notices and stops sending.
- For good: set `RELAY` back to `''` in the game, delete the Worker, and revoke the token on GitHub.

## Why the data has its own repository

The Worker's token can write to [jamesccupps/EightFold-data](https://github.com/jamesccupps/EightFold-data) and to nothing else. The game's own repository is served by GitHub Pages, so a token that could write there could change the game for everyone if it ever leaked; this one cannot. (Until 2026-11-25 the data lived on the `play-data` branch of the game's repository, under a token for that whole repository. The Worker still falls back to that arrangement while no `DATA_TOKEN` secret is set, which is how the move was made without a gap.)

The token expires a year after it is made. When it does, the Worker's status line still says `ready` but posts fail and the game keeps what it could not send; make a new token the same way and replace the secret.

## Test

`node relay/test.js` runs the Worker against a stand-in for GitHub. `python3 test/browser/relay.py` drives the real page in a browser through the same Worker code.

## The player's code

The game sends each browser's random code with its play data and scores. The Worker replaces it with a hash (`sha256('eightfold:' + code)`, first 16 hex characters) before anything is filed, in the file names as well. One player may post at most 60 scores a day.
