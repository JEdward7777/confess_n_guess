var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/GameDO.ts
import { DurableObject } from "cloudflare:workers";

// src/GameState.ts
var ALL_QUESTIONS = [
  "What was the strangest job I've ever had?",
  "What's the most embarrassing thing that has ever happened to me in public?",
  "If I could have any superpower, what would it be?",
  "What's my biggest fear?",
  "What's the most adventurous thing I've ever done?",
  "If I could live anywhere in the world, where would it be?",
  "What's the weirdest food I've ever eaten?",
  "What's my favorite hobby?",
  "If I could time travel, which era would I visit first?",
  "What's the craziest dream I've ever had?",
  "What was my first pet's name?",
  "What's my hidden talent that most people don't know about?",
  "If I could swap lives with any fictional character for a day, who would it be?",
  "What's the most unusual item in my bucket list?",
  "What's the strangest phobia I have?",
  "What's the most memorable vacation I've ever been on?",
  "What's my go-to comfort food?",
  "If I could have dinner with any historical figure, who would it be?",
  "What's the one thing I've always wanted to learn but never got around to?",
  "What's the silliest nickname I've ever been called?",
  "What's the most interesting fact about me that surprises people?",
  "If I could have any animal as a pet, what would it be?",
  "What's my favorite childhood memory?",
  "What's the most extreme sport or activity I've ever tried?",
  "What's the weirdest dream I've ever had?",
  "What's my favorite genre of music?",
  "If I could meet any celebrity, who would it be?",
  "What's my biggest pet peeve?",
  "What's the most adventurous thing I've eaten?",
  "If I could be proficient in any language, which one would it be?"
];
var GameState = class _GameState {
  static {
    __name(this, "GameState");
  }
  static {
    /**
     * Bump when a change makes older saves unreadable. fromJSON drops anything that
     * doesn't match rather than loading it into a shape the code no longer expects.
     */
    this.SAVE_VERSION = 4;
  }
  constructor(gameCode, config = {}) {
    this.questions = ALL_QUESTIONS.slice(0, config.questionCount || ALL_QUESTIONS.length);
    this.sharedState = {
      users: {},
      code: gameCode
    };
    this.usedQuestionIndexes = [];
    this.assignedQuestions = {};
    this.userAnswers = {};
    this.currentPhase = "collectingUsers" /* CollectingUsers */;
    this.currentQuestionIndex = 0;
    this.timerDeadline = null;
    this.currentLieTargetPlayer = "";
    this.lies = {};
    this.votes = {};
    this.currentBallot = null;
    this.lastActivity = Date.now();
    this.phaseToken = 0;
  }
  /**
   * Token for the current timed segment. Anything that ends a segment bumps it, so a
   * timer callback or client timerExpired carrying an older token can be recognised
   * as stale and dropped rather than applied to whatever phase happens to be current.
   */
  getPhaseToken() {
    return this.phaseToken;
  }
  newSegment() {
    this.phaseToken++;
  }
  /**
   * Mark the game as alive. Anything idle long enough gets swept (CNG-016).
   *
   * "Alive" means A HUMAN DID SOMETHING - a submission, a join, a host click. Do not
   * call this from server-driven transitions: setPhase used to touch, and the server's
   * own timers go through setPhase, so an abandoned game churning through restarts kept
   * refreshing its own lastActivity and the sweep could never collect it (CNG-033).
   */
  touch() {
    this.lastActivity = Date.now();
  }
  getLastActivity() {
    return this.lastActivity;
  }
  // Timer management: a new timed segment of `seconds` starts now.
  startTimer(seconds) {
    this.newSegment();
    this.timerDeadline = Date.now() + seconds * 1e3;
  }
  stopTimer() {
    this.timerDeadline = null;
  }
  getTimerDeadline() {
    return this.timerDeadline;
  }
  /** True when a timed segment exists and its deadline has passed. */
  timerHasExpired() {
    return this.timerDeadline !== null && Date.now() >= this.timerDeadline;
  }
  // Getters
  getSharedState() {
    return this.sharedState;
  }
  getGameCode() {
    return this.sharedState.code;
  }
  getPhase() {
    return this.currentPhase;
  }
  getUserAnswers() {
    return this.userAnswers;
  }
  /**
   * Seconds remaining, derived from the deadline - the wire shape
   * (ClientGameState.timerValue) and the H2 countdown are unchanged from the Node
   * version.
   */
  getTimerValue() {
    if (this.timerDeadline === null) return 0;
    return Math.max(0, Math.ceil((this.timerDeadline - Date.now()) / 1e3));
  }
  // User management
  addUser(name, emoji) {
    this.touch();
    this.sharedState.users[name] = {
      name,
      emoji,
      points: 0
    };
  }
  removeUser(name) {
    delete this.sharedState.users[name];
  }
  getUsers() {
    return this.sharedState.users;
  }
  getUserNames() {
    return Object.keys(this.sharedState.users).filter((name) => name !== "<host>");
  }
  userExists(name) {
    return name in this.sharedState.users;
  }
  /**
   * The stored name matching `name` case-insensitively and trimmed, or null.
   *
   * Reclaim-by-name is the supported reconnect path (see the identity decision), and it
   * has to survive a shift key: game codes are normalized everywhere, but names used to
   * be exact-matched, so "Bob" retyping "bob" on the tablet forked a ghost player into a
   * live game (CNG-031). Matching is loose; the stored spelling - what the player first
   * typed - is what everyone keeps seeing.
   */
  findUserName(name) {
    const canonical = (name ?? "").trim().toLowerCase();
    if (!canonical) return null;
    for (const existing of Object.keys(this.sharedState.users)) {
      if (existing !== "<host>" && existing.trim().toLowerCase() === canonical) {
        return existing;
      }
    }
    return null;
  }
  // Points
  addPoints(userName, points) {
    if (this.sharedState.users[userName]) {
      this.sharedState.users[userName].points += points;
    }
  }
  getPoints(userName) {
    return this.sharedState.users[userName]?.points ?? 0;
  }
  getNextQuestion() {
    if (this.questions.length === 0) {
      return null;
    }
    let availableQuestions = this.questions.filter(
      (_, index) => !this.usedQuestionIndexes.includes(index)
    );
    if (availableQuestions.length === 0) {
      this.usedQuestionIndexes = [];
      availableQuestions = [...this.questions];
    }
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const actualIndex = this.questions.indexOf(availableQuestions[randomIndex]);
    this.usedQuestionIndexes.push(actualIndex);
    return {
      question: availableQuestions[randomIndex],
      index: actualIndex
    };
  }
  /**
   * Draw a question for a player and remember it. Replaces any previous assignment,
   * so call this once per player per round.
   */
  assignQuestion(username) {
    const questionObj = this.getNextQuestion();
    if (questionObj) {
      this.assignedQuestions[username] = questionObj;
    }
    return questionObj;
  }
  /** What this player was handed, or null if they haven't been assigned one. */
  getAssignedQuestion(username) {
    return this.assignedQuestions[username] || null;
  }
  /**
   * The player's existing question, drawing one only if they have none. Resyncs must
   * use this: getNextQuestion() mutates, so calling it on reconnect would hand the
   * player a different question and burn the pool (CNG-006).
   */
  getOrAssignQuestion(username) {
    return this.assignedQuestions[username] || this.assignQuestion(username);
  }
  clearAssignedQuestions() {
    this.assignedQuestions = {};
  }
  // Answer management
  addAnswer(username, question, answer) {
    this.touch();
    this.userAnswers[username] = {
      question,
      answer,
      isTruth: true
      // Their own answer is always the truth
    };
  }
  // Clears a round's Q&A. Assignments go with the answers - every caller restarts the
  // round and reassigns immediately, so a stale assignment must not survive.
  clearAnswers() {
    this.userAnswers = {};
    this.assignedQuestions = {};
  }
  // Phase management. Deliberately does NOT touch(): the server's timers come through
  // here, and machine-driven churn must not count as activity (CNG-033).
  setPhase(phase) {
    this.newSegment();
    this.currentPhase = phase;
  }
  // Check if all users have submitted answers
  allUsersHaveAnswered() {
    const userNames = this.getUserNames();
    return userNames.every((name) => name in this.userAnswers);
  }
  // Get leaderboard sorted by points
  getLeaderboard() {
    return Object.values(this.sharedState.users).filter((user) => user.name !== "<host>").sort((a, b) => b.points - a.points);
  }
  // === LIE PHASE METHODS ===
  // Get the next player to target for lies
  getCurrentLieTargetPlayer() {
    return this.currentLieTargetPlayer;
  }
  setCurrentLieTargetPlayer(player) {
    this.newSegment();
    this.currentLieTargetPlayer = player;
  }
  // Get the truth answer for a player
  getTruthForPlayer(username) {
    return this.userAnswers[username] || null;
  }
  /**
   * Add a lie for the target player. One lie per person: a resubmission replaces the
   * previous one rather than adding a second.
   *
   * This used to push unconditionally, so a player submitting twice - two tabs, or a
   * resend after a resync, both of which are normal now that multiple devices are
   * supported - appeared twice in the answer list with two lies (CNG-012).
   */
  addLie(targetUsername, lieUsername, lie) {
    this.touch();
    if (!this.lies[targetUsername]) {
      this.lies[targetUsername] = [];
    }
    const existing = this.lies[targetUsername].find((l) => l.username === lieUsername);
    if (existing) {
      existing.lie = lie;
    } else {
      this.lies[targetUsername].push({ username: lieUsername, lie });
    }
  }
  // Get all lies for a target player
  getLiesForPlayer(targetUsername) {
    return this.lies[targetUsername] || [];
  }
  // Check if all OTHER players have submitted lies for target
  allLiesSubmittedForTarget(targetUsername) {
    const userNames = this.getUserNames();
    const otherPlayers = userNames.filter((name) => name !== targetUsername);
    const submittedLiers = this.lies[targetUsername]?.map((l) => l.username) || [];
    return otherPlayers.every((name) => submittedLiers.includes(name));
  }
  /**
   * Record a vote. One vote per person: changing your mind replaces the old vote rather
   * than casting a second.
   *
   * This used to push unconditionally, so a player voting twice - which a second open
   * tab makes easy, since it keeps showing a live ballot (CNG-026) - had BOTH counted
   * by calculateLiePoints, paying out 1000 or 500 twice for one opinion (CNG-012).
   */
  addVote(targetUsername, voter, selectedUsername) {
    this.touch();
    if (!this.votes[targetUsername]) {
      this.votes[targetUsername] = [];
    }
    const existing = this.votes[targetUsername].find((v) => v.voter === voter);
    if (existing) {
      existing.selectedUsername = selectedUsername;
    } else {
      this.votes[targetUsername].push({ voter, selectedUsername });
    }
  }
  setBallot(ballot) {
    this.currentBallot = ballot;
  }
  getBallot() {
    return this.currentBallot;
  }
  // Get all votes for a target
  getVotesForPlayer(targetUsername) {
    return this.votes[targetUsername] || [];
  }
  // Check if all players (except target) have voted
  allVotesSubmittedForTarget(targetUsername) {
    const userNames = this.getUserNames();
    const voters = userNames.filter((name) => name !== targetUsername);
    const votedPlayers = this.votes[targetUsername]?.map((v) => v.voter) || [];
    return voters.every((name) => votedPlayers.includes(name));
  }
  // Calculate and award points for lie round
  calculateLiePoints(targetUsername) {
    const truth = this.userAnswers[targetUsername];
    const lies = this.lies[targetUsername] || [];
    const votes = this.votes[targetUsername] || [];
    if (!truth) return;
    const allAnswers = [
      { username: targetUsername, answer: truth.answer, isTruth: true },
      ...lies.map((l) => ({ username: l.username, answer: l.lie, isTruth: false }))
    ];
    const voteCounts = {};
    votes.forEach((v) => {
      voteCounts[v.selectedUsername] = (voteCounts[v.selectedUsername] || 0) + 1;
    });
    allAnswers.forEach((answer) => {
      const numVotes = voteCounts[answer.username] || 0;
      if (answer.isTruth) {
        if (numVotes > 0) {
          this.addPoints(answer.username, numVotes * 1e3);
        }
      } else {
        if (numVotes > 0) {
          this.addPoints(answer.username, numVotes * 500);
        }
      }
    });
    votes.forEach((v) => {
      if (v.selectedUsername === targetUsername) {
        this.addPoints(v.voter, 1e3);
      }
    });
  }
  // Get next player for lie round, skipping players without a truth
  getNextLieTargetPlayerSkippingMissing() {
    const userNames = this.getUserNames();
    if (!this.currentLieTargetPlayer) {
      for (const player of userNames) {
        if (this.userAnswers[player]) {
          return player;
        }
      }
      return null;
    }
    const currentIndex = userNames.indexOf(this.currentLieTargetPlayer);
    for (let i = currentIndex + 1; i < userNames.length; i++) {
      const player = userNames[i];
      if (this.userAnswers[player]) {
        return player;
      }
    }
    return null;
  }
  // Reset lies and votes for new game
  resetLieData() {
    this.lies = {};
    this.votes = {};
    this.currentLieTargetPlayer = "";
    this.currentBallot = null;
  }
  /**
   * Wipe everything belonging to a previous game in this room, so starting again is
   * actually starting again. resetLieData() alone left the answers and the used-question
   * pool behind, so a replay could see allUsersHaveAnswered() true before anyone typed,
   * and kept draining a 30-question pool across games (CNG-010).
   * Users and their points are left alone - startGame only runs from CollectingUsers,
   * which is only reachable on a fresh game.
   */
  resetForNewGame() {
    this.clearAnswers();
    this.resetLieData();
    this.usedQuestionIndexes = [];
  }
  /**
   * Serialize for saving.
   *
   * This must capture EVERYTHING a round needs. Restarting the server mid-game is a
   * supported workflow - it's how code gets hot-patched during a live game without
   * replaying the trace from the start - so anything omitted here reappears as a
   * game that resumes into a state the code can't handle. This previously saved only
   * sharedState/usedQuestionIndexes/currentPhase/currentQuestionIndex, so every game
   * came back claiming to be mid-round with no answers, lies, votes or target
   * (CNG-002).
   *
   * If you add a field to this class, add it here, and bump SAVE_VERSION if old
   * saves can't be read.
   */
  toJSON() {
    return {
      version: _GameState.SAVE_VERSION,
      sharedState: this.sharedState,
      usedQuestionIndexes: this.usedQuestionIndexes,
      assignedQuestions: this.assignedQuestions,
      userAnswers: this.userAnswers,
      currentPhase: this.currentPhase,
      currentQuestionIndex: this.currentQuestionIndex,
      timerDeadline: this.timerDeadline,
      currentLieTargetPlayer: this.currentLieTargetPlayer,
      lies: this.lies,
      votes: this.votes,
      currentBallot: this.currentBallot,
      lastActivity: this.lastActivity,
      phaseToken: this.phaseToken
    };
  }
  /**
   * Load from saved state. Returns null for anything we can't faithfully restore -
   * the caller drops it. Loading a save we only half understand is worse than losing
   * it: it produces a game that looks playable and isn't.
   */
  static fromJSON(data, gameCode, config = {}) {
    if (!data || typeof data !== "object") return null;
    if (data.version !== _GameState.SAVE_VERSION) return null;
    if (!data.sharedState || typeof data.sharedState.users !== "object") return null;
    const gameState = new _GameState(gameCode, config);
    gameState.sharedState = data.sharedState;
    gameState.sharedState.code = gameCode;
    gameState.usedQuestionIndexes = data.usedQuestionIndexes || [];
    gameState.assignedQuestions = data.assignedQuestions || {};
    gameState.userAnswers = data.userAnswers || {};
    gameState.currentPhase = data.currentPhase || "collectingUsers" /* CollectingUsers */;
    gameState.currentQuestionIndex = data.currentQuestionIndex || 0;
    gameState.timerDeadline = data.timerDeadline ?? null;
    gameState.currentLieTargetPlayer = data.currentLieTargetPlayer || "";
    gameState.lies = data.lies || {};
    gameState.votes = data.votes || {};
    gameState.currentBallot = data.currentBallot || null;
    gameState.lastActivity = data.lastActivity || Date.now();
    gameState.phaseToken = data.phaseToken || 0;
    return gameState;
  }
};

