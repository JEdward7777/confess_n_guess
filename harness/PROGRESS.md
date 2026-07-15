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
