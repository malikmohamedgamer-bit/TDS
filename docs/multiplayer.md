# Multiplayer (co-op) design

Owner request 2026-11-12: working multiplayer, deployable on Supabase or another free host.
This file is the contract between the parts. Change it first if a part needs a different interface.

## What the player gets

- **Co-op, 2 to 4 players**, one map, shared keep, the same waves. Each player has their own hero
  (walks the map, attacks, 4 abilities), their own towers and their own wallet.
- Lobby: create a room (6-character code) or join one by code. The lobby shows players, heroes and
  ready state; the host picks map and difficulty and starts. Everyone must run the same game
  version (content hash); a mismatch is refused with a clear message.
- During the match: player list with colours, other players' heroes walk the map, towers show their
  owner's colour, quick pings (a short list of preset messages), a connection banner when someone
  drops. If the host leaves the match ends for everyone with a clear message.
- Rewards: each player's own save gets the normal match rewards (crowns, XP, quests) from the team
  result. The `coop` mode is never offered in single-player.

## Architecture

```
 hub Online tab (src/ui/onlineLobby.js)      match HUD (src/ui/matchHud.js)
            |                                          |
 src/net/lobby.js  (rooms, presence, ready, start)     |
            |                                          |
 src/net/lockstep.js (LockstepSession: turns, input delay, hash check, snapshot resync)
            |                 \__ drives the deterministic Match (src/sim/match.js)
 src/net/transports.js: LocalTransport (BroadcastChannel), RelayTransport (WebSocket to server/),
                        SupabaseTransport (Supabase Realtime broadcast + presence)
```

**Lockstep.** Every player runs the same `Match` (same seed, options, content). Only commands travel.
The host owns the clock: it stamps every command with the tick it applies on and broadcasts a
**turn** message every `turnTicks` ticks. A turn says "everything up to tick T is known" and carries
the commands scheduled up to T. Clients may simulate up to the latest T and no further, so all
players apply the same commands on the same ticks. Commands apply at `hostTick + delayTicks`.

**Desync safety.** Every `hashEvery` ticks each client sends `match.hash()`; the host compares with
its own hash for that tick. On a mismatch (for example two browsers rounding `Math.sin` differently)
the host sends a **snapshot** of its match and the client restores it. Late joiners and reconnects
use the same snapshot path.

## Contract 1: simulation (src/sim/match.js)

- `new Match({ ..., players })`, `players = [{ pid, hero, name }]`, 1-4 entries, order matters and is
  identical on every client. Default when omitted: `[{ pid: 'p1', hero: o.hero }]`.
  **Single-player behaviour, numbers and `hash()` stay exactly as today** (replays, balance and all
  existing tests must not change).
- Wallets: `match.wallet(pid)`; `match.cash` keeps working as the first player's wallet (get + set).
- Every command may carry `pid` (default: first player). `validate`/`_apply` use that player's
  wallet; towers record `owner: pid`; upgrade / sell / move / target / ability / hero commands only
  act on the issuing player's towers, hero and abilities (`code: 'owner'` when not).
- Heroes: `match.heroes = [{ pid, def, x, y, z, hp, ... }]`; `match.hero` is `heroes[0]`.
  Abilities: `match.abilitiesOf(pid)`; `match.abilities` is the first player's list.
- Income: kill cash goes to the player whose tower / hero / ability / ally made the kill (shared
  sources such as aura-less burns: the source tower's owner; no source: split). Wave bonuses and
  tower income: wave bonus split evenly with integer rounding (deterministic), tower income to the
  tower's owner. Starting cash per player and enemy health scale with player count from
  `data/modes.json` mode `coop` (`coop.cashShare[n-1]`, `coop.enemyHp[n-1]`).
- `match.result()` adds `players: [{ pid, kills, damage, cashEarned, placed }]` when co-op.
- `match.snapshot()` returns plain JSON (ids instead of object references) of the complete state
  including RNG state; `Match.restore(snap, { content, mapWorld })` rebuilds a Match. Test property:
  for any tick, stepping the restored match and the original with the same commands gives the same
  `hash()` on every following tick.
- New mode in `data/modes.json`: `{ "id": "coop", "online": true, ... }`; the hub hides `online` modes
  from the single-player mode list.

## Contract 2: transport (src/net/transports.js)

All transports implement:

```js
transport.id                  // own peer id (string)
await transport.join(room, meta)  // meta: { name, hero, version }
transport.send(data, to?)     // JSON-serialisable; broadcast to the room (not to self), or to one peer
transport.onMessage(fn)       // fn(data, fromPeerId)
transport.onPeers(fn)         // fn([{ id, meta, joinedAt }]) whenever the room changes (includes self)
transport.close()
```

- `LocalTransport` uses `BroadcastChannel` (same browser: two tabs, Playwright pages in one context).
  Presence by heartbeat every 1 s, a peer is gone after 4 s.
- `RelayTransport(url)` talks to `server/relay.mjs` over WebSocket (protocol in server/README.md).
- `SupabaseTransport({ url, anonKey })`: Realtime channel `tds:<room>`, broadcast event `m` (self:
  false), presence keyed by peer id. The vendored client loads only when this transport is used.
- Large messages (snapshots) are chunked by the session layer, not by transports (Supabase limits
  message size).
- Which transport: `data/online.json` `{ "transport": "supabase" | "relay" | "local", "supabaseUrl",
  "supabaseAnonKey", "relayUrl", "turnTicks", "delayTicks" }`; URL overrides `?net=local|relay|supabase`
  and `?relay=wss://...` for testing.

## Contract 3: session (src/net/lockstep.js, pure: no DOM)

```js
const s = new LockstepSession({ transport, hostId, sim, turnTicks = 6, delayTicks = 12, hashEvery = 120 })
// sim: { step(), command(cmd) -> {ok}, validate(cmd) -> {ok}, hash(), snapshot(), restore(snap), tick }
s.issue(cmd)          // local player's command (pid filled by the caller); host stamps, client asks host
s.advance(n)          // run up to n sim steps, never past the confirmed tick; returns steps done
s.setSpeed(x), s.setPaused(b)   // host only; carried in turn messages
s.on('desync' | 'resync' | 'peerLeft' | 'hostLeft' | 'stall' | 'speed' | 'paused', fn)
s.stats               // { tick, confirmedTick, lagTicks, rttMs, resyncs }
```

Messages: `{t:'cmd', cmd}` client to host; `{t:'turn', upTo, cmds:[{tick, cmd}], speed, paused}`
host to all; `{t:'hash', tick, hash}` client to host; `{t:'snap', id, part, of, data}` host to one
(chunked); `{t:'ping'|'pong', ts}`.

## Contract 4: server (server/)

- `server/relay.mjs`: dependency `ws`; rooms by code, max 4 peers, presence join / leave events,
  relays `send` to the room or one peer, message size limit (512 KB), per-peer rate limit, heartbeat
  and dead-peer cleanup, `GET /health`. Configurable `PORT`, `ALLOWED_ORIGINS`.
- Deploy files: `server/Dockerfile`, `render.yaml`, `fly.toml`; docs/DEPLOY-ONLINE.md covers Supabase
  (no server code: create a project, copy URL and anon key into data/online.json) and the relay.

## Known limits

- Supabase free tier counts every message; turns are batched (default 10 per second per room) and
  hero positions ride along with turns. Expect a few simultaneous rooms on the free tier; the relay
  server has no such limit.
- No host migration: if the host leaves, the match ends.
- Rewards are trusted to each client (as in single-player). Phase 2 of docs/online-plan.md (server
  replay verification) is still the path to competitive play.
