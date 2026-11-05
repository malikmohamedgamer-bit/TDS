# Online plan (not built yet)

TDS is a single-player browser game today: everything runs in the page, the save lives in
`localStorage`, and the deploy is static files on GitHub Pages. This document is the plan for
going online **without rewriting the game**. Nothing here is implemented. Estimates are rough.

## What already makes this possible

| Already in the code | Why it matters online |
|---|---|
| `src/core/` and `src/sim/` are pure and deterministic (seeded `Rng`, fixed 60 Hz step, no DOM / Three.js) | A Node server can import the exact same simulation and re-run any match |
| Every match records its commands (`match.log`) and ends with a state `hash()`; `replay()` in `src/sim/bot.js` re-runs a log and reproduces the hash | Server-side verification of scores, wins and daily-challenge results without trusting the client |
| Rewards are granted once per id (`match:<seed>`, `dailychallenge:<date>`, quest ids) | The same ids become database keys: a reward can never be paid twice |
| Summons are deterministic from the save's summon seed and pull counter | The server can compute (and therefore own) every pull result |
| Versioned save schema (v3) with migrations, sanitizing and a checksummed export | Cloud saves can reuse it; the checksum only catches accidents, it is **not** security |
| All content is JSON in `data/` | Server and client load the same files; a content hash can pin both to one version |

## Phases

### Phase 1: accounts and cloud save (smallest useful step)
- Sign-in with a hosted provider (passkeys / email link / Google). No passwords stored by us.
- `PUT /save` and `GET /save` storing the sanitized save JSON per account, with `updatedAt` and a
  schema version; last write wins, but keep the previous 5 versions for support.
- The client keeps `localStorage` as an offline cache and merges on sign-in (pick the save with
  more XP; never merge currencies by adding them).
- Hosting: the static game stays on GitHub Pages; the API is small (Cloudflare Workers + D1, or
  Supabase with row-level security). Both have free tiers that cover a hobby launch.
- Effort: about 1-2 weeks.

### Phase 2: server-authoritative rewards (needed before anything competitive)
- The client asks the server to **start** a match: the server picks the seed and returns it with a
  signed ticket (seed, map, mode, difficulty, loadout, levels, content hash).
- At the end the client sends the command log. The server replays it with the shared simulation
  (`replay()`), compares the hash, and only then grants crowns, XP, quest progress and the daily
  reward. A mismatch grants nothing and is logged.
- Replay cost: a 20-wave match simulates in roughly 0.5-2 s of CPU in Node (from the balance bot
  timings), so verification is affordable; queue it and grant rewards asynchronously.
- Summons move to the server: `POST /summon` spends sigils and returns results computed from the
  server's copy of the summon seed and counter.
- Effort: about 2-3 weeks.

### Phase 3: Daily Challenge leaderboard
- Same seed and rules for everyone on a date (already true). Rank verified runs by keep health
  left, then time. Show the top 100 and the player's own rank.
- Only replay-verified runs are listed; assisted runs are excluded (they are already flagged).
- Effort: about 1 week after phase 2.

### Phase 4 (optional): co-op
- Two players defending one map is possible because the simulation is deterministic: lockstep
  networking (exchange commands per tick window, both clients simulate) with the server relaying
  and verifying the final hash. Needs input delay handling and desync detection (compare hashes
  every few seconds). This is a large project (1-2 months); only do it if players ask for it.

## Not planned
- **Trading** between players: there is no trading in the game, and adding it creates fraud,
  account theft and real-money-trading problems. If ever added, it must be server-side only,
  with escrow, trade limits, and cool-downs.
- **Real-money purchases**: the game uses free currencies only (crowns, sigils). The summon is a
  slot machine; selling summons for money would make it a paid loot box, which is regulated or
  banned in some countries (for example Belgium) and needs published odds (already shown in the
  game), age ratings and legal review first. Do not add it casually.

## Security and privacy checklist
- Never trust the client for currency, rewards, summons or scores (phase 2 is the fix).
- Rate-limit match starts, save writes and summons per account.
- Store as little personal data as possible (an account id and a display name). Provide account
  deletion and a save export. Check children's privacy rules (COPPA / GDPR-K) before marketing to
  under-16s.
- Keep content and server versions pinned together: reject logs made with a different content hash.

## Open questions for the owner
1. Is a leaderboard worth the server cost and moderation (names)?
2. Which sign-in methods do your players use?
3. Should cloud saves be optional (play signed-out forever) or required for rewards?
