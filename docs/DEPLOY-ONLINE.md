# Putting co-op online

> **Status (2026-11-14):** co-op is live on the owner's Supabase project (`data/online.json`: transport
> `supabase`). Tested with a full two-player match through it: `TDS_SUPABASE=1 npx playwright test
> test/e2e/coop.spec.js -g supabase`. The steps below are for setting up a new project or the relay.

How to make the co-op mode (docs/multiplayer.md) work between players on different computers.
The game itself stays a static site (GitHub Pages). Players only need a way to pass messages to
each other, and there are two options:

| | Supabase (part A) | Own relay server (part B) |
|---|---|---|
| What you run | Nothing: a free Supabase project | `server/relay.mjs` on Render, Fly.io or any Docker host |
| Setup time | About 5 minutes | About 15 minutes |
| Cost | Free tier, with monthly message quota | Free tier hosts (Render sleeps when idle) |
| Limits | Messages per second and per month (below) | 500 connections per server, no message quota |
| Setting in `data/online.json` | `"transport": "supabase"` | `"transport": "relay"` |

Pick one. Supabase is the easiest; the relay has no quota and is the better choice if many people
play at once. Both use the same game code, only `data/online.json` changes.

All settings live in `data/online.json` (each field is explained in its `$doc` string):

```json
{
  "transport": "local",
  "supabaseUrl": "",
  "supabaseAnonKey": "",
  "relayUrl": "",
  "turnTicks": 6,
  "delayTicks": 12,
  "supabaseTurnTicks": 10
}
```

`"local"` (the default) only connects tabs of the same browser on one computer, for testing.

---

## A. Supabase (no server code)

Supabase Realtime carries the game messages (broadcast) and the player list (presence). No
database tables are created or used.

1. Go to https://supabase.com and sign up (GitHub sign-in works). Free plan, no card needed.
2. Click **New project**. Pick any name (for example `tds-coop`), set a database password (you
   will not need it for the game; keep it in your password manager) and the region closest to
   your players. Click **Create new project** and wait a minute or two until it is ready.
3. Open **Project Settings** (gear icon, bottom left) > **API** (in newer dashboards: **Data API**
   for the URL and **API Keys** for the key). Copy two values:
   - **Project URL**, looks like `https://abcdefghijklmnop.supabase.co`
   - **anon public** key (newer dashboards call it the **publishable** key, starting `sb_publishable_`).
     Do **not** copy the `service_role` / secret key: that one must never be in the game.
4. Open `data/online.json` and fill in:
   ```json
   "transport": "supabase",
   "supabaseUrl": "https://abcdefghijklmnop.supabase.co",
   "supabaseAnonKey": "<the anon / publishable key>",
   ```
5. Commit and push to `feature/vertical-slice`. GitHub Pages redeploys in a few minutes
   (`gh run list --limit 1` shows when it is done).
6. Test: open the game on two computers (or a computer and a phone), create a room in the Online
   tab on one, join with the code on the other.

**Is the anon key a secret?** No. It is designed to be public: it is inside every page that uses
Supabase, and it only allows what the project allows anonymous visitors. The game uses Realtime
broadcast and presence only and has no tables, so there is nothing for anyone to read or change
with it. The worst misuse is someone else sending messages through your project's quota. If that
ever happens, rotate the key in the dashboard (API Keys) and paste the new one.

### Free tier limits (check the official pages)

I could not check these live while writing this; they are the published free plan numbers as I
know them. Confirm on https://supabase.com/pricing and
https://supabase.com/docs/guides/realtime/quotas before relying on them:

| Limit (free plan) | Value | What it means for TDS |
|---|---|---|
| Concurrent Realtime connections | 200 | 200 players online at the same moment (each player is one connection) |
| Realtime messages per month | 2 million | See the estimate below |
| Messages per second (whole project) | 100 | About 4 busy 4-player rooms at the same moment |
| Presence messages per second | 20 | Players joining / leaving; fine for the lobby |
| Broadcast payload size | 256 KB | Snapshots are chunked by the game below this |
| Inactive project | Paused after 1 week without activity | Open the dashboard and click **Restore** if it pauses |

