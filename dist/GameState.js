"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = exports.GamePhase = void 0;
var GamePhase;
(function (GamePhase) {
    GamePhase["CollectingUsers"] = "collectingUsers";
    GamePhase["AnsweringQuestions"] = "answeringQuestions";
    GamePhase["SubmittingLies"] = "submittingLies";
    GamePhase["VotingOnLies"] = "votingOnLies";
    GamePhase["ShowingLieResults"] = "showingLieResults";
    GamePhase["ShowingPoints"] = "showingPoints";
    GamePhase["GameOver"] = "gameOver";
})(GamePhase || (exports.GamePhase = GamePhase = {}));
class GameState {
    constructor(gameCode) {
        // Question management
        this.questions = [
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
            "If I could be proficient in any language, which one would it be?",
        ];
        this.sharedState = {
            users: {},
            code: gameCode
        };
        this.usedQuestionIndexes = [];
        this.assignedQuestions = {};
        this.userAnswers = {};
        this.currentPhase = GamePhase.CollectingUsers;
        this.currentQuestionIndex = 0;
        this.timerValue = 0;
        this.timerInterval = null;
        this.timerStartTime = 0;
        this.currentLieTargetPlayer = '';
        this.lies = {};
        this.votes = {};
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
    /** Mark the game as alive. Anything idle long enough gets swept (CNG-016). */
    touch() {
        this.lastActivity = Date.now();
    }
    getLastActivity() {
        return this.lastActivity;
    }
    // Timer management
    setTimerValue(value) {
        this.newSegment();
        this.timerValue = value;
        this.timerStartTime = Date.now();
    }
    getTimerStartTime() {
        return this.timerStartTime;
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
    getTimerValue() {
        return this.timerValue;
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
        return Object.keys(this.sharedState.users).filter(name => name !== '<host>');
    }
    userExists(name) {
        return name in this.sharedState.users;
    }
    // Points
    addPoints(userName, points) {
        if (this.sharedState.users[userName]) {
            this.sharedState.users[userName].points += points;
        }
    }
    getPoints(userName) {
        var _a, _b;
        return (_b = (_a = this.sharedState.users[userName]) === null || _a === void 0 ? void 0 : _a.points) !== null && _b !== void 0 ? _b : 0;
    }
    getNextQuestion() {
        const availableQuestions = this.questions.filter((_, index) => !this.usedQuestionIndexes.includes(index));
        if (availableQuestions.length === 0) {
            return null;
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
            isTruth: true // Their own answer is always the truth
        };
    }
    // Clears a round's Q&A. Assignments go with the answers - every caller restarts the
    // round and reassigns immediately, so a stale assignment must not survive.
    clearAnswers() {
        this.userAnswers = {};
        this.assignedQuestions = {};
    }
    // Phase management
    setPhase(phase) {
        this.touch();
        this.newSegment();
        this.currentPhase = phase;
    }
    // Timer management
    startTimer(seconds, onComplete) {
        this.timerValue = seconds;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        this.timerInterval = setInterval(() => {
            this.timerValue--;
            if (this.timerValue <= 0) {
                this.stopTimer();
                onComplete();
            }
        }, 1000);
    }
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    // Check if all users have submitted answers
    allUsersHaveAnswered() {
        const userNames = this.getUserNames();
        return userNames.every(name => name in this.userAnswers);
    }
    // Get leaderboard sorted by points
    getLeaderboard() {
        return Object.values(this.sharedState.users)
            .filter(user => user.name !== '<host>')
            .sort((a, b) => b.points - a.points);
    }
    // === LIE PHASE METHODS ===
    // Get the next player to target for lies
    getCurrentLieTargetPlayer() {
        return this.currentLieTargetPlayer;
    }
    setCurrentLieTargetPlayer(player) {
        // A new target is a new round even if the phase name doesn't change.
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
        const existing = this.lies[targetUsername].find(l => l.username === lieUsername);
        if (existing) {
            existing.lie = lie;
        }
        else {
            this.lies[targetUsername].push({ username: lieUsername, lie });
        }
    }
    // Get all lies for a target player
    getLiesForPlayer(targetUsername) {
        return this.lies[targetUsername] || [];
    }
    // Check if all OTHER players have submitted lies for target
    allLiesSubmittedForTarget(targetUsername) {
        var _a;
        const userNames = this.getUserNames();
        // All players except the target should submit a lie
        const otherPlayers = userNames.filter(name => name !== targetUsername);
        const submittedLiers = ((_a = this.lies[targetUsername]) === null || _a === void 0 ? void 0 : _a.map(l => l.username)) || [];
        return otherPlayers.every(name => submittedLiers.includes(name));
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
        const existing = this.votes[targetUsername].find(v => v.voter === voter);
        if (existing) {
            existing.selectedUsername = selectedUsername;
        }
        else {
            this.votes[targetUsername].push({ voter, selectedUsername });
        }
    }
    // Get all votes for a target
    getVotesForPlayer(targetUsername) {
        return this.votes[targetUsername] || [];
    }
    // Check if all players (except target) have voted
    allVotesSubmittedForTarget(targetUsername) {
        var _a;
        const userNames = this.getUserNames();
        // All players except the target and the truth-owner should vote
        const voters = userNames.filter(name => name !== targetUsername);
        const votedPlayers = ((_a = this.votes[targetUsername]) === null || _a === void 0 ? void 0 : _a.map(v => v.voter)) || [];
        return voters.every(name => votedPlayers.includes(name));
    }
    // Calculate and award points for lie round
    calculateLiePoints(targetUsername) {
        const truth = this.userAnswers[targetUsername];
        const lies = this.lies[targetUsername] || [];
        const votes = this.votes[targetUsername] || [];
        if (!truth)
            return;
        // Build list of all answers (truth + lies) with their authors
        const allAnswers = [
            { username: targetUsername, answer: truth.answer, isTruth: true },
            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
        ];
        // Count votes for each answer
        const voteCounts = {};
        votes.forEach(v => {
            voteCounts[v.selectedUsername] = (voteCounts[v.selectedUsername] || 0) + 1;
        });
        // Award points
        allAnswers.forEach(answer => {
            const numVotes = voteCounts[answer.username] || 0;
            if (answer.isTruth) {
                // Truth owner gets 1000 per person who guessed correctly
                if (numVotes > 0) {
                    this.addPoints(answer.username, numVotes * 1000);
                }
            }
            else {
                // Lie creator gets 500 per person they fooled
                if (numVotes > 0) {
                    this.addPoints(answer.username, numVotes * 500);
                }
            }
        });
        // Voters who picked truth get 1000 each
        votes.forEach(v => {
            if (v.selectedUsername === targetUsername) {
                this.addPoints(v.voter, 1000);
            }
        });
    }
    // Get next player for lie round, skipping players without a truth
    getNextLieTargetPlayerSkippingMissing() {
        const userNames = this.getUserNames();
        // If no current target, start from the beginning
        if (!this.currentLieTargetPlayer) {
            for (const player of userNames) {
                if (this.userAnswers[player]) {
                    return player;
                }
            }
            return null;
        }
        const currentIndex = userNames.indexOf(this.currentLieTargetPlayer);
        // First, try to find players AFTER the current one
        for (let i = currentIndex + 1; i < userNames.length; i++) {
            const player = userNames[i];
            if (this.userAnswers[player]) {
                return player;
            }
        }
        // If no more after current, we're done (don't wrap around)
        return null;
    }
    // Reset lies and votes for new game
    resetLieData() {
        this.lies = {};
        this.votes = {};
        this.currentLieTargetPlayer = '';
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
            version: GameState.SAVE_VERSION,
            sharedState: this.sharedState,
            usedQuestionIndexes: this.usedQuestionIndexes,
            assignedQuestions: this.assignedQuestions,
            userAnswers: this.userAnswers,
            currentPhase: this.currentPhase,
            currentQuestionIndex: this.currentQuestionIndex,
            timerValue: this.timerValue,
            currentLieTargetPlayer: this.currentLieTargetPlayer,
            lies: this.lies,
            votes: this.votes,
            lastActivity: this.lastActivity,
            phaseToken: this.phaseToken
        };
    }
    /**
     * Load from saved state. Returns null for anything we can't faithfully restore -
     * the caller drops it. Loading a save we only half understand is worse than losing
     * it: it produces a game that looks playable and isn't.
     */
    static fromJSON(data, gameCode) {
        if (!data || typeof data !== 'object')
            return null;
        if (data.version !== GameState.SAVE_VERSION)
            return null;
        if (!data.sharedState || typeof data.sharedState.users !== 'object')
            return null;
        const gameState = new GameState(gameCode);
        gameState.sharedState = data.sharedState;
        gameState.sharedState.code = gameCode;
        gameState.usedQuestionIndexes = data.usedQuestionIndexes || [];
        gameState.assignedQuestions = data.assignedQuestions || {};
        gameState.userAnswers = data.userAnswers || {};
        gameState.currentPhase = data.currentPhase || GamePhase.CollectingUsers;
        gameState.currentQuestionIndex = data.currentQuestionIndex || 0;
        gameState.timerValue = data.timerValue || 0;
        gameState.currentLieTargetPlayer = data.currentLieTargetPlayer || '';
        gameState.lies = data.lies || {};
        gameState.votes = data.votes || {};
        gameState.lastActivity = data.lastActivity || Date.now();
        gameState.phaseToken = data.phaseToken || 0;
        return gameState;
    }
}
exports.GameState = GameState;
/**
 * Bump when a change makes older saves unreadable. fromJSON drops anything that
 * doesn't match rather than loading it into a shape the code no longer expects.
 */
GameState.SAVE_VERSION = 2;
//# sourceMappingURL=GameState.js.map