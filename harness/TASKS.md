# Task queue

Ordered. Top of "Now" is what to pick up next. Each task names the issues it closes.
See `ISSUES.md` for detail, `README.md` for the verification protocol.

Written alongside the 2026-07-15 sweep; five tasks landed the same day (see Done).

## Done

- **T1** — host no longer receives player-only screens (CNG-001). `06ccaa6`
- **T2** — reconnect resyncs from the server (CNG-005, -007, -018, -024). `0049ce8`
- **T4** — lie round un-inverted in the skip path (CNG-004, part of -014). `808f39d`
- **T5** — full state serialization + idle sweep (CNG-002, -016). `c494f4c`
- **T13** — assigned questions stored server-side (CNG-006). `318dae1`
- **T3 (correctness half)** — timer cascade + blind timeouts (CNG-003, -011, -025). `1e8912f`
- **T6** — one method per transition; -520 lines (CNG-023, -010, -013, -014, part of -022).

Every one was verified against a running server, not just compiled. Scripts live in
the session scratchpad and should be folded into T8.

## Now

### T7 — Server-side identity
Closes **CNG-009**, **CNG-008**, **CNG-019**, **CNG-012**, **CNG-020**.

The last structural root cause, and now the largest thing left. Handlers still take the
actor's `name` from the event payload and act on it without checking it against the
socket it arrived on, so any client can answer, lie or vote as anyone else — and anyone
typing an existing name is merged onto that player's identity and starts receiving their
screens.

Keep a `socketId → {code, name}` map; read the actor from it instead of the payload.
Mint a per-player token at first join and require it to reclaim a name. Mint a host token
at `newGame` (today `identify` accepts `role: 'host'` for any code from anyone, which
also leaks every answer before the reveal). Make `addLie`/`addVote` upsert by username
(CNG-012), and reject self-votes server-side (CNG-020).

Constraint from `todo.txt`: reclaiming a name after falling out of a game must keep
working — that's why it's token-on-reclaim rather than simply rejecting duplicates.

T6 landed first, so there's now one place per transition to thread identity through.

## Next

### T8 — Land the verification scripts as a test suite
Closes **CNG-021**.

**Most of the work is already done and is being thrown away every session.** Eight
scripts now exist that drive real sockets: `verify_fullgame` (host + 3 players through
every round to the winner), plus one each for CNG-001/002/003/004/005/006. They live in
the session scratchpad, which is the wrong place — they should be in the repo behind
`npm test`.

Needed: move them in, give them a runner that starts a server on a spare port and tears
it down, and make the two-phase restart test (`verify_cng002`) work under it. They found
CNG-024 and CNG-025 unaided; every regression they'd catch is one that currently reaches
a live game.

## Backlog

- **T3 (remainder)** — move the countdown off the host's browser and onto the server,
  via the unused `GameState.startTimer`. **Deliberately deferred.** The phase token
  closed the correctness bug (CNG-003), so what's left is robustness: today the game
  stalls if the host closes their tab, since the only clock is in their browser.
  Doing it now means touching ~8 duplicated transition sites and missing one means a
  round that never advances — a worse failure than the one being fixed. It also needs
  timers restarted on load, since a timer can't be serialised. Do it after T6, when
  there is one place to put it.

- **T9** — Remove or gate `killServer` (**CNG-015**). Any client can kill the process.
- **T11** — Fix H5 auto-continue re-arming (**CNG-017**).
- **T12** — Clear `userAnswers` and `usedQuestionIndexes` on `startGame` (**CNG-010**).

## Absorbed from todo.txt

`todo.txt` predates this harness and is mostly done. Still live, now tracked here:

| todo.txt line | Now |
|---|---|
| "if you refresh your screen, you don't lose your location" | **Done** — T2 / CNG-005 |
| "if a gave has no activity for enough time that it gets deleted" | **Done** — T5 / CNG-016 |
| "if you create a username that already exists that it fusses" / "replace that user so that it is possible to get back into the game" | T7 / CNG-008 |
| "Fix the control c thing which is bypassing the state of the game being saved" | **Done** — the SIGINT handler existed but saved an incomplete state; T5 / CNG-002 |

The rest of `todo.txt` appears complete. Only the CNG-008 line is still live; delete
`todo.txt` once T7 lands, so there's one place to look.