Message estimate: the host sends one turn message every `supabaseTurnTicks` = 10 ticks, which is 6
per second at 60 ticks per second, and Supabase counts each delivered copy. A 2-player match uses
roughly 13 messages per second, a 4-player match roughly 25. So 2 million messages a month is
about 40 hours of 2-player play or 20 hours of 4-player play. Raise `supabaseTurnTicks` (for
example to 15) to stretch the quota at the cost of slightly more input delay, or use the relay
for heavier use. The dashboard shows usage under **Reports** / **Usage**.

---

## B. Own relay server (`server/`)

`server/relay.mjs` is a small WebSocket relay (protocol: `server/README.md`). It needs Node 18+
or Docker and a host that allows WebSockets. Three ways to host it:

### B1. Render (free web service, uses `render.yaml`)

1. Sign up at https://render.com with your GitHub account.
2. **New** > **Blueprint**, pick the TDS repository and the `feature/vertical-slice` branch.
   Render reads `render.yaml` and proposes one free web service called `tds-relay`.
3. It asks for `ALLOWED_ORIGINS`: enter `https://malikmohamedgamer-bit.github.io` (the address
   the game is served from, no path). Add `,http://localhost:5173` if you also test locally
   against it. Leaving it empty allows every site.
4. Click **Apply**. After the build, the service page shows its address, for example
   `https://tds-relay.onrender.com`. Open `https://tds-relay.onrender.com/health` in a browser:
   it should show `{"ok":true,"rooms":0,"peers":0}`.
5. In `data/online.json` set `"transport": "relay"` and
   `"relayUrl": "wss://tds-relay.onrender.com/"` (note `wss://`, not `https://`). Commit, push.

The free plan sleeps after about 15 minutes without traffic and takes up to about a minute to wake
on the next request. While it wakes, **Create room** / **Join** shows "connecting": when no
connection to the relay could be opened at all, the game keeps retrying for up to 60 seconds
before it gives up with "Could not reach the relay server" (if the server answers but refuses or
never confirms the join, it gives up after 15 seconds). If you still see that message, the
service was slower than a minute to wake: press **Join** / **Create room** again. To avoid the
wait, open `https://tds-relay.onrender.com/health` in a browser a minute before playing (it wakes
the service; the page shows `{"ok":true,...}` once it is up). Paid plans or the hosts below do not
sleep.

### B2. Fly.io (uses `server/fly.toml` and `server/Dockerfile`)

