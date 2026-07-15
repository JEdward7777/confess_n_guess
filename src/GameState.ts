import { UserPoints, SharedState, Screens } from './IncludeStuff';

export enum GamePhase {
    CollectingUsers = 'collectingUsers',
    AnsweringQuestions = 'answeringQuestions',
    SubmittingLies = 'submittingLies',
    VotingOnLies = 'votingOnLies',
    ShowingLieResults = 'showingLieResults',
    ShowingPoints = 'showingPoints',
    GameOver = 'gameOver'
}

export interface UserAnswer {
    question: string;
    answer: string;
    isTruth: boolean;
}

export interface Lie {
    username: string;
    lie: string;
}

export interface Vote {
    voter: string;
    selectedUsername: string;
}

export class GameState {
    /**
     * Bump when a change makes older saves unreadable. fromJSON drops anything that
     * doesn't match rather than loading it into a shape the code no longer expects.
     */
    static readonly SAVE_VERSION = 2;

    private lastActivity: number;
    // Identifies the current timed segment of the game. Bumped whenever the game moves
    // on in a way that invalidates an in-flight timer. A timerExpired carrying a stale
    // token is a timer for a segment that's already over, and is ignored (CNG-003).
    private phaseToken: number;
    private sharedState: SharedState;
    private usedQuestionIndexes: number[];
    // Which question each player was actually handed. Without this the server has no
    // record of the assignment and a resync would draw a fresh one (CNG-006).
    private assignedQuestions: { [username: string]: { question: string; index: number } };
    private userAnswers: { [username: string]: UserAnswer };
    private currentPhase: GamePhase;
    private currentQuestionIndex: number;
    private timerValue: number;
    private timerInterval: NodeJS.Timeout | null;
    // Timer tracking to prevent stale timer events
    private timerStartTime: number;
    // Lie phase tracking
    private currentLieTargetPlayer: string;
    private lies: { [targetUsername: string]: Lie[] };
    private votes: { [targetUsername: string]: Vote[] };

