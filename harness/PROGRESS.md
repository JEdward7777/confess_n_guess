# Progress log

Append-only, newest last. One entry per session or per landed change.

---

## 2026-07-15 — Harness created, full code sweep

**Done:** Set up `harness/`. Read every file in `src/` and
`confess_n_guess_client/src/` and logged 23 issues (`ISSUES.md`) and 13 tasks
(`TASKS.md`). No code changed.

**Baseline:** commit `98fd9a2`, branch `main`. `npx tsc --noEmit` passes clean in both
the server root and `confess_n_guess_client/`. `npm test` is a stub that exits 1.
Working tree had unrelated local edits to `.vscode/launch.json`,
`confess_n_guess_client/package-lock.json`, `games.json`, plus an untracked `SS.txt`
(a stale build log from before the client's deps were installed — its
`Cannot find module 'react'` errors no longer reproduce).

**On the reported refresh/role-swap flakiness.** The user asked whether the previous
agent's work fixed it. It did not — commits `bac7c5b`/`017fde5`/`98fd9a2` converted
sockets to lists, which correctly stopped players from booting each other, but left
every mechanism behind the symptom intact. Five separate confirmed causes:

- **CNG-001** — `sendToPlayers` discards its `except()` calls, so every "players only"
  broadcast hits the host too. The host's screen is overwritten with a player waiting
  screen at game end and after a voting timeout. Deterministic, verified against
  socket.io's source: `except()` returns a new operator rather than mutating.
- **CNG-005** — nothing resyncs on reconnect. `identify` registers the socket and
  returns; the client restores its old screen from `localStorage`. Refresh and you
  stay wherever you were, however stale.
- **CNG-002** — saved games omit answers/lies/votes/target, so a server restart
  reloads every in-flight game into a state the code cannot handle. Confirmed against
  the real `games.json` (37 games, first one is phase `submittingLies` with no
  answers). Given the dev loop is restart-the-server, likely a large share of it.
- **CNG-003** — the countdown runs in the *host's browser* and `timerExpired`'s guard
  admits three phases, so two events in a row cascade a round into restarting or
  skipping a player. The list-of-host-sockets change **enabled** this: two host tabs
  now means two countdowns.
- **CNG-004** — one lie-round path has target and non-targets literally swapped: the
  target is asked to lie about themselves while everyone else waits.

**Root cause** (in `ISSUES.md`): identity and progression are asserted by the client,
while the server's socket↔name map is in-memory only and the game store is persisted —
so they disagree the instant anything restarts or reconnects. The individual bugs are
symptoms of that.

Also worth flagging: `GameState.startTimer` and `sendToUserSockets` are both fully
written and never called. Adopting the first fixes a Critical; adopting the second
removes most of the ~700 lines of duplicated transition logic (CNG-023) that let
CNG-004 drift out of sync in the first place.

**Next:** T1 (one-line `except()` fix, kills a reported symptom) and T2 (resync on
identify).

**T5 decided (user):** crash-resume is wanted, and for a stronger reason than
assumed — the workflow is hot-patching code *during a live game*, so a restart must
not force replaying the trace from the start. Full serialization it is; resume has
to be correct rather than best-effort. Recorded in `/CLAUDE.md` so it isn't
re-litigated.

---

## 2026-07-15 — Check-in rule added

**Done:** Added `/CLAUDE.md` at the user's request, carrying the rule that a
meaningful unit of work ends in a commit without being asked. It lives there rather
than in this directory because `CLAUDE.md` is the file loaded into an agent's context
automatically — a rule in `harness/README.md` alone would only be followed by someone
who already went looking. The README restates it and points at `CLAUDE.md` as the
authoritative copy.

`CLAUDE.md` also records three things that were costing time to rediscover: `dist/`
is committed and `npm start` runs it, so `src/` edits do nothing until a rebuild; the
save-state requirement above; and the two structural root causes (client-asserted
identity, browser-owned timer).

---

## 2026-07-15 — T1: host no longer receives player screens (CNG-001)

**Done:** `sendToPlayers` now applies its host exclusions in the same chain that
emits. The old code called `room.except(id)` in a `forEach` and discarded every
return value; `except()` builds a new operator rather than mutating, so nothing was
ever excluded and every "players only" broadcast hit the host.

**Verified**, not just compiled. Drove a real host plus two players against a real
server through `endGame`:

- pre-fix: host screens `[6, 8]` — winner screen, then overwritten with the player
  waiting screen. Exactly the reported symptom.
- post-fix: host `[6]`, players `[8]`.

Checked the test against the pre-fix build first and confirmed it fails there, so the
pass means something. Script kept at `scratchpad/verify_cng001.js` — it is the seed
of T8 and should be folded in when that lands.

**Note for next session:** `dist/` is tracked and `npm start` runs it, so the built
output is committed alongside the source. Easy to forget and then wonder why nothing
changed.

---

## 2026-07-15 — Store assigned questions server-side (CNG-006)

**Done:** `GameState` now records which question each player was handed
(`assignedQuestions`). `assignQuestion()` draws and records; `getOrAssignQuestion()`
returns what they already have and only draws if there is nothing — resync uses that
one. `sendQuestionAnswer` now stores the question the server assigned rather than the
string the client echoes back, so a stale or crafted client can't file an answer
against a question it invented. `clearAnswers()` clears assignments alongside answers.

**Why now, ahead of T2:** `sendPlayerToCorrectScreen` called `getNextQuestion()`,
which mutates. Wiring it into reconnect (T2) without fixing this first would have made
every refresh silently re-roll the player's question and drain a 30-question pool.

**Verified:** alice refreshes 3x mid-round. Pre-fix: 3 different questions, 3 burned
from the pool. Post-fix: same question all 3 times. Script at
`scratchpad/verify_cng006.js`.

**Process note — cost me a false result.** A test claimed the fix didn't work; the
real cause was an orphaned server from the previous run still holding :3199, so the
test was talking to an old build. `kill $SRV` had killed the wrapping subshell and
left `node` alive. When starting a server for verification, check it actually bound
the port and confirm the old one is gone — `pgrep -af dist/index.js` — before trusting
a result. Ironically the orphan gave a clean pre-fix baseline.

