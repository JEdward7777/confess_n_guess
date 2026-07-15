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
- **T3 (correctness half)** — timer cascade + blind timeouts (CNG-003, -011, -025).

Every one was verified against a running server, not just compiled. Scripts live in
the session scratchpad and should be folded into T8.

## Now

### T6 — Collapse the duplicated transitions
Closes **CNG-023**, **CNG-013**, rest of **CNG-014**; retires the rest of **CNG-022**.

Now the highest-value item: it's the disease behind several of the fixes already made.
Truths→lies is written out three times, lies→voting twice, voting→results twice, and
they have already drifted — one shuffles the reveal, another doesn't, so whether the
reveal order is randomised depends on whether the timer expired. CNG-004 (roles
inverted) and CNG-025 (restart not resetting) were both single copies that drifted from
their siblings. Every fix here risks missing a path until this is one method per
transition.

Extract one method per transition. Fold the remaining hand-inlined socket loops into
`sendToUserSockets`. Make every emit carry its own `targetPlayer` instead of relying on
the client's merge leaving a stale one (`:809`, `:1302` still don't).

Doing this first also makes T3's remainder nearly free — there'd be one place to start
a server-side timer instead of eight.

## Next

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