// worker/GameDO.ts
function validateName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "<host>") return null;
  if (trimmed.length > 40) return null;
  return trimmed;
}
__name(validateName, "validateName");
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
__name(shuffleArray, "shuffleArray");
var GameDurableObject = class extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.gameState = null;
    this.code = "";
    ctx.blockConcurrencyWhile(async () => {
      const data = await ctx.storage.get("game");
      const code = data?.sharedState?.code;
      if (data && typeof code === "string") {
        this.code = code;
        this.gameState = GameState.fromJSON(data, code, this.gameConfig());
      }
    });
  }
  static {
    __name(this, "GameDurableObject");
  }
  // --- config (D5: vars from env, not process.env) ---
  num(v, fallback) {
    return Number(v) || fallback;
  }
  roundSeconds() {
    return this.num(this.env.CNG_ROUND_SECONDS, 60);
  }
  restartSeconds() {
    return this.num(this.env.CNG_RESTART_SECONDS, 30);
  }
  backstopSeconds() {
    return this.num(this.env.CNG_BACKSTOP_SECONDS, 240);
  }
  cleanTimeMs() {
    return this.num(this.env.CNG_CLEAN_TIME_MS, 24 * 60 * 60 * 1e3);
  }
  gameConfig() {
    const questionCount = Number(this.env.CNG_QUESTION_COUNT) || void 0;
    return { questionCount };
  }
  // --- lifecycle ---
  /**
   * Initialize storage for a fresh game (called by the worker on POST /api/newGame).
   * Returns false if this code already hosts a live game (D9), so the worker retries
   * with a different code.
   */
  async createGame(code) {
    if (this.gameState) return false;
    this.code = code;
    this.gameState = new GameState(code, this.gameConfig());
    this.gameState.addUser("<host>", "\u{1F3E0}");
    await this.persistAndSchedule();
    return true;
  }
  /** WebSocket upgrade for /ws/CODE. */
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected a WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ event: "identifyMe" }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    let event = "";
    let data = {};
    try {
      const parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      event = String(parsed.event ?? "");
      data = parsed.data ?? {};
    } catch {
      return;
    }
    this.handleEvent(ws, event, data);
    await this.persistAndSchedule();
  }
  // webSocketClose/webSocketError need no bookkeeping: getWebSockets() only returns
  // live sockets, which is the whole disconnect-cleanup loop of the Node version
  // made unnecessary.
  /**
   * One alarm, three duties (D4), in order:
   *   1. clean time - no human touch for cleanTimeMs -> the game is deleted (CNG-016/038)
   *   2. the phase deadline passed -> handleTimerExpiry (CNG-027/028 semantics)
   *   3. reschedule for whichever of {phase deadline, clean time} comes first
   */
  async alarm() {
    const gameState = this.gameState;
    if (!gameState) {
      await this.ctx.storage.deleteAll();
      return;
    }
    if (Date.now() - gameState.getLastActivity() > this.cleanTimeMs()) {
      console.log(`Pruned idle game ${this.code} (clean time reached)`);
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(1e3, "game expired");
        } catch {
        }
      }
      this.gameState = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    if (gameState.timerHasExpired()) {
      this.handleTimerExpiry();
    }
    await this.persistAndSchedule();
  }
  async persistAndSchedule() {
    if (!this.gameState) return;
    await this.ctx.storage.put("game", this.gameState.toJSON());
    const deadline = this.gameState.getTimerDeadline() ?? this.gameState.getLastActivity() + this.cleanTimeMs();
    await this.ctx.storage.setAlarm(deadline);
  }
  // --- send helpers: the socketStuff replacement ---
  attachmentOf(ws) {
    try {
      return ws.deserializeAttachment() ?? null;
    } catch {
      return null;
    }
  }
  send(ws, state) {
    try {
      ws.send(JSON.stringify({ event: "gameState", data: state }));
    } catch {
    }
  }
  withPhaseToken(state) {
    if (!this.gameState) return state;
    return { ...state, phaseToken: this.gameState.getPhaseToken() };
  }
  sendToHost(state) {
    const stamped = this.withPhaseToken(state);
    for (const ws of this.ctx.getWebSockets()) {
      if (this.attachmentOf(ws)?.role === "host") this.send(ws, stamped);
    }
  }
  /** All of one player's devices - the multi-device support (CNG-026) unchanged. */
  sendToUserSockets(username, state) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachmentOf(ws);
      if (att?.role === "player" && att.name === username) this.send(ws, state);
    }
  }
  /**
   * Everyone who isn't a host socket - spectators and not-yet-named sockets included,
   * matching the Node version's room-except-host broadcast (CNG-001 semantics; the
   * host-exclusion test guards this).
   */
  sendToPlayers(state) {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.attachmentOf(ws)?.role !== "host") this.send(ws, state);
    }
  }
  sendToSpectators(state) {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.attachmentOf(ws)?.role === "spectator") this.send(ws, state);
    }
  }
  // --- event dispatch ---
  handleEvent(ws, event, data) {
    const gameState = this.gameState;
    if (!gameState) {
      this.send(ws, {
        screen: 0 /* g1NewGame */,
        error: "Invalid game code",
        name: "",
        emoji: "",
        sharedState: { users: {}, code: String(data.code ?? this.code ?? "") }
      });
      return;
    }
    switch (event) {
      case "joinGame":
        return this.onJoinGame(ws, gameState);
      case "identify":
        return this.onIdentify(ws, gameState, data);
      case "nameAndEmoji":
        return this.onNameAndEmoji(ws, gameState, data);
      case "startGame":
        return this.onStartGame(ws, gameState);
      case "sendQuestionAnswer":
        return this.onQuestionAnswer(ws, gameState, data);
      case "submitLie":
        return this.onSubmitLie(ws, gameState, data);
      case "voteOnLie":
        return this.onVoteOnLie(ws, gameState, data);
      case "continueFromResults":
        return this.onContinueFromResults(gameState);
      case "continueFromScores":
        return this.onContinueFromScores(gameState);
      case "endGame":
        return this.onEndGame(gameState);
      case "timerExpired":
        return this.onTimerExpired(gameState, data);
      case "requestJoinHost":
        try {
          ws.send(JSON.stringify({ event: "joinHost", data: { lanHost: null } }));
        } catch {
        }
        return;
      default:
        console.log("Ignoring unknown event: " + event);
    }
  }
  onJoinGame(ws, gameState) {
    gameState.touch();
    this.send(ws, {
      sharedState: gameState.getSharedState(),
      name: "",
      emoji: "",
      screen: 7 /* c1TypeInYourNameAndPickAnEmojiForYourPicture */,
      error: ""
    });
  }
  onIdentify(ws, gameState, data) {
    const role = data.role;
    const name = data.name;
    gameState.touch();
    if (role === "host") {
      ws.serializeAttachment({ role: "host" });
      this.sendHostToCorrectScreen(gameState, ws);
      return;
    }
    if (role === "player" && name) {
      const canonical = gameState.findUserName(name);
      if (!canonical) {
        if (gameState.getPhase() === "collectingUsers" /* CollectingUsers */) {
          this.send(ws, {
            screen: 7 /* c1TypeInYourNameAndPickAnEmojiForYourPicture */,
            name: "",
            emoji: "",
            sharedState: gameState.getSharedState()
          });
        } else {
          this.addSpectator(ws, gameState, name);
        }
        return;
      }
      ws.serializeAttachment({ role: "player", name: canonical });
      this.sendPlayerToCorrectScreen(gameState, canonical, ws);
    }
  }
  onNameAndEmoji(ws, gameState, data) {
    gameState.touch();
    const trimmed = validateName(data.name);
    if (!trimmed) {
      this.send(ws, {
        screen: 7 /* c1TypeInYourNameAndPickAnEmojiForYourPicture */,
        error: "Please pick a usable name",
        name: "",
        emoji: "",
        sharedState: gameState.getSharedState()
      });
      return;
    }
    const existing = gameState.findUserName(trimmed);
    if (!existing && gameState.getPhase() !== "collectingUsers" /* CollectingUsers */) {
      this.addSpectator(ws, gameState, trimmed);
      return;
    }
    const canonical = existing ?? trimmed;
    if (!existing) {
      gameState.addUser(canonical, String(data.emoji ?? "\u{1F60A}"));
    }
    ws.serializeAttachment({ role: "player", name: canonical });
    this.sendToHost({
      sharedState: gameState.getSharedState(),
      name: "<host>",
      screen: this.getHostScreen(gameState)
    });
    this.sendPlayerToCorrectScreen(gameState, canonical, ws);
  }
  onStartGame(ws, gameState) {
    const phase = gameState.getPhase();
    if (phase !== "collectingUsers" /* CollectingUsers */) {
      this.sendHostToCorrectScreen(gameState, ws);
      return;
    }
    if (gameState.getUserNames().length < 2) {
      this.sendToHost({
        screen: 1 /* h1CollectingUsers */,
        text: "Need at least 2 players to start!"
      });
      return;
    }
    gameState.touch();
    gameState.resetForNewGame();
    this.beginAnsweringRound(gameState, "Truthfully answer the questions on your device.", this.roundSeconds());
  }
  onQuestionAnswer(ws, gameState, data) {
    const name = String(data.name ?? "");
    if (gameState.getPhase() !== "answeringQuestions" /* AnsweringQuestions */) {
      this.sendPlayerToCorrectScreen(gameState, name, ws);
      return;
    }
    const assigned = gameState.getAssignedQuestion(name);
    gameState.addAnswer(name, assigned?.question ?? String(data.question ?? ""), String(data.answer ?? ""));
    if (gameState.allUsersHaveAnswered()) {
      this.advanceToNextLieRoundOrEnd(gameState);
    } else {
      this.sendToUserSockets(name, {
        screen: 8 /* c2WaitingScreenJustWhateverText */,
        text: "Thank you for your answer! Please wait for others to finish..."
      });
    }
  }
  onSubmitLie(ws, gameState, data) {
    const name = String(data.name ?? "");
    if (gameState.getPhase() !== "submittingLies" /* SubmittingLies */) {
      this.sendPlayerToCorrectScreen(gameState, name, ws);
      return;
    }
    const currentTarget = gameState.getCurrentLieTargetPlayer();
    if (data.targetPlayer !== currentTarget) {
      this.sendPlayerToCorrectScreen(gameState, name, ws);
      return;
    }
    gameState.addLie(currentTarget, name, String(data.lie ?? ""));
    if (gameState.allLiesSubmittedForTarget(currentTarget)) {
      this.beginVoting(gameState, currentTarget);
    } else {
      this.sendToUserSockets(name, {
        screen: 8 /* c2WaitingScreenJustWhateverText */,
        text: "Lie submitted! Waiting for others to submit their lies..."
      });
    }
  }
  onVoteOnLie(ws, gameState, data) {
    const name = String(data.name ?? "");
    if (gameState.getPhase() !== "votingOnLies" /* VotingOnLies */) {
      this.sendPlayerToCorrectScreen(gameState, name, ws);
      return;
    }
    const currentTarget = gameState.getCurrentLieTargetPlayer();
    if (data.targetPlayer !== currentTarget) {
      this.sendPlayerToCorrectScreen(gameState, name, ws);
      return;
    }
    if (data.selectedUsername === name) {
      this.sendPlayerToCorrectScreen(gameState, name, ws);
      return;
    }
    gameState.addVote(currentTarget, name, String(data.selectedUsername ?? ""));
    if (gameState.allVotesSubmittedForTarget(currentTarget)) {
      this.showLieResults(gameState, currentTarget);
    } else {
      this.sendToUserSockets(name, {
        screen: 8 /* c2WaitingScreenJustWhateverText */,
        text: "Vote submitted! Waiting for others to vote..."
      });
    }
  }
  onContinueFromResults(gameState) {
    if (gameState.getPhase() === "showingLieResults" /* ShowingLieResults */) {
      gameState.touch();
      this.showPoints(gameState);
    }
  }
  onContinueFromScores(gameState) {
    if (gameState.getPhase() === "showingPoints" /* ShowingPoints */) {
      gameState.touch();
      this.advanceToNextLieRoundOrEnd(gameState);
    }
  }
  // Nothing in the current client emits this; it stays because the host-exclusion
  // test drives it and depends on its host/player screen split (CNG-034).
  onEndGame(gameState) {
    if (gameState.getPhase() === "gameOver" /* GameOver */) return;
    gameState.stopTimer();
    gameState.setPhase("gameOver" /* GameOver */);
    const leaderboard = gameState.getLeaderboard();
    const winner = leaderboard.length > 0 ? leaderboard[0] : null;
    this.sendToHost({
      screen: 6 /* h6ShowTheWinner */,
      text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : "No winner",
      leaderboard
    });
    this.sendToPlayers({
      screen: 8 /* c2WaitingScreenJustWhateverText */,
      text: winner ? `Game Over! Winner: ${winner.name} with ${winner.points} points!` : "Game Over!"
    });
  }
  // Fallback only (D6): the server's alarm owns expiry; the host's browser countdown
  // is a second chance, still token-guarded against stale tabs (CNG-003).
  onTimerExpired(gameState, data) {
    const currentToken = gameState.getPhaseToken();
    if (data.phaseToken !== currentToken) {
      console.log(`Ignoring stale timerExpired (token ${data.phaseToken}, current ${currentToken})`);
      return;
    }
    this.handleTimerExpiry();
  }
  // --- spectators (CNG-031/037 ruling) ---
  addSpectator(ws, gameState, name) {
    ws.serializeAttachment({ role: "spectator", name });
    this.sendSpectatorToCurrentScreen(gameState, ws, name);
  }
  sendSpectatorToCurrentScreen(gameState, ws, name) {
    const phase = gameState.getPhase();
    const targetPlayer = gameState.getCurrentLieTargetPlayer();
    const base = { sharedState: gameState.getSharedState(), name };
    switch (phase) {
      case "showingLieResults" /* ShowingLieResults */:
        this.send(ws, {
          ...base,
          screen: 3 /* h3ShowTheLiesAndTruths */,
          text: "Results for " + targetPlayer + "!",
          answers: this.buildResults(gameState, targetPlayer),
          targetPlayer
        });
        break;
      case "showingPoints" /* ShowingPoints */:
        this.send(ws, {
          ...base,
          screen: 5 /* h5ShowThePointsForTheRound */,
          text: "Points for this round!",
          leaderboard: gameState.getLeaderboard()
        });
        break;
      case "gameOver" /* GameOver */:
        this.send(ws, {
          ...base,
          screen: 6 /* h6ShowTheWinner */,
          text: "Game Over!",
          leaderboard: gameState.getLeaderboard()
        });
        break;
      default:
        this.send(ws, {
          ...base,
          screen: 8 /* c2WaitingScreenJustWhateverText */,
          text: "You're watching this game. You'll see the results as they come in - you can join the board when the next game starts."
        });
    }
  }
  // --- resyncs (the "single source of truth for where you belong") ---
  getHostScreen(gameState) {
    switch (gameState.getPhase()) {
      case "collectingUsers" /* CollectingUsers */:
        return 1 /* h1CollectingUsers */;
      case "answeringQuestions" /* AnsweringQuestions */:
      case "submittingLies" /* SubmittingLies */:
      case "votingOnLies" /* VotingOnLies */:
        return 2 /* h2InformationScreenWithTimer */;
      case "showingLieResults" /* ShowingLieResults */:
        return 3 /* h3ShowTheLiesAndTruths */;
      case "showingPoints" /* ShowingPoints */:
        return 5 /* h5ShowThePointsForTheRound */;
      case "gameOver" /* GameOver */:
        return 6 /* h6ShowTheWinner */;
      default:
        return 1 /* h1CollectingUsers */;
    }
  }
  sendHostToCorrectScreen(gameState, ws) {
    const phase = gameState.getPhase();
    const targetPlayer = gameState.getCurrentLieTargetPlayer();
    const baseState = { sharedState: gameState.getSharedState(), name: "<host>" };
    const sendState = /* @__PURE__ */ __name((state) => {
      if (ws) {
        this.send(ws, this.withPhaseToken(state));
      } else {
        this.sendToHost(state);
      }
    }, "sendState");
    switch (phase) {
      case "answeringQuestions" /* AnsweringQuestions */:
        sendState({
          ...baseState,
          screen: 2 /* h2InformationScreenWithTimer */,
          text: "Truthfully answer the questions on your device.",
          timerValue: gameState.getTimerValue() || 60
        });
        break;
      case "submittingLies" /* SubmittingLies */:
        sendState({
          ...baseState,
          screen: 2 /* h2InformationScreenWithTimer */,
          text: targetPlayer ? `Now submitting lies for ${targetPlayer}!` : "Submitting lies...",
          timerValue: gameState.getTimerValue() || 60
        });
        break;
      case "votingOnLies" /* VotingOnLies */:
        sendState({
          ...baseState,
          screen: 2 /* h2InformationScreenWithTimer */,
          text: targetPlayer ? `Voting on lies for ${targetPlayer}!` : "Voting...",
          timerValue: gameState.getTimerValue() || 60
        });
        break;
      case "showingLieResults" /* ShowingLieResults */:
        if (targetPlayer && gameState.getTruthForPlayer(targetPlayer)) {
          sendState({
            ...baseState,
            screen: 3 /* h3ShowTheLiesAndTruths */,
            text: `Results for ${targetPlayer}!`,
            answers: this.buildResults(gameState, targetPlayer)
          });
        } else {
          sendState({ ...baseState, screen: 3 /* h3ShowTheLiesAndTruths */ });
        }
        break;
      case "showingPoints" /* ShowingPoints */:
        sendState({
          ...baseState,
          screen: 5 /* h5ShowThePointsForTheRound */,
          text: targetPlayer ? `Points for ${targetPlayer}'s round!` : "Points!",
          leaderboard: gameState.getLeaderboard()
        });
        break;
      case "gameOver" /* GameOver */: {
        const leaderboard = gameState.getLeaderboard();
        const winner = leaderboard[0];
        sendState({
          ...baseState,
          screen: 6 /* h6ShowTheWinner */,
          text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : "Game Over!",
          leaderboard
        });
        break;
      }
      default:
        sendState({ ...baseState, screen: 1 /* h1CollectingUsers */, text: "" });
    }
  }
  sendPlayerToCorrectScreen(gameState, playerName, ws) {
    const phase = gameState.getPhase();
    const targetPlayer = gameState.getCurrentLieTargetPlayer();
    const baseState = {
      sharedState: gameState.getSharedState(),
      name: playerName
    };
    if (gameState.getSharedState().users[playerName]) {
      baseState.emoji = gameState.getSharedState().users[playerName].emoji;
    }
    let screenToSend = 8 /* c2WaitingScreenJustWhateverText */;
    let textToSend = "Please wait...";
    let questionText = "";
    let instructionText = "";
    let answers = [];
    switch (phase) {
      case "collectingUsers" /* CollectingUsers */:
        textToSend = "Please wait for the host to start the game...";
        break;
      case "answeringQuestions" /* AnsweringQuestions */:
        if (gameState.getTruthForPlayer(playerName)) {
          textToSend = "Your answer has been submitted! Please wait for others...";
        } else {
          const questionObj = gameState.getOrAssignQuestion(playerName);
          screenToSend = 9 /* c3SubmitTruth */;
          questionText = questionObj?.question || "";
          instructionText = "Please answer this question truthfully about yourself";
          textToSend = questionObj ? `Please answer this question:

${questionObj.question}` : "No question available";
        }
        break;
      case "submittingLies" /* SubmittingLies */:
        if (targetPlayer === playerName) {
          textToSend = "Your truth has been submitted! Now others will submit lies for your question.";
        } else {
          const truth = gameState.getTruthForPlayer(targetPlayer || "");
          const alreadyLied = gameState.getLiesForPlayer(targetPlayer || "").some((l) => l.username === playerName);
          if (alreadyLied) {
            textToSend = "Your lie has been submitted! Please wait for others...";
          } else {
            screenToSend = 11 /* c5SubmitLie */;
            questionText = truth?.question || "";
            instructionText = `Write a fooling answer for this question about ${targetPlayer}`;
            textToSend = truth ? `Write a LIE for this question about ${targetPlayer}:

${truth.question}` : "No question available";
          }
        }
        break;
      case "votingOnLies" /* VotingOnLies */: {
        const alreadyVoted = gameState.getVotesForPlayer(targetPlayer || "").some((v) => v.voter === playerName);
        if (targetPlayer === playerName) {
          textToSend = "Others are voting on your question!";
        } else if (alreadyVoted) {
          textToSend = "Your vote has been submitted! Please wait for others...";
        } else {
          answers = gameState.getBallot() ?? shuffleArray(
            this.buildResults(gameState, targetPlayer || "").map(
              ({ voters, ...a }) => a
            )
          );
          screenToSend = 10 /* c4PickTheBestAnswerOutOfAList */;
          textToSend = "Vote for the TRUTH!";
        }
        break;
      }
      case "showingLieResults" /* ShowingLieResults */:
        if (targetPlayer && gameState.getTruthForPlayer(targetPlayer)) {
          answers = this.buildResults(gameState, targetPlayer);
        }
        screenToSend = 3 /* h3ShowTheLiesAndTruths */;
        textToSend = targetPlayer ? `Results for ${targetPlayer}!` : "Results";
        break;
      case "showingPoints" /* ShowingPoints */:
        textToSend = "Please wait while results are being shown...";
        break;
      case "gameOver" /* GameOver */:
        screenToSend = 6 /* h6ShowTheWinner */;
        textToSend = "The game has ended!";
        break;
    }
    const emitState = {
      ...baseState,
      screen: screenToSend,
      text: textToSend,
      question: questionText,
      instructionText,
      answers,
      leaderboard: phase === "gameOver" /* GameOver */ || phase === "showingPoints" /* ShowingPoints */ ? gameState.getLeaderboard() : void 0
    };
    if (targetPlayer) {
      emitState.targetPlayer = targetPlayer;
    }
    this.send(ws, emitState);
  }
  // --- phase transitions (one method each; CNG-023 discipline) ---
  buildResults(gameState, targetPlayer) {
    const truth = gameState.getTruthForPlayer(targetPlayer);
    const lies = gameState.getLiesForPlayer(targetPlayer);
    const votes = gameState.getVotesForPlayer(targetPlayer);
    const voters = {};
    votes.forEach((v) => {
      if (!voters[v.selectedUsername]) voters[v.selectedUsername] = [];
      voters[v.selectedUsername].push(v.voter);
    });
    return [
      { username: targetPlayer, answer: truth?.answer || "", isTruth: true },
      ...lies.map((l) => ({ username: l.username, answer: l.lie, isTruth: false }))
    ].map((a) => ({ ...a, voters: voters[a.username] || [] }));
  }
  beginAnsweringRound(gameState, hostText, seconds) {
    gameState.setPhase("answeringQuestions" /* AnsweringQuestions */);
    gameState.startTimer(seconds);
    this.sendToHost({
      screen: 2 /* h2InformationScreenWithTimer */,
      text: hostText,
      timerValue: seconds
    });
    this.sendToSpectators({
      screen: 8 /* c2WaitingScreenJustWhateverText */,
      text: "Players are answering their questions..."
    });
    gameState.getUserNames().forEach((username) => {
      const questionObj = gameState.assignQuestion(username);
      if (!questionObj) return;
      this.sendToUserSockets(username, {
        screen: 9 /* c3SubmitTruth */,
        text: `Please truthfully answer this question:

${questionObj.question}`,
        question: questionObj.question,
        questionIndex: questionObj.index,
        instructionText: "Please answer this question truthfully about yourself"
      });
    });
  }
  restartRound(gameState, hostText) {
    gameState.clearAnswers();
    gameState.resetLieData();
    this.beginAnsweringRound(gameState, hostText, this.restartSeconds());
  }
  beginLieRound(gameState, targetPlayer) {
    gameState.setCurrentLieTargetPlayer(targetPlayer);
    gameState.setPhase("submittingLies" /* SubmittingLies */);
    gameState.startTimer(this.roundSeconds());
    const truth = gameState.getTruthForPlayer(targetPlayer);
    this.sendToHost({
      screen: 2 /* h2InformationScreenWithTimer */,
      text: "Now submitting lies for " + targetPlayer + "!",
      timerValue: this.roundSeconds()
    });
    this.sendToSpectators({
      screen: 8 /* c2WaitingScreenJustWhateverText */,
      text: "Players are writing lies about " + targetPlayer + "..."
    });
    gameState.getUserNames().forEach((username) => {
      if (username === targetPlayer) {
        this.sendToUserSockets(username, {
          screen: 8 /* c2WaitingScreenJustWhateverText */,
          text: "Your truth has been submitted! Now others will submit lies for your question.",
          targetPlayer
        });
      } else {
        this.sendToUserSockets(username, {
          screen: 11 /* c5SubmitLie */,
          text: "Write a LIE for this question about " + targetPlayer + ":\n\n" + (truth?.question || ""),
          question: truth?.question || "",
          targetPlayer,
          instructionText: `Write a fooling answer for this question about ${targetPlayer}`
        });
      }
    });
  }
  beginVoting(gameState, targetPlayer) {
    gameState.setPhase("votingOnLies" /* VotingOnLies */);
    gameState.startTimer(this.roundSeconds());
    const truth = gameState.getTruthForPlayer(targetPlayer);
    const lies = gameState.getLiesForPlayer(targetPlayer);
    const answers = shuffleArray([
      { username: targetPlayer, answer: truth?.answer || "", isTruth: true },
      ...lies.map((l) => ({ username: l.username, answer: l.lie, isTruth: false }))
    ]);
    gameState.setBallot(answers);
    this.sendToHost({
      screen: 2 /* h2InformationScreenWithTimer */,
      text: "Voting on lies for " + targetPlayer + "!",
      timerValue: this.roundSeconds(),
      answers
    });
    this.sendToSpectators({
      screen: 8 /* c2WaitingScreenJustWhateverText */,
      text: "Players are voting on " + targetPlayer + "'s answers..."
    });
    gameState.getUserNames().forEach((username) => {
      if (username === targetPlayer) {
        this.sendToUserSockets(username, {
          screen: 8 /* c2WaitingScreenJustWhateverText */,
          text: "Others are voting on your question!",
          targetPlayer
        });
      } else {
        this.sendToUserSockets(username, {
          screen: 10 /* c4PickTheBestAnswerOutOfAList */,
          text: "Which one is the TRUTH about " + targetPlayer + "?",
          answers,
          targetPlayer
        });
      }
    });
  }
  showLieResults(gameState, targetPlayer) {
    gameState.calculateLiePoints(targetPlayer);
    gameState.setPhase("showingLieResults" /* ShowingLieResults */);
    gameState.startTimer(this.backstopSeconds());
    const state = {
      screen: 3 /* h3ShowTheLiesAndTruths */,
      text: "Results for " + targetPlayer + "!",
      answers: this.buildResults(gameState, targetPlayer),
      targetPlayer
    };
    this.sendToHost(state);
    this.sendToSpectators(state);
    gameState.getUserNames().forEach((username) => this.sendToUserSockets(username, state));
  }
  showPoints(gameState) {
    gameState.setPhase("showingPoints" /* ShowingPoints */);
    gameState.startTimer(this.backstopSeconds());
    const state = {
      screen: 5 /* h5ShowThePointsForTheRound */,
      text: "Points for this round!",
      leaderboard: gameState.getLeaderboard()
    };
    this.sendToHost(state);
    this.sendToPlayers(state);
  }
  advanceToNextLieRoundOrEnd(gameState) {
    const next = gameState.getNextLieTargetPlayerSkippingMissing();
    if (next) {
      this.beginLieRound(gameState, next);
    } else {
      this.endGameShowingWinner(gameState);
    }
  }
  endGameShowingWinner(gameState) {
    gameState.stopTimer();
    gameState.setPhase("gameOver" /* GameOver */);
    const leaderboard = gameState.getLeaderboard();
    const winner = leaderboard[0];
    const state = {
      screen: 6 /* h6ShowTheWinner */,
      text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : "Game Over!",
      leaderboard
    };
    this.sendToHost(state);
    this.sendToPlayers(state);
  }
  /**
   * What to do when a round runs out of time. Reached from the alarm (the
   * authoritative clock) and from the host's token-guarded fallback; both run this
   * one method so they cannot drift (CNG-023's lesson).
   */
  handleTimerExpiry() {
    const gameState = this.gameState;
    if (!gameState) return;
    const phase = gameState.getPhase();
    const targetPlayer = gameState.getCurrentLieTargetPlayer();
    switch (phase) {
      case "answeringQuestions" /* AnsweringQuestions */: {
        const nextTarget = gameState.getNextLieTargetPlayerSkippingMissing();
        if (nextTarget) {
          this.beginLieRound(gameState, nextTarget);
        } else {
          this.restartRound(gameState, "No answers submitted! Please answer the questions.");
        }
        break;
      }
      case "submittingLies" /* SubmittingLies */: {
        if (!targetPlayer) break;
        if (gameState.getLiesForPlayer(targetPlayer).length > 0) {
          this.beginVoting(gameState, targetPlayer);
        } else if (targetPlayer === gameState.getUserNames()[0]) {
          this.restartRound(gameState, "No lies submitted! Starting fresh round.");
        } else {
          this.advanceToNextLieRoundOrEnd(gameState);
        }
        break;
      }
      case "votingOnLies" /* VotingOnLies */: {
        if (!targetPlayer) break;
        this.showLieResults(gameState, targetPlayer);
        break;
      }
      // The screens the host normally drives; reaching these means nobody is
      // driving (CNG-028).
      case "showingLieResults" /* ShowingLieResults */:
        this.showPoints(gameState);
        break;
      case "showingPoints" /* ShowingPoints */:
        this.advanceToNextLieRoundOrEnd(gameState);
        break;
      default:
        gameState.stopTimer();
    }
  }
};

// worker/index.ts
var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateGameCode() {
  return Array.from(
    { length: 5 },
    () => CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
  ).join("");
}
__name(generateGameCode, "generateGameCode");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/newGame" && request.method === "POST") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateGameCode();
        const stub = env.GAME.getByName(code);
        const created = await stub.createGame(code);
        if (created) {
          return Response.json({ code });
        }
      }
      return Response.json({ error: "could not allocate a game code" }, { status: 503 });
    }
    const wsMatch = url.pathname.match(/^\/ws\/([A-Za-z0-9]{1,10})$/);
    if (wsMatch) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected a WebSocket upgrade", { status: 426 });
      }
      const code = wsMatch[1].toUpperCase();
      const stub = env.GAME.getByName(code);
      return stub.fetch(request);
    }
    return new Response("not found", { status: 404 });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-I4mfJp/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-I4mfJp/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  GameDurableObject,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
