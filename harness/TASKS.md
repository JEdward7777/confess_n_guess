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
- **T6** — one method per transition; -520 lines (CNG-023, -010, -013, -014, part of -022). `25d439f`
- **T8** — integration suite behind `npm test` (CNG-021). `de6bd50`
- **T7 (revised)** — identity accepted as claimed-not-proved; fixed the honest-player bugs it was hiding (CNG-012, -020, -026). `78357fa`
- **T3 (remainder)** — server owns the countdown; host can leave (CNG-027, -022).

Every one was verified against a running server, not just compiled. Scripts live in
the session scratchpad and should be folded into T8.

## Now

Queue from the 2026-07-16 review sweep (spotted, deliberately not fixed — see PROGRESS).
Ordered so the decisions come before the code that depends on them.

### T14 — Case-insensitive name reclaim
Closes **CNG-031**. The reclaim-by-name feature breaks on capitalization: "Bob" retyping
"bob" forks a ghost player into a live game, stalling quorums and orphaning points. Match
names trimmed and case-folded, store them as first typed. Fix `identify`'s check the same
way. Test: rejoin as "bob " after playing as "Bob" — same player, same points, no ghost.

### T15 — Recycle the question pool
Closes **CNG-032**. Pool exhaustion silently gives players nothing and then restarts the
empty round forever. Recycle `usedQuestionIndexes` when the pool can't serve everyone.
Test: pre-drain the pool, start a round, everyone still gets a question.

### T16 — "Activity" means a human did something
Closes **CNG-033**. Move `touch()` out of `setPhase` and into the socket handlers, so a
game the server is churning by itself can idle out. Interacts with the CNG-028 backstop —
see the issue for the test to write.

### T17 — Delete the orphaned mutating handlers
Closes **CNG-034**, part of **CNG-041**. Remove `selectBestAnswer` and `nextRound`
(nothing emits them; both can wreck a live round). **Keep `endGame`** — the
host-exclusion test depends on it and on its host/player screen split — but give it a
phase guard and `stopTimer()`. Delete the dead H4 screen while there.

### T18 — One ballot order per round; resyncs reuse the transition builders
Closes **CNG-035**, **CNG-040**. Store the shuffled ballot order on `GameState` (and in
`toJSON` — it must survive a hot-patch restart). Point the two resync functions at
`buildResults` and the stored order instead of their pre-T6 hand-rolled copies.

### T19 — Survive SIGTERM; save more than once per lifetime
Closes **CNG-036**, enables the **CNG-038** runtime sweep. Handle SIGTERM like SIGINT and
add a periodic/debounced save; prune idle games and their `socketStuff` entries there.
Test: run restart-survival with SIGTERM.

### T20 — Ask the user: mid-round joiners
**CNG-037** is a design decision, not just a bug: deal a mid-round joiner in immediately
(current behaviour, stalls the quorum until the timer) or park them until the next round?
Get an answer before coding.

### T21 — Server-side name validation
Closes **CNG-039**. Trim; reject empty and `<host>`; cap length. One guard clause in
`nameAndEmoji`, shared with T14's canonicalization.

## Backlog


## Absorbed from todo.txt

`todo.txt` predates this harness and is mostly done. Still live, now tracked here:

| todo.txt line | Now |
|---|---|
| "if you refresh your screen, you don't lose your location" | **Done** — T2 / CNG-005 |
| "if a gave has no activity for enough time that it gets deleted" | **Done** — T5 / CNG-016 |
| "if you create a username that already exists that it fusses" / "replace that user so that it is possible to get back into the game" | **Settled** — reclaim-by-name kept deliberately; see the decision note in `ISSUES.md`. The "fusses" half is explicitly *not* wanted. |
| "Fix the control c thing which is bypassing the state of the game being saved" | **Done** — the SIGINT handler existed but saved an incomplete state; T5 / CNG-002 |

Every line in `todo.txt` is now either done or settled above. It can be deleted — this
file is the one place to look.
