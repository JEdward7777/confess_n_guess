# Task queue

Ordered. Top of "Now" is what to pick up next. Each task names the issues it closes.
See `ISSUES.md` for detail, `README.md` for the verification protocol.

Nothing here has been started — this queue was written alongside the 2026-07-15 sweep.

## Now

### T1 — Stop the host screen turning into a player screen
Closes **CNG-001**. `src/socketHandlers.ts:89-102`.

One-line fix: `except()` returns a new operator instead of mutating, so the current
`forEach` discards every exclusion. Pass the array in a single chained call. Cheapest
real fix in the register and it kills a reported symptom outright.

Verify: play to the end of a game and watch the host — it must stay on the winner
screen, not fall through to "Waiting...".

### T2 — Make reconnect resync from the server
Closes **CNG-005**, most of **CNG-007**.

At the end of the `identify` handler, call `sendPlayerToCorrectScreen` /
`sendHostToCorrectScreen`. The server already treats that function as "the single
source of truth for where a player should be" — the reconnect path just never calls
it. Then fix `App.tsx:36` to route `name === '<host>'` to the host screen instead of
the player name-entry screen, and stop trusting `localStorage` for anything the
server can answer.

Verify: refresh a player mid-lie-round and mid-vote; refresh the host on every
screen. Everyone lands where the game actually is. Try it once with localStorage
cleared.

### T3 — Give the server the timer back
Closes **CNG-003**, **CNG-011**; retires half of **CNG-022**.

`GameState.startTimer` already exists and is never called. Move the countdown
authority server-side and reduce the client's `timerExpired` to advisory (or drop it).
While here, delete the two nested blind `setTimeout`s at `:1588-1653` — a deferred
transition must re-check the phase it was scheduled for before acting.

If a full move is too big for one pass, the interim fix is to give `timerExpired` a
phase/round token and reject any that doesn't match the current one. That alone stops
the cascade.

Verify: open the host on two tabs and let a timer run out. The round must advance
once. Today it restarts the round or skips a player.

### T4 — Fix the inverted lie round
Closes **CNG-004**. `src/socketHandlers.ts:1382-1416`.

Target and non-targets are swapped in this one path. Small fix, but do it as part of
T6 if T6 happens first — the reason it's wrong is that it's a hand-copy that drifted.

Verify: let the lie timer expire with no lies on a non-first target.

### T5 — Persist the whole game
Closes **CNG-002**, **CNG-016**.

`toJSON` drops `userAnswers`, `lies`, `votes`, `currentLieTargetPlayer`, so every
saved game reloads into a state the code can't handle.

**Decided 2026-07-15 (user):** full serialization. Mid-game state must survive a
restart, because the workflow is *hot-patching code in the middle of a live game* —
restarting must not force replaying the trace from the beginning. This is a real
requirement, not incidental, so resume has to be correct rather than best-effort.
Recorded in `/CLAUDE.md`.

So: serialize everything a round needs, version the file, and discard entries whose
version doesn't match rather than loading them into a shape the code no longer
expects. Add `lastActivity` and sweep old games. Delete the current 37 (all written
by the broken `toJSON`, none resumable). Gitignore `games.json` — this does *not*
stop it saving, it only keeps churn out of commits.

Verify: restart the server mid-round and have everyone reconnect — the round must
carry on, not restart.

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
- **T10** — Identify on `connect` rather than waiting for `identifyMe` (**CNG-018**).
- **T11** — Fix H5 auto-continue re-arming (**CNG-017**).
- **T12** — Clear `userAnswers` and `usedQuestionIndexes` on `startGame` (**CNG-010**).
- **T13** — Store each player's assigned question server-side (**CNG-006**). Folds
  naturally into T7 — it's the same "server should know, not ask the client" fix.

## Absorbed from todo.txt

`todo.txt` predates this harness and is mostly done. Still live, now tracked here:

| todo.txt line | Now |
|---|---|
| "if you refresh your screen, you don't lose your location" | T2 / CNG-005 |
| "if a gave has no activity for enough time that it gets deleted" | T5 / CNG-016 |
| "if you create a username that already exists that it fusses" / "replace that user so that it is possible to get back into the game" | T7 / CNG-008 |
| "Fix the control c thing which is bypassing the state of the game being saved" | Partly done (SIGINT handler at `index.ts:32`), but what it saves is incomplete — T5 / CNG-002 |

The rest of `todo.txt` appears complete. Suggest deleting it once T2/T5/T7 land, so
there's one place to look.
