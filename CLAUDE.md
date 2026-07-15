# confess_n_guess

A Fibbage-style party game. TypeScript + socket.io server (`src/`), React + Vite
client (`confess_n_guess_client/`). Host screen drives the game; players join from
their phones with a 5-letter code.

## Project harness — read this first

Work is tracked in `harness/`. **Before starting anything, read `harness/TASKS.md`**
for the queue and `harness/ISSUES.md` for the detail behind any `CNG-NNN` reference.
`harness/README.md` documents the protocol.

## Rule: check in after each unit of work

**After completing a meaningful unit of work, commit it. Don't wait to be asked.**

A "unit of work" is one coherent change that leaves the tree in a working state —
typically one task from `harness/TASKS.md`, or one issue fixed. If a turn produced a
meaningful amount of work, it ends with a commit.

Each check-in:

1. `npx tsc --noEmit` in the repo root **and** in `confess_n_guess_client/` — both
   must pass.
2. Update the issue's status in `harness/ISSUES.md` and append to
   `harness/PROGRESS.md`.
3. Commit the code and the harness update together, referencing the issue id
   (e.g. `Fix host receiving player screens (CNG-001)`).

Do **not** batch several unrelated fixes into one commit — the point of this rule is
that a bad change can be found and reverted on its own. Do not commit generated state
(`games.json`) or build logs.

An issue is only `Fixed` once it has been exercised in a running game, not merely
compiled. Until it's been played, mark it `In progress` and say so in the commit.

## Build and run

    npm run build          # client then server — MUST rebuild after editing src/
    npm start              # server on :3001, serves the built client

    cd confess_n_guess_client && npm run dev    # client with hot reload

`dist/` is committed build output and `npm start` runs `dist/index.js` — **edits to
`src/` have no effect until `npm run build_server`.** This has bitten before.

## Testing

There is none (`npm test` is a stub that exits 1 — see CNG-021). Verification means
running the server and hand-driving a host screen plus at least three player tabs
through the affected path, **including a mid-game refresh of both a player and the
host** — that's where the bugs in this codebase live.

## Things to know about this codebase

- **Game state must survive a server restart.** This is deliberate: it allows
  hot-patching code mid-game while debugging without replaying a trace from the
  start. `GameState.toJSON`/`fromJSON` must serialize *everything* a round needs.
- `games.json` is runtime state written to the CWD. It is gitignored — that does not
  stop it saving, it just keeps churn out of commits.
- Identity is currently client-asserted: handlers trust the `name` in the event
  payload. This is the root cause of most reconnection bugs (CNG-009). Prefer fixes
  that move identity server-side.
- The phase countdown currently runs in the *host's browser*, not the server
  (CNG-003). `GameState.startTimer` exists and is unused.
