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

Every one was verified against a running server, not just compiled. Scripts live in
the session scratchpad and should be folded into T8.

## Now

### T3 — Give the server the timer back
Closes **CNG-003**, **CNG-011**; retires half of **CNG-022**.

The last of the five original criticals, and the only one left that can still wreck a
live round.

`GameState.startTimer` already exists and is never called — the authoritative
countdown runs in the *host's browser*. Two host tabs means two countdowns, and
`timerExpired`'s guard admits three phases at once, so two events in a row punch
through into the next phase: the round either restarts or a player is skipped, with
nobody having typed anything. Note the previous agent's socket-list change is what
made two live host sockets possible, so this is reachable today.

Move the countdown server-side and reduce the client's `timerExpired` to advisory (or
drop it). While here, delete the two nested blind `setTimeout`s at `:1588-1653` — they
advance the game without re-checking the phase, so they race the host's Continue
button and can skip a whole round (CNG-011).

Interim fix if a full move is too big for one pass: give `timerExpired` a phase/round
token and reject any that doesn't match. That alone stops the cascade.

Verify: open the host on two tabs and let a timer run out — the round must advance
once. Today it restarts the round or skips a player.

## Next

### T6 — Collapse the duplicated transitions
Closes **CNG-023**, **CNG-013**, **CNG-014**; retires the rest of **CNG-022**.

Truths→lies exists three times, lies→voting twice, voting→results twice, and they
have already drifted apart (one shuffles the reveal, another doesn't). Extract one
method per transition. Fold the ~12 hand-inlined socket loops into the
already-written-but-unused `sendToUserSockets`. Ensure every emit that a screen
depends on carries its own `targetPlayer` rather than relying on the client's merge
leaving a stale one lying around.

Do T3 and T4 first — this is a refactor and wants the semantics settled.

### T7 — Server-side identity
Closes **CNG-009**, **CNG-008**, **CNG-019**, **CNG-012**, **CNG-020**.

Keep a `socketId → {code, name}` map; read the actor from it instead of from the
event payload. Mint a per-player token at first join and require it to reclaim a
name — that's what makes reconnect work without letting a second person type "Alice"
and take over Alice's identity. Mint a host token at `newGame`. Make `addLie`/
`addVote` upsert by username, and reject self-votes server-side.

Note the constraint from `todo.txt`: reclaiming a name after falling out of a game
must keep working. Token-on-reclaim preserves that; simply rejecting duplicates
would not.

### T8 — Integration test for a full round
Closes **CNG-021**.

Drive one host and three players through a full round with socket.io-client, with a
refresh in the middle. Would have caught CNG-001, -003, -004, -005 and -013 without a
human. Everything above is currently verified by hand across four browser tabs, which
is why regressions keep landing.

## Backlog

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