---

## 2026-07-15 — T2: reconnect resyncs from the server (CNG-005, -007, -018, -024)

**Done.** The reported bug — "refresh and people swap roles / end up on the wrong
screen" — is now fixed at its source.

- `identify` ends by calling `sendPlayerToCorrectScreen`/`sendHostToCorrectScreen`
  instead of just registering the socket id. It also rejoins the socket to the room
  (a socket after a refresh isn't in it), which alone was enough to make a refreshed
  client miss every subsequent broadcast.
- Unknown game → back to g1 with an error. A name the game has never heard of → c1 to
  pick a name, rather than resyncing a player that doesn't exist.
- `App.tsx` routes `name === '<host>'` to the host screen. The host's URL carries
  `name=<host>`, so a refreshing host was being shown the *player* name-entry screen;
  with localStorage empty they could type a name and turn the host into a player.
- The client identifies on `connect` rather than waiting to be asked, closing the race
  where a fast connection delivered `identifyMe` before React attached the listener
  and it was dropped forever (CNG-018).
- `localStorage` is now only a placeholder for the moment before the server answers,
  and can never overwrite server state.

**Verified:** 13 scenarios across every phase — host and player, answered and not,
target and non-target, dead code, unknown name. All pass. `scratchpad/verify_cng005.js`.

**The verification earned its keep: it found CNG-024.** The lie target was being handed
a ballot for their own round on resync — `sendPlayerToCorrectScreen`'s voting branch
checked "have you voted?" but never "are you the target?", though the branch directly
above it does exactly that check. The target could vote for their own truth for 1000
points. Latent before today (resync only ran on a mis-phased submission); wiring resync
into reconnect made it reachable by refreshing during a vote. Fixed here.

That is a good argument for T8: reading found 23 issues, but *running* the thing found
the 24th in minutes.

**Still open from the original five:** CNG-002 (restart corrupts saved games) and
CNG-003/CNG-004 (timer cascade, inverted lie round). Those are next.

---

## 2026-07-15 — T5: full state serialization (CNG-002, CNG-016)

**Done.** `toJSON` now saves everything a round needs — `userAnswers`,
`assignedQuestions`, `lies`, `votes`, `currentLieTargetPlayer`, `timerValue`,
`lastActivity` — behind `SAVE_VERSION = 2`. `fromJSON` returns `null` for anything it
can't faithfully restore, and the loader drops it: a save we only half understand is
worse than a lost one, because it produces a game that looks playable and isn't. Added
`lastActivity` (touched on every mutation) with a 12h idle sweep on load and save.

**Verified against the actual workflow this exists for.** Built a game to mid-lie-round
with one lie already in, SIGINT'd the server, restarted, reconnected everyone:

- saved phase `submittingLies`, answers `[alice, bob, carol]`, lies `{alice: [bob]}` —
  all of which the old `toJSON` silently discarded
- host resumed the lie round; all players still present
- bob (already lied) → waiting; carol (hadn't) → still asked; alice (target) → waiting
- carol's lie completed the round → voting

The 37 legacy saves have no version field and are all dropped on load, cleanly. That's
correct — none of them were resumable.

**Remaining from the original five:** CNG-003 (timer cascade) and CNG-004 (inverted
lie round). Both live in the `timerExpired` handler, and both are really symptoms of
CNG-023 (the transition logic is copy-pasted 3x and has drifted). Worth doing T3/T4
together with an eye to T6 rather than patching each copy.

---

## 2026-07-15 — T4: un-invert the lie round (CNG-004, part of CNG-014)

**Done.** In the skip-to-next-target path, everyone except the target now writes the
lie and the target waits. It had the two exactly swapped — the target was asked to
write a lie about themselves while everyone else was told "X is writing a lie, wait
your turn".

Rewrote it through `sendToUserSockets` — which was already written and never called —
rather than adding a fourth hand-rolled socket loop. The emit now carries
`targetPlayer` (CNG-014 on this path) and sets the timer so the host's countdown
restarts instead of inheriting the expired one.

**Verified** by driving the real path: complete round 1, then let the lie timer expire
with zero lies for a non-first target. Target waits, other two get c5, the emit carries
the new target, round completes into voting. `scratchpad/verify_cng004.js`.

**Also:** `/CLAUDE.md` reduced to a pointer at the user's request. The working rules,
build/run notes and codebase notes now live in `harness/README.md` only, so there's one
copy to keep true rather than two to drift apart.

**Remaining critical: CNG-003** (browser-owned timer + a guard that admits three
phases, so two `timerExpired` events cascade). That one is worth doing properly —
moving the countdown server-side via the unused `GameState.startTimer` — rather than
patching the guard. It is also entangled with CNG-011 and CNG-023.

---

## 2026-07-15 — T3 (correctness half): timer cascade (CNG-003, -011, -025)

**Done.** The last of the five original criticals no longer wrecks rounds.

- **Phase token (CNG-003).** `GameState` carries a counter bumped by anything ending a
  timed segment. Every host-bound state is stamped with it in
  `sendToHost`/`sendHostToCorrectScreen` — deliberately in one place rather than at the
  ~15 emit sites, because missing one silently disables the guard, and CNG-023 says
  that's what happens in this file. The host's countdown echoes it back with
  `timerExpired`; the second of two events is recognised as timing a segment that's
  already over and dropped.
- A **missing** token is rejected too. My first cut allowed it for backwards
  compatibility, which would have left the guard bypassable by exactly the stale tab it
  exists to stop. Every host emit now carries one, so absence means a stale bundle —
  and an event we can't place in time isn't one to act on. Recovery is a host refresh,
  which is cheap now CNG-005 works.
- **Deleted the blind setTimeout chain (CNG-011).** The voting-timeout path now stops at
  ShowingLieResults and waits for the host, like the all-voted path in `voteOnLie`. That
  inconsistency was the bug — one waited, the other raced ahead after 10s and could
  double-advance past the host's Continue. H3 already auto-continues, so nothing stalls.
  Also removes a latent crash on `winner.name` off an empty leaderboard.
- The client's countdown now resets on the token rather than on `text` changing, which
  is what the "Reset host timer when transitioning from truths to lies" commits were
  chasing. Two segments can carry identical text and the same 60s.

**Verified:** two host tabs both firing — exactly one applied, all players in one
coherent state, game still playable; stale and untokened events both rejected. All six
suites green together (`verify_cng001/003/003b/004/005/006`).

**Found CNG-025 on the way.** Both round-restart paths called `clearAnswers()` but never
`resetLieData()`, so a "fresh" round kept `currentLieTargetPlayer` pointing mid-list.
Since the target scan deliberately doesn't wrap (commit `553d19d`), the restarted round
resumed *after* the old target and everyone before them never got a round — and the
abandoned round's lies and votes leaked into the new one. Fixed.

**Deliberately not done: moving the countdown server-side.** The token closed the
correctness bug; what's left is robustness (the game stalls if the host closes their
tab, as the only clock is in their browser). Doing it now means touching ~8 duplicated
transition sites, and missing one gives a round that never advances — worse than what
it fixes. It also needs timers restarted on load, since a timer isn't serialisable.
Deferred to after T6, when there's one place to put it. That reverses what I said
earlier ("worth doing properly rather than patching the guard") — the token turned out
to be a real fix rather than a patch, and T6-first is the cheaper order.

**Process note:** two false results this session, both from my own shell, both the same
shape — a stale server on the port serving an old build, and a `cd` that persisted so
`npx tsc`/`npm run build_server` ran in the scratchpad and silently didn't rebuild.
Always rebuild from the repo root and confirm the guard you just wrote is actually in
`dist/` before believing a result.

---

## 2026-07-15 — T6: one method per transition (CNG-023, -010, -013, -014, part of -022)

**Done.** Extracted `beginAnsweringRound`, `restartRound`, `beginLieRound`,
`beginVoting`, `showLieResults`, `advanceToNextLieRoundOrEnd`, `endGameShowingWinner`,
`buildResults`. Every call site delegates. `timerExpired` went from **514 lines to ~70**
and now reads as three cases; `socketHandlers.ts` 1696 → 1174, `GameState.ts` 553 → 529.

**I re-rated CNG-023 from Low to High before doing it.** I originally filed it as
hygiene. That was wrong, and the day proved it: CNG-004 (one copy inverted), CNG-025 (one
copy didn't reset), CNG-014 (copies omitting `targetPlayer`) and the shuffle drift were
all single copies falling out of step with their siblings. It was a bug generator, not
untidiness.

Folded in along the way:
- **CNG-010** — `startGame` now calls `resetForNewGame()`. Points/users deliberately left
  alone: `startGame` only runs from `CollectingUsers`, only reachable on a fresh game, so
  resetting them would be dead code pretending to be a safeguard.
- **CNG-013** — `nextRound` broadcast every player's question to everyone via
  `sendToPlayers`; it now targets each player.
- **CNG-014** — fully closed; both `beginLieRound` and `beginVoting` carry `targetPlayer`
  explicitly, so nothing depends on the client's merge any more.
- Removed four variants of the same lie-target scan (`getNextLieTargetPlayer`,
  `nextLieTarget`, `hasMoreLieTargets`, `isLiePhaseDone`). Leaving those is the exact
  trap that caused this: the next caller picks the wrong one.
- Replaced the `gameState['userAnswers']`/`['lies']`/`['votes']` private reach-arounds
  with public getters. That function bypassing the class is how CNG-024's missing target
  check hid in plain sight.
- `startTimer`/`stopTimer` kept unused **on purpose** — they're the mechanism for T3's
  remainder. Noted in ISSUES so nobody "cleans up" the thing the plan depends on.

**Deliberately NOT unified:** `endGame` sends players `c2` while `continueFromScores`
sends `h6`. Tidying that would make the CNG-001 regression test vacuous — it proves the
host is excluded from player-only broadcasts by checking they land on *different*
screens. Consistency isn't worth blinding the guard.

**Verified:** all 8 suites green, including a new **full-game end-to-end**
(`verify_fullgame.js`): host + 3 players, every player gets exactly one round, ballots
have 1 truth + 2 lies, reveal reaches everyone, final leaderboard 4000 each (2000 as
target + 2000 as voter). This is the T8 seed and should land in the repo next — it is
currently being thrown away every session.

**Next: T7 (server-side identity)** — the last structural root cause. Handlers still
trust the `name` in the payload.

---

## 2026-07-15 — T8: the verification scripts are now the test suite (CNG-021)

**Done, and it should have been done sooner.** The user pointed out the contradiction:
I'd called the full-game test the most valuable thing here and simultaneously left it in
a session-scoped scratch directory that gets discarded, then filed "move it" as a future
task. Calling something valuable and leaving it somewhere temporary is not a plan.

`npm test` now builds the server and runs six integration tests in `tests/`:

| test | guards |
|---|---|
| `host-exclusion` | CNG-001 |
| `question-stability` | CNG-006 |
| `reconnect` | CNG-005, -007, -024 |
| `timer` | CNG-003, -004, -014, -025 |
| `fullgame` | every transition, scoring, a whole game to the winner |
| `restart-survival` | CNG-002 — guards the hot-patch-a-live-game workflow |

Each test gets a freshly started server on a free port in its own temp directory, so
nothing leaks between tests or touches the real `games.json`. `tests/server.js` tracks
the node pid directly — the two false results this session both came from server
lifecycle mistakes (an orphan holding the port, `pkill -f` matching my own shell), so the
runner is built to make those impossible rather than trusting anyone to remember.

The scripts each had their own copy of client setup and an absolute path to
`socket.io-client`. Copying that duplication into the repo right after T6 would have been
a poor lesson to take from T6, so it's factored into `tests/helpers.js`.

**Confirmed non-vacuous, which matters more than the green.** Reverted the `except()` fix
→ `host-exclusion` goes red with `host saw [6,8]`. Removed the target check → `reconnect`
goes red with `target refresh -> c4Vote, wanted c2Waiting`. Both restored; 6/6 green. A
green suite nobody has watched fail is not evidence. That rule is now in the README.

**Next: T7 (server-side identity)** — the last structural root cause, and now the only
task left that a test suite would want to stand behind.

---

## 2026-07-15 — T7 revised: identity is claimed, not proved (CNG-012, -020, -026)

**The user rejected the token plan, and was right.** T7 was going to mint a per-player
secret required to reclaim a name. That is the only way to prove identity without
passwords, and it buys the proof by making a lost token equal a lost seat — a dead
battery, a cleared browser, or picking up the tablet instead of the phone would end your
game mid-round. Meanwhile impersonating someone needs devtools and hand-crafted socket
messages, from a friend sitting in the same room.

`todo.txt` had already settled this: *"Actually make it so that you replace that user so
that it is possible to get back into the game if you fall out."* Name-only reclaim is the
feature. My plan would have quietly reversed a decision the user had already made — the
kind of thing a security framing makes feel obligatory rather than optional.

CNG-008, CNG-009 and CNG-019 are now **Won't fix (accepted)**, with the reasoning written
into ISSUES so the next person to read "anyone can vote as anyone" doesn't reach for the
same fix. If the room ever isn't trusted, the answer is host-mediated approval of a
reclaim — a human who can see the room — not a secret the player can lose.

**What the security framing was hiding.** T7 bundled identity-proof together with three
plain correctness bugs, and they'd have ridden along on a decision that turned out to be
wrong. They have nothing to do with proving who anyone is, and are made *more* likely by
the multi-device support the decision protects:

- **CNG-026** (new) — the three post-submit confirmations used `socket.emit`, reaching
  only the socket that submitted, while every other player-bound send goes through
  `sendToUserSockets`. So a player's second tab kept showing a live ballot.
- **CNG-012** — `addLie`/`addVote` pushed unconditionally, so that second tab's vote
  counted as well as the first.
- **CNG-020** — re-rated Low → High. Filed as "a crafted client could cheat"; with
  CNG-026 an honest second tab reaches the same place.

Measured with all three reverted: `voters on the truth: [bob, bob, carol]`, leaderboard
`alice=3000 bob=2500 carol=1000` instead of `alice=2000`. One player, one extra tab.

**New test `multi-device` — and I nearly shipped it vacuous.** First version passed with
the bugs reverted: the double-vote branch was guarded by `if (liars.includes('alice'))`
and the first target is deterministically the first player, so alice was never a voter and
the branch never ran. Exactly the failure mode written into the README one commit earlier,
caught only because the rule says to watch it fail. It now pins the two-device player to a
voter and **asserts that premise**, so if targeting ever changes the test fails loudly
instead of quietly proving nothing.

A second flaw fell out of the same check: I was asserting the sibling-tab behaviour after
the *last* voter voted, when everyone correctly moves to the reveal — checking at the one
moment the thing is unobservable.

7/7 green. Nothing queued; the T3 remainder (server-owned countdown) is the only
substantial item left, and is robustness rather than correctness.

---

## 2026-07-15 — T3 remainder: the server owns the clock (CNG-027, CNG-022)

**Done.** `startPhaseTimer` starts the authoritative countdown inside the transition
helpers — one place each, which only T6 made possible. `GameState.startTimer`, written
long ago and never called, is finally in use and now captures the phase token at start,
firing only if that segment is still current. `resumeTimers()` restarts the clock for any
game restored mid-round, giving the round its **full** time back: the reason to restart is
to hot-patch code, and taking the players' thinking time as a side effect of a rebuild
would be its own bug.

Kept the host's `timerExpired` as a fallback rather than deleting it — if the server's
timer somehow never started, the host's browser is a second chance instead of the only
chance. Both routes call the same `handleTimerExpiry`, so they can't drift apart, which is
the whole lesson of CNG-023.

**The user assumed the full walkthrough test would guard this. It does not, and that was
worth checking rather than agreeing to.** `fullgame` submits every action promptly and
finishes in ~6 seconds against a 60-second clock, so **no timer has ever fired inside it**.
The `timer` test emits `timerExpired` by hand rather than waiting. So between them they
cover what a timer *triggers* and nothing about a timer *firing*.

Measured, not assumed: with the server clock reverted, **7 of 8 tests stayed green** —
including `fullgame` and `restart-survival`. Only the new `timer-fires` caught it, showing
the game frozen exactly where the host abandoned it (`alice:c2Waiting bob:c5Lie
carol:c5Lie`). A full walkthrough is not automatically a guard against everything it walks
past; it only tests what it waits for.

`timer-fires` covers the three things nothing else could: a round timing out with **no host
connected at all**, the round restarting on its own, and a restored game's clock actually
running after a restart. Round lengths are overridable via `CNG_ROUND_SECONDS` so it takes
seconds rather than a minute.

8/8 green. Nothing dead left in `GameState` or `socketHandlers`. Nothing queued.

---

## 2026-07-15 — CNG-028: an abandoned game keeps moving (also CNG-017)

**Fixing a claim I got wrong.** Last session I said CNG-027 meant "the game no longer
depends on the host's browser at all". It doesn't. It covers the three *timed* phases. The
reveal and points screens are untimed server-side, and the only things advancing them are
the auto-continue timers inside H3 and H5 — in the host's tab. Close it at the reveal and
the game stops forever. Measured before writing any fix: host closed, three players voted
to the reveal, all three sat on `h3Results` and stayed.

Wrote the test first, at the user's direction, and it caught two flaws before the code did:

1. Its first draft passed two assertions **vacuously** — "have they left the points screen"
   is trivially true when they never reached it. Rewrote to wait for states to *arrive*,
   never to be left behind.
2. The real failure then pinned cleanly: `stuck on alice:h3Results bob:h3Results
   carol:h3Results`.

Fix: `BACKSTOP_SECONDS` (240s) on entering `ShowingLieResults`/`ShowingPoints`, with
`handleTimerExpiry` cases that carry on without the host. `showPoints` extracted so the
host's Continue and the backstop share one path (CNG-023's lesson). `resumeTimers` covers
these phases too.

**240s, not 60, on purpose.** The host drives these screens; H3 paces its reveal at ~4s an
entry and then gives 60s to read. A 60s backstop would fire mid-reveal and cut the host
off. It is a backstop, not a competing clock — the same relationship `timerExpired` has to
the server's timer.

CNG-017 fixed alongside in both H3 and H5: fire once via a ref and stay at zero rather than
resetting to `null` and retriggering the arming branch. I'd filed it cosmetic because the
screen normally changes underneath it — which was only true *because* these timers were the
sole thing advancing two phases.

**The non-vacuity check is the headline.** With the backstop reverted, **8 of 9 pass** —
including `timer-fires`, the exact test I generalised from. It abandons the game during a
timed phase, which is the part that already worked. Only `unattended` catches the freeze.
Two sessions running, a green test has led me to a conclusion broader than it earned; that
warning is now in the README next to the "watch it fail first" rule.

9/9 green.

---

## 2026-07-15 — Remove killServer (CNG-015)

Removed. Any connected client could emit `killServer` and take the process down.

Worth recording *why* this didn't fall under the CNG-008 decision, since it looks like it
should: also devtools-only, also a friend in the room. The difference is that identity risk
was accepted because **fixing it cost something real** — reconnecting and switching
devices. `killServer` bought nothing: no screen emitted it, no code path used it, no test
touched it. With nothing on the other side of the scale there was no trade to make, and
"accept the risk" isn't a principle, it's the answer to a comparison.

It also looks obsolete rather than merely unused. `todo.txt` had two adjacent lines —
*"create a function that I can send to the server to kill it"* and *"Fix the control c
thing which is bypassing the state of the game being saved"*. The kill switch reads as a
workaround for Ctrl+C losing state, and SIGINT now saves properly (that's what
`restart-survival` exercises). Ctrl+C does the job it stood in for.

If a remote kill is ever wanted back for dev convenience, gate it behind an env var rather
than leaving it open to every client.

Backlog is now empty.

---

## 2026-07-15 — Join QR code (CNG-029), and where this thing actually runs

**Hosting, asked and answered:** nowhere. No Dockerfile, Procfile, CI, or cloud config; no
URL in the source but `localhost`; the only remote is the GitHub repo. It's built to be
self-hosted on a LAN — the server serves the client from its own origin, binds `*:3001`,
and the client resolves its server as whatever origin served the page. Verified in the
built bundle rather than from the source line: `const URL = void 0`, so Vite folds the
`NODE_ENV` check and `io(undefined)` connects back to the serving origin. `npm run build &&
npm start` on a laptop *is* the deployment. Pushed the session's 15 commits.

**CNG-029.** Looking for hosting turned up a live trap: the QR code — the join mechanism —
was built from the host browser's own URL, so opening the host page at `localhost:3001`
(the obvious thing on the server machine) produced a QR every phone would fail to scan.

**The user's spec was sharper than my instinct** and worth recording. I would have reached
for "ask the server where it lives". That's wrong: behind a reverse proxy the server's
address is internal and `window.location` is the *only* correct answer. So the rule is
narrow — trust the address bar always, except for a loopback hostname, where it cannot
possibly be right.

One refinement fell out of that reasoning: only the **hostname** is wrong on loopback.
Keeping the browser's port and path means a reverse proxy on the same box still works —
`localhost:8080` becomes `192.168.x.x:8080`, going *through* the proxy instead of around it
to the app's port.

Put `buildJoinUrl`/`isLoopbackHostname` in `IncludeStuff.ts` — shared, pure, testable —
rather than in the component where no test could reach them. Server-side, `getLanHost()`
prefers private ranges because a machine with Docker or a VPN up lists unreachable bridges
first. The host screen now shows the join URL under the QR and says so plainly when it's
still a dud.

Verified both directions, and the interesting one is that **making it always substitute
turns the reverse-proxy tests red** — the guard protects the user's actual requirement, not
just the bug I noticed.

**Also filed CNG-030** (not fixed): the server serves `confess_n_guess_client/dist`, which
is gitignored, while the server's own `dist/` is committed. A fresh clone plus `npm start`
serves nothing. Works here only because the build output has sat there since April. Needs a
decision — commit the client build for consistency, or make `npm start` depend on the build
— so it's left open rather than guessed at.

---

## 2026-07-16 — npm start self-heals a missing build (CNG-030)

**Done.** `prestart` hook (`scripts/ensure-build.js`) builds only what's missing: client
deps, client build, server build. Present means untouched — start stays instant, and it
deliberately does not try to answer "is the build stale?", because that's the developer's
call and the hot-patch loop (edit → build_server → restart) shouldn't be second-guessed by
a wrapper.

**Verified against a real `git clone`, and the clone taught two things.** First, it cloned
the *committed* state — without the fix — which handed me an honest pre-fix baseline: `npm
start` on a fresh clone serves Express's default 404 page. Second, that 404 page begins
with `<!DOCTYPE html>`, which sailed straight past my "did it serve HTML?" check. Assert on
content — `id="root"`, the asset path — never on "some HTML came back". With the fix copied
into the clone: deps installed themselves, the client built, GET / returned the actual app,
and a second start skipped everything.

---

## 2026-07-16 — Second full review sweep (CNG-031..041 filed, nothing fixed)

**At the user's direction: spot, don't fix.** The user swapped the session onto a
different model and asked for a fresh full review while it's available, with fixes left
for a later session. Eleven findings filed, T14–T21 queued. Line numbers pinned to
`1486efe`.

**Shape of the findings.** The first sweep (2026-07-15) found structural faults — wrong
authority, missing resync, discarded exclusions. Those are gone, and the second read
found none of that class. What's left is *seams*: places where two individually-correct
mechanisms meet badly. The two that matter most:

- **CNG-031** — name reclaim (the feature the identity decision protects) is
  case-sensitive while game codes aren't. "Bob" retyping "bob" on a new device forks a
  ghost player into a live game. This is the honest-player failure mode again, sitting
  directly on the supported reconnect path.
- **CNG-032/033 together** — question-pool exhaustion produces players who silently get
  nothing, then an empty round that restarts forever; and because the server's own
  transitions call `touch()`, that churning game counts as "active" and the idle sweep
  can never collect it. Two features (restart-on-empty, activity tracking) each fine
  alone, jointly an immortal zombie game.

Also worth flagging from the sweep: `selectBestAnswer` can silently discard a voting
round's scoring (CNG-034), the two resync functions still carry pre-T6 hand-rolled copies
of `buildResults` (CNG-035 — the exact shape that produced CNG-004/025), and the
save-on-shutdown guarantee only holds for SIGINT, not SIGTERM (CNG-036), so `kill`,
systemd, or docker stop lose every game.

**Note for the fixing session:** CNG-034 has a trap — `endGame` looks like the other two
orphans but is load-bearing for the host-exclusion test *and* for the documented
host/player screen-split guard. Delete the other two; guard that one. And T20 (mid-round
joiners) needs the user's answer before any code.

---

## 2026-07-16 — The review batch lands: CNG-031/032/033/034/037/039 fixed, red-first

**The user directed the order and the method:** test to prove each bug first, then fix,
then green-light the test. Every fix in this batch ran that way, and the red runs were
worth having — each one produced the filed symptom verbatim ("only [alice] got one; bob
emits:[]", "still saved with phase answeringQuestions; churn counted as activity",
"players: [<host>,Alice,Bob,Carol, ALICE ]").

**Decisions recorded:**
- **T20 ruled:** once a game starts, unmatched names watch, never join the board; matching
  is case-insensitive. Implemented as spectators — tracked per-socket, never in `users`,
  they follow reveals/points/winner and can play next game. This closed CNG-037 outright
  rather than needing a quorum patch.
- **CNG-036 remains the user's call** — recommendation delivered (SIGTERM handler, three
  lines), "may just leave it" is a legitimate outcome; record it either way.

