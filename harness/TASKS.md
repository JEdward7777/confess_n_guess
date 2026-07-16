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

Nothing queued.

All five original criticals are fixed, the identity question is settled (see the decision
note in `ISSUES.md`), and `npm test` covers every one of them. What's left in Backlog is
small and genuinely optional.

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
