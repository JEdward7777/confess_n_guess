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
    private sharedState: SharedState;
    private usedQuestionIndexes: number[];
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
    setTimerValue(value: number): void {
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

    // Answer management
    addAnswer(username: string, question: string, answer: string): void {
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

    clearAnswers(): void {
        this.userAnswers = {};
    }

    // Phase management
    setPhase(phase: GamePhase): void {
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
        this.currentLieTargetPlayer = player;
    }

    // Get the truth answer for a player
    getTruthForPlayer(username: string): UserAnswer | null {
        return this.userAnswers[username] || null;
    }

    // Add a lie for the target player
    addLie(targetUsername: string, lieUsername: string, lie: string): void {
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

    // Check if all lie rounds are done
    isLiePhaseDone(): boolean {
        return this.getNextLieTargetPlayer() === null && this.currentLieTargetPlayer !== '';
    }

    // Reset lies and votes for new game
    resetLieData(): void {
        this.lies = {};
        this.votes = {};
        this.currentLieTargetPlayer = '';
    }

    // Serialize for saving
    toJSON(): object {
        return {
            sharedState: this.sharedState,
            usedQuestionIndexes: this.usedQuestionIndexes,
            currentPhase: this.currentPhase,
            currentQuestionIndex: this.currentQuestionIndex
        };
    }

    // Load from saved state
    static fromJSON(data: any, gameCode: string): GameState {
        const gameState = new GameState(gameCode);
        gameState.sharedState = data.sharedState;
        gameState.usedQuestionIndexes = data.usedQuestionIndexes || [];
        gameState.currentPhase = data.currentPhase || GamePhase.CollectingUsers;
        gameState.currentQuestionIndex = data.currentQuestionIndex || 0;
        return gameState;
    }
}