**Fixes:** pool recycles instead of going silent (CNG-032); `touch()` moved to
human-driven handlers so abandoned churn can't keep a game alive (CNG-033, with a control
asserting live games still survive); `selectBestAnswer`/`nextRound` deleted after
verifying at three layers — source, served bundle, git history (which showed they *were*
once emitted: genuine legacy, not never-used); `endGame` kept for the host-exclusion test
but guarded; H4 removed; names match trimmed/case-folded with stored spelling preserved,
and the server now validates names at all (CNG-031, -039).

**One test-helper bug caught by its own red run:** the `connect()` helper never captured
`st.name`, so "client is told its canonical name" failed against a working server. The
helper was the bug. Worth remembering that a red assertion indicts the test as often as
the code.

**Suite: 13/13.** Two tests were updated to the new ruling (`reconnect`'s unknown-name
expectation changed from "pick a name" to "watches" — behavior change, not regression).

Remaining open: T18 (ballot order + resync dedup), T19/CNG-036 (user decision), the two
H1/merge nits in CNG-041, CNG-038 (runtime pruning).

---

## 2026-07-16 — CNG-036: SIGTERM saves (user approved the minimal version)

Three lines: SIGTERM now runs the same save-and-exit as SIGINT. The red check was nearly
free — `restart-survival` already proves a round survives a restart, so switching its
restart signal to SIGTERM *was* the test. Pre-fix it lost everything ("that game no longer
exists" for every player); green after. `idle-sweep` keeps restarting via SIGINT so both
signal paths stay covered.

The periodic save was recommended against and the user concurred by approving the minimal
version: it would only protect against power loss and hard crashes mid-party. Recorded in
ISSUES so it isn't re-proposed.

---

## 2026-07-16 — T18: one ballot order per round (CNG-035, CNG-040)

`beginVoting` shuffles once and stores the ballot on `GameState`; every send — transition
and resync alike — reuses it, and it's serialized (SAVE_VERSION → 3) so the order survives
a hot-patch restart mid-vote. Both `ShowingLieResults` resync branches now call
`buildResults`; the last pre-T6 hand-rolled copies (~60 lines) are gone.

Red-first with four players so a coincidental reshuffle match is 1/24 per check: pre-fix,
a refresh reordered `[alice,dana,carol,bob]` → `[dana,carol,alice,bob]` and the restart
reshuffled again. Green after, including order-across-restart. 14/14.

With this, every structural finding from both sweeps is closed. Remaining: two nits (T22)
and runtime pruning (T23), both Low.

---

## 2026-07-18 — T22: the lobby shows what the server says (CNG-041 closed)

H1 now renders `gameState.text`. The interesting half was the merge trap this walks into:
rendering a merged field means a mid-game message ("Now submitting lies for Bob!") could
leak into the lobby on a host resync. So the two lobby-bound emits — `newGame` and the
host-resync default — clear `text` explicitly. Verified end to end: a 1-player Start shows
"Need at least 2 players to start!" on the lobby, and a host resync to the lobby arrives
with the field cleared. 14/14. The user reserves the right to restyle it.

Register status: only T23 (runtime pruning, Low, recommended defer) remains open.

---

## 2026-07-18 — T23: runtime sweep with a 24-hour clean time (CNG-038). Register clean.

The user set the policy: 24 hours. One constant now governs the load, save and runtime
sweeps (previously 12h, save/load only); an hourly unref()'d interval prunes games no
human has touched, stopping their timers — which also finally kills the CNG-033 residue,
where an abandoned game churned in memory until the next Ctrl+C.

Red-first with a 2s window: pre-fix, the abandoned game's code still answered joins on the
live server; post-fix "Invalid game code", with a control proving recently-active games
survive. 15/15.

**With this, the register is clean: all 41 issues are Fixed or Won't-fix-by-recorded-
decision, every fix has a test that has been seen red, and the queue is empty.** From the
original report — "flaky connection issues where when someone refreshed their page people
would swap rolls" — to here: 5 root causes for the reported symptom, 36 more found by
sweeps and by tests, 15 integration tests, and a harness that carries the decisions.

---

## 2026-07-18 — The Cloudflare port begins (M0: preserve + plan)

The user approved moving to Cloudflare Workers + Durable Objects and set the method:
freeze the current state on a `socketio` branch, then tear up main, tracked through the
harness like a proper engineering project.

- Branch `socketio` pushed at `d483727` — the Node/socket.io version in the best shape of
  its life: register clean, 15/15 green. It is the reference implementation and escape
  hatch, not a maintenance target (no dual-target abstraction; decision recorded in
  PORT.md non-goals).
- `harness/PORT.md` written: goals, ten numbered decisions (D1–D10), eight milestones
  (M0–M7) each with an acceptance check, four recorded risks. The load-bearing ones: the
  wire protocol is frozen so the existing 15 tests are the port's correctness oracle
  (D1/M6), timers become deadlines + one DO alarm with three duties (D3/D4), and the
  client keeps its socket.io-shaped surface via a shim so the React screens don't change
  (D2).
- wrangler 4.112 installed; `wrangler dev` runs locally with no Cloudflare account, which
  is why deploy is a documented user step rather than part of the port.

Suite expectation during the port: red from M2 until M6, deliberately and visibly.

---

## 2026-07-18 — M1–M7: the port lands in a day

**M1** scaffolded and booted. **M2** made GameState platform-pure (deadline timers,
config injection, SAVE_VERSION 4) — and pulled the Node server's deletion forward from
M7, since it couldn't compile against the new timer API and every commit must typecheck.
**M3+M4** ported every handler and transition onto hibernation sockets and the
three-duty alarm; first smoke test passed end to end on raw WebSockets. **M5** rewrote
socket.js as a shim that keeps the socket.io surface so no screen changed. **M6**
re-pointed the test harness at `wrangler dev`.

**The suite earned its keep within minutes of running.** First full run: 8/14 green,
6 failing with what looked like three unrelated bugs — a first-reply race, lost
broadcasts, and restarts answering "Invalid game code". It was ONE bug (CNG-042): the
rehydrate guard read `data.code`, which `toJSON()` never writes. wrangler dev's
aggressive eviction meant any mid-test hibernation silently dropped the game, scattering
the symptoms. One-line fix; all six tests green simultaneously. The M3 smoke could never
have caught it — a warm process keeps the in-memory instance — which is exactly why D10
made the full suite the acceptance bar and R2 named "hibernation surprises" in advance.

**M7** teardown: express, socket.io, socket.io-client and 104 packages removed; only
comments mention socket.io now. Test count is 14, not 15: idle-sweep's subjects (save
files, shutdown signals) no longer exist as platform concepts; its live semantics moved
into runtime-prune, where the alarm IS the sweep.

