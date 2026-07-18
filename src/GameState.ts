import { UserPoints, SharedState, Screens, UserAnswer as BallotEntry } from './IncludeStuff';

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

const ALL_QUESTIONS: string[] = [
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

/**
 * Optional construction config (PORT.md D5: there is no process.env on Workers, so the
 * platform passes settings in explicitly).
 *
 * questionCount trims the pool so tests can reach exhaustion in seconds instead of ten
 * rounds; production omits it and gets the whole bank.
 */
export interface GameStateConfig {
    questionCount?: number;
}

export class GameState {
    /**
     * Bump when a change makes older saves unreadable. fromJSON drops anything that
     * doesn't match rather than loading it into a shape the code no longer expects.
     */
    static readonly SAVE_VERSION = 4; // v4: timerDeadline replaces timerValue (PORT.md D3)

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
    // When the current timed segment runs out, as an epoch-ms deadline - or null when
    // nothing is timed. A deadline serializes and survives hibernation/eviction, which a
    // ticking interval cannot (PORT.md D3). The platform schedules its alarm from this.
    private timerDeadline: number | null;
    // Lie phase tracking
    private currentLieTargetPlayer: string;
    private lies: { [targetUsername: string]: Lie[] };
    private votes: { [targetUsername: string]: Vote[] };
    // The round's ballot, shuffled ONCE when voting begins. Every send - transition and
    // resync alike - reuses this order, so a refreshing voter isn't handed a fresh
    // shuffle that reorders the options under them (CNG-040). Serialized, because the
    // order has to survive a hot-patch restart mid-vote too.
    private currentBallot: BallotEntry[] | null;

    constructor(gameCode: string, config: GameStateConfig = {}) {
        this.questions = ALL_QUESTIONS.slice(0, config.questionCount || ALL_QUESTIONS.length);
        this.sharedState = {
            users: {},
            code: gameCode
        };
        this.usedQuestionIndexes = [];
        this.assignedQuestions = {};
        this.userAnswers = {};
        this.currentPhase = GamePhase.CollectingUsers;
        this.currentQuestionIndex = 0;
        this.timerDeadline = null;
        this.currentLieTargetPlayer = '';
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
    getPhaseToken(): number {
        return this.phaseToken;
    }

    private newSegment(): void {
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
    touch(): void {
        this.lastActivity = Date.now();
    }

    getLastActivity(): number {
        return this.lastActivity;
    }

    // Timer management: a new timed segment of `seconds` starts now.
    startTimer(seconds: number): void {
        this.newSegment();
        this.timerDeadline = Date.now() + seconds * 1000;
    }

    stopTimer(): void {
        this.timerDeadline = null;
    }

    getTimerDeadline(): number | null {
        return this.timerDeadline;
    }

    /** True when a timed segment exists and its deadline has passed. */
    timerHasExpired(): boolean {
        return this.timerDeadline !== null && Date.now() >= this.timerDeadline;
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

    /**
     * Seconds remaining, derived from the deadline - the wire shape
     * (ClientGameState.timerValue) and the H2 countdown are unchanged from the Node
     * version.
     */
    getTimerValue(): number {
        if (this.timerDeadline === null) return 0;
        return Math.max(0, Math.ceil((this.timerDeadline - Date.now()) / 1000));
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

    /**
     * The stored name matching `name` case-insensitively and trimmed, or null.
     *
     * Reclaim-by-name is the supported reconnect path (see the identity decision), and it
     * has to survive a shift key: game codes are normalized everywhere, but names used to
     * be exact-matched, so "Bob" retyping "bob" on the tablet forked a ghost player into a
     * live game (CNG-031). Matching is loose; the stored spelling - what the player first
     * typed - is what everyone keeps seeing.
     */
    findUserName(name: string): string | null {
        const canonical = (name ?? '').trim().toLowerCase();
        if (!canonical) return null;
        for (const existing of Object.keys(this.sharedState.users)) {
            if (existing !== '<host>' && existing.trim().toLowerCase() === canonical) {
                return existing;
            }
        }
        return null;
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
    private questions: string[];

    getNextQuestion(): { question: string; index: number } | null {
        if (this.questions.length === 0) {
            return null;
        }

        let availableQuestions = this.questions.filter((_, index) =>
            !this.usedQuestionIndexes.includes(index)
        );

        if (availableQuestions.length === 0) {
            // The pool ran dry. Recycle it rather than returning null: pre-fix, null meant
            // beginAnsweringRound silently sent that player nothing and the empty round
            // restarted forever (CNG-032). A player may eventually see a question repeat
            // from an earlier round; repeats beat silence. Within a single round questions
            // stay unique whenever the pool is at least as large as the player count,
            // since one round draws at most one question per player.
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

    // Clears a round's Q&A. Assignments go with the answers - every caller restarts the
    // round and reassigns immediately, so a stale assignment must not survive.
    clearAnswers(): void {
        this.userAnswers = {};
        this.assignedQuestions = {};
    }

    // Phase management. Deliberately does NOT touch(): the server's timers come through
    // here, and machine-driven churn must not count as activity (CNG-033).
    setPhase(phase: GamePhase): void {
        this.newSegment();
        this.currentPhase = phase;
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

    /**
     * Add a lie for the target player. One lie per person: a resubmission replaces the
     * previous one rather than adding a second.
     *
     * This used to push unconditionally, so a player submitting twice - two tabs, or a
     * resend after a resync, both of which are normal now that multiple devices are
     * supported - appeared twice in the answer list with two lies (CNG-012).
     */
    addLie(targetUsername: string, lieUsername: string, lie: string): void {
        this.touch();
        if (!this.lies[targetUsername]) {
            this.lies[targetUsername] = [];
        }
        const existing = this.lies[targetUsername].find(l => l.username === lieUsername);
        if (existing) {
            existing.lie = lie;
        } else {
            this.lies[targetUsername].push({ username: lieUsername, lie });
        }
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

    /**
     * Record a vote. One vote per person: changing your mind replaces the old vote rather
     * than casting a second.
     *
     * This used to push unconditionally, so a player voting twice - which a second open
     * tab makes easy, since it keeps showing a live ballot (CNG-026) - had BOTH counted
     * by calculateLiePoints, paying out 1000 or 500 twice for one opinion (CNG-012).
     */
    addVote(targetUsername: string, voter: string, selectedUsername: string): void {
        this.touch();
        if (!this.votes[targetUsername]) {
            this.votes[targetUsername] = [];
        }
        const existing = this.votes[targetUsername].find(v => v.voter === voter);
        if (existing) {
            existing.selectedUsername = selectedUsername;
        } else {
            this.votes[targetUsername].push({ voter, selectedUsername });
        }
    }

    setBallot(ballot: BallotEntry[]): void {
        this.currentBallot = ballot;
    }

    getBallot(): BallotEntry[] | null {
        return this.currentBallot;
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
    
    // Reset lies and votes for new game
    resetLieData(): void {
        this.lies = {};
        this.votes = {};
        this.currentLieTargetPlayer = '';
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
    resetForNewGame(): void {
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
    toJSON(): object {
        return {
            version: GameState.SAVE_VERSION,
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
    static fromJSON(data: any, gameCode: string, config: GameStateConfig = {}): GameState | null {
        if (!data || typeof data !== 'object') return null;
        if (data.version !== GameState.SAVE_VERSION) return null;
        if (!data.sharedState || typeof data.sharedState.users !== 'object') return null;

        const gameState = new GameState(gameCode, config);
        gameState.sharedState = data.sharedState;
        gameState.sharedState.code = gameCode;
        gameState.usedQuestionIndexes = data.usedQuestionIndexes || [];
        gameState.assignedQuestions = data.assignedQuestions || {};
        gameState.userAnswers = data.userAnswers || {};
        gameState.currentPhase = data.currentPhase || GamePhase.CollectingUsers;
        gameState.currentQuestionIndex = data.currentQuestionIndex || 0;
        gameState.timerDeadline = data.timerDeadline ?? null;
        gameState.currentLieTargetPlayer = data.currentLieTargetPlayer || '';
        gameState.lies = data.lies || {};
        gameState.votes = data.votes || {};
        gameState.currentBallot = data.currentBallot || null;
        gameState.lastActivity = data.lastActivity || Date.now();
        gameState.phaseToken = data.phaseToken || 0;
        return gameState;
    }
}
