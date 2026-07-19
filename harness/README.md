# Confess'n'Guess project harness

A lightweight tracking system so work on this project can be directed, resumed, and
verified without re-deriving context every session.

`/CLAUDE.md` only points here. This file is the authoritative copy of the working
rules — put them here, not there.

## Files

| File | Purpose |
|---|---|
| `ISSUES.md` | The register of known problems. Every finding gets a stable `CNG-NNN` id, a severity, a status, and file:line evidence. |
| `TASKS.md` | The work queue. What to do next, in order. Tasks reference issue ids. |
| `PROGRESS.md` | Append-only log of what actually happened, dated. |

## Rule: check in after each unit of work

**After completing a meaningful unit of work, commit it — without being asked.**

A "unit of work" is one coherent change that leaves the tree in a working state,
typically one task from `TASKS.md` or one issue fixed. Each check-in:

1. `npm test` — green. And `npx tsc --noEmit` in the repo root **and** in
   `confess_n_guess_client/`.
2. Update the issue's status in `ISSUES.md` and append to `PROGRESS.md`.
3. Commit the code and the harness update together, referencing the issue id
   (e.g. `Fix host receiving player screens (CNG-001)`).

One fix per commit — the point is that a bad change can be found and reverted on its
own. Don't commit generated state (`games.json`) or build logs.

## How to use it

**To direct work:** edit `TASKS.md` — move something into "Now", or add a new task.
An agent picking this project up reads `TASKS.md` first, `ISSUES.md` for detail.

**To report a problem:** add a row to `ISSUES.md` with a new id. Include how to
reproduce it if known. Don't renumber existing ids — they're referenced elsewhere.

**To record progress:** append to `PROGRESS.md` and flip the issue's status in
`ISSUES.md`. A fix isn't `Fixed` until it's been exercised against a running game,
not just compiled.

## Issue status values

- `Open` — confirmed, not started
- `In progress` — being worked
- `Fixed` — code changed *and* behavior verified in a real game
- `Won't fix` — deliberate, with a reason recorded
- `Unconfirmed` — suspected, needs reproduction before spending effort

## Severity

- **Critical** — corrupts a live game or makes it unplayable
- **High** — visibly wrong behavior players will hit in a normal session
- **Medium** — wrong but recoverable, or only hit in edge cases
- **Low** — cleanup, dead code, hygiene

## Build and run (Cloudflare edition — see PORT.md)

    npm start              # wrangler dev on :8787 (local Miniflare, no account needed)
    npm run deploy         # build client + wrangler deploy (needs `npx wrangler login`)

    cd confess_n_guess_client && npm run dev    # client with hot reload against :8787

The server is `worker/` (entry + GameDurableObject); shared game logic is `src/`
(GameState, IncludeStuff), which wrangler bundles directly — no separate server build.
The Node/socket.io version lives on branch `socketio`.

## Verification protocol

    npm test              # build the server, then run the integration suite (~2 min)
    npm test -- reconnect # just the tests matching "reconnect"

Two tests wait on real timers (`timer-fires`, `unattended`), which is why the suite takes
minutes rather than seconds. That waiting is the point — see below.

`tests/` drives real socket.io clients against a real server — a host and three players,
through whole games. That is the only kind of test worth writing here: nearly every bug
in this project has been about *what the server sends to whom*, which only a real client
can see. Each test gets a freshly started server on a free port in its own scratch
directory, so nothing leaks between tests or into the real `games.json`.

**Run `npm test` before every check-in.** A fix isn't `Fixed` until the suite is green
*and* the behaviour has been seen working — for anything the suite can't reach, drive a
host plus three player tabs by hand, **including a mid-game refresh of both a player and
the host**, which is where the bugs live.

**Add a test with a bug fix, and watch it fail first.** Every issue found by running
rather than reading (CNG-024, CNG-025) came from a test written to check something else.
A green suite you have never seen go red is not evidence of anything — revert the fix,
confirm the test catches it, then put the fix back.

**Watch what a test doesn't cover, too.** `fullgame` walks a whole game but submits
everything promptly, so no timer has ever fired inside it — the server clock could be
deleted and it would stay green (measured, CNG-027). `timer-fires` abandons the game
during a *timed* phase, so it stayed green while the reveal froze forever (measured,
CNG-028). A walkthrough only guards what it waits for. When a test passes and you're about
to conclude something broader from it, check whether it could have failed.

If you do need a server by hand: **confirm it actually bound the port** and that no
earlier one is still holding it, or you will test a stale build and get a false result.
Never use `pkill -f` with a pattern that appears in your own command line — it matches
the shell and kills it. Both mistakes have cost real time here; `tests/server.js` avoids
them by tracking the process group.

## Things to know about this codebase

- **Game state must survive a redeploy.** This is deliberate: it allows hot-patching
  code mid-game without replaying a trace from the start. On Cloudflare that's DO
  storage + durable alarms; `GameState.toJSON`/`fromJSON` must serialize *everything*
  a round needs, `SAVE_VERSION` must be bumped when old saves stop being readable, and
  **anything the DO caches in memory must be rehydrated in the constructor** — an
  eviction is a restart you didn't schedule (CNG-042).
- Identity is currently client-asserted: handlers trust the `name` in the event
  payload. This is the root cause of most reconnection bugs (CNG-009). Prefer fixes
  that move identity server-side.
- The server owns the phase countdown (`startPhaseTimer`). The host's browser also counts
  down so players see a number, and still sends `timerExpired` as a token-guarded
  fallback, but the game does not depend on it. Round lengths are overridable via
  `CNG_ROUND_SECONDS` / `CNG_RESTART_SECONDS` — that exists so tests can watch a real
  timer fire in seconds; nothing in the game should read those directly.
- Phase transitions live in one method each (`beginLieRound`, `beginVoting`,
  `showLieResults`, …). Keep it that way: when these were hand-copied they drifted and
  produced CNG-004, -014 and -025 (CNG-023).
- `endGame` sends players `c2` while `continueFromScores` sends `h6`. That inconsistency
  is deliberate — the `host-exclusion` test proves the host is excluded from player-only
  broadcasts by checking the two land on *different* screens. Unify them and the test
  goes quiet without going red.
