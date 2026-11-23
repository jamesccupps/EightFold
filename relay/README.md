# Play-data relay

The game is a static page on GitHub Pages, so it cannot write to GitHub by itself: it would have to carry a token, and anyone can read a public page's source. This small Cloudflare Worker holds the token instead.

```
game (browser)  --POST one session's records-->  Worker  --commit-->  play-data branch: sessions/<date>/<session>.json
```

What it does with a post:

- accepts it only from the game's own page (`https://jamesccupps.github.io`), up to 64 KB;
- keeps the fields it knows, of the right type and size, and drops everything else. The one piece of free text is player feedback: up to ten notes a visit, 600 characters each, control characters removed;
- writes one JSON file per session, replacing it as the session goes on, only under `sessions/` on the `play-data` branch;
- adds the country Cloudflare reports for the request, and nothing else about the sender: the address is never stored;
- commits as `eightfold-relay`, and never sends the token anywhere but GitHub.

Limits against misuse: 40 posts per sender per ten minutes, 250 attempts per session, 300 new session files per day in total. The address is public, so junk is possible within those limits; it lands on the data branch only and is easy to delete.

## Set up (about ten minutes, once)

**1. A GitHub token that can write to this repository and nothing else**

GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.

- Name: `eightfold-relay`. Expiration: 90 days is plenty, this is temporary.
- Repository access: *Only select repositories* > `EightFold`.
- Permissions > Repository permissions > **Contents: Read and write**. Nothing else.
- Generate, and copy the token. It is shown once.

**2. The Worker**

Sign up at cloudflare.com (the free plan is enough), then in the dashboard:

- Workers & Pages > Create application > start with **Hello World** > name it `eightfold-relay` > Deploy.
- Edit code > replace everything with the contents of [`worker.js`](worker.js) > Deploy.
- Settings > Variables and Secrets > Add > type **Secret**, name `GITHUB_TOKEN`, value: the token from step 1 > Deploy.

**3. Check it and hand over the address**

Open the Worker's address (it looks like `https://eightfold-relay.<your-name>.workers.dev`). It should show `{"ok":true,"what":"Eightfold play-data relay","ready":true}`.

That address goes into `RELAY` near the top of the recording code in `src/page.html`; then `node build.js`, commit and push. From then on the public game sends play data, and says so on its menu.

## Updating the Worker

**Automatically (recommended).** Connect the Worker to this repository once, and every push to `main` that touches `relay/` deploys it:

- Worker > Settings > Builds > Connect > GitHub > repository `EightFold`, branch `main`.
- Root directory: `relay`. Build command: none. Deploy command: `npx wrangler deploy` (the default).
- Branch control: turn **off** builds for non-production branches. The relay commits to `play-data` many times a day, and each of those would otherwise start a build.
- Build watch paths: include `relay/*`, so game-only changes do not redeploy the Worker.

`wrangler.jsonc` here names the Worker and its entry file. The `GITHUB_TOKEN` secret stays in the dashboard and is untouched by deploys.

**By hand.** Worker > Edit code > replace everything with the new `worker.js` > Deploy.

Either way, an older Worker keeps working with a newer game; it just drops the fields it does not know yet.

## Turning it off

- For a while: add a variable `OFF` with value `1` to the Worker. The game notices and stops sending.
- For good: set `RELAY` back to `''` in the game, delete the Worker, and revoke the token on GitHub.

## Stricter option

The token above can write to any branch of this repository, although the Worker only ever writes to `play-data`. To make that impossible rather than unused, create a separate repository just for the data, scope the token to that one, and set the Worker variable `REPO` to its name.

## Test

`node relay/test.js` runs the Worker against a stand-in for GitHub. `python3 test/browser/relay.py` drives the real page in a browser through the same Worker code.
