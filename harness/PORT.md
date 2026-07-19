# The Cloudflare port

Approved by the user 2026-07-18: *"Create a SocketIO branch to save the current state and
then tear it up."* The Node/socket.io version is frozen on branch **`socketio`**
(`d483727`) — it is the escape hatch and the reference implementation, not a maintenance
target. `main` becomes the Cloudflare Workers + Durable Objects version.

## Goal

The same game, served from Cloudflare's free tier: public URL, no laptop hosting, state
that survives redeploys. **The wire protocol, the React screens, and the game logic do
not change.** A player cannot tell the backends apart.

## Non-goals

- **No dual-target abstraction.** We cut along the existing seam once; we do not maintain
  a layer that runs on both Node and Workers. The `socketio` branch is the Node version.
- **No deploy from this repo's automation.** `wrangler deploy` needs the user's Cloudflare
  login; everything here works against `wrangler dev` (local Miniflare, no account).
  Deploying is a documented user step.
- **No feature changes.** Every behavior decision already recorded in ISSUES.md stands:
  spectators, 24h clean time, reclaim-by-name, claimed identity, one ballot order.

## Architecture

One game = one Durable Object, keyed by the 5-letter code: `env.GAME.getByName(code)`.
The platform replaces three things we hand-built:

| Today (Node) | Becomes | Why it's a simplification |
|---|---|---|
| `games` map + `socketStuff` | One DO per code; sockets tagged with `{role, name}` via `serializeAttachment`, filtered with `getWebSockets()` | The cross-game bookkeeping and disconnect loop dissolve |
| `games.json` + SIGINT/SIGTERM handlers + `resumeTimers` | `ctx.storage` write-through after every event | Persistence is no longer signal-shaped; alarms survive redeploys natively |
| `setInterval` countdown in `GameState.startTimer` | Deadline timestamp + one DO alarm | Survives hibernation and eviction; `resumeTimers()` is deleted, not ported |
| express static | Workers static assets | Free, no code |

### Decisions (numbered so ISSUES/commits can cite them)

- **D1 — Wire protocol frozen.** Same JSON events, same names, same payloads. The client
  screens and the 15 test suites' assertions are the port's correctness oracle.
- **D2 — Client shim, not client rewrite.** `socket.js` is rewritten internally to a
  native WebSocket wrapper that keeps the socket.io surface (`emit/on/off`, `connected`,
  a `connect` event, auto-reconnect). Screens import it unchanged. It knows the current
  game code and lazily connects to `/ws/<CODE>`; `newGame` becomes `POST /api/newGame`
  (the one protocol edge that must change: a per-game DO needs the code to exist before
  a socket can route to it).
- **D3 — Deadline timers.** `GameState` stores `timerDeadline` (epoch ms) instead of
  ticking a counter. `getTimerValue()` derives seconds remaining, so `ClientGameState.
  timerValue` and H2 are untouched. The DO schedules `setAlarm(deadline)`.
  SAVE_VERSION → 4.
- **D4 — One alarm, three duties.** `alarm()` runs, in order: (1) clean-time check — no
  human touch for `CLEAN_TIME_MS` → `storage.deleteAll()`, done; (2) phase deadline
  passed → `handleTimerExpiry` (which sets the next deadline via the transitions);
  (3) reschedule to `phaseDeadline ?? lastActivity + CLEAN_TIME_MS`. This carries
  CNG-033/038 semantics: only humans `touch()`, and an abandoned game's alarm chain
  walks it to GameOver and then deletes it.
- **D5 — No `process.env` on Workers.** Config (`ROUND_SECONDS`, `RESTART_SECONDS`,
  `BACKSTOP_SECONDS`, `CLEAN_TIME_MS`, `QUESTION_COUNT`) moves to wrangler `vars`, read
  from `env` in the DO and passed into `GameState` explicitly (constructor option for the
  question pool). Tests pass them via `wrangler dev --var`.
- **D6 — Phase token stays.** The host's browser countdown still sends `timerExpired` as
  a token-guarded fallback; late messages after an alarm fire still need rejecting.
- **D7 — `requestJoinHost` answers `{ lanHost: null }`.** There is no `os` module and no
  LAN to report. The client's loopback handling (CNG-029) is untouched and correct: under
  `wrangler dev` on localhost it shows the "only works on this machine" warning, which is
  true; deployed, the hostname isn't loopback and the QR just works.