Deploying is the user's step: `npx wrangler login`, then `npm run deploy`.

---

## 2026-07-18 — Deployed. It's live.

The user checked login (already authenticated, despite whoami showing read-only-looking
scopes — the display was misleading) and said deploy. `npm run deploy` shipped it:

    https://confess-n-guess.hootowl7777-cloud.workers.dev

Verified with a real round against production over TLS websockets, using the same test
helpers the suite uses: client served, game created, three players joined, questions
dealt, lies submitted, votes resolved to the reveal. The throwaway game will be
collected by its own 24-hour clean-time alarm — the sweep working as designed is also
the cleanup plan for the verification.

The QR code now just works: the hostname isn't loopback, so `window.location` is simply
correct — the outcome CNG-029's narrow design was waiting for.

From "flaky connection issues when someone refreshed" to a public URL on Cloudflare's
free tier: 42 issues, 14 integration tests that judged their own port, two platforms,
one harness.

---

## 2026-07-19 — The space-techno theme, verified by actually looking (CNG-043 found)

The user asked for a space-techno theme with vector art per page, mobile-first without
being stupid on desktop. Built as one system: "deep signal" — void-navy starfield (pure
CSS gradients + an inline-SVG star tile, zero requests), neon cyan/magenta/violet on
stroke-based line art, Orbitron/Exo 2 type, glow used sparingly. Twelve SVG pieces in
SpaceArt.tsx, one per screen role (ringed planet, orbital relay, radar timer ring, truth
scanner, constellation, crowned planet, helmet badge with the chosen emoji in the visor,
drifting astronaut, truth beacon, cloaked ship, signal picker). All eleven screens
re-skinned with logic untouched; player screens are a thumb column, host screens widen
at 760px.

