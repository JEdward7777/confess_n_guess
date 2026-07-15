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