- **D8 — Storage layout.** SQLite-backed class (required on the free plan) using the KV
  API: the game is one JSON blob under key `game`, written through after every handled
  event and alarm. The state is kilobytes; a table schema would be over-modeling.
  `SAVE_VERSION` gating carries over: unreadable blob → treat as no game.
- **D9 — "Game exists" means storage has state.** `getByName` always returns a stub, so
  invalid-code answers come from the DO finding empty storage, same protocol reply as
  today. Code generation retries if the fresh code collides with a live game.
- **D10 — Test harness drives `wrangler dev`.** `tests/server.js` spawns
  `wrangler dev --port N --persist-to <tmp>` instead of `node dist/index.js`;
  `restart()` kills and respawns against the same persist dir, which is exactly what
  proves storage-backed survival. `savedGames()` (reads games.json) is gone — the
  restart-survival and sweep tests assert behavior over the wire instead of file
  contents.

## Milestones

Each lands as its own commit; the suite is expected red from M2 until M6 — that is
tracked, not hidden. "Done" for the port = M6 acceptance.

- **M0 — Preserve + plan.** `socketio` branch pushed; this document. ✅ when both exist.
- **M1 — Scaffold.** wrangler.jsonc (DO binding, sqlite migration, assets, vars),
  worker tsconfig, deps. ✅ when `wrangler dev` boots and serves the built client.
- **M2 — GameState goes platform-pure.** Deadline timers (D3), config injection (D5),
  SAVE_VERSION 4, `setInterval`/`NodeJS.Timeout` gone. ✅ when `tsc` is clean with no
  Node types in `src/GameState.ts` + `src/IncludeStuff.ts`.
- **M3 — The DO.** `worker/GameDO.ts`: hibernation websockets, the event dispatcher, all
  transition/resync methods ported, `alarm()` per D4, write-through per D8. ✅ compiles;
  smoke-tested by hand against `wrangler dev` (create, join, answer round-trip).
- **M4 — Worker entry.** `worker/index.ts`: `POST /api/newGame`, `/ws/:code` upgrade
  routing, assets fallthrough. ✅ same smoke test through real HTTP.
- **M5 — Client shim.** `socket.js` rewritten per D2. ✅ a real browser (or the shim
  driven headless) plays the lobby flow against `wrangler dev`.
- **M6 — The suite is the judge.** `tests/server.js` + `helpers.js` re-pointed per D10;
  every test adjusted only where the *platform* semantics differ (file-reading
  assertions), never where game semantics live. ✅ **15/15 green against wrangler dev.**
- **M7 — Teardown.** Delete `src/index.ts`, `src/socketHandlers.ts`, express + socket.io
  deps, `scripts/ensure-build.js` Node paths; update README/CLAUDE/harness docs and
  npm scripts (`start` = `wrangler dev`, `deploy` = `wrangler deploy`). ✅ `npm test`
  green from a tree with no socket.io anywhere; docs describe only the new world.

## Risks

- **R1 — wrangler dev startup cost.** Each test boots its own instance (~3–8s); the suite
  gets slower. Acceptable; parallelism or a shared instance only if it becomes painful.
- **R2 — Hibernation surprises.** In-memory DO fields vanish on eviction. Mitigation:
  D8's write-through and rehydrate-on-wake in the constructor; nothing game-critical
  lives only in memory. The suite's restart tests double as eviction tests.
- **R3 — The shim's reconnect.** socket.io's auto-reconnect was load-bearing for the
  refresh story. The shim must re-fire `connect` so App.tsx re-identifies (CNG-018 path).
  The reconnect test covers it.
- **R4 — Free-tier limits are per-day.** 100k requests/day with 20:1 WebSocket message
  discount; party scale is ~4 orders of magnitude inside. No action, recorded so nobody
  re-derives it.

## Status — COMPLETE 2026-07-18

All milestones landed; the suite (the acceptance bar for M6) is green against
`wrangler dev`. One issue found and fixed during the port: CNG-042 (rehydration read a
field toJSON never wrote — R2's predicted class, found by exactly the tests D10 said
would find it). Deploying remains the user's step: `npx wrangler login`, then
`npm run deploy`.