**"Look at each page" was taken literally.** /usr/bin/google-chrome exists, so the pages
were screenshotted headlessly: wrangler dev with hour-long timers, seven games parked one
per phase, puppeteer-core driving real viewports (390x844 phone, 1280x800 TV), thirteen
screenshots read back as images. The looking earned its keep four times:

1. **CNG-043** — the shim/App identify deadlock. A refreshing player never resynced in
   the real browser; the entire suite stayed green because the test helper emits eagerly.
   Screens don't lie.
2. The helmet visor emoji was invisible (SVG root fill="none" inherited by <text>).
3. Desktop-centered tall screens clipped the lobby's Launch button below the fold —
   fixed by compressing host-screen headers at desktop after `safe center` measurably
   changed nothing (overflow means safe center == start).
4. The first camera was lying: --virtual-time-budget freezes real time so websockets
   never resync, and window-size clipping cropped layouts. Screenshot tooling has to be
   verified like any other test.

Also bitten a THIRD time by an orphaned server (workerd child survived killing its npx
parent) — the hand-rolled shot server skipped tests/server.js's process-group
discipline. The rule exists; use it.

Suite green after; deployed and production-screenshotted.

**Post-theme flake hunt.** Two suite runs after the theme flaked in a new way: cold DOs
under load answer slower than the tests' fixed sleeps, so assertions read null (or a
three-player game quietly ran with two — the flake showed as a MISSING Carol, which is
worse than an error because nothing failed loudly). Root cause was in the test harness,
not the game: `refresh`, `joinPlayers` and `newGameWithHost` now wait bounded for the
server's answer instead of trusting a stopwatch, and report ws errors when the wait
times out. 14/14 twice after, including once immediately post-deploy.