1. Install the Fly CLI (https://fly.io/docs/flyctl/install/) and run `fly auth login`.
2. In a terminal:
   ```sh
   cd server
   fly launch --copy-config --no-deploy   # choose a unique app name when asked
   fly secrets set ALLOWED_ORIGINS=https://malikmohamedgamer-bit.github.io
   fly deploy
   ```
3. Check `https://<app-name>.fly.dev/health`, then set
   `"relayUrl": "wss://<app-name>.fly.dev/"` and `"transport": "relay"` in `data/online.json`.

Fly asks for a payment card even for small usage; machines stop when nobody is connected
(`auto_stop_machines`), which keeps the bill near zero. Check https://fly.io/docs/about/pricing/.

### B3. Any Docker host or your own computer

```sh
docker build -t tds-relay server
docker run -d --restart unless-stopped -p 8787:8787 -e ALLOWED_ORIGINS=https://malikmohamedgamer-bit.github.io tds-relay
```

Without Docker: `cd server && npm ci && npm start`. Browsers on an `https://` page only connect to
`wss://` addresses, so put the relay behind HTTPS (a reverse proxy such as Caddy, or a tunnel such
as Cloudflare Tunnel) and use that `wss://` address as `relayUrl`.

---

## C. The game itself

Nothing changes: GitHub Pages keeps serving the game from `feature/vertical-slice`
(`.github/workflows/pages.yml`; it also runs the relay tests). `vendor/supabase/supabase.js`
ships with the site and is only loaded when the Supabase transport is used.

For itch.io: `node tools/package-itch.mjs` writes `dist/tds-<version>-web.zip`, upload it as an
HTML5 game. If you use the relay with `ALLOWED_ORIGINS`, add itch.io's game frame origin
(`https://html-classic.itch.zone`) to the list.

---

## D. Testing two players on one computer

**Two tabs, no server.** Run `npm run dev`, open http://localhost:5173/?net=local in two tabs of
the same browser. Create a room in one, join it from the other. This uses `BroadcastChannel` and
works without any internet.

**Through a local relay.** In one terminal:

```sh
cd server
npm install
npm start          # "[relay] listening on port 8787 (all origins)"
```

In another, `npm run dev`, then open
http://localhost:5173/?net=relay&relay=ws://localhost:8787 in two tabs (or two browsers).

**Another device on your home network** (a second PC or a phone on the same Wi-Fi). `npm run dev`
only listens on `127.0.0.1`, so other devices cannot reach it. Start the game server on all
network interfaces instead:

```sh
npm run dev -- --host 0.0.0.0
```

(the same as `node tools/dev-server.mjs --host 0.0.0.0`). It prints `on your network:
http://192.168.x.y:5173/` lines with your computer's address. The relay (`npm start` in `server/`)
already listens on all interfaces. Windows asks once whether Node.js may accept connections on
private networks: allow it. Then open, on the other device,
`http://192.168.1.20:5173/?net=relay&relay=ws://192.168.1.20:8787` (your address instead of
`192.168.1.20`), and the same address on your computer (not `localhost`, so both are the same page
origin if you set `ALLOWED_ORIGINS`).

**Supabase from your computer.** With `supabaseUrl` and `supabaseAnonKey` filled in, open
http://localhost:5173/?net=supabase in two tabs.

URL overrides (`?net=`, `?relay=`) win over `data/online.json`, so you can test a transport
without committing a change.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "Supabase is not configured" | `supabaseUrl` or `supabaseAnonKey` is empty in `data/online.json`, or the deploy with them has not finished yet. |
| Supabase: stuck on "connecting", then a timeout | Wrong URL or key (copy them again; the URL has no path), or the project is paused (dashboard > **Restore project**). |
| Supabase works for a while, then stops | Monthly or per-second quota reached: dashboard > **Usage**. Raise `supabaseTurnTicks` or switch to the relay. |
| Relay: the connection fails at once | `relayUrl` must start with `wss://` on the live site (`ws://` only works on `http://localhost`). Check `<relay address>/health` in a browser. |
| Relay: the console shows HTTP 403 | The page's origin is not in `ALLOWED_ORIGINS`. Add it exactly (scheme + host, no path, for example `https://malikmohamedgamer-bit.github.io`). |
| Relay on Render: "connecting" for up to a minute, or "Could not reach the relay server" | The free service was asleep; it wakes on the first request and the game retries for 60 seconds. If it still failed, press Join / Create room again. Opening `<relay address>/health` a minute before playing avoids the wait. |
| Relay: after duplicating a tab, the older tab stops updating | Both tabs had the same player identity (a duplicated tab copies it). The relay keeps the newer tab and tells the older one "This room was opened in another tab or window"; the older one stops instead of fighting for the seat. Keep playing in the newer tab. |
| Relay: "already used by another player" (`taken`) | Someone in the room uses that player id with a different secret. Leave and create or join the room again (a fresh id is used). |
| Another device on the Wi-Fi cannot open the game | `npm run dev` listens only on this computer: use `npm run dev -- --host 0.0.0.0`, allow Node.js in the Windows firewall prompt, and use the address it prints. |
| "room is full" | Rooms hold 4 players. |
| Two tabs with `?net=local` do not see each other | Both tabs must be the same browser and the same address (both `localhost:5173`, not one `127.0.0.1`). Private windows do not share `BroadcastChannel` with normal ones. |
| "version mismatch" in the lobby | One player has an old cached copy. Reload (twice if the service worker shows "update ready"). |
| Players drift apart / "resync" appears | The game corrects this itself with a snapshot from the host. Frequent resyncs on one device are worth a bug report (browser and device in `BUGS.md`). |
