// One game = one Durable Object, keyed by the game code (harness/PORT.md).
//
// This is the port of src/socketHandlers.ts from the socketio branch. The game logic and
// wire protocol are identical by design (D1) - what changed is the platform seam:
//
//   socketStuff bookkeeping  ->  a {role, name} attachment on each hibernatable socket
//   setInterval countdown    ->  GameState's deadline + one alarm with three duties (D4)
//   games.json + signals     ->  write-through storage after every event (D8)
//
// Decisions cited as D-numbers are in harness/PORT.md; CNG numbers in harness/ISSUES.md.

import { DurableObject } from 'cloudflare:workers';
import { GameState, GamePhase } from '../src/GameState';
import { Screens, ClientGameState, UserAnswer } from '../src/IncludeStuff';
import type { Env } from './index';

type Role = 'host' | 'player' | 'spectator';
interface Attachment {
    role: Role;
    name?: string;
}

/**
 * Server-side name validation (CNG-039). The client validates too, but the server can't
 * rely on that. Returns the trimmed name, or null if it isn't usable.
 */
function validateName(name: unknown): string | null {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === '<host>') return null;
    if (trimmed.length > 40) return null; // the lobby and reveal render these
    return trimmed;
}

// Fisher-Yates shuffle - proper unbiased shuffle
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export class GameDurableObject extends DurableObject<Env> {
    private gameState: GameState | null = null;
    private code = '';

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        // Rehydrate before any event lands (R2): in-memory fields vanish on eviction,
        // storage doesn't. An unreadable or version-mismatched blob means "no game" -
        // same SAVE_VERSION discipline as the Node version (CNG-002).
        ctx.blockConcurrencyWhile(async () => {
            const data = await ctx.storage.get<any>('game');
            // The code lives inside sharedState - toJSON has no top-level code field.
            // The first draft read data.code, which doesn't exist, so rehydration
            // silently never happened and every eviction or restart "lost" the game
            // while its blob sat intact on disk (CNG-042).
            const code = data?.sharedState?.code;
            if (data && typeof code === 'string') {
                this.code = code;
                this.gameState = GameState.fromJSON(data, code, this.gameConfig());
            }
        });
    }

    // --- config (D5: vars from env, not process.env) ---

    private num(v: string | undefined, fallback: number): number {
        return Number(v) || fallback;
    }
    private roundSeconds(): number { return this.num(this.env.CNG_ROUND_SECONDS, 60); }
    private restartSeconds(): number { return this.num(this.env.CNG_RESTART_SECONDS, 30); }
    private backstopSeconds(): number { return this.num(this.env.CNG_BACKSTOP_SECONDS, 240); }
    private cleanTimeMs(): number { return this.num(this.env.CNG_CLEAN_TIME_MS, 24 * 60 * 60 * 1000); }
    private gameConfig() {
        const questionCount = Number(this.env.CNG_QUESTION_COUNT) || undefined;
        return { questionCount };
    }

    // --- lifecycle ---

    /**
     * Initialize storage for a fresh game (called by the worker on POST /api/newGame).
     * Returns false if this code already hosts a live game (D9), so the worker retries
     * with a different code.
     */
    async createGame(code: string): Promise<boolean> {
        if (this.gameState) return false;
        this.code = code;
        this.gameState = new GameState(code, this.gameConfig());
        this.gameState.addUser('<host>', '🏠');
        await this.persistAndSchedule();
        return true;
    }

    /** WebSocket upgrade for /ws/CODE. */
    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return new Response('expected a WebSocket upgrade', { status: 426 });
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        // Hibernation API: the runtime holds the socket while this object sleeps; events
        // arrive via webSocketMessage below.
        this.ctx.acceptWebSocket(server);
        // Same opening move as the Node version - the shim identifies on connect anyway
        // (CNG-018), this is the belt to that braces.
        server.send(JSON.stringify({ event: 'identifyMe' }));
        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
        let event = '';
        let data: any = {};
        try {
            const parsed = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
            event = String(parsed.event ?? '');
            data = parsed.data ?? {};
        } catch {
            return; // not our protocol; ignore
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
    async alarm(): Promise<void> {
        const gameState = this.gameState;
        if (!gameState) {
            await this.ctx.storage.deleteAll();
            return;
        }

        if (Date.now() - gameState.getLastActivity() > this.cleanTimeMs()) {
            console.log(`Pruned idle game ${this.code} (clean time reached)`);
            for (const ws of this.ctx.getWebSockets()) {
                try { ws.close(1000, 'game expired'); } catch { /* already gone */ }
            }
            this.gameState = null;
            await this.ctx.storage.deleteAll(); // also removes the alarm
            return;
        }

        if (gameState.timerHasExpired()) {
            this.handleTimerExpiry();
        }
        await this.persistAndSchedule();
    }

    private async persistAndSchedule(): Promise<void> {
        if (!this.gameState) return;
        // D8: write-through. The state is kilobytes; every handled event persists it.
        await this.ctx.storage.put('game', this.gameState.toJSON());
        // D4 duty 3: next wake is the phase deadline if one is running, else the moment
        // this game hits clean time. setAlarm replaces any previous alarm.
        const deadline = this.gameState.getTimerDeadline()
            ?? this.gameState.getLastActivity() + this.cleanTimeMs();
        await this.ctx.storage.setAlarm(deadline);
    }

    // --- send helpers: the socketStuff replacement ---

    private attachmentOf(ws: WebSocket): Attachment | null {
        try {
            return (ws.deserializeAttachment() as Attachment) ?? null;
        } catch {
            return null;
        }
    }

    private send(ws: WebSocket, state: ClientGameState): void {
        try {
            ws.send(JSON.stringify({ event: 'gameState', data: state }));
        } catch { /* socket died between getWebSockets and send */ }
    }

    private withPhaseToken(state: ClientGameState): ClientGameState {
        // Same single-stamping-point reasoning as the Node version (CNG-003): the host's
        // browser echoes this with its fallback timerExpired.
        if (!this.gameState) return state;
        return { ...state, phaseToken: this.gameState.getPhaseToken() };
    }

    private sendToHost(state: ClientGameState): void {
        const stamped = this.withPhaseToken(state);
        for (const ws of this.ctx.getWebSockets()) {
            if (this.attachmentOf(ws)?.role === 'host') this.send(ws, stamped);
        }
    }

    /** All of one player's devices - the multi-device support (CNG-026) unchanged. */
    private sendToUserSockets(username: string, state: ClientGameState): void {
        for (const ws of this.ctx.getWebSockets()) {
            const att = this.attachmentOf(ws);
            if (att?.role === 'player' && att.name === username) this.send(ws, state);
        }
    }

    /**
     * Everyone who isn't a host socket - spectators and not-yet-named sockets included,
     * matching the Node version's room-except-host broadcast (CNG-001 semantics; the
     * host-exclusion test guards this).
     */
    private sendToPlayers(state: ClientGameState): void {
        for (const ws of this.ctx.getWebSockets()) {
            if (this.attachmentOf(ws)?.role !== 'host') this.send(ws, state);
        }
    }

    private sendToSpectators(state: ClientGameState): void {
        for (const ws of this.ctx.getWebSockets()) {
            if (this.attachmentOf(ws)?.role === 'spectator') this.send(ws, state);
        }
    }

    // --- event dispatch ---

    private handleEvent(ws: WebSocket, event: string, data: any): void {
        const gameState = this.gameState;

        // The only event that works without a game: everything else answers "no game
        // here" the same way the Node version answered an unknown code.
        if (!gameState) {
            this.send(ws, {
                screen: Screens.g1NewGame,
                error: 'Invalid game code',
                name: '',
                emoji: '',
                sharedState: { users: {}, code: String(data.code ?? this.code ?? '') }
            });
            return;
        }

        switch (event) {
            case 'joinGame': return this.onJoinGame(ws, gameState);
            case 'identify': return this.onIdentify(ws, gameState, data);
            case 'nameAndEmoji': return this.onNameAndEmoji(ws, gameState, data);
            case 'startGame': return this.onStartGame(ws, gameState);
            case 'sendQuestionAnswer': return this.onQuestionAnswer(ws, gameState, data);
            case 'submitLie': return this.onSubmitLie(ws, gameState, data);
            case 'voteOnLie': return this.onVoteOnLie(ws, gameState, data);
            case 'continueFromResults': return this.onContinueFromResults(gameState);
            case 'continueFromScores': return this.onContinueFromScores(gameState);
            case 'endGame': return this.onEndGame(gameState);
            case 'timerExpired': return this.onTimerExpired(gameState, data);
            case 'requestJoinHost':
                // D7: no os module, no LAN to report. The client's loopback handling
                // (CNG-029) shows its warning under wrangler dev, which is truthful.
                try { ws.send(JSON.stringify({ event: 'joinHost', data: { lanHost: null } })); } catch { }
                return;
            default:
                console.log('Ignoring unknown event: ' + event);
        }
    }

    private onJoinGame(ws: WebSocket, gameState: GameState): void {
        gameState.touch();
        this.send(ws, {
            sharedState: gameState.getSharedState(),
            name: '',
            emoji: '',
            screen: Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture,
            error: ''
        });
    }

    private onIdentify(ws: WebSocket, gameState: GameState, data: any): void {
        const role = data.role as string;
        const name = data.name as string | undefined;

        // A human reconnecting counts as activity; the server's own churn does not
        // (CNG-033).
        gameState.touch();

        if (role === 'host') {
            ws.serializeAttachment({ role: 'host' } satisfies Attachment);
            this.sendHostToCorrectScreen(gameState, ws);
            return;
        }
        if (role === 'player' && name) {
            // Loose matching, stored spelling (CNG-031).
            const canonical = gameState.findUserName(name);
            if (!canonical) {
                if (gameState.getPhase() === GamePhase.CollectingUsers) {
                    this.send(ws, {
                        screen: Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture,
                        name: '',
                        emoji: '',
                        sharedState: gameState.getSharedState()
                    });
                } else {
                    // Mid-game unknowns watch (user ruling 2026-07-16, CNG-031/037).
                    this.addSpectator(ws, gameState, name);
                }
                return;
            }
            ws.serializeAttachment({ role: 'player', name: canonical } satisfies Attachment);
            this.sendPlayerToCorrectScreen(gameState, canonical, ws);
        }
    }

    private onNameAndEmoji(ws: WebSocket, gameState: GameState, data: any): void {
        gameState.touch();

        const trimmed = validateName(data.name);
        if (!trimmed) {
            this.send(ws, {
                screen: Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture,
                error: 'Please pick a usable name',
                name: '',
                emoji: '',
                sharedState: gameState.getSharedState()
            });
            return;
        }

        const existing = gameState.findUserName(trimmed);
        if (!existing && gameState.getPhase() !== GamePhase.CollectingUsers) {
            // Once a game starts, a name matching nobody watches (CNG-031/037 ruling).
            this.addSpectator(ws, gameState, trimmed);
            return;
        }

        const canonical = existing ?? trimmed;
        if (!existing) {
            gameState.addUser(canonical, String(data.emoji ?? '😊'));
        }
        ws.serializeAttachment({ role: 'player', name: canonical } satisfies Attachment);

        this.sendToHost({
            sharedState: gameState.getSharedState(),
            name: '<host>',
            screen: this.getHostScreen(gameState)
        });
        this.sendPlayerToCorrectScreen(gameState, canonical, ws);
    }

    private onStartGame(ws: WebSocket, gameState: GameState): void {
        const phase = gameState.getPhase();
        if (phase !== GamePhase.CollectingUsers) {
            this.sendHostToCorrectScreen(gameState, ws);
            return;
        }
        if (gameState.getUserNames().length < 2) {
            this.sendToHost({
                screen: Screens.h1CollectingUsers,
                text: 'Need at least 2 players to start!'
            });
            return;
        }
        gameState.touch();
        gameState.resetForNewGame();
        this.beginAnsweringRound(gameState, 'Truthfully answer the questions on your device.', this.roundSeconds());
    }

    private onQuestionAnswer(ws: WebSocket, gameState: GameState, data: any): void {
        const name = String(data.name ?? '');
        if (gameState.getPhase() !== GamePhase.AnsweringQuestions) {
            this.sendPlayerToCorrectScreen(gameState, name, ws);
            return;
        }
        // Prefer the question the server actually handed out (CNG-006).
        const assigned = gameState.getAssignedQuestion(name);
        gameState.addAnswer(name, assigned?.question ?? String(data.question ?? ''), String(data.answer ?? ''));

        if (gameState.allUsersHaveAnswered()) {
            this.advanceToNextLieRoundOrEnd(gameState);
        } else {
            this.sendToUserSockets(name, {
                screen: Screens.c2WaitingScreenJustWhateverText,
                text: 'Thank you for your answer! Please wait for others to finish...'
            });
        }
    }

    private onSubmitLie(ws: WebSocket, gameState: GameState, data: any): void {
        const name = String(data.name ?? '');
        if (gameState.getPhase() !== GamePhase.SubmittingLies) {
            this.sendPlayerToCorrectScreen(gameState, name, ws);
            return;
        }
        const currentTarget = gameState.getCurrentLieTargetPlayer();
        if (data.targetPlayer !== currentTarget) {
            this.sendPlayerToCorrectScreen(gameState, name, ws);
            return;
        }
        gameState.addLie(currentTarget, name, String(data.lie ?? ''));

        if (gameState.allLiesSubmittedForTarget(currentTarget)) {
            this.beginVoting(gameState, currentTarget);
        } else {
            this.sendToUserSockets(name, {
                screen: Screens.c2WaitingScreenJustWhateverText,
                text: 'Lie submitted! Waiting for others to submit their lies...'
            });
        }
    }

    private onVoteOnLie(ws: WebSocket, gameState: GameState, data: any): void {
        const name = String(data.name ?? '');
        if (gameState.getPhase() !== GamePhase.VotingOnLies) {
            this.sendPlayerToCorrectScreen(gameState, name, ws);
            return;
        }
        const currentTarget = gameState.getCurrentLieTargetPlayer();
        if (data.targetPlayer !== currentTarget) {
            this.sendPlayerToCorrectScreen(gameState, name, ws);
            return;
        }
        // The ballot hides your own answer; the server enforces it too (CNG-020).
        if (data.selectedUsername === name) {
            this.sendPlayerToCorrectScreen(gameState, name, ws);
            return;
        }
        gameState.addVote(currentTarget, name, String(data.selectedUsername ?? ''));

        if (gameState.allVotesSubmittedForTarget(currentTarget)) {
            this.showLieResults(gameState, currentTarget);
        } else {
            this.sendToUserSockets(name, {
                screen: Screens.c2WaitingScreenJustWhateverText,
                text: 'Vote submitted! Waiting for others to vote...'
            });
        }
    }

    private onContinueFromResults(gameState: GameState): void {
        if (gameState.getPhase() === GamePhase.ShowingLieResults) {
            gameState.touch();
            this.showPoints(gameState);
        }
    }

    private onContinueFromScores(gameState: GameState): void {
        if (gameState.getPhase() === GamePhase.ShowingPoints) {
            gameState.touch();
            this.advanceToNextLieRoundOrEnd(gameState);
        }
    }

    // Nothing in the current client emits this; it stays because the host-exclusion
    // test drives it and depends on its host/player screen split (CNG-034).
    private onEndGame(gameState: GameState): void {
        if (gameState.getPhase() === GamePhase.GameOver) return;
        gameState.stopTimer();
        gameState.setPhase(GamePhase.GameOver);

        const leaderboard = gameState.getLeaderboard();
        const winner = leaderboard.length > 0 ? leaderboard[0] : null;
        this.sendToHost({
            screen: Screens.h6ShowTheWinner,
            text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'No winner',
            leaderboard
        });
        this.sendToPlayers({
            screen: Screens.c2WaitingScreenJustWhateverText,
            text: winner ? `Game Over! Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!'
        });
    }

    // Fallback only (D6): the server's alarm owns expiry; the host's browser countdown
    // is a second chance, still token-guarded against stale tabs (CNG-003).
    private onTimerExpired(gameState: GameState, data: any): void {
        const currentToken = gameState.getPhaseToken();
        if (data.phaseToken !== currentToken) {
            console.log(`Ignoring stale timerExpired (token ${data.phaseToken}, current ${currentToken})`);
            return;
        }
        this.handleTimerExpiry();
    }

    // --- spectators (CNG-031/037 ruling) ---

    private addSpectator(ws: WebSocket, gameState: GameState, name: string): void {
        ws.serializeAttachment({ role: 'spectator', name } satisfies Attachment);
        this.sendSpectatorToCurrentScreen(gameState, ws, name);
    }

    private sendSpectatorToCurrentScreen(gameState: GameState, ws: WebSocket, name: string): void {
        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();
        const base = { sharedState: gameState.getSharedState(), name };

        switch (phase) {
            case GamePhase.ShowingLieResults:
                this.send(ws, {
                    ...base,
                    screen: Screens.h3ShowTheLiesAndTruths,
                    text: 'Results for ' + targetPlayer + '!',
                    answers: this.buildResults(gameState, targetPlayer),
                    targetPlayer
                });
                break;
            case GamePhase.ShowingPoints:
                this.send(ws, {
                    ...base,
                    screen: Screens.h5ShowThePointsForTheRound,
                    text: 'Points for this round!',
                    leaderboard: gameState.getLeaderboard()
                });
                break;
            case GamePhase.GameOver:
                this.send(ws, {
                    ...base,
                    screen: Screens.h6ShowTheWinner,
                    text: 'Game Over!',
                    leaderboard: gameState.getLeaderboard()
                });
                break;
            default:
                this.send(ws, {
                    ...base,
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: "You're watching this game. You'll see the results as they come in - you can join the board when the next game starts."
                });
        }
    }

    // --- resyncs (the "single source of truth for where you belong") ---

    private getHostScreen(gameState: GameState): Screens {
        switch (gameState.getPhase()) {
            case GamePhase.CollectingUsers: return Screens.h1CollectingUsers;
            case GamePhase.AnsweringQuestions:
            case GamePhase.SubmittingLies:
            case GamePhase.VotingOnLies: return Screens.h2InformationScreenWithTimer;
            case GamePhase.ShowingLieResults: return Screens.h3ShowTheLiesAndTruths;
            case GamePhase.ShowingPoints: return Screens.h5ShowThePointsForTheRound;
            case GamePhase.GameOver: return Screens.h6ShowTheWinner;
            default: return Screens.h1CollectingUsers;
        }
    }

    private sendHostToCorrectScreen(gameState: GameState, ws?: WebSocket): void {
        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();
        const baseState = { sharedState: gameState.getSharedState(), name: '<host>' };

        const sendState = (state: ClientGameState) => {
            if (ws) {
                this.send(ws, this.withPhaseToken(state));
            } else {
                this.sendToHost(state);
            }
        };

        switch (phase) {
            case GamePhase.AnsweringQuestions:
                sendState({
                    ...baseState,
                    screen: Screens.h2InformationScreenWithTimer,
                    text: 'Truthfully answer the questions on your device.',
                    timerValue: gameState.getTimerValue() || 60
                });
                break;
            case GamePhase.SubmittingLies:
                sendState({
                    ...baseState,
                    screen: Screens.h2InformationScreenWithTimer,
                    text: targetPlayer ? `Now submitting lies for ${targetPlayer}!` : 'Submitting lies...',
                    timerValue: gameState.getTimerValue() || 60
                });
                break;
            case GamePhase.VotingOnLies:
                sendState({
                    ...baseState,
                    screen: Screens.h2InformationScreenWithTimer,
                    text: targetPlayer ? `Voting on lies for ${targetPlayer}!` : 'Voting...',
                    timerValue: gameState.getTimerValue() || 60
                });
                break;
            case GamePhase.ShowingLieResults:
                // One builder for every path (CNG-035).
                if (targetPlayer && gameState.getTruthForPlayer(targetPlayer)) {
                    sendState({
                        ...baseState,
                        screen: Screens.h3ShowTheLiesAndTruths,
                        text: `Results for ${targetPlayer}!`,
                        answers: this.buildResults(gameState, targetPlayer)
                    });
                } else {
                    sendState({ ...baseState, screen: Screens.h3ShowTheLiesAndTruths });
                }
                break;
            case GamePhase.ShowingPoints:
                sendState({
                    ...baseState,
                    screen: Screens.h5ShowThePointsForTheRound,
                    text: targetPlayer ? `Points for ${targetPlayer}'s round!` : 'Points!',
                    leaderboard: gameState.getLeaderboard()
                });
                break;
            case GamePhase.GameOver: {
                const leaderboard = gameState.getLeaderboard();
                const winner = leaderboard[0];
                sendState({
                    ...baseState,
                    screen: Screens.h6ShowTheWinner,
                    text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!',
                    leaderboard
                });
                break;
            }
            default:
                // text cleared explicitly: H1 renders it, and the client merge would
                // otherwise carry a mid-game message into the lobby (CNG-041).
                sendState({ ...baseState, screen: Screens.h1CollectingUsers, text: '' });
        }
    }

    private sendPlayerToCorrectScreen(gameState: GameState, playerName: string, ws: WebSocket): void {
        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();

        const baseState: ClientGameState = {
            sharedState: gameState.getSharedState(),
            name: playerName
        };
        if (gameState.getSharedState().users[playerName]) {
            baseState.emoji = gameState.getSharedState().users[playerName].emoji;
        }

        let screenToSend: Screens = Screens.c2WaitingScreenJustWhateverText;
        let textToSend = 'Please wait...';
        let questionText = '';
        let instructionText = '';
        let answers: UserAnswer[] = [];

        switch (phase) {
            case GamePhase.CollectingUsers:
                textToSend = 'Please wait for the host to start the game...';
                break;

            case GamePhase.AnsweringQuestions:
                if (gameState.getTruthForPlayer(playerName)) {
                    textToSend = 'Your answer has been submitted! Please wait for others...';
                } else {
                    // Never draw a new question on resync (CNG-006).
                    const questionObj = gameState.getOrAssignQuestion(playerName);
                    screenToSend = Screens.c3SubmitTruth;
                    questionText = questionObj?.question || '';
                    instructionText = 'Please answer this question truthfully about yourself';
                    textToSend = questionObj ? `Please answer this question:\n\n${questionObj.question}` : 'No question available';
                }
                break;

            case GamePhase.SubmittingLies:
                if (targetPlayer === playerName) {
                    textToSend = 'Your truth has been submitted! Now others will submit lies for your question.';
                } else {
                    const truth = gameState.getTruthForPlayer(targetPlayer || '');
                    const alreadyLied = gameState.getLiesForPlayer(targetPlayer || '')
                        .some(l => l.username === playerName);
                    if (alreadyLied) {
                        textToSend = 'Your lie has been submitted! Please wait for others...';
                    } else {
                        screenToSend = Screens.c5SubmitLie;
                        questionText = truth?.question || '';
                        instructionText = `Write a fooling answer for this question about ${targetPlayer}`;
                        textToSend = truth ? `Write a LIE for this question about ${targetPlayer}:\n\n${truth.question}` : 'No question available';
                    }
                }
                break;

            case GamePhase.VotingOnLies: {
                const alreadyVoted = gameState.getVotesForPlayer(targetPlayer || '')
                    .some(v => v.voter === playerName);
                if (targetPlayer === playerName) {
                    // The target never votes (CNG-024).
                    textToSend = 'Others are voting on your question!';
                } else if (alreadyVoted) {
                    textToSend = 'Your vote has been submitted! Please wait for others...';
                } else {
                    // The round's stored ballot, in the order everyone is already
                    // looking at (CNG-040).
                    answers = gameState.getBallot() ?? shuffleArray(
                        this.buildResults(gameState, targetPlayer || '').map(
                            ({ voters, ...a }) => a));
                    screenToSend = Screens.c4PickTheBestAnswerOutOfAList;
                    textToSend = 'Vote for the TRUTH!';
                }
                break;
            }

            case GamePhase.ShowingLieResults:
                if (targetPlayer && gameState.getTruthForPlayer(targetPlayer)) {
                    answers = this.buildResults(gameState, targetPlayer);
                }
                screenToSend = Screens.h3ShowTheLiesAndTruths;
                textToSend = targetPlayer ? `Results for ${targetPlayer}!` : 'Results';
                break;

            case GamePhase.ShowingPoints:
                textToSend = 'Please wait while results are being shown...';
                break;

            case GamePhase.GameOver:
                textToSend = 'The game has ended!';
                break;
        }

        const emitState: ClientGameState = {
            ...baseState,
            screen: screenToSend,
            text: textToSend,
            question: questionText,
            instructionText,
            answers,
            leaderboard: phase === GamePhase.GameOver || phase === GamePhase.ShowingPoints
                ? gameState.getLeaderboard() : undefined
        };
        if (targetPlayer) {
            emitState.targetPlayer = targetPlayer;
        }
        this.send(ws, emitState);
    }

    // --- phase transitions (one method each; CNG-023 discipline) ---

    private buildResults(gameState: GameState, targetPlayer: string): UserAnswer[] {
        const truth = gameState.getTruthForPlayer(targetPlayer);
        const lies = gameState.getLiesForPlayer(targetPlayer);
        const votes = gameState.getVotesForPlayer(targetPlayer);

        const voters: { [username: string]: string[] } = {};
        votes.forEach(v => {
            if (!voters[v.selectedUsername]) voters[v.selectedUsername] = [];
            voters[v.selectedUsername].push(v.voter);
        });

        return [
            { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
        ].map(a => ({ ...a, voters: voters[a.username] || [] }));
    }

    private beginAnsweringRound(gameState: GameState, hostText: string, seconds: number): void {
        gameState.setPhase(GamePhase.AnsweringQuestions);
        gameState.startTimer(seconds);

        this.sendToHost({
            screen: Screens.h2InformationScreenWithTimer,
            text: hostText,
            timerValue: seconds
        });
        this.sendToSpectators({
            screen: Screens.c2WaitingScreenJustWhateverText,
            text: 'Players are answering their questions...'
        });

        gameState.getUserNames().forEach(username => {
            const questionObj = gameState.assignQuestion(username);
            if (!questionObj) return;
            this.sendToUserSockets(username, {
                screen: Screens.c3SubmitTruth,
                text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                question: questionObj.question,
                questionIndex: questionObj.index,
                instructionText: 'Please answer this question truthfully about yourself'
            });
        });
    }

    private restartRound(gameState: GameState, hostText: string): void {
        gameState.clearAnswers();
        // A restarted round must actually be fresh (CNG-025).
        gameState.resetLieData();
        this.beginAnsweringRound(gameState, hostText, this.restartSeconds());
    }

    private beginLieRound(gameState: GameState, targetPlayer: string): void {
        gameState.setCurrentLieTargetPlayer(targetPlayer);
        gameState.setPhase(GamePhase.SubmittingLies);
        gameState.startTimer(this.roundSeconds());

        const truth = gameState.getTruthForPlayer(targetPlayer);

        this.sendToHost({
            screen: Screens.h2InformationScreenWithTimer,
            text: 'Now submitting lies for ' + targetPlayer + '!',
            timerValue: this.roundSeconds()
        });
        this.sendToSpectators({
            screen: Screens.c2WaitingScreenJustWhateverText,
            text: 'Players are writing lies about ' + targetPlayer + '...'
        });

        gameState.getUserNames().forEach(username => {
            if (username === targetPlayer) {
                this.sendToUserSockets(username, {
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: 'Your truth has been submitted! Now others will submit lies for your question.',
                    targetPlayer
                });
            } else {
                this.sendToUserSockets(username, {
                    screen: Screens.c5SubmitLie,
                    text: 'Write a LIE for this question about ' + targetPlayer + ':\n\n' + (truth?.question || ''),
                    question: truth?.question || '',
                    targetPlayer,
                    instructionText: `Write a fooling answer for this question about ${targetPlayer}`
                });
            }
        });
    }

    private beginVoting(gameState: GameState, targetPlayer: string): void {
        gameState.setPhase(GamePhase.VotingOnLies);
        gameState.startTimer(this.roundSeconds());

        const truth = gameState.getTruthForPlayer(targetPlayer);
        const lies = gameState.getLiesForPlayer(targetPlayer);
        // Shuffled ONCE, then stored: every later send reuses this order (CNG-040).
        const answers = shuffleArray([
            { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
        ]);
        gameState.setBallot(answers);

        this.sendToHost({
            screen: Screens.h2InformationScreenWithTimer,
            text: 'Voting on lies for ' + targetPlayer + '!',
            timerValue: this.roundSeconds(),
            answers
        });
        this.sendToSpectators({
            screen: Screens.c2WaitingScreenJustWhateverText,
            text: 'Players are voting on ' + targetPlayer + "'s answers..."
        });

        gameState.getUserNames().forEach(username => {
            if (username === targetPlayer) {
                this.sendToUserSockets(username, {
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: 'Others are voting on your question!',
                    targetPlayer
                });
            } else {
                this.sendToUserSockets(username, {
                    screen: Screens.c4PickTheBestAnswerOutOfAList,
                    text: 'Which one is the TRUTH about ' + targetPlayer + '?',
                    answers,
                    targetPlayer
                });
            }
        });
    }

    private showLieResults(gameState: GameState, targetPlayer: string): void {
        gameState.calculateLiePoints(targetPlayer);
        gameState.setPhase(GamePhase.ShowingLieResults);
        // The host drives this screen; the backstop only covers them not being there
        // (CNG-028).
        gameState.startTimer(this.backstopSeconds());

        const state: ClientGameState = {
            screen: Screens.h3ShowTheLiesAndTruths,
            text: 'Results for ' + targetPlayer + '!',
            answers: this.buildResults(gameState, targetPlayer),
            targetPlayer
        };

        this.sendToHost(state);
        this.sendToSpectators(state);
        gameState.getUserNames().forEach(username =>
            this.sendToUserSockets(username, state));
    }

    private showPoints(gameState: GameState): void {
        gameState.setPhase(GamePhase.ShowingPoints);
        gameState.startTimer(this.backstopSeconds());

        const state: ClientGameState = {
            screen: Screens.h5ShowThePointsForTheRound,
            text: 'Points for this round!',
            leaderboard: gameState.getLeaderboard()
        };
        this.sendToHost(state);
        this.sendToPlayers(state);
    }

    private advanceToNextLieRoundOrEnd(gameState: GameState): void {
        const next = gameState.getNextLieTargetPlayerSkippingMissing();
        if (next) {
            this.beginLieRound(gameState, next);
        } else {
            this.endGameShowingWinner(gameState);
        }
    }

    private endGameShowingWinner(gameState: GameState): void {
        gameState.stopTimer();
        gameState.setPhase(GamePhase.GameOver);
        const leaderboard = gameState.getLeaderboard();
        const winner = leaderboard[0];
        const state: ClientGameState = {
            screen: Screens.h6ShowTheWinner,
            text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!',
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
    private handleTimerExpiry(): void {
        const gameState = this.gameState;
        if (!gameState) return;

        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();

        switch (phase) {
            case GamePhase.AnsweringQuestions: {
                const nextTarget = gameState.getNextLieTargetPlayerSkippingMissing();
                if (nextTarget) {
                    this.beginLieRound(gameState, nextTarget);
                } else {
                    this.restartRound(gameState, 'No answers submitted! Please answer the questions.');
                }
                break;
            }
            case GamePhase.SubmittingLies: {
                if (!targetPlayer) break;
                if (gameState.getLiesForPlayer(targetPlayer).length > 0) {
                    this.beginVoting(gameState, targetPlayer);
                } else if (targetPlayer === gameState.getUserNames()[0]) {
                    this.restartRound(gameState, 'No lies submitted! Starting fresh round.');
                } else {
                    this.advanceToNextLieRoundOrEnd(gameState);
                }
                break;
            }
            case GamePhase.VotingOnLies: {
                if (!targetPlayer) break;
                this.showLieResults(gameState, targetPlayer);
                break;
            }
            // The screens the host normally drives; reaching these means nobody is
            // driving (CNG-028).
            case GamePhase.ShowingLieResults:
                this.showPoints(gameState);
                break;
            case GamePhase.ShowingPoints:
                this.advanceToNextLieRoundOrEnd(gameState);
                break;
            default:
                // CollectingUsers and GameOver: nothing to expire. Stop the clock so
                // the alarm falls back to the clean-time schedule.
                gameState.stopTimer();
        }
    }
}