**One process slip owned:** the deploy was chained after `tail` with `&&`, so it shipped
before the suite result was read (13/14 at that moment). Harmless — the failing test was
the flake above and the deployed artifact was the visually-verified client on an
unchanged server — but gate on the judge, not on the pager.

---

## 2026-07-19 — lansfords.com/confessnguess redirect; custom domain declined by decision

Added a redirect at https://lansfords.com/confessnguess (the jedward7777.github.io
Jekyll repo, following its existing /mightymen pattern; query strings carry through so
shared ?code= links land in the join flow). Verified live.

**Decision, don't re-propose:** the Worker stays on workers.dev. A custom domain would
require moving lansfords.com's nameservers to Cloudflare wholesale — subdomain setup is
Enterprise-only (verified against the docs, not recalled) — and the user judges the
migration risk to their Zoho email not worth it. Correct trade; also costless: the
redirect uses location.replace, so the host lands on workers.dev and the QR encodes it
directly — no hop for scanning players. (An earlier claim here that scanners would
bounce through the redirect was wrong and is retracted.)

---

## 2026-07-19 — First real playtest: the family loved it. Three fixes from the couch.

The user played it with their family — the first real-world session, and the verdict was
"awesome". Three pieces of feedback, all fixed and verified:

1. **Reveal pacing tripled** (2s → 6s per stage, 12s per entry): the drumroll went by too
   fast to savor. Verified behaviorally — at 4.5s the screen still reads "1 of 3
   (answer)" where the old timing had already flipped the verdict. Timing budget checked:
   8 players ≈ 96s of reveal + 60s host auto-continue still fits inside the 240s backstop.
