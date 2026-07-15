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

1. `npx tsc --noEmit` in the repo root **and** in `confess_n_guess_client/` — both
   must pass.
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

## Build and run

    npm run build          # client then server — MUST rebuild after editing src/
    npm start              # server on :3001, serves the built client

    cd confess_n_guess_client && npm run dev    # client with hot reload

`dist/` is committed build output and `npm start` runs `dist/index.js` — **edits to
`src/` have no effect until `npm run build_server`.** This has bitten before.

## Verification protocol

There are no tests (`npm test` is a stub that exits 1 — CNG-021). "Verified" means
running the server and driving the affected path, **including a mid-game refresh of
both a player and the host** — that's where the bugs in this codebase live. Either
hand-drive a host plus three player tabs, or drive real sockets from a script.

Scripted verification has worked well and is much faster than four browser tabs; the
scripts written so far are noted in `PROGRESS.md`. Folding them into a real test suite
is T8/CNG-021, and is the highest-leverage remaining item — reading found 23 issues,
but *running* the thing found CNG-024 in minutes.

When starting a server to verify against, **confirm it actually bound the port** and
that no earlier one is still holding it (`pgrep -af '[d]ist/index.js'`). An orphaned
server from a previous run silently serves the old build and produces false results.
Note `pkill -f` will match your own shell if the pattern appears in the command line.

## Things to know about this codebase

- **Game state must survive a server restart.** This is deliberate: it allows
  hot-patching code mid-game while debugging without replaying a trace from the
  start. `GameState.toJSON`/`fromJSON` must serialize *everything* a round needs, and
  `SAVE_VERSION` must be bumped when old saves stop being readable.
- `games.json` is runtime state written to the CWD. It is gitignored — that does not
  stop it saving, it just keeps churn out of commits.
- Identity is currently client-asserted: handlers trust the `name` in the event
  payload. This is the root cause of most reconnection bugs (CNG-009). Prefer fixes
  that move identity server-side.
- The phase countdown currently runs in the *host's browser*, not the server
  (CNG-003). `GameState.startTimer` exists and is unused.
- The phase-transition logic is copy-pasted several times over and has already
  drifted apart (CNG-023). If you're fixing one copy, check the others.
