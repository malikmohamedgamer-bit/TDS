# TDS relay server

A small WebSocket relay for TDS online co-op (`docs/multiplayer.md`, contract 4). It groups
connections into rooms by code and forwards JSON messages between the peers of a room. It knows
nothing about the game: the lockstep session on the clients (`src/net/lockstep.js`) does all game
logic, so the server needs no updates when the game changes.

You only need this if you do not use Supabase. Owner's step-by-step guide: `docs/DEPLOY-ONLINE.md`.

## Run

```sh
cd server
npm install        # one dependency: ws
npm start          # listens on port 8787
npm test           # starts real relay processes on free ports and talks to them
```

Then open the game with `?net=relay&relay=ws://localhost:8787` in two tabs (or two machines on
your network, with your computer's address instead of localhost).

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | Listen port. `0` picks a free port (printed on start). Render and Fly set it for you. |
| `ALLOWED_ORIGINS` | empty | Comma separated page origins allowed to connect, for example `https://you.github.io,http://localhost:5173`. Empty allows every origin. Compared without trailing slash, case-insensitive. When set, connections without an `Origin` header (non-browser clients) are refused too. `*` in the list allows all. |
| `HEARTBEAT_MS` | `15000` | The server pings every socket this often; a socket that did not answer the previous ping is terminated. |
| `MAX_CLIENTS` | `500` | Simultaneous sockets; more get HTTP 503 on upgrade. |
| `RATE_PER_SEC` / `RATE_BURST` | `60` / `120` | Per-socket token bucket. |
| `JOIN_TIMEOUT_MS` | `30000` | A socket that has not joined a room by then is closed (code 4000). |

## HTTP

- `GET /health` returns `200 {"ok":true,"rooms":<n>,"peers":<n>}` (JSON, `no-store`, CORS `*`).
  Point uptime monitors and platform health checks here.
- `GET /` returns a one-line text page. Anything else is `404`.
- WebSocket upgrades are accepted on any path. With `ALLOWED_ORIGINS` set, a disallowed origin gets
  `HTTP 403` before the handshake completes.

## Protocol

Every frame is one JSON object (text frame). Binary frames are refused (`bad_json`).

### Client to server

| Message | Meaning |
|---|---|
| `{op:'join', room, peer, meta}` | Join room `room` as peer `peer`. `room`: 4-12 characters `A-Z0-9` (upper case; the client normalises). `peer`: 1-64 characters `A-Za-z0-9_-`, chosen by the client and kept across reconnects. `meta`: a JSON object up to 4 KB (`{name, hero, version}`), shown to the others. Joining again on the same socket updates `meta`; joining another room moves the socket. |
| `{op:'send', data, to?}` | Relay `data` (any JSON value) to every other peer in the room, or only to peer `to`. |
| `{op:'ping', ts}` | Answered with `{op:'pong', ts}` (round-trip time measurement). |

### Server to client

| Message | When |
|---|---|
| `{op:'joined', peer, peers}` | Reply to a successful `join`. `peers` is the full member list including yourself. |
| `{op:'peers', peers}` | Sent to the **other** members whenever someone joins, leaves, reconnects or changes meta. The joiner itself gets `joined` instead. |
| `{op:'msg', from, data}` | A message relayed from peer `from`. Never echoed to its sender. |
| `{op:'pong', ts}` | Reply to `ping`. |
| `{op:'error', code, message}` | See the error codes. The socket stays open unless noted. |

A peer list is `[{id, meta, joinedAt}]`, oldest first (`joinedAt` is the server's `Date.now()` at
the first join; a reconnect keeps it, so the order is stable).

### Error codes

| Code | Cause |
|---|---|
| `bad_json` | Not a JSON object, or a binary frame. |
| `bad_op` | Unknown `op`. |
| `bad_room` | Room code not 4-12 characters `A-Z0-9`. |
| `bad_peer` | Peer id not 1-64 characters `A-Za-z0-9_-`. |
| `bad_meta` | `meta` not an object, or over 4 KB. |
| `full` | The room already has 4 peers (and you are not one of them). |
| `not_joined` | `send` before a successful `join`. |
| `bad_msg` | `send` without `data`. |
| `no_peer` | `send` with a `to` that is not in the room. |
| `too_big` | Frame over 512 KB (524288 bytes). It is not relayed. Frames over 1 MB close the socket (code 1009). |
| `rate` | Over the rate limit; the message was dropped. Sent at most once a second. |
| `replaced` | Another socket joined with your peer id (a reconnect). This socket is then closed with code 4001. |
| `internal` | Server bug; the message was dropped. |

### Close codes

`4000` join timeout, `4001` replaced by a reconnect, `1001` server shutting down, `1009` frame
over 1 MB. A socket that misses a heartbeat is terminated without a close frame.

### Reconnect

Connect again and send `join` with the **same** `room` and `peer`. The new socket takes over the
slot (it is never refused as `full`), keeps the original `joinedAt`, and the old socket, if still
open, gets `replaced` and is closed. The others receive a `peers` update.

### Limits

4 peers per room; 512 KB per message; 60 messages/s per socket with bursts up to 120; 4 KB meta;
500 sockets per server (configurable). The game batches its traffic (one turn message every
`turnTicks` ticks, snapshots chunked by the session layer), so a normal match uses a small fraction.

## Deploy

Any host that runs Node 18+ or Docker and supports WebSockets. Files:

- `server/Dockerfile`: `docker build -t tds-relay server && docker run -p 8787:8787 tds-relay`.
- `render.yaml` (repository root): Render blueprint for a free web service.
- `server/fly.toml`: Fly.io app config (`cd server && fly launch --copy-config --no-deploy && fly deploy`).

Step-by-step instructions for each, and how to point the game at the relay (`data/online.json`
`transport: "relay"`, `relayUrl: "wss://.../"`), are in `docs/DEPLOY-ONLINE.md`.

## Security notes

- The relay forwards whatever peers send inside a room; it does not authenticate players. Room
  codes are the only access control, which is fine for co-op between friends. Rewards are trusted
  to clients as in single-player (see docs/multiplayer.md, Known limits).
- Set `ALLOWED_ORIGINS` to your game's address in production so other sites cannot use your relay
  from their pages.
- All input is validated and size-limited, handler errors are caught per message, and dead or idle
  sockets are cleaned up, so one bad client cannot take the server down or keep rooms alive.
