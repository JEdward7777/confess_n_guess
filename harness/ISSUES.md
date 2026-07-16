# Issue register

Findings from the full code sweep on 2026-07-15. All line numbers are against commit
`98fd9a2`. Every issue below was confirmed by reading the code (and, where noted, by
checking library source or on-disk data) — none are speculative unless marked
`Unconfirmed`.

## Summary

| id | Sev | Status | Title |
|---|---|---|---|
| [CNG-001](#cng-001) | Critical | **Fixed** | `sendToPlayers` never excludes the host — host device gets player screens |
| [CNG-002](#cng-002) | Critical | **Fixed** | Saved games drop answers/lies/votes — every game resumes corrupt after a restart |
| [CNG-003](#cng-003) | Critical | **Fixed** | Duplicate `timerExpired` cascades through phases and wrecks the round |
| [CNG-004](#cng-004) | Critical | **Fixed** | Lie-round roles inverted in the skip path — target lies about themselves |
| [CNG-005](#cng-005) | Critical | **Fixed** | Reconnect never resyncs — refreshing leaves you on a stale screen |
| [CNG-006](#cng-006) | High | **Fixed** | Resync re-rolls the player's question; assignment never stored server-side |
| [CNG-007](#cng-007) | High | **Fixed** | Host refresh lands on the player name-entry screen |
| [CNG-008](#cng-008) | High | **Won't fix** | Duplicate name silently merges two devices into one player |
| [CNG-009](#cng-009) | High | **Won't fix** | Server trusts the client-supplied `name` on every event |
| [CNG-010](#cng-010) | High | **Fixed** | `startGame` doesn't clear answers or the question pool |
| [CNG-011](#cng-011) | High | **Fixed** | Blind `setTimeout` chain advances the game behind the host's back |
| [CNG-012](#cng-012) | High | **Fixed** | `addLie`/`addVote` don't dedupe — duplicate entries and double points |
| [CNG-013](#cng-013) | Medium | **Fixed** | `nextRound` broadcasts every question to every player |
| [CNG-014](#cng-014) | Medium | **Fixed** | Skip path omits `targetPlayer`, client submits against a stale target |
| [CNG-015](#cng-015) | Medium | **Fixed** | `killServer` is unauthenticated |
| [CNG-016](#cng-016) | Medium | **Fixed** | Games are never expired — 37 stale games on disk |
| [CNG-017](#cng-017) | Medium | **Fixed** | H5 auto-continue re-arms forever |
| [CNG-018](#cng-018) | Medium | **Fixed** | `identifyMe` can arrive before the client's listener is attached |
| [CNG-019](#cng-019) | Medium | **Won't fix** | Any client can claim to be the host of any game |
| [CNG-020](#cng-020) | **High** | **Fixed** | Self-vote only prevented client-side |
| [CNG-021](#cng-021) | High | **Fixed** | No automated test can reach any of this |
| [CNG-022](#cng-022) | Low | **Fixed** | Dead code: server-side timer, `sendToUserSockets` |
| [CNG-023](#cng-023) | **High** | **Fixed** | ~700 lines of duplicated phase-transition logic |
| [CNG-025](#cng-025) | High | **Fixed** | A restarted round isn't fresh — keeps the old target pointer, lies and votes |
| [CNG-026](#cng-026) | High | **Fixed** | Post-submit confirmations only reach the submitting socket, so sibling tabs stay live |
| [CNG-027](#cng-027) | High | **Fixed** | The only clock lived in the host's browser, so a host closing their tab froze the game |
| [CNG-028](#cng-028) | High | **Fixed** | The reveal and points screens have no server clock, so an absent host still freezes the game |
| [CNG-029](#cng-029) | High | **Fixed** | A host on localhost produces a QR code nobody can scan |
| [CNG-030](#cng-030) | Medium | **Fixed** | A fresh clone serves nothing — the client build is gitignored but the server serves it |
| [CNG-031](#cng-031) | High | Open | Name reclaim is case- and whitespace-sensitive — retyping "bob" for "Bob" forks a ghost player mid-game |
| [CNG-032](#cng-032) | High | Open | Question pool exhaustion: players silently get no question, and the empty round restarts forever |
| [CNG-033](#cng-033) | Medium | Open | Server-driven transitions count as "activity", so an abandoned churning game never idles out |
| [CNG-034](#cng-034) | Medium | Open | Three orphaned handlers still mutate live games: `selectBestAnswer`, `nextRound`, `endGame` |
| [CNG-035](#cng-035) | Medium | Open | The two resync functions still hand-roll results/ballots — pre-T6 duplication that will drift |
| [CNG-036](#cng-036) | Medium | Open | Non-SIGINT shutdown loses every game — SIGTERM has no handler and there is no periodic save |
| [CNG-037](#cng-037) | Low | Open | Mid-round joiners are added to the current round's quorum, stalling it until the timer |
| [CNG-038](#cng-038) | Low | Open | `socketStuff` and in-memory games are never pruned while the server runs |
| [CNG-039](#cng-039) | Low | Open | Server accepts any name: empty, `<host>`, unbounded length |
| [CNG-040](#cng-040) | Low | Open | Resync reshuffles the ballot, so a refreshing voter sees the options in a new order |
| [CNG-041](#cng-041) | Low | Open | Client nits: dead H4 screen, H1 never renders server text, stale-merge trap notes |
| [CNG-024](#cng-024) | High | **Fixed** | Lie target is handed a ballot for their own round on resync |

---

## Root cause

Most of the "flaky refresh" symptoms trace to one design decision rather than to
individual bugs: **identity and progression are asserted by the client, and the
server's copy of who-is-who lives only in memory.**

- Every event carries a `name` the server accepts without checking it against the
  socket it arrived on (CNG-009).
- `socketStuff` (the socket↔name map) is in-memory only, while `games` is persisted —
  so they disagree the moment the server restarts (CNG-002).
- The countdown that drives every phase transition runs in the *host's browser* and
  the server acts on whatever `timerExpired` it receives (CNG-003). `GameState` has a
  perfectly good server-side timer that is never called (CNG-022).
- Reconnection is handled by the client restoring `localStorage` rather than by the
  server telling the client where it should be (CNG-005).

The previous agent's work (commits `bac7c5b`, `017fde5`, `98fd9a2`) changed sockets
from single values to lists. That correctly stopped players from booting each other,
but it did not address any of the above — and it *enabled* CNG-003, because two live
host sockets now means two independent countdowns both firing `timerExpired`.

---

## Decision: identity is claimed, not proved (2026-07-15)

**CNG-008, CNG-009 and CNG-019 are accepted risks, not bugs to fix.** Decided by the
user; recorded here so it doesn't get re-litigated by the next person who reads
"anyone can vote as anyone" and reaches for a fix.

The original plan was a per-player token minted at first join and required to reclaim a
name. That is the only way to prove identity without passwords — and it buys the proof
by making a lost token equal a lost seat.

That is the wrong trade for this game:

- **The threat needs devtools.** No screen offers a way to submit as another player;
  you would have to craft socket messages by hand. The people who could are friends
  sitting in the same room, who could equally just look at your phone.
- **The lockout needs nothing.** A flat battery, a cleared browser, a private window, or
  simply picking up the tablet instead of the phone. Any of those would end your game,
  permanently, mid-round.
- **It was already decided.** `todo.txt`: *"Actually make it so that you replace that
  user so that it is possible to get back into the game if you fall out."* Name-only
  reclaim is the feature. A token would have quietly reversed it.

So: someone playing unfairly is a risk worth carrying; someone getting locked out is not.

**What this does not excuse.** The T7 task bundled identity-proof together with several
plain correctness bugs, and the security framing carried them along. Duplicate
submissions (CNG-012), self-votes (CNG-020) and stale sibling tabs (CNG-026) have nothing
to do with proving who anyone is — they are ways an *honest* player gets the wrong result,
and several are made **more** likely by the multi-device support this decision protects.
Those are fixed.

If the game is ever played somewhere the room isn't trusted, revisit this — but the fix
is then host-mediated approval of a reclaim (the host is a human who can see the room),
not a secret the player can lose.

---

## Details

### CNG-001
**`sendToPlayers` never excludes the host — host device gets player screens**
Critical · **Fixed 2026-07-15** · `src/socketHandlers.ts:89-102`

> Fixed by applying the exclusions in the same chain that emits:
> `this.io.in(gameCode).except(socketInfo.hostSocketIds).emit(...)` — `except`
> takes an array. Verified by driving a real host + 2 players through `endGame`:
> host now sees `[6]` (winner) where it previously saw `[6, 8]` — overwritten with
> the player waiting screen. Confirmed the check fails against the pre-fix build, so
> the verification is real and not vacuous.

```ts
const room = this.io.in(gameCode);
socketInfo.hostSocketIds.forEach(hostSocketId => {
    room.except(hostSocketId);   // <-- return value discarded
});
room.emit('gameState', data);
```

`BroadcastOperator.except()` does not mutate — it returns a *new* operator. Verified
in `node_modules/socket.io/dist/broadcast-operator.js:68-77`:

```js
except(room) {
    const exceptRooms = new Set(this.exceptRooms);
    ...
    return new BroadcastOperator(this.adapter, this.rooms, exceptRooms, this.flags);
}
```

So the `forEach` throws away every exclusion and `room.emit` goes to the whole room,
host included. Correct usage is `this.io.in(code).except(hostSocketIds).emit(...)` —
`except` accepts an array.

**This is a direct cause of the reported role-swapping.** In `endGame`
(`:1100-1110`) the host is sent `h6ShowTheWinner`, then `sendToPlayers` immediately
broadcasts `c2WaitingScreen` to everyone — so the host's TV lands on a *player*
waiting screen. Same in the `timerExpired` voting path (`:1595`): host gets
`h5ShowThePointsForTheRound`, then is overwritten with "Points have been awarded!"
on a player screen.

Repro: play to the end of a game, or let the voting timer expire. Watch the host.

---

### CNG-002
**Saved games drop answers/lies/votes — every game resumes corrupt after a restart**
Critical · **Fixed 2026-07-15** · `src/GameState.ts:434-451`

> Fixed: `toJSON` now serializes everything a round needs — `userAnswers`,
> `assignedQuestions`, `lies`, `votes`, `currentLieTargetPlayer`, `timerValue`,
> `lastActivity` — behind a `SAVE_VERSION`. `fromJSON` returns `null` for anything it
> can't faithfully restore and the caller drops it: a save we half-understand is worse
> than a lost one, because it yields a game that looks playable and isn't.
>
> The 37 legacy saves have no version and are dropped on load, which is correct —
> none were resumable.
>
> Verified against the real workflow: SIGINT the server mid-lie-round, restart,
> reconnect. Answers and lies survive, the player who'd already lied isn't asked
> again, the one who hadn't still is, the target still waits, and the round plays on
> into voting. `scratchpad/verify_cng002.js`.

`toJSON()` persists only `sharedState`, `usedQuestionIndexes`, `currentPhase`, and
`currentQuestionIndex`. It omits `userAnswers`, `lies`, `votes`, and
`currentLieTargetPlayer`. `fromJSON` therefore restores a game whose phase says the
round is underway but which has no content.

Confirmed against real data — `games.json` currently holds 37 games, the first of
which is:

```json
{ "sharedState": { "users": { "<host>":…, "p1":…, "p2":…, "p3":… }, "code": "8M5SK" },
  "usedQuestionIndexes": [9, 1, 24],
  "currentPhase": "submittingLies",
  "currentQuestionIndex": 0 }
```

Phase `submittingLies`, but no answers, no target player. On reload,
`getCurrentLieTargetPlayer()` returns `''`, so `sendPlayerToCorrectScreen`
(`:293-309`) sends every player to `c5SubmitLie` with a blank question and the
prompt "Write a fooling answer for this question about " — and their lies get filed
under the empty-string key.

Since the dev loop is restart-the-server, this fires constantly. It is very likely a
large share of the "flaky" behavior.

Fix: serialize the full state, and version the file so old entries are discarded
rather than loaded into a shape the code no longer expects.

---

### CNG-003
**Duplicate `timerExpired` cascades through phases and wrecks the round**
Critical · **Fixed 2026-07-15** · `src/socketHandlers.ts:1114-1131`

> Fixed with a phase token. `GameState` carries a counter bumped by anything that ends
> a timed segment (`setPhase`, `setTimerValue`, `setCurrentLieTargetPlayer`). Every
> host-bound state is stamped with it in `sendToHost`/`sendHostToCorrectScreen` — one
> place, not the ~15 emit sites, because missing one would silently disable the guard.
> The host's countdown echoes it back with `timerExpired`, so the second of two events
> is recognised as timing a segment that is already over, and dropped.
>
> A *missing* token is rejected too. Being lenient there would leave the guard
> bypassable by exactly the stale tab it exists to stop; since every host emit now
> carries one, absence means a stale bundle, and an event we can't place in time isn't
> one to act on. Recovery is a host refresh, which is cheap now CNG-005 is fixed.
>
> The client's countdown reset now keys off the token rather than `text`/`timerValue`
> changing — two consecutive segments can carry identical text and the same 60s, and
> the old countdown would silently carry on.
>
> Verified with two host tabs both firing: exactly one is applied, all players stay in
> one coherent state, and the game remains playable. Stale and untokened events are
> both rejected. `scratchpad/verify_cng003.js`, `verify_cng003b.js`.
>
> **Follow-up done 2026-07-15:** the countdown now runs on the server
> (`startPhaseTimer`), so the game no longer depends on the host's browser at all. The
> host's `timerExpired` remains as a token-guarded fallback. See CNG-027.

The guard admits three phases at once:

```ts
if (phase !== GamePhase.AnsweringQuestions &&
    phase !== GamePhase.SubmittingLies &&
    phase !== GamePhase.VotingOnLies) { return; }
```

Two `timerExpired` events arriving back-to-back are both processed. The first, in
`AnsweringQuestions`, transitions the game to `SubmittingLies`. The second now reads
`phase === SubmittingLies`, passes the guard, and falls into the lie-timeout branch
(`:1271`) — where no lies exist yet, so it either **restarts the whole round**
(`:1340-1373`) or **skips a player** (`:1376`). Instantly, with no one having typed
anything.

Two events is not hypothetical: the countdown lives in the host's browser
(`H2InformationScreenWithTimer.tsx:29-40`) and `hostSocketIds` is now a list, so a
host with the game open on two screens has two independent countdowns both emitting.

The event carries no indication of *which* timer expired. It needs a phase/round
token the server can check, or — better — the server should own the timer
(see CNG-022, the unused `GameState.startTimer`).

---

### CNG-004
**Lie-round roles inverted in the skip path — target lies about themselves**
Critical · **Fixed 2026-07-15** · `src/socketHandlers.ts:1382-1416`

> Fixed: everyone except the target now writes the lie; the target waits. Rewritten
> through `sendToUserSockets` (which was already written and unused) so it reads like
> the other transitions instead of being a fourth hand-rolled copy. The emit now
> carries `targetPlayer`, fixing CNG-014 on this path, and sets the timer so the host's
> countdown restarts rather than inheriting the expired one.
>
> Verified by driving the real path — complete round 1, let the lie timer expire with
> zero lies for a non-first target — and asserting the target waits, the other two get
> c5, the emit carries the new target, and the round completes into voting.
> `scratchpad/verify_cng004.js`.

When the lie timer expires with zero lies for a non-first target, the code advances
to the next target and then sends the screens out backwards:

```ts
// Send lie submission to next target
if (…playerSockets[nextTargetPlayer]) {
    → c5SubmitLie: `Write a LIE for this question about ${nextTargetPlayer}`
}
// Send waiting to others
userNames.forEach(username => {
    if (username !== nextTargetPlayer …)
        → c2Waiting: `${nextTargetPlayer} is writing a lie! Wait for your turn...`
});
```

The **target** is asked to write a lie about themselves, and **everyone else** is
told to wait. That is the exact inverse of the rule — everyone *except* the target
writes lies. Every other transition in the file gets this right; only this path is
flipped. Players here would quite literally have swapped roles.

---

### CNG-005
**Reconnect never resyncs — refreshing leaves you on a stale screen**
Critical · **Fixed 2026-07-15** · `src/socketHandlers.ts:499-522`, `confess_n_guess_client/src/App.tsx:85-100`

> Fixed: `identify` now ends by calling `sendPlayerToCorrectScreen` /
> `sendHostToCorrectScreen`, and rejoins the socket to the room (a socket after a
> refresh isn't in it). Unknown game -> back to g1 with an error; a name the game has
> never heard of -> c1 to pick a name, rather than resyncing a ghost. Client-side,
> `localStorage` is now only a placeholder for the moment before the server answers
> and can never overwrite server state (`hasServerState` ref).
>
> Verified across 13 scenarios covering every phase — see `scratchpad/verify_cng005.js`.
> Exposed CNG-024 in the process.

The `identify` handler registers the socket id and returns. It never sends game
state. So the whole of reconnection rests on the client restoring `localStorage`:

```ts
const savedStateString = localStorage.getItem(`gameState-${code}-${name}`);
if (savedStateString) setGameState(JSON.parse(savedStateString));
```

A refreshing player is restored to whatever screen they were on *when they left*. If
the game advanced in the meantime they sit on a dead screen — and nothing corrects
them, because the server only resyncs in response to a submission arriving at the
wrong phase (`:664`, `:754`, `:852`). The game self-heals only if the stranded player
happens to submit something.

`identify` should end by calling `sendPlayerToCorrectScreen` / `sendHostToCorrectScreen`.
The server already has that function and calls it "the single source of truth for
where a player should be" (`:241-249`) — the reconnect path just doesn't use it.

This is the issue the user described: refresh, and you're somewhere wrong.

---

### CNG-006
**Resync re-rolls the player's question; assignment never stored server-side**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts:285`, `src/GameState.ts:162-179`

> Fixed by giving `GameState` an `assignedQuestions` map. `assignQuestion()` draws and
> records; `getOrAssignQuestion()` returns the existing one and only draws if there
> isn't one, and is what resync calls. `sendQuestionAnswer` now records the question
> the *server* handed out rather than the one the client echoes back. `clearAnswers()`
> clears assignments too, since every caller restarts the round and reassigns.
>
> Verified: alice refreshes 3x mid-round. Pre-fix she got a different question every
> time (3 more burned from a 30-question pool); post-fix the same question all 3
> times. Had to land this before T2 — wiring resync into reconnect without it would
> have made every refresh re-roll.

In the `AnsweringQuestions` branch of `sendPlayerToCorrectScreen`:

```ts
const questionObj = gameState.getNextQuestion();
```

`getNextQuestion()` is not a read — it mutates `usedQuestionIndexes` and returns a
*new random* question. So every resync hands the player a different question from the
one they were originally given, and burns another entry from a 30-question pool. Once
drained it returns `null` and the player gets "No question available".

The root problem: the server assigns a question at `startGame` (`:632`) and never
records who got what. The only record is the `question` string the *client* echoes
back in `sendQuestionAnswer` (`C3SubmitTruth.tsx:38-43`), which the server stores
verbatim (`GameState.addAnswer`). Store the assignment per player at assignment time
and have resync read it.

---

### CNG-007
**Host refresh lands on the player name-entry screen**
High · **Fixed 2026-07-15** · `confess_n_guess_client/src/App.tsx:23-38`

> Fixed: initial screen now routes `name === '<host>'` to `h1CollectingUsers`. With
> CNG-005 the server corrects it a moment later anyway, but the host must not sit on
> a name-entry screen even briefly — typing a name there turned the host into a
> player.

```ts
const joinCode = urlParams.get('code');
screen: showNewGame ? Screens.g1NewGame
      : (joinCode ? Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture
                  : Screens.g1NewGame)
```

The host's URL *is* rewritten to include the code (`:147-153`, which sets
`?code=XXXXX&name=%3Chost%3E`), so on refresh `joinCode` is set and the host renders
`c1TypeInYourNameAndPickAnEmoji` — the player join screen. It's usually papered over
a moment later by the `localStorage` restore, but if storage is empty or cleared
(different browser, private window, someone opened the host URL fresh) the host is
stranded on the name screen. Type a name and the host device becomes a *player*
(CNG-008 then merges it onto whoever owns that name).

The check ignores `joinName === '<host>'`, which is right there in the next line.

---

### CNG-008
**Duplicate name silently merges two devices into one player**
High · **Won't fix (accepted) 2026-07-15** · `src/socketHandlers.ts:524-556`

> **This is the intended behaviour, not a bug.** See the decision note below.

```ts
if (gameState.userExists(name)) {
    // User already exists - preserve their state, just add new socket connection
} else {
    gameState.addUser(name, emoji);
}
…
this.socketStuff[code].playerSockets[name].push(socket.id);
```

There is no check that the person claiming the name is the person who had it. Anyone
typing an existing name is appended to that name's socket list and from then on
receives that player's screens, sees their question, and can submit as them. Two
humans, one identity — a literal role swap.

This is deliberate: `todo.txt` says *"Actually make it so that you replace that user
so that it is possible to get back into the game if you fall out."* The intent is
right (reconnection must work) but name-only is too weak a key. Needs a per-player
secret issued on first join and presented on reclaim — see TASKS.md.

---

### CNG-009
**Server trusts the client-supplied `name` on every event**
High · **Won't fix (accepted) 2026-07-15** · `src/socketHandlers.ts:653, 742, 841`

> Accepted risk. See the decision note below.

`sendQuestionAnswer`, `submitLie`, and `voteOnLie` all take `name` from the payload
and act on it without checking it against the socket. Any client can submit an
answer, a lie, or a vote as any other player.

The server *has* the data to prevent this — `socketStuff[code].playerSockets` maps
name → socket ids — it just never looks the other way. A `socketId → {code, name}`
map maintained at identify/join time, with handlers reading the name from there
instead of from the payload, removes this whole class of bug and is the structural
fix for the identity drift behind CNG-005/007/008.

---

### CNG-010
**`startGame` doesn't clear answers or the question pool**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts:614-617`, `src/GameState.ts:427-431`

> Fixed: `startGame` calls a new `GameState.resetForNewGame()` (answers, question
> assignments, lies, votes, target, used-question pool). Points and users are left alone
> deliberately — `startGame` only runs from `CollectingUsers`, which is only reachable on
> a fresh game, so resetting them would be dead code pretending to be a safeguard.

`startGame` calls `resetLieData()`, which clears `lies`, `votes`, and
`currentLieTargetPlayer` — but not `userAnswers`, and not `usedQuestionIndexes`.
Starting a second game in the same room therefore begins with every previous answer
still present, so `allUsersHaveAnswered()` (`GameState.ts:235`) can be true before
anyone types, immediately shoving the game into the lie phase with last game's
answers. And the question pool keeps shrinking across games until it's empty.

---

### CNG-011
**Blind `setTimeout` chain advances the game behind the host's back**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts:1588-1653`

> Fixed by deleting the chain. The voting-timeout path now stops at
> `ShowingLieResults` and waits for the host, exactly like the all-voted path in
> `voteOnLie` ("DO NOT auto-continue - wait for host to click Continue"). That
> inconsistency *was* the bug: one path waited, the other raced ahead after 10s. The
> host's H3 screen already auto-continues after the reveal, so nothing stalls.
>
> Also removes a latent crash: the deleted code read `winner.name` off an empty
> leaderboard.

The voting-timeout path schedules a 5s timeout, and a further 5s timeout inside it,
which show points and then advance to the next lie target. Neither re-checks the
phase before acting. During those 10 seconds the host can click Continue
(`continueFromScores`, `:1031`) and advance the game legitimately — then the timeout
fires and advances it *again*, skipping a player's entire round.

The timeouts are also never cleared, so they survive the game ending.

Any deferred transition needs to capture the phase/round it was scheduled for and
no-op if the game has moved on.

---

### CNG-012
**`addLie`/`addVote` don't dedupe — duplicate entries and double points**
High · **Fixed 2026-07-15** · `src/GameState.ts:264-269, 286-291`

> Fixed: both upsert by username. A resubmission replaces the previous entry rather than
> adding a second. Nothing to do with identity — this is how an *honest* player with two
> tabs gets double points, and it's made more likely by the multi-device support the
> CNG-008 decision protects.

Both push unconditionally. A player who submits twice (two tabs — now supported —
or a resend after a resync) appears twice in the answer list, and in the case of
votes has both counted by `calculateLiePoints` (`:308-350`), paying out 500/1000 per
duplicate. Should be upsert-by-username.

---

### CNG-013
**`nextRound` broadcasts every question to every player**
Medium · **Fixed 2026-07-15** · `src/socketHandlers.ts:993-1004`

> Fixed: `nextRound` now delegates to `restartRound` → `beginAnsweringRound`, which
> targets each player's own sockets. The old loop called `sendToPlayers` — a room
> broadcast that ignores the username entirely — so every player's question went to
> everyone and they all ended up on whichever was drawn last.

```ts
userNames.forEach(username => {
    const questionObj = gameState.getNextQuestion();
    if (questionObj) {
        this.sendToPlayers(code, { screen: c3SubmitTruth, question: questionObj.question, … });
    }
});
```

`sendToPlayers` is a room broadcast — it ignores `username` entirely. So each
iteration blasts that player's question to *everyone*, and all players end up looking
at whichever question was drawn last. (Every other assignment site correctly targets
`playerSockets[username]`.) Compounded by CNG-001, the host gets them too.

---

### CNG-014
**Skip path omits `targetPlayer`, client submits against a stale target**
Medium · **Partly fixed 2026-07-15** · `src/socketHandlers.ts:1396-1402`

> **Fully fixed with T6.** Every transition now emits through one method, and both
> `beginLieRound` and `beginVoting` carry `targetPlayer` explicitly. Nothing relies on
> the client's merge leaving the right value behind any more.

That `c5SubmitLie` emit sends `screen`, `text`, `question`, `instructionText` — but
no `targetPlayer`. Because `App.setGameState` merges (`{...prev, ...next}`,
`App.tsx:66`), the client keeps the *previous* target, and `C5SubmitLie` submits
against it (`C5SubmitLie.tsx:47`). The server rejects it as the wrong target
(`:762`) and resyncs. The voting emits at `:809` and `:1302` have the same omission
and only work by accident, because the earlier `c5SubmitLie` emit happened to leave
the right value merged in.

The merge-on-every-update in `setGameState` is the underlying hazard here: no emit
can ever clear a field, so stale values leak across screens. Worth considering
whether `gameState` payloads should be authoritative-complete.

---

### CNG-015
**`killServer` is unauthenticated**
Medium · **Fixed 2026-07-15** · `src/socketHandlers.ts:1659-1664`

> Removed.
>
> At first glance this falls under the CNG-008 decision: reachable only via devtools, by a
> friend in the room. But that reasoning doesn't transfer, and the reason is the useful
> part. Identity risk was accepted because *fixing it cost something real* — reconnecting
> and switching devices. `killServer` bought nothing: no screen emitted it, no code path
> used it. Nothing sat on the other side of the scale, so there was no trade to make.
>
> It was almost certainly already obsolete. `todo.txt` had two adjacent lines — *"create a
> function that I can send to the server to kill it"* and *"Fix the control c thing which
> is bypassing the state of the game being saved"*. The kill switch reads as a workaround
> for Ctrl+C losing state, and the SIGINT handler (`index.ts:32`) now saves properly —
> that's what `restart-survival` exercises. Ctrl+C does the job it was standing in for.
>
> If a remote kill is ever wanted back for dev convenience, gate it behind an env var
> rather than leaving it open to every connected client.

Any connected client can emit `killServer` and take the process down for everyone.
It came from a `todo.txt` line ("create a function that I can send to the server to
kill it") and no client emits it. Delete it, or gate it behind a dev-only env var.

---

### CNG-016
**Games are never expired — 37 stale games on disk**
Medium · **Fixed 2026-07-15** · `src/index.ts:20-48`

> Fixed: `GameState` tracks `lastActivity` (touched on every mutation) and games idle
> more than 12h are dropped on both load and save. 12h is long enough to survive a
> restart mid-game — the whole point of saving — and short enough that the store
> doesn't grow without bound. `games.json` is now gitignored; it still saves, it just
> doesn't churn commits.

Nothing ever deletes a game. `games.json` has accumulated 37, all reloaded into
memory at boot, all in whatever broken state CNG-002 left them. `todo.txt` already
notes this: *"Make it so that if a gave has no activity for enough time that it gets
deleted."* Needs a `lastActivity` timestamp and a sweep. Also note `games.json` is
written to the process CWD and is currently tracked in git — it probably belongs in
`.gitignore`.

---

### CNG-017
**H5 auto-continue re-arms forever**
Medium · **Fixed 2026-07-15** · `confess_n_guess_client/src/H5ShowPoints.tsx:21-36`

> Fixed in both H5 and H3 (same bug, both copies): fire once via a `hasContinued` ref and
> stay at zero, instead of resetting `countdown` to `null` and retriggering the arming
> branch. Mirrors what `H2InformationScreenWithTimer` already did.
>
> Filed as cosmetic because the screen normally changes underneath it. That was only true
> *because* these timers are load-bearing — they were the sole thing advancing two phases
> (CNG-028). Fixed alongside it.

```ts
if (isHost && countdown === null) setCountdown(60);
…
} else if (countdown === 0) {
    socket.emit('continueFromScores', { code });
    setCountdown(null);   // ← effect re-runs, sees null, re-arms at 60
}
```

Setting `countdown` back to `null` retriggers the arming branch. Normally harmless
because the screen changes, but if `continueFromScores` no-ops (its phase guard
fails, `:1035`) the host silently re-emits every 60 seconds forever.

---

### CNG-018
**`identifyMe` can arrive before the client's listener is attached**
Medium · **Fixed 2026-07-15** · `confess_n_guess_client/src/socket.js:6`, `App.tsx:42-62`

> Fixed: the client now identifies on `connect` (and if already connected at mount)
> rather than only when asked. The server's `identifyMe` is still honoured, so the
> two are belt and braces. Also covers reconnects, since socket.io re-fires
> `connect`.

`socket.js` opens the connection at module-evaluation time; the `identifyMe` listener
is attached in a `useEffect`, which runs after mount. Socket.IO does not buffer
inbound events for listeners registered later, so a connection that completes before
React commits drops the event and that client is never registered in `socketStuff` —
invisible to every targeted send until it next submits something.

The handshake is a network round trip so React normally wins, which is exactly what
makes this the kind of bug that shows up as "flaky" once and never reproduces. Making
the client identify on `connect` (and on every reconnect) rather than waiting to be
asked removes the race entirely.

---

### CNG-019
**Any client can claim to be the host of any game**
Medium · **Won't fix (accepted) 2026-07-15** · `src/socketHandlers.ts:499-522`

> Accepted risk. A host token would lock out a host whose tab died — the worst possible
> role to lock out, since the countdown lives in their browser. See the decision note.

`identify` accepts `role: 'host'` for any code, from anyone, and pushes the socket
into `hostSocketIds`. That socket then receives host screens (seeing every answer
before the reveal) and can drive `startGame`, `continueFromScores`, `endGame`,
`timerExpired`. The handler also doesn't check that the game exists, so it will
happily create tracking for a nonexistent code. Needs a host token minted at
`newGame`.

---

### CNG-020
**Self-vote only prevented client-side**
High · **Fixed 2026-07-15** · `confess_n_guess_client/src/C4PickBestAnswer.tsx:31`

> Re-rated Low → High: filed as "a crafted client could cheat", but with CNG-026 a
> perfectly honest second tab reaches the same place. Fixed server-side in `voteOnLie` —
> a vote for your own answer is rejected and the player resynced.

The voting list filters out the player's own lie in the browser. The server accepts
any `selectedUsername`, and `calculateLiePoints` pays out for it. A stale or crafted
client can vote for its own lie for 500 a head. Enforce in `addVote`.

---

### CNG-021
**No automated test can reach any of this**
High · **Fixed 2026-07-15** · `package.json:12`

> Fixed: `npm test` runs six integration tests that drive real socket.io clients against
> a real server — `tests/`. Each gets a freshly started server on a free port in its own
> scratch directory, so tests can't leak state into each other or touch the real
> `games.json`.
>
> | test | guards |
> |---|---|
> | `host-exclusion` | CNG-001 |
> | `question-stability` | CNG-006 |
> | `reconnect` | CNG-005, -007, -024 |
> | `timer` | CNG-003, -004, -014, -025 |
> | `fullgame` | every transition, scoring, a whole game to the winner |
> | `restart-survival` | CNG-002 — guards the hot-patch-a-live-game workflow |
>
> **Confirmed non-vacuous**: reverting the `except()` fix turns `host-exclusion` red
> (`host saw [6,8]`), and removing the target check turns `reconnect` red
> (`target refresh -> c4Vote, wanted c2Waiting`). A green suite you have never seen fail
> is not evidence of anything.

`"test": "echo \"Error: no test specified\" && exit 1"`. Every issue in this register
was found by reading, and can only be verified by hand-driving four browser tabs.
That's why regressions keep landing. A socket.io-client harness that drives a host
plus three players through a full round — including a mid-round refresh — would have
caught CNG-001, -003, -004, -005 and -013 outright. This is the highest-leverage item
here after the criticals.

---

### CNG-022
**Dead code: server-side timer, `sendToUserSockets`**
Low · **Partly fixed 2026-07-15** · `src/GameState.ts:211-232`, `src/socketHandlers.ts:59-74`

> `sendToUserSockets` is now the single way player-bound state is sent; the ~12
> hand-inlined copies of its loop are gone (T6). Also removed `sendToRoom`,
> `sendToSocket`, `getClientState`, `getAllAnswers`, `getAllAnswersWithUsernames`.
>
> `startTimer`/`stopTimer` are now in use: the server owns the countdown (T3 remainder,
> 2026-07-15). `startTimer` captures the phase token when it starts and only fires
> `onComplete` if that segment is still current, so a timer can never be applied to a
> phase it wasn't timing.
>
> Nothing dead is left in either file.

`GameState.startTimer`/`stopTimer`/`timerInterval` are fully implemented and never
called from anywhere — the authoritative countdown lives in the host's browser
instead (which is what makes CNG-003 possible). `sendToUserSockets` is likewise never
called, while the exact loop it encapsulates is hand-inlined ~12 times.

These two are worth keeping in mind together: adopting `startTimer` fixes a Critical,
and adopting `sendToUserSockets` removes most of CNG-023's bulk.

---

### CNG-023
**~700 lines of duplicated phase-transition logic**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts:653-1657`

> Re-rated Low → High before fixing. It was filed as hygiene, but by the end of the day
> it had been the direct cause of CNG-004 (one copy inverted), CNG-025 (one copy didn't
> reset), CNG-014 (copies omitting `targetPlayer`) and the shuffle drift. It wasn't
> untidiness, it was a bug generator.
>
> Fixed: one method per transition — `beginAnsweringRound`, `restartRound`,
> `beginLieRound`, `beginVoting`, `showLieResults`, `advanceToNextLieRoundOrEnd`,
> `endGameShowingWinner`, `buildResults`. Every call site now delegates. `timerExpired`
> went from 514 lines to ~70 and reads as three cases. `socketHandlers.ts` 1696 → 1174
> lines, `GameState.ts` lost four different variants of the same lie-target scan
> (`getNextLieTargetPlayer`, `nextLieTarget`, `hasMoreLieTargets`, `isLiePhaseDone`) —
> leaving those is the trap that started all this, since the next caller picks the wrong
> one.
>
> Also removed the `gameState['userAnswers']` / `['lies']` / `['votes']` private
> reach-arounds in `sendPlayerToCorrectScreen` in favour of the public getters. That
> function bypassing the class is how CNG-024's missing target check hid in plain sight.
>
> Verified: all 8 suites green, including a new full-game end-to-end
> (`verify_fullgame.js`) that plays host + 3 players through every round to the winner.

The truths→lies transition is written out three times (`:683-730`, `:1138-1180`,
`:1226-1268`), lies→voting twice (`:774-829`, `:1274-1321`), voting→results twice
(`:872-925`, `:1480-1529`). They have already drifted: the copy at `:1503` shuffles
the results, the copy at `:897` doesn't, so whether the reveal order is randomized
depends on whether the timer expired. CNG-004's inversion is the same disease.

Each transition should exist once, as a method. This is why fixes here keep missing
a path.

---

### CNG-024
**Lie target is handed a ballot for their own round on resync**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts:310-326`

`sendPlayerToCorrectScreen`'s `VotingOnLies` branch checked whether the player had
already voted, but never whether they are the *target* of the round:

```ts
case GamePhase.VotingOnLies:
    if (userVotes && userVotes[targetPlayer]?.some(v => v.voter === playerName)) {
        → c2 waiting
    } else {
        → c4 vote        // ← the target lands here too
    }
```

The target knows their own truth, so they must never vote — every other path
correctly excludes them (`submitLie` at `:803`, and the `SubmittingLies` branch
directly above this one checks `targetPlayer === playerName`). Only this branch was
missed. The target could vote for their own answer and collect 1000 points; nothing
server-side stops it (see CNG-020).

Latent before CNG-005 was fixed, because resync only ran when a submission arrived at
the wrong phase. Wiring resync into reconnect made it reachable by simply refreshing
during a vote — which is exactly the reported "refresh and things go weird". Found by
the CNG-005 verification, not by reading.

---

### CNG-025
**A restarted round isn't fresh — keeps the old target pointer, lies and votes**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts:1262-1265, 1418-1421`

Both round-restart paths in `timerExpired` ("No answers submitted - restarting round"
and "No lies submitted for first player - restarting round") called `clearAnswers()`
but never `resetLieData()`:

```ts
gameState.setPhase(GamePhase.AnsweringQuestions);
gameState.clearAnswers();
gameState.setTimerValue(30);
```

`clearAnswers()` drops answers and question assignments. It does not touch
`currentLieTargetPlayer`, `lies` or `votes` — that's `resetLieData()`, which only
`startGame` calls. So after a restart:

- `currentLieTargetPlayer` still points mid-list. `getNextLieTargetPlayerSkippingMissing()`
  scans *after* the current target and deliberately doesn't wrap (see CNG "Don't wrap
  around when skipping players without truths", commit `553d19d`), so the fresh round
  resumes at the player after the old target and **everyone before them never gets a
  round at all**.
- The abandoned round's lies and votes survive into the new one.

Found by the CNG-003 verification: after a restart the round targeted `bob` instead of
starting over at `alice`. Fixed by calling `resetLieData()` in both paths.

---

### CNG-026
**Post-submit confirmations only reach the submitting socket, so sibling tabs stay live**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts:879, 925, 970`

> Fixed: all three confirmations now go through `sendToUserSockets`, reaching every one of
> that player's devices like every other player-bound send already did.
>
> Measured with CNG-012/-020/-026 all reverted: the reveal listed
> `voters on the truth: [bob, bob, carol]` and the leaderboard read
> `alice=3000 bob=2500 carol=1000` instead of `alice=2000` — bob counted twice, plus 500
> from his own self-vote. One player, one extra tab.

The three "thanks, now wait" confirmations are sent with `socket.emit`, which reaches
only the socket that submitted:

```ts
} else {
    socket.emit('gameState', {
        screen: Screens.c2WaitingScreenJustWhateverText,
        text: 'Vote submitted! Waiting for others to vote...'
    });
}
```

Every other player-bound send goes through `sendToUserSockets` and reaches all of a
player's devices. These three don't. So a player with two tabs (explicitly supported
since commit `bac7c5b`) votes in one, and **the other tab still shows a live ballot**.
Voting again pushes a second vote, which `calculateLiePoints` counts — 1000 or 500 points
for one opinion, plus their name appearing twice in the reveal.

Directly caused by the multi-device support that the CNG-008 decision above exists to
protect: the more devices a player is allowed, the more likely this is. Nothing to do
with identity — an honest player gets the wrong result. Pairs with CNG-012, which is what
makes the second submission count rather than being ignored.

---

### CNG-027
**The only clock lived in the host's browser, so a host closing their tab froze the game**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts`, `src/GameState.ts:211-232`

The phase token (CNG-003) stopped duplicate and stale countdowns from corrupting a round,
but the countdown itself still ran in `H2InformationScreenWithTimer` and the server only
ever reacted to `timerExpired`. So the game's only clock was in one player's browser: close
that tab, and every subsequent round would wait forever.

Fixed: `startPhaseTimer` starts the authoritative countdown inside the transition helpers
(`beginAnsweringRound`, `beginLieRound`, `beginVoting`) — possible in one place each only
because T6 collapsed them first. `GameState.startTimer`, written long ago and never called
(CNG-022), now captures the phase token at start and fires only if that segment is still
current. `stopTimer()` on entering an untimed phase.

The host's `timerExpired` is kept as a fallback rather than deleted: if the server's timer
somehow never started, the host's browser is a second chance instead of the only chance.
Both routes call the same `handleTimerExpiry`, so they cannot drift (CNG-023's lesson).

`resumeTimers()` restarts the clock for any game restored mid-round — timers can't be
serialised, so without it CNG-002's restart-survival would resume a game that then never
advanced. The round gets its **full** time back rather than the remainder: the reason to
restart mid-game is to hot-patch code, and taking the players' thinking time as a side
effect of the developer's rebuild would be its own bug.

**Why this needed a new test.** `ROUND_SECONDS` is now overridable via `CNG_ROUND_SECONDS`
so a test can watch a real timer fire in seconds. That mattered: with the server clock
reverted, `fullgame` and all six other tests stayed **green** — fullgame submits everything
promptly and finishes in ~6s against a 60s clock, so no timer ever fires in it, and the
`timer` test emits `timerExpired` by hand rather than waiting. Only `timer-fires` caught it.
A full walkthrough is not automatically a guard against everything it walks past.

---

### CNG-028
**The reveal and points screens have no server clock, so an absent host still freezes the game**
High · **Fixed 2026-07-15** · `src/socketHandlers.ts`, `H3ShowLiesAndTruths.tsx:99-111`, `H5ShowPoints.tsx:21-36`

> Fixed: `BACKSTOP_SECONDS` (240s, `CNG_BACKSTOP_SECONDS`) started on entering
> `ShowingLieResults` and `ShowingPoints`, with `handleTimerExpiry` cases that carry on
> without the host. `showPoints` extracted so the host's Continue and the backstop share
> one path. `resumeTimers` covers these phases too, or a game restored at the reveal with
> no host would hang exactly as described.
>
> Deliberately 240s, not 60: the host drives these screens and H3 paces a reveal at ~4s an
> entry then gives 60s to read — a 60s backstop would fire mid-reveal and cut the host off.
> It answers "nobody is driving", nothing more.
>
> **Confirmed non-vacuous, and the result is the point**: with the backstop reverted, 8 of
> 9 tests pass — including `timer-fires`, the test I generalised from when I claimed the
> game no longer depended on the host at all. Only `unattended` catches it.

CNG-027 moved the countdown onto the server for the three *timed* phases, and the
`timer-fires` test proves a round times out with no host connected. **That result does not
generalise, and I claimed it did.**

`ShowingLieResults` and `ShowingPoints` are untimed server-side. The only things that
advance them are `continueFromResults` and `continueFromScores`, and the only things that
emit those are the auto-continue timers inside `H3ShowLiesAndTruths` and `H5ShowPoints` —
i.e. the host's browser. Close that tab at the reveal and the game stops forever.

Measured: host closed, three players voted through to the reveal, waited 6s on a 2s round
clock. All three sat on `h3Results` and stayed there.

The fix is the same shape as CNG-027, with one difference that matters: the server's timer
here must be a **long backstop, not a competing clock**. H3 paces a two-stage reveal at
~4s per entry and then gives the host 60s to read it, so a 60s server timer would fire
mid-reveal and cut the host off. The backstop exists only to say "nobody is driving, move
on"; the host's auto-continue stays primary because it's paced to the animation. Same
relationship `timerExpired` now has to `startPhaseTimer`.

CNG-017 (the H3/H5 auto-continue re-arming forever) is the same code and is fixed
alongside — it is only cosmetic *because* these timers normally unmount, and they are
load-bearing until this is fixed.

---

### CNG-029
**A host on localhost produces a QR code nobody can scan**
High · **Fixed 2026-07-15** · `confess_n_guess_client/src/H1CollectingUsersPage.tsx:32`

The QR code is the join mechanism, and it was built from
`window.location.origin + window.location.pathname`. That encodes whatever URL the *host's
browser* happens to be on. Open the host page at `http://localhost:3001` — the obvious
thing to do on the machine running the server — and the QR says `localhost`. Every phone
that scans it tries to reach *itself* and fails, with no clue as to why.

**Fixed narrowly, at the user's direction**, and the narrowness is the point. The obvious
fix — always use the server's LAN address — is wrong: behind a reverse proxy the server's
address is an internal detail no phone can reach, and `window.location` is the *only*
correct answer. So:

- the host's address bar is used as-is, always, except
- when its hostname is loopback (`localhost`, `127.0.0.1`, `::1`), where it cannot possibly
  be right, the server's LAN address is substituted.

Only the **hostname** is replaced. Keeping the port and path means a reverse proxy on the
same box still works: browsing `localhost:8080` yields `192.168.x.x:8080`, going *through*
the proxy rather than around it to the app's own port.

`buildJoinUrl`/`isLoopbackHostname` live in `IncludeStuff.ts` — shared, pure, and therefore
testable, rather than buried in a component where nothing could reach them. The server
reports its address via `requestJoinHost`, preferring private ranges (192.168 → 10 →
172.16-31), because a machine with Docker or a VPN up lists bridges nobody can reach first.

The host screen now also shows the join URL under the QR, and says so plainly when it's
still loopback (no LAN address available) rather than letting people scan a dud.

Verified both ways: making it always substitute breaks the reverse-proxy cases; making it
never substitute breaks the localhost rescue. `tests/join-url.test.js`.

---

### CNG-030
**A fresh clone serves nothing — the client build is gitignored but the server serves it**
Medium · **Fixed 2026-07-16** · `confess_n_guess_client/.gitignore:11`, `src/index.ts:16-17`

> Fixed with an npm `prestart` hook (`scripts/ensure-build.js`): builds only what is
> missing — client deps, client build, server build — and does nothing when they exist,
> so the normal start stays instant and the hot-patch loop is not second-guessed.
>
> Verified against an actual `git clone`, which accidentally produced its own baseline:
> the clone got the committed (pre-fix) code, and `npm start` served **Express's default
> 404 page** — whose `<!DOCTYPE html>` fooled the first "is it serving?" check. Lesson
> banked: assert on content (`id="root"`, the bundle path), never on "returned some HTML".
> With the fix copied in: deps installed, client built, HTTP 200 with the real app, and a
> second start skipped the build entirely.

`src/index.ts` serves `confess_n_guess_client/dist/` via `express.static`. That directory is
gitignored, while the *server's* `dist/` is committed. So a fresh clone plus `npm start`
gives a running server that serves nothing until someone runs `npm run build`.

It works on the current machine only because the build output has been sitting there since
April. Nothing warns about it.

Not urgent — there's no deployment (see below) and the owner's machine is fine. Options:
commit the client build to match the server's, or have `npm start` depend on `npm run
build`. The second is cleaner; the first is more consistent with how `dist/` is already
treated. Worth a decision rather than a default.

**Context: this project isn't hosted anywhere.** No Dockerfile, Procfile, CI, or cloud
config; no URL in the source but `localhost`. It is built to be self-hosted on a LAN — the
server serves the client from its own origin, binds `*:3001` (all interfaces), and the
client resolves its server as `undefined`, i.e. whatever origin served the page (verified in
the built bundle: `const URL = void 0`). `npm run build && npm start` on a laptop *is* the
deployment. CNG-029's reverse-proxy handling exists because that is the one other way this
plausibly gets run.

---

## 2026-07-16 review sweep

A second full read of everything, requested by the user after the model handoff, with the
explicit instruction to **spot, not fix** — the findings below are for a future session to
work through. All line numbers are against commit `1486efe`. The first sweep's structural
problems are gone; what's left is mostly seams: places where two mechanisms that are each
correct meet badly.

---

### CNG-031
**Name reclaim is case- and whitespace-sensitive — retyping "bob" for "Bob" forks a ghost player mid-game**
High · Open · `src/socketHandlers.ts:926-944, 53-56`, `src/GameState.ts:154-156`

Game codes are normalized on every handler (`normalizeCode`, `:53`). Names never are:
`userExists` is a raw `name in users` (`GameState.ts:154`), and `nameAndEmoji` trusts it
(`:938`).

The reclaim-by-name decision (see the 2026-07-15 decision note) makes typing your name on a
new device the *supported* reconnect path. So the honest failure is: Bob's phone dies, he
grabs the tablet, types `bob` — and `userExists('bob')` is false, so a **new player** is
added to a live game. Now:

- `allUsersHaveAnswered` / `allLiesSubmittedForTarget` / `allVotesSubmittedForTarget`
  (`GameState.ts:308, 365, 400`) all include the ghost, so the round stalls until the
  timer bails it out;
- real-Bob's points are orphaned on the entry he can no longer reach;
- the leaderboard shows both Bobs.

This is the same class of honest-player failure as CNG-026, sitting directly on the
feature the identity decision exists to protect. Suggested fix: canonicalize names for
*matching* (trim + case-fold) while preserving the display form the player first typed —
i.e. a `findUserByName` used by `nameAndEmoji`/`identify`, not a blanket `toLowerCase` on
storage, so nobody's name gets visually mangled. `identify`'s `userExists` check (`:900`)
needs the same treatment or reclaim-by-URL breaks where reclaim-by-typing works.

Test: join as "Bob", answer, reconnect as "bob " — must resync as the same player, same
points, no ghost in the lobby.

---

### CNG-032
**Question pool exhaustion: players silently get no question, and the empty round restarts forever**
High · Open · `src/socketHandlers.ts:484-494, 638-641`, `src/GameState.ts:203-232, 496-500`

The pool is 30 questions. `usedQuestionIndexes` is only ever reset by `resetForNewGame`
(`startGame`). `restartRound` does **not** recycle it, and every restart draws a fresh
question per player. Two compounding failures:

1. **The silent player.** When `getNextQuestion()` returns null, `beginAnsweringRound`
   just skips them — `if (!questionObj) return;` (`:486`). No screen, no message. They sit
   on whatever they had while the host shows a countdown. With 3 players, ten
   starts/restarts drain the pool; a party that restarts a few times and then plays a
   second game gets there in an evening.

2. **The forever-restart.** Nobody gets questions → nobody answers → timer →
   `handleTimerExpiry` finds no answers → `restartRound` (`:638-641`) → still no questions
   → timer → … every `RESTART_SECONDS`, indefinitely. The `unattended` test never sees
   this because it exhausts nothing.

Suggested fix: when the pool can't serve every player, recycle it (`usedQuestionIndexes =
[]`) at the top of `beginAnsweringRound` — repeats across rounds beat silence. Keep
per-round uniqueness (players in the same round shouldn't share a question), which the
recycle preserves since a round draws at most N of 30. Consider also breaking the
restart loop after a bounded number of consecutive empty rounds (see CNG-033, which is
what makes this loop immortal).

Test: force `usedQuestionIndexes` to 28/30 used, start a round with 3 players, assert
every player still receives a question.

---

### CNG-033
**Server-driven transitions count as "activity", so an abandoned churning game never idles out**
Medium · Open · `src/GameState.ts:270-274`, `src/index.ts:22-28`

`setPhase` calls `touch()` (`GameState.ts:271`) — which is right for player- and
host-driven transitions, but the server's own timers also go through `setPhase`. So the
CNG-032 restart loop, and any timer-driven progression, refreshes `lastActivity` every
cycle. The 12-hour idle sweep (CNG-016) can never collect a game that is keeping *itself*
alive: players started a game, walked away, and the server now churns it — timer, restart,
timer — until the process dies.

The definition is wrong, not the mechanism: **activity should mean a human did
something.** `touch()` belongs in the socket handlers (submissions, joins, host clicks),
not inside `setPhase`. `addUser`/`addAnswer`/`addLie`/`addVote` touching is fine — those
only fire from handlers.

One wrinkle for the fixer: the unattended-game backstop (CNG-028) *deliberately* advances
games without humans. Under the corrected definition an abandoned game goes idle-stale
while the backstop walks it to GameOver — that's compatible (GameOver has no timer, then
the sweep gets it), but the interaction deserves a test: abandon a game entirely, assert
it reaches GameOver and is dropped at the next save after the idle window, not churned
forever.

---

### CNG-034
**Three orphaned handlers still mutate live games: `selectBestAnswer`, `nextRound`, `endGame`**
Medium · Open · `src/socketHandlers.ts:1175-1210, 1212-1223, 1247-1270`

Nothing in the client emits any of these (verified by grep across
`confess_n_guess_client/src`). All three still mutate state, and two have no meaningful
guard:

- **`selectBestAnswer` (`:1175`)** — callable during `VotingOnLies`. Awards +10 to an
  arbitrary name and jumps the phase to `ShowingPoints` **without ever calling
  `calculateLiePoints`** — the round's lies and votes are silently discarded, nobody is
  scored. It's labeled "legacy … keep for backward compatibility" with nothing to be
  compatible with.
- **`nextRound` (`:1212`)** — no phase check at all. One event, at any moment including
  mid-vote or GameOver, throws the current round away via `restartRound`.
- **`endGame` (`:1247`)** — no phase guard, and doesn't `stopTimer()` (harmless today only
  because the token check eats the orphaned interval's completion).

Under the accepted-identity decision these are devtools-only *triggers*, but that decision
traded risk for a benefit, and dead handlers buy nothing — the same reasoning that removed
`killServer` (CNG-015). Delete `selectBestAnswer` and `nextRound` outright.

**Caution on `endGame`:** it is load-bearing for the test suite. `host-exclusion.test.js`
drives it, and that test *depends* on `endGame` sending players `c2` while the host gets
`h6` — the documented reason the host/player screen difference was kept (see the T6
PROGRESS note). Keep `endGame`, give it a phase guard (`!== GameOver`) and a `stopTimer()`,
and leave its screen split alone. Also fold in: delete `Screens.h4…` and
`H4IterateAnswers.tsx` — no server path ever sends that screen (see CNG-041).

---

### CNG-035
**The two resync functions still hand-roll results/ballots — pre-T6 duplication that will drift**
Medium · Open · `src/socketHandlers.ts:225-253, 363-372, 375-406`

T6 collapsed the *transitions* to one method each, but the two resync functions predate it
and kept their own copies of the same constructions:

- `sendHostToCorrectScreen`'s `ShowingLieResults` branch (`:225-253`) rebuilds
  truth+lies+voters by hand — it is `buildResults` (`:452`), inlined.
- `sendPlayerToCorrectScreen`'s `ShowingLieResults` branch (`:375-406`) — same again.
- `sendPlayerToCorrectScreen`'s `VotingOnLies` branch (`:363-372`) rebuilds the ballot and
  **reshuffles it** (CNG-040 is the user-visible half of that).

This is exactly the shape that produced CNG-004 and CNG-025: a copy that wasn't in the
one-method-per-transition sweep, drifting. Both branches should call `buildResults`; the
ballot branch needs the shuffled-order problem solved first (CNG-040), most simply by
storing the round's shuffled order on the GameState when `beginVoting` creates it and
having every send — transition and resync alike — reuse it.

---

### CNG-036
**Non-SIGINT shutdown loses every game — SIGTERM has no handler and there is no periodic save**
Medium · Open · `src/index.ts:44-52`

`saveGameState` runs on `process.on('exit')` and `SIGINT`. Node does **not** fire `exit`
listeners for signals with default handlers, so plain `kill <pid>` (SIGTERM — also what
systemd and `docker stop` send) terminates the process with every in-flight game
unsaved. The hot-patch workflow happens to use Ctrl+C, which is why this hasn't bitten,
but the save-on-restart guarantee (CNG-002) currently depends on *which signal* you use.

Suggested fix: register the same handler for SIGTERM, and add a cheap debounced
save-on-mutation or a periodic save (the file is small JSON; `writeFileSync` per phase
transition would be fine at this scale). That also narrows the loss window for genuine
crashes and power cuts, which no signal handler can cover.

Test: `restart-survival` already exists — parameterize the shutdown signal and run it with
SIGTERM.

---

### CNG-037
**Mid-round joiners are added to the current round's quorum, stalling it until the timer**
Low · Open · `src/socketHandlers.ts:938-944`, `src/GameState.ts:308-311, 365-371, 400-406`

`nameAndEmoji` calls `addUser` in any phase, and every all-submitted predicate is computed
over the *current* user list. So a newcomer joining during `AnsweringQuestions` makes
`allUsersHaveAnswered` false again even if everyone else already answered — a round that
was one submit from advancing now waits for someone who arrived seconds ago (bounded by
the round timer, which is why this is Low). Same for lies and votes.

It mostly works — the newcomer genuinely can answer/lie/vote, and `sendPlayerToCorrectScreen`
puts them on the right screen — so this is as much a design decision as a bug: **should a
mid-round joiner be dealt in immediately, or parked until the next lie round?** Parking is
simpler and matches how the skip logic already treats players without truths; dealing in
is friendlier. Decide, then make the quorum predicates match the decision. Flag for the
user if unsure.

---

### CNG-038
**`socketStuff` and in-memory games are never pruned while the server runs**
Low · Open · `src/socketHandlers.ts:80, 884-887`, `src/index.ts:38-42`

The idle sweep runs only at load and save. A long-running server accumulates every game
ever created (and its `socketStuff` entry — those aren't dropped even when the game is)
until the process restarts. Disconnects clean *socket ids* out of `socketStuff` but never
the per-game entry itself. At party scale this is kilobytes and it has an every-Ctrl+C
safety valve, hence Low — but if CNG-036 adds a periodic save, run the sweep there too and
delete `socketStuff[code]` alongside the game.

---

### CNG-039
**Server accepts any name: empty, `<host>`, unbounded length**
Low · Open · `src/socketHandlers.ts:926-944`

All name validation lives in the client (`C1…Page.tsx:22-30`): trim, non-empty, not
`<host>`. The server checks nothing. `nameAndEmoji` with `name: ''` or `name: '<host>'`
is accepted — the latter merges the sender's socket into the host's user entry
(`userExists('<host>')` is true from `newGame`). Reaching this needs devtools, so it's
inside the accepted-identity decision, but unlike the accepted items this validation costs
one guard clause and protects future honest clients (a native app, a different UI) from
re-learning the client-side rules. Trim + reject empty/`<host>` + cap length (say 40
chars, the lobby renders these) server-side in `nameAndEmoji`, mirroring the CNG-031 fix.

---

### CNG-040
**Resync reshuffles the ballot, so a refreshing voter sees the options in a new order**
Low · Open · `src/socketHandlers.ts:363-372, 546-550`

`beginVoting` shuffles once and sends the same order to everyone (`:547`). A voter who
refreshes mid-vote hits `sendPlayerToCorrectScreen`, which rebuilds the ballot and calls
`shuffleArray` again (`:369`) — the options they were just reading reorder under them, and
no longer match what a neighbour's screen shows. Harmless to scoring (votes are by
username), confusing to humans mid-decision.

Fix together with CNG-035: persist the round's shuffled order (it belongs on `GameState`
next to `lies`/`votes`, and in `toJSON` — it must survive the hot-patch restart too, or a
restart mid-vote reorders every ballot). One stored order, every send reuses it.

---

### CNG-041
**Client nits, collected**
Low · Open · various

Small things spotted on the read that don't merit their own entries:

- **`H4IterateAnswers.tsx` and `Screens.h4…` are dead** — no server path ever sends screen
  4. Delete the component, the enum member, and the `App.tsx` import/branch (do it with
  CNG-034's cleanup).
- **`H1CollectingUsersPage` never renders `gameState.text`** — the server's "Need at least
  2 players to start!" (`socketHandlers.ts:1017-1020`) is invisible. Unreachable via the
  UI today because the Start button is disabled below 2 players, but the message should
  either render or stop being sent.
- **The merge trap is still armed** (noted inside CNG-014, never fixed as such):
  `setGameState` is `{...prev, ...next}` (`App.tsx:88`), so any field a screen renders but
  an emit omits shows stale data. Current emits happen to cover the fields current screens
  read; nothing enforces that for the next screen someone adds. If it bites a third time,
  consider making `gameState` emits authoritative-complete server-side rather than
  patching the client.
- **`resumeTimers` gives restored rounds `ROUND_SECONDS` even if they were on the shorter
  restart clock** — deliberate-adjacent (full time back is the documented policy), just
  noting the asymmetry is known rather than overlooked.