    constructor(gameCode: string) {
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
    getPhaseToken(): number {
        return this.phaseToken;
    }

    private newSegment(): void {
        this.phaseToken++;
    }

    /** Mark the game as alive. Anything idle long enough gets swept (CNG-016). */
    touch(): void {
        this.lastActivity = Date.now();
    }

    getLastActivity(): number {
        return this.lastActivity;
    }

    // Timer management
    setTimerValue(value: number): void {
        this.newSegment();
        this.timerValue = value;
        this.timerStartTime = Date.now();
    }

    getTimerStartTime(): number {
        return this.timerStartTime;
    }

    // Getters
    getSharedState(): SharedState {
        return this.sharedState;
    }

    getGameCode(): string {
        return this.sharedState.code;
    }

    getPhase(): GamePhase {
        return this.currentPhase;
    }

    getUserAnswers(): { [username: string]: UserAnswer } {
        return this.userAnswers;
    }

    getTimerValue(): number {
        return this.timerValue;
    }

    // User management
    addUser(name: string, emoji: string): void {
        this.touch();
        this.sharedState.users[name] = {
            name,
            emoji,
            points: 0
        };
    }

    removeUser(name: string): void {
        delete this.sharedState.users[name];
    }

    getUsers(): { [key: string]: UserPoints } {
        return this.sharedState.users;
    }

    getUserNames(): string[] {
        return Object.keys(this.sharedState.users).filter(name => name !== '<host>');
    }

    userExists(name: string): boolean {
        return name in this.sharedState.users;
    }

    // Points
    addPoints(userName: string, points: number): void {
        if (this.sharedState.users[userName]) {
            this.sharedState.users[userName].points += points;
        }
    }

    getPoints(userName: string): number {
        return this.sharedState.users[userName]?.points ?? 0;
    }

    // Question management
    private questions: string[] = [
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

    getNextQuestion(): { question: string; index: number } | null {
        const availableQuestions = this.questions.filter((_, index) => 
            !this.usedQuestionIndexes.includes(index)
        );
        
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
    assignQuestion(username: string): { question: string; index: number } | null {
        const questionObj = this.getNextQuestion();
        if (questionObj) {
            this.assignedQuestions[username] = questionObj;
        }
        return questionObj;
    }

    /** What this player was handed, or null if they haven't been assigned one. */
    getAssignedQuestion(username: string): { question: string; index: number } | null {
        return this.assignedQuestions[username] || null;
    }

    /**
     * The player's existing question, drawing one only if they have none. Resyncs must
     * use this: getNextQuestion() mutates, so calling it on reconnect would hand the
     * player a different question and burn the pool (CNG-006).
     */
    getOrAssignQuestion(username: string): { question: string; index: number } | null {
        return this.assignedQuestions[username] || this.assignQuestion(username);
    }

    clearAssignedQuestions(): void {
        this.assignedQuestions = {};
    }

    // Answer management
    addAnswer(username: string, question: string, answer: string): void {
        this.touch();
        this.userAnswers[username] = {
            question,
            answer,
            isTruth: true // Their own answer is always the truth
        };
    }

    getAllAnswers(): UserAnswer[] {
        return Object.values(this.userAnswers);
    }

    getAllAnswersWithUsernames(): Array<{ username: string; answer: UserAnswer }> {
        return Object.entries(this.userAnswers).map(([username, answer]) => ({
            username,
            answer
        }));
    }

    // Clears a round's Q&A. Assignments go with the answers - every caller restarts the
    // round and reassigns immediately, so a stale assignment must not survive.
    clearAnswers(): void {
        this.userAnswers = {};
        this.assignedQuestions = {};
    }

    // Phase management
    setPhase(phase: GamePhase): void {
        this.touch();
        this.newSegment();
        this.currentPhase = phase;
    }

    // Timer management
    startTimer(seconds: number, onComplete: () => void): void {
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

    stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // Check if all users have submitted answers
    allUsersHaveAnswered(): boolean {
        const userNames = this.getUserNames();
        return userNames.every(name => name in this.userAnswers);
    }

    // Get leaderboard sorted by points
    getLeaderboard(): Array<{ name: string; emoji: string; points: number }> {
        return Object.values(this.sharedState.users)
            .filter(user => user.name !== '<host>')
            .sort((a, b) => b.points - a.points);
    }

    // === LIE PHASE METHODS ===

    // Get the next player to target for lies
    getCurrentLieTargetPlayer(): string {
        return this.currentLieTargetPlayer;
    }

    setCurrentLieTargetPlayer(player: string): void {
        // A new target is a new round even if the phase name doesn't change.
        this.newSegment();
        this.currentLieTargetPlayer = player;
    }

    // Get the truth answer for a player
    getTruthForPlayer(username: string): UserAnswer | null {
        return this.userAnswers[username] || null;
    }

    // Add a lie for the target player
    addLie(targetUsername: string, lieUsername: string, lie: string): void {
        this.touch();
        if (!this.lies[targetUsername]) {
            this.lies[targetUsername] = [];
        }
        this.lies[targetUsername].push({ username: lieUsername, lie });
    }

    // Get all lies for a target player
    getLiesForPlayer(targetUsername: string): Lie[] {
        return this.lies[targetUsername] || [];
    }

    // Check if all OTHER players have submitted lies for target
    allLiesSubmittedForTarget(targetUsername: string): boolean {
        const userNames = this.getUserNames();
        // All players except the target should submit a lie
        const otherPlayers = userNames.filter(name => name !== targetUsername);
        const submittedLiers = this.lies[targetUsername]?.map(l => l.username) || [];
        return otherPlayers.every(name => submittedLiers.includes(name));
    }

    // Add a vote
    addVote(targetUsername: string, voter: string, selectedUsername: string): void {
        this.touch();
        if (!this.votes[targetUsername]) {
            this.votes[targetUsername] = [];
        }
        this.votes[targetUsername].push({ voter, selectedUsername });
    }

    // Get all votes for a target
    getVotesForPlayer(targetUsername: string): Vote[] {
        return this.votes[targetUsername] || [];
    }

    // Check if all players (except target) have voted
    allVotesSubmittedForTarget(targetUsername: string): boolean {
        const userNames = this.getUserNames();
        // All players except the target and the truth-owner should vote
        const voters = userNames.filter(name => name !== targetUsername);
        const votedPlayers = this.votes[targetUsername]?.map(v => v.voter) || [];
        return voters.every(name => votedPlayers.includes(name));
    }

    // Calculate and award points for lie round
    calculateLiePoints(targetUsername: string): void {
        const truth = this.userAnswers[targetUsername];
        const lies = this.lies[targetUsername] || [];
        const votes = this.votes[targetUsername] || [];

        if (!truth) return;

        // Build list of all answers (truth + lies) with their authors
        const allAnswers = [
            { username: targetUsername, answer: truth.answer, isTruth: true },
            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
        ];

        // Count votes for each answer
        const voteCounts: { [username: string]: number } = {};
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
            } else {
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
    getNextLieTargetPlayer(): string | null {
        const userNames = this.getUserNames();
        const currentIndex = userNames.indexOf(this.currentLieTargetPlayer);
        
        if (currentIndex === -1) {
            // First player
            return userNames.length > 0 ? userNames[0] : null;
        }
        
        const nextIndex = currentIndex + 1;
        return nextIndex < userNames.length ? userNames[nextIndex] : null;
    }

    // Get next player for lie round, skipping players without a truth
    getNextLieTargetPlayerSkippingMissing(): string | null {
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
    
    // Advance to next lie target player
    nextLieTarget(): void {
        const next = this.getNextLieTargetPlayerSkippingMissing();
        if (next) {
            this.currentLieTargetPlayer = next;
        }
    }

    // Check if all lie rounds are done
    isLiePhaseDone(): boolean {
        return this.getNextLieTargetPlayerSkippingMissing() === null && this.currentLieTargetPlayer !== '';
    }

    // Check if there are more targets with truths (for continuing after showing points)
    hasMoreLieTargets(): boolean {
        // Check if there are more players with truths AFTER the current one
        const userNames = this.getUserNames();
        if (!this.currentLieTargetPlayer) {
            return userNames.some(name => this.userAnswers[name]);
        }
        
        const currentIndex = userNames.indexOf(this.currentLieTargetPlayer);
        
        for (let i = currentIndex + 1; i < userNames.length; i++) {
            if (this.userAnswers[userNames[i]]) {
                return true;
            }
        }
        
        return false;
    }

    // Reset lies and votes for new game
    resetLieData(): void {
        this.lies = {};
        this.votes = {};
        this.currentLieTargetPlayer = '';
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
    toJSON(): object {
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
    static fromJSON(data: any, gameCode: string): GameState | null {
        if (!data || typeof data !== 'object') return null;
        if (data.version !== GameState.SAVE_VERSION) return null;
        if (!data.sharedState || typeof data.sharedState.users !== 'object') return null;

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
