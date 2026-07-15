# Issue register

Findings from the full code sweep on 2026-07-15. All line numbers are against commit
`98fd9a2`. Every issue below was confirmed by reading the code (and, where noted, by
checking library source or on-disk data) — none are speculative unless marked
`Unconfirmed`.

## Summary

| id | Sev | Status | Title |
|---|---|---|---|
| [CNG-001](#cng-001) | Critical | Open | `sendToPlayers` never excludes the host — host device gets player screens |
| [CNG-002](#cng-002) | Critical | Open | Saved games drop answers/lies/votes — every game resumes corrupt after a restart |
| [CNG-003](#cng-003) | Critical | Open | Duplicate `timerExpired` cascades through phases and wrecks the round |
| [CNG-004](#cng-004) | Critical | Open | Lie-round roles inverted in the skip path — target lies about themselves |
| [CNG-005](#cng-005) | Critical | Open | Reconnect never resyncs — refreshing leaves you on a stale screen |
| [CNG-006](#cng-006) | High | Open | Resync re-rolls the player's question; assignment never stored server-side |
| [CNG-007](#cng-007) | High | Open | Host refresh lands on the player name-entry screen |
| [CNG-008](#cng-008) | High | Open | Duplicate name silently merges two devices into one player |
| [CNG-009](#cng-009) | High | Open | Server trusts the client-supplied `name` on every event |
| [CNG-010](#cng-010) | High | Open | `startGame` doesn't clear answers or the question pool |
| [CNG-011](#cng-011) | High | Open | Blind `setTimeout` chain advances the game behind the host's back |
| [CNG-012](#cng-012) | High | Open | `addLie`/`addVote` don't dedupe — duplicate entries and double points |
| [CNG-013](#cng-013) | Medium | Open | `nextRound` broadcasts every question to every player |
| [CNG-014](#cng-014) | Medium | Open | Skip path omits `targetPlayer`, client submits against a stale target |
| [CNG-015](#cng-015) | Medium | Open | `killServer` is unauthenticated |
| [CNG-016](#cng-016) | Medium | Open | Games are never expired — 37 stale games on disk |
| [CNG-017](#cng-017) | Medium | Open | H5 auto-continue re-arms forever |
| [CNG-018](#cng-018) | Medium | Open | `identifyMe` can arrive before the client's listener is attached |
| [CNG-019](#cng-019) | Medium | Open | Any client can claim to be the host of any game |
| [CNG-020](#cng-020) | Low | Open | Self-vote only prevented client-side |
| [CNG-021](#cng-021) | High | Open | No automated test can reach any of this |
| [CNG-022](#cng-022) | Low | Open | Dead code: server-side timer, `sendToUserSockets` |
| [CNG-023](#cng-023) | Low | Open | ~700 lines of duplicated phase-transition logic |

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

## Details

### CNG-001
**`sendToPlayers` never excludes the host — host device gets player screens**
Critical · Open · `src/socketHandlers.ts:89-102`

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
Critical · Open · `src/GameState.ts:434-451`

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
Critical · Open · `src/socketHandlers.ts:1114-1131`

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
Critical · Open · `src/socketHandlers.ts:1382-1416`

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
Critical · Open · `src/socketHandlers.ts:499-522`, `confess_n_guess_client/src/App.tsx:85-100`

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
High · Open · `src/socketHandlers.ts:285`, `src/GameState.ts:162-179`

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
High · Open · `confess_n_guess_client/src/App.tsx:23-38`

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
High · Open · `src/socketHandlers.ts:524-556`

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
High · Open · `src/socketHandlers.ts:653, 742, 841`

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
High · Open · `src/socketHandlers.ts:614-617`, `src/GameState.ts:427-431`

`startGame` calls `resetLieData()`, which clears `lies`, `votes`, and
`currentLieTargetPlayer` — but not `userAnswers`, and not `usedQuestionIndexes`.
Starting a second game in the same room therefore begins with every previous answer
still present, so `allUsersHaveAnswered()` (`GameState.ts:235`) can be true before
anyone types, immediately shoving the game into the lie phase with last game's
answers. And the question pool keeps shrinking across games until it's empty.

---

### CNG-011
**Blind `setTimeout` chain advances the game behind the host's back**
High · Open · `src/socketHandlers.ts:1588-1653`

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
High · Open · `src/GameState.ts:264-269, 286-291`

Both push unconditionally. A player who submits twice (two tabs — now supported —
or a resend after a resync) appears twice in the answer list, and in the case of
votes has both counted by `calculateLiePoints` (`:308-350`), paying out 500/1000 per
duplicate. Should be upsert-by-username.

---

### CNG-013
**`nextRound` broadcasts every question to every player**
Medium · Open · `src/socketHandlers.ts:993-1004`

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
Medium · Open · `src/socketHandlers.ts:1396-1402`

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
Medium · Open · `src/socketHandlers.ts:1659-1664`

Any connected client can emit `killServer` and take the process down for everyone.
It came from a `todo.txt` line ("create a function that I can send to the server to
kill it") and no client emits it. Delete it, or gate it behind a dev-only env var.

---

### CNG-016
**Games are never expired — 37 stale games on disk**
Medium · Open · `src/index.ts:20-48`

Nothing ever deletes a game. `games.json` has accumulated 37, all reloaded into
memory at boot, all in whatever broken state CNG-002 left them. `todo.txt` already
notes this: *"Make it so that if a gave has no activity for enough time that it gets
deleted."* Needs a `lastActivity` timestamp and a sweep. Also note `games.json` is
written to the process CWD and is currently tracked in git — it probably belongs in
`.gitignore`.

---

### CNG-017
**H5 auto-continue re-arms forever**
Medium · Open · `confess_n_guess_client/src/H5ShowPoints.tsx:21-36`

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
Medium · Open · `confess_n_guess_client/src/socket.js:6`, `App.tsx:42-62`

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
Medium · Open · `src/socketHandlers.ts:499-522`

`identify` accepts `role: 'host'` for any code, from anyone, and pushes the socket
into `hostSocketIds`. That socket then receives host screens (seeing every answer
before the reveal) and can drive `startGame`, `continueFromScores`, `endGame`,
`timerExpired`. The handler also doesn't check that the game exists, so it will
happily create tracking for a nonexistent code. Needs a host token minted at
`newGame`.

---

### CNG-020
**Self-vote only prevented client-side**
Low · Open · `confess_n_guess_client/src/C4PickBestAnswer.tsx:31`

The voting list filters out the player's own lie in the browser. The server accepts
any `selectedUsername`, and `calculateLiePoints` pays out for it. A stale or crafted
client can vote for its own lie for 500 a head. Enforce in `addVote`.

---

### CNG-021
**No automated test can reach any of this**
High · Open · `package.json:12`

`"test": "echo \"Error: no test specified\" && exit 1"`. Every issue in this register
was found by reading, and can only be verified by hand-driving four browser tabs.
That's why regressions keep landing. A socket.io-client harness that drives a host
plus three players through a full round — including a mid-round refresh — would have
caught CNG-001, -003, -004, -005 and -013 outright. This is the highest-leverage item
here after the criticals.

---

### CNG-022
**Dead code: server-side timer, `sendToUserSockets`**
Low · Open · `src/GameState.ts:211-232`, `src/socketHandlers.ts:59-74`

`GameState.startTimer`/`stopTimer`/`timerInterval` are fully implemented and never
called from anywhere — the authoritative countdown lives in the host's browser
instead (which is what makes CNG-003 possible). `sendToUserSockets` is likewise never
called, while the exact loop it encapsulates is hand-inlined ~12 times.

These two are worth keeping in mind together: adopting `startTimer` fixes a Critical,
and adopting `sendToUserSockets` removes most of CNG-023's bulk.

---

### CNG-023
**~700 lines of duplicated phase-transition logic**
Low · Open · `src/socketHandlers.ts:653-1657`

The truths→lies transition is written out three times (`:683-730`, `:1138-1180`,
`:1226-1268`), lies→voting twice (`:774-829`, `:1274-1321`), voting→results twice
(`:872-925`, `:1480-1529`). They have already drifted: the copy at `:1503` shuffles
the results, the copy at `:897` doesn't, so whether the reveal order is randomized
depends on whether the timer expired. CNG-004's inversion is the same disease.

Each transition should exist once, as a method. This is why fixes here keep missing
a path.
