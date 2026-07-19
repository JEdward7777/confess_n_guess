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

**The Cloudflare port is the active project.** Plan and decisions live in `PORT.md`;
these tasks map to its milestones. The Node/socket.io version is frozen on branch
`socketio` (`d483727`).

- **T24–T31 / M0–M7** — ✅ all landed 2026-07-18; suite green against `wrangler dev`.
  (Test count is 14: idle-sweep's subjects — save files, shutdown signals — no longer
  exist as platform concepts; its live semantics moved into runtime-prune.)

Remaining user step: `npx wrangler login` once, then `npm run deploy`.

The pre-port register (CNG-001..041) is clean: everything Fixed or Won't-fix by recorded
decision. Issues found during the port get new CNG numbers.

## Done (2026-07-18)

- **T23** — runtime idle sweep with the user's 24-hour clean time (CNG-038). Red-first;
  also finally kills the CNG-033 churn residue by stopping pruned games' timers.

- **T22** — H1 renders server text; lobby-bound emits clear it so the merge can't leak a
  mid-game message into the lobby (CNG-041 closed).

## Done (2026-07-16 batch)

- **T18** — one ballot order per round, stored and serialized; resyncs collapsed onto
  `buildResults` (CNG-035, -040). Red-first; SAVE_VERSION → 3.

- **T15** — question pool recycles (CNG-032). `d58ff97` — red-first.
- **T16** — activity means a human did something (CNG-033). `6b28dba` — red-first.
- **T17** — orphaned handlers deleted, endGame guarded, H4 removed (CNG-034, part -041). `8c34db4` — usage verified in source, served bundle, and history first.
- **T19** — SIGTERM saves like SIGINT (CNG-036); user approved the minimal version, periodic save deliberately not built. Red-first via restart-survival-over-SIGTERM.
- **T14 + T20 + T21** — case-insensitive reclaim, spectators by user ruling, server-side name validation (CNG-031, -037, -039). Red-first; 13/13 suite.

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
