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
        this.userAnswers = {};
        this.currentPhase = GamePhase.CollectingUsers;
        this.currentQuestionIndex = 0;
        this.timerValue = 0;
        this.timerInterval = null;
        this.timerStartTime = 0;
        this.currentLieTargetPlayer = '';
        this.lies = {};
        this.votes = {};
    }
    // Timer management
    setTimerValue(value) {
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
    // Answer management
    addAnswer(username, question, answer) {
        this.userAnswers[username] = {
            question,
            answer,
            isTruth: true // Their own answer is always the truth
        };
    }
    getAllAnswers() {
        return Object.values(this.userAnswers);
    }
    getAllAnswersWithUsernames() {
        return Object.entries(this.userAnswers).map(([username, answer]) => ({
            username,
            answer
        }));
    }
    clearAnswers() {
        this.userAnswers = {};
    }
    // Phase management
    setPhase(phase) {
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
        this.currentLieTargetPlayer = player;
    }
    // Get the truth answer for a player
    getTruthForPlayer(username) {
        return this.userAnswers[username] || null;
    }
    // Add a lie for the target player
    addLie(targetUsername, lieUsername, lie) {
        if (!this.lies[targetUsername]) {
            this.lies[targetUsername] = [];
        }
        this.lies[targetUsername].push({ username: lieUsername, lie });
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
    // Add a vote
    addVote(targetUsername, voter, selectedUsername) {
        if (!this.votes[targetUsername]) {
            this.votes[targetUsername] = [];
        }
        this.votes[targetUsername].push({ voter, selectedUsername });
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
    // Get next player for lie round, or null if done
    getNextLieTargetPlayer() {
        const userNames = this.getUserNames();
        const currentIndex = userNames.indexOf(this.currentLieTargetPlayer);
        if (currentIndex === -1) {
            // First player
            return userNames.length > 0 ? userNames[0] : null;
        }
        const nextIndex = currentIndex + 1;
        return nextIndex < userNames.length ? userNames[nextIndex] : null;
    }
    // Check if all lie rounds are done
    isLiePhaseDone() {
        return this.getNextLieTargetPlayer() === null && this.currentLieTargetPlayer !== '';
    }
    // Reset lies and votes for new game
    resetLieData() {
        this.lies = {};
        this.votes = {};
        this.currentLieTargetPlayer = '';
    }
    // Serialize for saving
    toJSON() {
        return {
            sharedState: this.sharedState,
            usedQuestionIndexes: this.usedQuestionIndexes,
            currentPhase: this.currentPhase,
            currentQuestionIndex: this.currentQuestionIndex
        };
    }
    // Load from saved state
    static fromJSON(data, gameCode) {
        const gameState = new GameState(gameCode);
        gameState.sharedState = data.sharedState;
        gameState.usedQuestionIndexes = data.usedQuestionIndexes || [];
        gameState.currentPhase = data.currentPhase || GamePhase.CollectingUsers;
        gameState.currentQuestionIndex = data.currentQuestionIndex || 0;
        return gameState;
    }
}
exports.GameState = GameState;
//# sourceMappingURL=GameState.js.map