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
| `RATE_PER_SEC` / `RATE_BURST` | `60` / `120` | Per-socket token bucket (messages). |
| `RATE_BYTES_PER_SEC` / `RATE_BYTES_BURST` | `1048576` / `2097152` | Per-socket token bucket (received bytes: 1 MB/s, bursts up to 2 MB). The burst is never below the 512 KB message limit. |
| `MAX_BUFFERED_BYTES` | `2097152` | Backpressure: a socket with more than this many bytes queued to it and not read yet (a stalled tab, a dead network, a client that stopped reading) is terminated instead of buffering without limit. The game reconnects and resyncs. |
| `PEER_GRACE_MS` | `600000` | How long a peer id that left stays reserved for its secret (10 minutes). |
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
| `{op:'join', room, peer, meta, secret}` | Join room `room` as peer `peer`. `room`: 4-12 characters `A-Z0-9` (upper case; the client normalises). `peer`: 1-64 characters `A-Za-z0-9_-`, chosen by the client and kept across reconnects. `meta`: a JSON object up to 4 KB (`{name, hero, version}`), shown to the others. `secret`: 16-128 characters `A-Za-z0-9_-` (the game sends 128 random bits as 32 hex characters), kept with the peer id; see Peer identity. Optional for older clients. Joining again on the same socket updates `meta`; joining another room moves the socket. |
| `{op:'send', data, to?}` | Relay `data` (any JSON value) to every other peer in the room, or only to peer `to`. |
| `{op:'ping', ts}` | Answered with `{op:'pong', ts}` (round-trip time measurement). |

### Server to client

| Message | When |
|---|---|
| `{op:'joined', peer, peers}` | Reply to a successful `join`. `peers` is the full member list including yourself. |
| `{op:'peers', peers}` | Sent to the **other** members whenever someone joins, leaves, reconnects or changes meta. The joiner itself gets `joined` instead. |
| `{op:'msg', from, data}` | A message relayed from peer `from`. `from` is always set by the server from the sending socket's joined peer id (a `from` field in the client's `send` is ignored), so it cannot be forged. Never echoed to its sender. |
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
| `bad_secret` | `secret` present but not 16-128 characters `A-Za-z0-9_-`. |
| `taken` | The peer id is in use in this room (or left less than 10 minutes ago) with a different secret. Not retried by the game: a new peer id is needed. |
| `full` | The room already has 4 peers (and you are not one of them). |
| `not_joined` | `send` before a successful `join`. |
| `bad_msg` | `send` without `data`. |
| `no_peer` | `send` with a `to` that is not in the room. |
| `too_big` | Frame over 512 KB (524288 bytes). It is not relayed. Frames over 1 MB close the socket (code 1009). |
| `rate` | Over the message or byte rate limit; the message was dropped. Sent at most once a second. |
| `replaced` | Another socket joined with your peer id and secret: a reconnect, or the same room opened in another tab or window (a duplicated browser tab copies the id and secret). Message: `This room was opened in another tab or window`. This socket is then closed with code 4001; the client must **not** reconnect on it (the game stops with status `replaced`), or the two sockets would take the seat from each other forever. |
| `internal` | Server bug; the message was dropped. |

### Close codes

`4000` join timeout, `4001` replaced by a reconnect or another tab, `1001` server shutting down,
`1009` frame over 1 MB. A socket that misses a heartbeat, or has more than `MAX_BUFFERED_BYTES`
unread, is terminated without a close frame.

### Reconnect

Connect again and send `join` with the **same** `room`, `peer` and `secret`. The new socket takes
over the slot (it is never refused as `full`), keeps the original `joinedAt`, and the old socket, if
still open, gets `replaced` and is closed. The others receive a `peers` update.

### Peer identity

The first socket that joins a room as peer id P with secret S owns P in that room. A later `join`
as P is accepted only with the same S (a reconnect, or a page reload that kept both); with any
other secret, or none, it is refused with `taken`, so nobody in a room can take over another
player's seat, the host's included. The server remembers S while P is connected and for
`PEER_GRACE_MS` (10 minutes) after P left; the claims go away with the room when its last peer
leaves.

Backwards compatibility: `secret` is optional. A client that sends none gets the old behaviour (its
id can be taken over by any later join with that id, which then sets the secret). Old clients keep
working against a new server and the new client works against an old server (it ignores the extra
field). The game always sends a secret.

### Limits

4 peers per room; 512 KB per message; 60 messages/s and 1 MB/s per socket with bursts up to 120
messages and 2 MB; 2 MB unread per receiver; 4 KB meta; 500 sockets per server (configurable). The game batches its traffic (one turn message every
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
  codes are the only access control, which is fine for co-op between friends. Inside a room the
  peer secret keeps ids from being taken over, and `from` is always the real sender. Rewards are trusted
  to clients as in single-player (see docs/multiplayer.md, Known limits).
- Set `ALLOWED_ORIGINS` to your game's address in production so other sites cannot use your relay
  from their pages.
- All input is validated, size-limited and rate-limited (messages and bytes), handler errors are
  caught per message, receivers that stop reading are cut off before their queue grows past 2 MB,
  and dead or idle sockets are cleaned up, so one bad client cannot take the server down, fill its
  memory or keep rooms alive.