2. **Aliens decommissioned**: 👽 → 🦉 (an owl for the hootowl household), 👾 → 🌍.
3. **The radar sweep** — the user's diagnosis from the couch was exactly right: one end
   should pin at the center and the other should sweep the full circle. Root cause:
   `transform-box: fill-box` rotates an element around its OWN bounding box, so the
   needle orbited its own middle instead of the dial's. Changed sweep/orbit to
   `transform-box: view-box` (all art shares a 120² viewBox with the pivot at center).
   Verified with two screenshots 1.1s apart: needle anchored at center, different
   quadrants. The same bug had silently kept G1's moon from ever orbiting its planet —
   fixed by the same line, which says something about shared animation classes: one wrong
   assumption, every user of the class inherits it.

Playtest feedback beats any test in this file: it found the pacing (a taste issue no
assertion covers) and the radar (a visual-correctness issue the static screenshots
missed, because a broken rotation origin still looks plausible in a single frame — it
took a human watching it MOVE).

---

## 2026-07-19 — The mission announcer (TTS), built under a deploy embargo

New feature at the user's request, with an explicit constraint: **do not deploy until
they give leave** (they're family-testing the previous deploy). Committed and pushed;
embargo recorded at the top of TASKS.md so no session ships it by reflex.

Design settled by two questions (asked one at a time per the user's instruction): full
game-show announcer that reads every answer and verdict during the reveal — with variety
as an explicit requirement, "so it doesn't get under your skin" — and a playful-tease
personality: ribs players by name, never mean.

Build: `announcer.ts` holds ten banks of ~10 phrase templates each (joins, truth round,
lie round, voting, answer reading, truth/lie verdicts, the nobody-believed-the-truth
sting, points, winner). Picks shuffle through a whole bank before any repeat, and a
fresh shuffle never leads with the line that just played. Browser speechSynthesis (free,
local, host-only); a corner mute toggle doubles as the user gesture that unlocks audio
after a refresh. Wired into H1 (new joins only — a refresh doesn't replay the roster),
H2 (phase lines parsed from the host text, keyed on phaseToken), H3 (reads each card,
then the verdict; allDone re-renders are guarded against re-announcing), H5, H6 — all
gated on isHost, because H3/H5/H6 also render on player phones.

Verified without ears: stubbed speechSynthesis.speak in a headless host page and drove
a full game around it. The captured transcript hit every moment in order — joins, truth
round, lie round naming the target, voting, both reveal cards quoted verbatim, a lie
busted with its author, a truth confirmed, points, winner — with no consecutive repeats,
and a player page confirmed silent. 14/14 suite green.

---

## 2026-07-19 — Embargo lifted; two corrections ship with the announcer

The user said "commit and publish" with two corrections, which lifts the TTS embargo:

1. **The alien ship (🛸) decommissioned** from the picker — the earlier alien removal
   caught the faces but missed the vehicle. Replaced with a satellite 🛰️.
2. **No more dead end after game over.** A player refreshing post-game landed on a
   waiting screen reading "The game has ended!" with no way out. Rather than bolting an
   escape button onto a dead end, the GameOver resync now sends the winner screen (H6)
   with the standings — same as everyone present got — and H6's button reads "Back to
   Home" on player phones ("Start New Game" remains for the host). A permanent guard
   went into fullgame: a post-game refresh must land on h6 with the full leaderboard.

Deployed with the announcer aboard.

**Post-publish addendum:** the pre-publish suite read 13/14 and the commit+deploy chain
ran before the verdict was read — the SAME gate-on-the-pager mistake as two days ago,
now committed twice, so the rule is strengthened in README: read the verdict and act in
separate commands, never `tail && deploy`. The failure itself was the timer-fires test
racing its own server restart: a 3s round legitimately expires during a slower wrangler
startup, the restored alarm correctly restarts the round, and the test only accepted the
narrower outcome. Product behavior was correct (it's CNG-028's design working); the test
now accepts both legitimate post-restart states. Deployed code unaffected.
