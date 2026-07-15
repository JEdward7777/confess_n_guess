# Confess'n'Guess project harness

A lightweight tracking system so work on this project can be directed, resumed, and
verified without re-deriving context every session.

## Files

| File | Purpose |
|---|---|
| `ISSUES.md` | The register of known problems. Every finding gets a stable `CNG-NNN` id, a severity, a status, and file:line evidence. |
| `TASKS.md` | The work queue. What to do next, in order. Tasks reference issue ids. |
| `PROGRESS.md` | Append-only log of what actually happened, dated. |

## Rule: check in after each unit of work

**After completing a meaningful unit of work, commit it — without being asked.**
This rule is restated in `/CLAUDE.md`, which is the copy that actually gets loaded
into an agent's context automatically. Keep the two in sync.

A "unit of work" is one coherent change that leaves the tree in a working state,
typically one task from `TASKS.md` or one issue fixed. Each check-in: typecheck both
roots, update the issue status here and append to `PROGRESS.md`, then commit code and
harness together referencing the issue id. One fix per commit — the point is that a
bad change can be reverted on its own.

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

## Verification protocol

This project has no tests and no automated checks beyond `npx tsc --noEmit`.
Until that changes, "verified" means: run the server, open a host screen and at
least three player tabs, and play the specific path the fix touches — including a
mid-game refresh of both a player and the host.

    npm run build && npm start        # server on :3001
    cd confess_n_guess_client && npm run dev   # client dev server

The single highest-leverage thing that would make this harness stronger is an
automated multi-client integration test driving socket.io clients through a full
round. See CNG-021.
