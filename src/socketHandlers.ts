import { Server, Socket } from 'socket.io';
import * as os from 'os';
import { GameState, GamePhase } from './GameState';
import { Screens, ClientGameState, UserAnswer } from './IncludeStuff';

// Seconds on the clock for a normal round, and for one being restarted after nobody
// took part (shorter, because the players are evidently already there and waiting).
//
// Overridable so the tests can watch a real timer fire without sitting for a minute.
// Nothing in the game should read the env directly - go through these.
const ROUND_SECONDS = Number(process.env.CNG_ROUND_SECONDS) || 60;
const RESTART_SECONDS = Number(process.env.CNG_RESTART_SECONDS) || 30;

// How long the reveal and points screens wait before moving on by themselves.
//
// A backstop, NOT a competing clock. The host drives these screens: H3 paces a two-stage
// reveal at ~4s an entry and then gives 60s to read it, so anything near 60 would fire
// mid-reveal and cut the host off. This only exists to answer "nobody is driving" - the
// same relationship timerExpired has to the server's own timer (CNG-028).
const BACKSTOP_SECONDS = Number(process.env.CNG_BACKSTOP_SECONDS) || 240;

/**
 * The address other machines on the network can reach this server at, or null if there
 * isn't one. Only used to rescue a QR code when the host opened the game at localhost -
 * see buildJoinUrl. Behind a reverse proxy this is an internal detail and must not be
 * used, which is why the decision lives with the client's address bar, not here.
 *
 * Prefers the private ranges a party is actually on. A machine with Docker or a VPN up has
 * several candidates and the first one the OS lists is often a bridge nobody can reach.
 */
function getLanHost(): string | null {
    const candidates: string[] = [];
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name] || []) {
            // Node <18 reports family as 'IPv4', newer as 4.
            const isIPv4 = iface.family === 'IPv4' || (iface.family as unknown as number) === 4;
            if (!isIPv4 || iface.internal) continue;
            candidates.push(iface.address);
        }
    }

    const rank = (ip: string): number => {
        if (ip.startsWith('192.168.')) return 0;
        if (ip.startsWith('10.')) return 1;
        if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
        return 3;
    };
    candidates.sort((a, b) => rank(a) - rank(b));
    return candidates[0] ?? null;
}

/**
 * Server-side name validation. The client validates too, but the server can't rely on
 * that - and the rules were previously only in the client (CNG-039). Returns the trimmed
 * name, or null if it isn't usable.
 */
function validateName(name: unknown): string | null {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === '<host>') return null;
    if (trimmed.length > 40) return null; // the lobby and reveal render these
    return trimmed;
}

// Normalize game code to uppercase for case-insensitive matching
function normalizeCode(code: string): string {
    return code?.toUpperCase() ?? '';
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

interface GamesStore {
    [gameCode: string]: GameState;
}

interface SocketStuff {
    hostSocketIds: string[];
    playerSockets: { [username: string]: string[] };
    // Mid-game arrivals whose name matches nobody. They watch - reveals, points, the
    // winner - but are never in the game's users, so they can't appear on the board or
    // count toward a round's quorum. Ruled by the user 2026-07-16: "I am ok for a third
    // party to join and just watch, but they shouldn't join the board."
    spectatorSockets: string[];
}

export class SocketHandlers {
    private io: Server;
    private games: GamesStore;
    private socketStuff: { [gameCode: string]: SocketStuff };

    constructor(io: Server, games: GamesStore) {
        this.io = io;
        this.games = games;
        this.socketStuff = {};
    }

    private generateGameCode(): string {
        const charactersToUse = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return Array.from({ length: 5 }, () => 
            charactersToUse.charAt(Math.floor(Math.random() * charactersToUse.length))
        ).join('');
    }

    /**
     * Send a message to all sockets for a specific user.
     * This supports multiple devices/tabs for the same user.
     */
    private sendToUserSockets(code: string, username: string, event: string, data: any): void {
        const socketInfo = this.socketStuff[code];
        if (!socketInfo || !socketInfo.playerSockets || !socketInfo.playerSockets[username]) {
            return;
        }
        
        const socketIds = socketInfo.playerSockets[username];
        if (!socketIds || socketIds.length === 0) {
            return;
        }
        
        // Send to all sockets for this user
        socketIds.forEach(socketId => {
            this.io.to(socketId).emit(event, data);
        });
    }

    private sendToSpectators(code: string, data: ClientGameState): void {
        const socketInfo = this.socketStuff[code];
        if (!socketInfo || !socketInfo.spectatorSockets) return;
        socketInfo.spectatorSockets.forEach(socketId => {
            this.io.to(socketId).emit('gameState', data);
        });
    }

    /**
     * Stamp the current phase token onto a state going to the host. The host's browser
     * owns the countdown and echoes this back with timerExpired, which is how a timer
     * for a segment that's already over gets recognised and dropped (CNG-003).
     *
     * Done here rather than at each of the ~15 emit sites: one of them would get missed,
     * and a missing token means the guard silently lets everything through. See CNG-023
     * for why that is not a hypothetical worry in this file.
     */
    private withPhaseToken(gameCode: string, data: ClientGameState): ClientGameState {
        const gameState = this.games[gameCode];
        if (!gameState) return data;
        return { ...data, phaseToken: gameState.getPhaseToken() };
    }

    private sendToHost(gameCode: string, data: ClientGameState): void {
        const socketInfo = this.socketStuff[gameCode];
        console.log('sendToHost called:', { gameCode, hasSocketInfo: !!socketInfo, hostSocketIds: socketInfo?.hostSocketIds, screen: data.screen });
        if (socketInfo && socketInfo.hostSocketIds && socketInfo.hostSocketIds.length > 0) {
            const stamped = this.withPhaseToken(gameCode, data);
            // Send to all host sockets
            socketInfo.hostSocketIds.forEach(socketId => {
                this.io.to(socketId).emit('gameState', stamped);
            });
        } else {
            console.log('WARNING: sendToHost no host socket found for game', gameCode);
        }
    }

    private sendToPlayers(gameCode: string, data: ClientGameState): void {
        const socketInfo = this.socketStuff[gameCode];
        if (socketInfo && socketInfo.hostSocketIds && socketInfo.hostSocketIds.length > 0) {
            // except() returns a new operator rather than mutating, so the exclusions
            // must be applied in the same chain that emits. It accepts an array.
            this.io.in(gameCode).except(socketInfo.hostSocketIds).emit('gameState', data);
        } else {
            // Fallback: send to everyone
            this.io.to(gameCode).emit('gameState', data);
        }
    }

    private getHostScreen(gameState: GameState): Screens {
        switch (gameState.getPhase()) {
            case GamePhase.CollectingUsers:
                return Screens.h1CollectingUsers;
            case GamePhase.AnsweringQuestions:
                return Screens.h2InformationScreenWithTimer;
            case GamePhase.SubmittingLies:
                return Screens.h2InformationScreenWithTimer;
            case GamePhase.VotingOnLies:
                return Screens.h2InformationScreenWithTimer;
            case GamePhase.ShowingLieResults:
                return Screens.h3ShowTheLiesAndTruths;
            case GamePhase.ShowingPoints:
                return Screens.h5ShowThePointsForTheRound;
            case GamePhase.GameOver:
                return Screens.h6ShowTheWinner;
            default:
                return Screens.h1CollectingUsers;
        }
    }
    
    private sendHostToCorrectScreen(code: string, gameState: GameState, hostSocket?: Socket): void {
        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();
        
        const baseState = {
            sharedState: gameState.getSharedState(),
            name: '<host>'
        };
        
        // Helper to send to host - either via stored socket or provided socket
        const sendState = (state: ClientGameState) => {
            if (hostSocket) {
                // Send directly to the socket that called startGame. This path bypasses
                // sendToHost, so stamp the token here too - a reconnecting host needs a
                // current one or its countdown's timerExpired is rejected as stale.
                hostSocket.emit('gameState', this.withPhaseToken(code, state));
            } else {
                // Fallback to stored host socket
                this.sendToHost(code, state);
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
                // One builder for every path (CNG-035); this was another pre-T6 inline
                // copy of buildResults.
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
            case GamePhase.GameOver:
                const leaderboard = gameState.getLeaderboard();
                const winner = leaderboard[0];
                sendState({
                    ...baseState,
                    screen: Screens.h6ShowTheWinner,
                    text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!',
                    leaderboard
                });
                break;
            default:
                // text cleared explicitly: H1 renders it now, and the client merge would
                // otherwise carry a mid-game message into the lobby (CNG-041).
                sendState({ ...baseState, screen: Screens.h1CollectingUsers, text: '' });
        }
    }
    
    /**
     * Sends a player to the correct screen based on game state and their name.
     * This is the single source of truth for where a player should be.
     * Used for reconnects and when players send events at wrong times.
     * @param code Game code
     * @param gameState Current game state
     * @param playerName Name of player to send
     * @param socket Player's socket connection
     * @param customTarget Optional override for target player (used when transitioning between lie rounds)
     */
    private sendPlayerToCorrectScreen(code: string, gameState: GameState, playerName: string, socket: Socket, customTarget?: string): void {
        const phase = gameState.getPhase();
        // Use custom target if provided, otherwise use game state
        const targetPlayer = customTarget || gameState.getCurrentLieTargetPlayer();
        
        const baseState = {
            sharedState: gameState.getSharedState(),
            name: playerName
        };
        
        // Get user emoji if available
        if (gameState.getSharedState().users[playerName]) {
            (baseState as any).emoji = gameState.getSharedState().users[playerName].emoji;
        }
        
        let screenToSend: Screens = Screens.c2WaitingScreenJustWhateverText;
        let textToSend = 'Please wait...';
        let questionText = '';
        let instructionText = '';
        let answers: any[] = [];
        
        switch (phase) {
            case GamePhase.CollectingUsers:
                screenToSend = Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'Please wait for the host to start the game...';
                break;
                
            case GamePhase.AnsweringQuestions:
                // Check if user already answered
                if (gameState.getTruthForPlayer(playerName)) {
                    screenToSend = Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Your answer has been submitted! Please wait for others...';
                } else {
                    // The question they were already handed - never draw a new one here,
                    // this runs on every resync (CNG-006).
                    const questionObj = gameState.getOrAssignQuestion(playerName);
                    screenToSend = Screens.c3SubmitTruth;
                    questionText = questionObj?.question || '';
                    instructionText = 'Please answer this question truthfully about yourself';
                    textToSend = questionObj ? `Please answer this question:\n\n${questionObj.question}` : 'No question available';
                }
                break;
                
            case GamePhase.SubmittingLies:
                if (targetPlayer === playerName) {
                    screenToSend = Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Your truth has been submitted! Now others will submit lies for your question.';
                } else {
                    const truth = gameState.getTruthForPlayer(targetPlayer || '');
                    const alreadyLied = gameState.getLiesForPlayer(targetPlayer || '')
                        .some(l => l.username === playerName);
                    if (alreadyLied) {
                        screenToSend = Screens.c2WaitingScreenJustWhateverText;
                        textToSend = 'Your lie has been submitted! Please wait for others...';
                    } else {
                        screenToSend = Screens.c5SubmitLie;
                        questionText = truth?.question || '';
                        instructionText = `Write a fooling answer for this question about ${targetPlayer}`;
                        textToSend = truth ? `Write a LIE for this question about ${targetPlayer}:\n\n${truth.question}` : 'No question available';
                    }
                }
                break;
                
            case GamePhase.VotingOnLies:
                const alreadyVoted = gameState.getVotesForPlayer(targetPlayer || '')
                    .some(v => v.voter === playerName);
                if (targetPlayer === playerName) {
                    // The round is about them - they know the answer and must not vote.
                    // Every other path excludes the target here; this one didn't (CNG-024).
                    screenToSend = Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Others are voting on your question!';
                } else if (alreadyVoted) {
                    screenToSend = Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Your vote has been submitted! Please wait for others...';
                } else {
                    // The round's stored ballot, in the order everyone is already
                    // looking at. Re-shuffling here is how a refresh used to reorder
                    // the options under the voter (CNG-040). The fallback only covers
                    // a save from before ballots were stored.
                    answers = gameState.getBallot() ?? shuffleArray(
                        this.buildResults(gameState, targetPlayer || '').map(
                            ({ voters, ...a }) => a));
                    screenToSend = Screens.c4PickTheBestAnswerOutOfAList;
                    textToSend = 'Vote for the TRUTH!';
                }
                break;
                
            case GamePhase.ShowingLieResults:
                // Send to results screen too so they can see what happened. One builder
                // for every path - this branch was a pre-T6 hand-rolled copy of
                // buildResults, which is the shape that drifted into CNG-004 and
                // CNG-025 (see CNG-035).
                if (targetPlayer && gameState.getTruthForPlayer(targetPlayer)) {
                    answers = this.buildResults(gameState, targetPlayer);
                }
                screenToSend = Screens.h3ShowTheLiesAndTruths;
                textToSend = targetPlayer ? `Results for ${targetPlayer}!` : 'Results';
                break;
                
            case GamePhase.ShowingPoints:
                screenToSend = Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'Please wait while results are being shown...';
                break;
                
            case GamePhase.GameOver:
                screenToSend = Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'The game has ended!';
                break;
                
            default:
                screenToSend = Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'Please wait...';
        }
        
        // Send the corrected state to the player
        const emitState: any = {
            ...baseState,
            screen: screenToSend,
            text: textToSend,
            question: questionText,
            instructionText: instructionText,
            answers: answers,
            leaderboard: phase === GamePhase.GameOver || phase === GamePhase.ShowingPoints ? gameState.getLeaderboard() : undefined
        };
        
        // Always add targetPlayer if we have one
        if (targetPlayer) {
            emitState.targetPlayer = targetPlayer;
        }
        
        socket.emit('gameState', emitState);
    }

    /**
     * Where a spectator belongs right now. They follow the game - reveals and the winner
     * like everyone else, a waiting screen while the players work - but never a question,
     * a lie prompt, or a ballot.
     */
    private sendSpectatorToCurrentScreen(code: string, gameState: GameState, socket: Socket, name: string): void {
        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();
        const base = { sharedState: gameState.getSharedState(), name };

        switch (phase) {
            case GamePhase.ShowingLieResults:
                socket.emit('gameState', {
                    ...base,
                    screen: Screens.h3ShowTheLiesAndTruths,
                    text: 'Results for ' + targetPlayer + '!',
                    answers: this.buildResults(gameState, targetPlayer),
                    targetPlayer
                });
                break;
            case GamePhase.ShowingPoints:
                socket.emit('gameState', {
                    ...base,
                    screen: Screens.h5ShowThePointsForTheRound,
                    text: 'Points for this round!',
                    leaderboard: gameState.getLeaderboard()
                });
                break;
            case GamePhase.GameOver:
                socket.emit('gameState', {
                    ...base,
                    screen: Screens.h6ShowTheWinner,
                    text: 'Game Over!',
                    leaderboard: gameState.getLeaderboard()
                });
                break;
            default:
                socket.emit('gameState', {
                    ...base,
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: "You're watching this game. You'll see the results as they come in - you can join the board when the next game starts."
                });
        }
    }

    /** Register a mid-game arrival as a watcher and show them where the game is. */
    private addSpectator(code: string, gameState: GameState, socket: Socket, name: string): void {
        const socketInfo = this.socketStuff[code];
        if (socketInfo && !socketInfo.spectatorSockets.includes(socket.id)) {
            socketInfo.spectatorSockets.push(socket.id);
        }
        console.log('Spectator ' + name + ' watching game ' + code);
        this.sendSpectatorToCurrentScreen(code, gameState, socket, name);
    }

    // === PHASE TRANSITIONS ===
    //
    // One method per transition. Each was previously written out two or three times by
    // hand at the call sites, and the copies had drifted: one shuffled the reveal and
    // another didn't, one asked the target to lie about themselves (CNG-004), one
    // forgot to reset the round (CNG-025), several omitted targetPlayer (CNG-014).
    // Every one of those was a single copy falling out of step with its siblings.
    // Change behaviour here, once, and every path gets it. (CNG-023)

    /** truth + lies for a target, with who voted for each. */
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

    /**
     * Start the answering round: every player gets their own question.
     * Assigning here (rather than at the call site) is what keeps each player's question
     * recorded server-side - see CNG-006.
     */
    private beginAnsweringRound(code: string, gameState: GameState, hostText: string, seconds: number): void {
        gameState.setPhase(GamePhase.AnsweringQuestions);
        this.startPhaseTimer(code, gameState, seconds);

        this.sendToHost(code, {
            screen: Screens.h2InformationScreenWithTimer,
            text: hostText,
            timerValue: seconds
        });

        this.sendToSpectators(code, {
            screen: Screens.c2WaitingScreenJustWhateverText,
            text: 'Players are answering their questions...'
        });

        gameState.getUserNames().forEach(username => {
            const questionObj = gameState.assignQuestion(username);
            if (!questionObj) return;
            this.sendToUserSockets(code, username, 'gameState', {
                screen: Screens.c3SubmitTruth,
                text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                question: questionObj.question,
                questionIndex: questionObj.index,
                instructionText: 'Please answer this question truthfully about yourself'
            });
        });
    }

    /** Throw the round away and start it over from scratch. */
    private restartRound(code: string, gameState: GameState, hostText: string): void {
        gameState.clearAnswers();
        // Must also reset the lie round pointer and drop the abandoned round's lies and
        // votes, or the "fresh" round resumes mid-list (CNG-025).
        gameState.resetLieData();
        this.beginAnsweringRound(code, gameState, hostText, RESTART_SECONDS);
    }

    /** Everyone except the target writes a lie about the target; the target waits. */
    private beginLieRound(code: string, gameState: GameState, targetPlayer: string): void {
        gameState.setCurrentLieTargetPlayer(targetPlayer);
        gameState.setPhase(GamePhase.SubmittingLies);
        this.startPhaseTimer(code, gameState, ROUND_SECONDS);

        const truth = gameState.getTruthForPlayer(targetPlayer);

        this.sendToHost(code, {
            screen: Screens.h2InformationScreenWithTimer,
            text: 'Now submitting lies for ' + targetPlayer + '!',
            timerValue: ROUND_SECONDS
        });

        this.sendToSpectators(code, {
            screen: Screens.c2WaitingScreenJustWhateverText,
            text: 'Players are writing lies about ' + targetPlayer + '...'
        });

        gameState.getUserNames().forEach(username => {
            if (username === targetPlayer) {
                this.sendToUserSockets(code, username, 'gameState', {
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: 'Your truth has been submitted! Now others will submit lies for your question.',
                    targetPlayer
                });
            } else {
                this.sendToUserSockets(code, username, 'gameState', {
                    screen: Screens.c5SubmitLie,
                    text: 'Write a LIE for this question about ' + targetPlayer + ':\n\n' + (truth?.question || ''),
                    question: truth?.question || '',
                    targetPlayer,
                    instructionText: `Write a fooling answer for this question about ${targetPlayer}`
                });
            }
        });
    }

    /** Everyone except the target votes on the shuffled truth+lies; the target waits. */
    private beginVoting(code: string, gameState: GameState, targetPlayer: string): void {
        gameState.setPhase(GamePhase.VotingOnLies);
        this.startPhaseTimer(code, gameState, ROUND_SECONDS);

        const truth = gameState.getTruthForPlayer(targetPlayer);
        const lies = gameState.getLiesForPlayer(targetPlayer);
        // Shuffled ONCE so the truth isn't always in the same position, then stored:
        // every later send - including a resync after a refresh or a restart - reuses
        // this order rather than dealing a fresh shuffle (CNG-040).
        const answers = shuffleArray([
            { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
        ]);
        gameState.setBallot(answers);

        this.sendToHost(code, {
            screen: Screens.h2InformationScreenWithTimer,
            text: 'Voting on lies for ' + targetPlayer + '!',
            timerValue: ROUND_SECONDS,
            answers
        });

        this.sendToSpectators(code, {
            screen: Screens.c2WaitingScreenJustWhateverText,
            text: 'Players are voting on ' + targetPlayer + "'s answers..."
        });

        gameState.getUserNames().forEach(username => {
            if (username === targetPlayer) {
                this.sendToUserSockets(code, username, 'gameState', {
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: 'Others are voting on your question!',
                    targetPlayer
                });
            } else {
                this.sendToUserSockets(code, username, 'gameState', {
                    screen: Screens.c4PickTheBestAnswerOutOfAList,
                    text: 'Which one is the TRUTH about ' + targetPlayer + '?',
                    answers,
                    // Carry it explicitly. The old emits left the client merging whatever
                    // targetPlayer happened to still be in its state (CNG-014).
                    targetPlayer
                });
            }
        });
    }

    /**
     * Award points and reveal. Stops here deliberately - the host drives what happens
     * next, via continueFromResults. The timeout path used to auto-advance from here on
     * a blind timer and race the host (CNG-011).
     */
    private showLieResults(code: string, gameState: GameState, targetPlayer: string): void {
        gameState.calculateLiePoints(targetPlayer);
        gameState.setPhase(GamePhase.ShowingLieResults);
        // The host drives this screen; the backstop only covers them not being there.
        this.startPhaseTimer(code, gameState, BACKSTOP_SECONDS);

        // Not shuffled: H3 sorts these itself (lies first, truth last) for the reveal, so
        // one of the old copies shuffling and the other not made no visible difference -
        // it just made the two look meaningfully different when they weren't.
        const state: ClientGameState = {
            screen: Screens.h3ShowTheLiesAndTruths,
            text: 'Results for ' + targetPlayer + '!',
            answers: this.buildResults(gameState, targetPlayer),
            targetPlayer
        };

        this.sendToHost(code, state);
        this.sendToSpectators(code, state);
        gameState.getUserNames().forEach(username =>
            this.sendToUserSockets(code, username, 'gameState', state));
    }

    /**
     * Start the authoritative countdown for the segment we just entered. The host's
     * browser still counts down so players see a number, and still sends timerExpired as
     * a fallback, but the server no longer depends on it: a host who closes their tab used
     * to take the only clock in the game with them.
     */
    private startPhaseTimer(code: string, gameState: GameState, seconds: number): void {
        gameState.startTimer(seconds, () => {
            console.log('Server timer fired for game ' + code);
            this.handleTimerExpiry(code);
        });
    }

    /**
     * What to do when a round runs out of time. Reached from the server's own clock and
     * from the host's fallback timerExpired; both must behave identically, so neither gets
     * its own copy.
     */
    private handleTimerExpiry(code: string): void {
        const gameState = this.games[code];
        if (!gameState) return;

        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();

        switch (phase) {
            case GamePhase.AnsweringQuestions: {
                // Play on with whatever truths we have. Only start over if there is
                // nothing at all to work with.
                const nextTarget = gameState.getNextLieTargetPlayerSkippingMissing();
                if (nextTarget) {
                    console.log('Answer timer expired - proceeding with the answers we have');
                    this.beginLieRound(code, gameState, nextTarget);
                } else {
                    console.log('Answer timer expired with no answers - restarting round');
                    this.restartRound(code, gameState, 'No answers submitted! Please answer the questions.');
                }
                break;
            }

            case GamePhase.SubmittingLies: {
                if (!targetPlayer) break;

                if (gameState.getLiesForPlayer(targetPlayer).length > 0) {
                    // At least one lie: there's something to vote on, so vote on it.
                    console.log('Lie timer expired - voting on the lies we have');
                    this.beginVoting(code, gameState, targetPlayer);
                } else if (targetPlayer === gameState.getUserNames()[0]) {
                    // Nobody lied for the very first target: nothing has happened yet, so
                    // start the whole round over rather than marching through targets
                    // nobody is playing along with.
                    console.log('No lies for the first target - restarting round');
                    this.restartRound(code, gameState, 'No lies submitted! Starting fresh round.');
                } else {
                    console.log('No lies for ' + targetPlayer + ' - skipping to the next target');
                    this.advanceToNextLieRoundOrEnd(code, gameState);
                }
                break;
            }

            case GamePhase.VotingOnLies: {
                if (!targetPlayer) break;
                // Score whatever votes are in and reveal.
                console.log('Vote timer expired - scoring the votes we have');
                this.showLieResults(code, gameState, targetPlayer);
                break;
            }

            // The two screens the host normally drives. Reaching these means nobody is
            // driving - the host's tab is gone - so carry on without them (CNG-028).
            case GamePhase.ShowingLieResults:
                console.log('Nobody advanced the reveal - showing points');
                this.showPoints(code, gameState);
                break;

            case GamePhase.ShowingPoints:
                console.log('Nobody advanced the points screen - moving on');
                this.advanceToNextLieRoundOrEnd(code, gameState);
                break;

            default:
                // CollectingUsers and GameOver: nothing to move on to.
                console.log('Ignoring timer expiry for phase: ' + phase);
        }
    }

    /**
     * Restart the clock for any game that was mid-round when the server went down.
     * Timers can't be serialised, so without this a restored game would sit forever with
     * nobody's clock running - which would have turned CNG-002's restart-survival into a
     * game that resumes and then never moves.
     *
     * The round gets its full time back rather than the remainder. That's deliberate: the
     * reason to restart mid-game is to hot-patch code, and taking the players' thinking
     * time away as a side effect of the developer's rebuild would be its own bug.
     */
    /**
     * Drop every game no human has touched within maxIdleMs, along with its socket
     * tracking, from the RUNNING server. The load/save sweeps use the same window; this
     * exists because a server that stays up used to keep abandoned games (and their
     * churn) in memory until the next Ctrl+C (CNG-038). Policy set by the user
     * 2026-07-18: a 24-hour clean time.
     */
    pruneIdleGames(maxIdleMs: number): void {
        const now = Date.now();
        for (const code in this.games) {
            const gameState = this.games[code];
            if (now - gameState.getLastActivity() > maxIdleMs) {
                // Stop the clock first or its interval keeps ticking on a deleted game.
                gameState.stopTimer();
                delete this.games[code];
                delete this.socketStuff[code];
                console.log('Pruned idle game ' + code + ' (no human activity for ' + Math.round((now - gameState.getLastActivity()) / 60000) + ' min)');
            }
        }
    }

    resumeTimers(): void {
        for (const code in this.games) {
            const gameState = this.games[code];
            const phase = gameState.getPhase();
            if (phase === GamePhase.AnsweringQuestions ||
                phase === GamePhase.SubmittingLies ||
                phase === GamePhase.VotingOnLies) {
                console.log('Resuming timer for game ' + code + ' (' + phase + ')');
                this.startPhaseTimer(code, gameState, ROUND_SECONDS);
            } else if (phase === GamePhase.ShowingLieResults || phase === GamePhase.ShowingPoints) {
                // Host-driven screens still need their backstop back, or a game restored
                // here with no host would hang exactly as CNG-028 describes.
                console.log('Resuming backstop for game ' + code + ' (' + phase + ')');
                this.startPhaseTimer(code, gameState, BACKSTOP_SECONDS);
            }
        }
    }

    /**
     * Show the round's points. Reached from the host clicking Continue and from the
     * backstop when there is no host - one method, so they cannot drift (CNG-023).
     */
    private showPoints(code: string, gameState: GameState): void {
        gameState.setPhase(GamePhase.ShowingPoints);
        this.startPhaseTimer(code, gameState, BACKSTOP_SECONDS);

        const state: ClientGameState = {
            screen: Screens.h5ShowThePointsForTheRound,
            text: 'Points for this round!',
            leaderboard: gameState.getLeaderboard()
        };
        this.sendToHost(code, state);
        this.sendToPlayers(code, state);
    }

    /** Move to the next player's lie round, or end the game if there are none left. */
    private advanceToNextLieRoundOrEnd(code: string, gameState: GameState): void {
        const next = gameState.getNextLieTargetPlayerSkippingMissing();
        if (next) {
            this.beginLieRound(code, gameState, next);
        } else {
            this.endGameShowingWinner(code, gameState);
        }
    }

    private endGameShowingWinner(code: string, gameState: GameState): void {
        gameState.stopTimer();
        gameState.setPhase(GamePhase.GameOver);
        const leaderboard = gameState.getLeaderboard();
        const winner = leaderboard[0];
        const state: ClientGameState = {
            screen: Screens.h6ShowTheWinner,
            // The old copy in the timeout path read winner.name unguarded and would throw
            // on an empty leaderboard.
            text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!',
            leaderboard
        };
        this.sendToHost(code, state);
        this.sendToPlayers(code, state);
    }

    handleConnection(socket: Socket): void {
        console.log('a user connected', socket.id);

        // Ask the client to identify themselves
        socket.emit('identifyMe');

        socket.on('disconnect', () => {
            console.log('user disconnected', socket.id);
            
            // Clean up this socket from all games' socket tracking
            // IMPORTANT: Do NOT remove player from game state - only clean up socket connections
            for (const code in this.socketStuff) {
                const socketInfo = this.socketStuff[code];
                
                const spectatorIndex = socketInfo.spectatorSockets.indexOf(socket.id);
                if (spectatorIndex > -1) {
                    socketInfo.spectatorSockets.splice(spectatorIndex, 1);
                }

                // Check if this was a host socket and remove from the list
                const hostIndex = socketInfo.hostSocketIds.indexOf(socket.id);
                if (hostIndex > -1) {
                    socketInfo.hostSocketIds.splice(hostIndex, 1);
                    console.log('Host socket removed from game ' + code);
                }
                
                // Remove this socket from all players' socket arrays
                for (const username in socketInfo.playerSockets) {
                    const socketArray = socketInfo.playerSockets[username];
                    const index = socketArray.indexOf(socket.id);
                    if (index > -1) {
                        socketArray.splice(index, 1);
                        console.log(`Socket ${socket.id} removed from player ${username} in game ${code}`);
                    }
                    
                    // Clean up empty arrays (user has no active sockets)
                    if (socketArray.length === 0) {
                        delete socketInfo.playerSockets[username];
                        console.log(`Player ${username} has no active sockets in game ${code} (game state preserved)`);
                    }
                }
            }
        });

        socket.on('newGame', () => {
            const code = this.generateGameCode();
            const gameState = new GameState(code);
            
            // Add host as a user
            gameState.addUser('<host>', '🏠');
            
            this.games[code] = gameState;
            
            // Track host socket IDs (as list) and player sockets
            this.socketStuff[code] = {
                hostSocketIds: [socket.id],
                playerSockets: {},
                spectatorSockets: []
            };
            
            // Join the socket to the game room
            socket.join(code);
            
            console.log('new game ' + code + ' created.');
            
            socket.emit('gameState', {
                sharedState: gameState.getSharedState(),
                name: '<host>',
                screen: Screens.h1CollectingUsers,
                text: '',
                error: ''
            });
        });

        socket.on('joinGame', (code: string) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState) {
                console.log('joining game ' + code);
                gameState.touch();
                socket.join(code);
                
                // Initialize socket tracking if not exists (for loaded games)
                if (!this.socketStuff[code]) {
                    this.socketStuff[code] = { hostSocketIds: [], playerSockets: {}, spectatorSockets: [] };
                }
                
                socket.emit('gameState', {
                    sharedState: gameState.getSharedState(),
                    name: '',
                    emoji: '',
                    screen: Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture,
                    error: ''
                });
            } else {
                socket.emit('gameState', {
                    screen: Screens.g1NewGame,
                    error: 'Invalid game code',
                    name: '',
                    emoji: '',
                    sharedState: {
                        users: {},
                        code
                    }
                });
            }
        });

        // Client identifies themselves as host or player after joining.
        // This is the reconnect path: a refreshed page lands here, so it must end by
        // telling the client where the game actually is. Leaving it to the client to
        // restore its own last screen from localStorage is what stranded refreshing
        // players on dead screens (CNG-005).
        socket.on('identify', ({ role, code, name }: { role: 'host' | 'player', code: string, name?: string }) => {
            code = normalizeCode(code);

            const gameState = this.games[code];
            if (!gameState) {
                console.log('identify for unknown game ' + code + ' - sending client back to the start');
                socket.emit('gameState', {
                    screen: Screens.g1NewGame,
                    error: 'That game no longer exists',
                    name: '',
                    emoji: '',
                    sharedState: { users: {}, code }
                });
                return;
            }

            // A human reconnecting counts as activity; the server's own churn does not
            // (CNG-033).
            gameState.touch();

            // Initialize socket tracking if not exists
            if (!this.socketStuff[code]) {
                this.socketStuff[code] = { hostSocketIds: [], playerSockets: {}, spectatorSockets: [] };
            }

            // Rejoin the room - a new socket after a refresh is not in it yet.
            socket.join(code);

            if (role === 'host') {
                // Only add if not already present in the list
                if (!this.socketStuff[code].hostSocketIds.includes(socket.id)) {
                    this.socketStuff[code].hostSocketIds.push(socket.id);
                }
                console.log('>>> HOST IDENTIFIED for game ' + code + ' (socket: ' + socket.id + ')');
                this.sendHostToCorrectScreen(code, gameState, socket);
            } else if (role === 'player' && name) {
                // Same loose matching as nameAndEmoji, or reclaim-by-refresh breaks in
                // exactly the cases reclaim-by-typing works (CNG-031).
                const canonical = gameState.findUserName(name);

                if (!canonical) {
                    if (gameState.getPhase() === GamePhase.CollectingUsers) {
                        // Game hasn't started - they can simply pick a name and play.
                        console.log('identify for unknown player ' + name + ' in game ' + code);
                        socket.emit('gameState', {
                            screen: Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture,
                            name: '',
                            emoji: '',
                            sharedState: gameState.getSharedState()
                        });
                    } else {
                        // Mid-game and they match nobody (server restarted and dropped
                        // the save, or they're new): they watch. Also what makes a
                        // refreshing spectator resume watching instead of bouncing back
                        // to the name screen.
                        this.addSpectator(code, gameState, socket, name);
                    }
                    return;
                }

                if (!this.socketStuff[code].playerSockets[canonical]) {
                    this.socketStuff[code].playerSockets[canonical] = [];
                }
                // Only add if not already present
                if (!this.socketStuff[code].playerSockets[canonical].includes(socket.id)) {
                    this.socketStuff[code].playerSockets[canonical].push(socket.id);
                }
                console.log('>>> PLAYER ' + canonical + ' IDENTIFIED for game ' + code + ' (socket: ' + socket.id + ')');
                this.sendPlayerToCorrectScreen(code, gameState, canonical, socket);
            }
        });

        socket.on('nameAndEmoji', ({ name, emoji, code }: { name: string; emoji: string; code: string }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
             if (gameState) {
                 // Initialize socket tracking if not exists (for loaded games)
                 if (!this.socketStuff[code]) {
                     this.socketStuff[code] = { hostSocketIds: [], playerSockets: {}, spectatorSockets: [] };
                 }

                 gameState.touch();
                 socket.join(code);

                 const trimmed = validateName(name);
                 if (!trimmed) {
                     socket.emit('gameState', {
                         screen: Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture,
                         error: 'Please pick a usable name',
                         name: '',
                         emoji: '',
                         sharedState: gameState.getSharedState()
                     });
                     return;
                 }

                 // Match loosely, keep the stored spelling: "Bob" retyping " bob " on a
                 // new device is the supported reconnect path, and exact matching forked
                 // a ghost player into the live game (CNG-031).
                 const existing = gameState.findUserName(trimmed);

                 if (!existing && gameState.getPhase() !== GamePhase.CollectingUsers) {
                     // Once a game starts, a name that matches nobody doesn't join the
                     // board - they watch (user ruling, 2026-07-16). They can play when
                     // the next game starts.
                     this.addSpectator(code, gameState, socket, trimmed);
                     return;
                 }

                 // The name everyone else already sees, or the new player's as typed.
                 const canonical = existing ?? trimmed;
                 if (!existing) {
                     gameState.addUser(canonical, emoji);
                 }

                 // Track player socket - ADD to array, don't replace
                 if (!this.socketStuff[code].playerSockets[canonical]) {
                     this.socketStuff[code].playerSockets[canonical] = [];
                 }
                 if (!this.socketStuff[code].playerSockets[canonical].includes(socket.id)) {
                     this.socketStuff[code].playerSockets[canonical].push(socket.id);
                 }

                console.log('User ' + canonical + ' joined game ' + code + ' (phase: ' + gameState.getPhase() + ')');
                
                // Notify host of new user
                this.sendToHost(code, {
                    sharedState: gameState.getSharedState(),
                    name: '<host>',
                    screen: this.getHostScreen(gameState)
                });
                
                // Use the single source of truth function to send player to correct
                // screen. It carries name: canonical, which is how a sloppy retype
                // learns the spelling the game knows them by.
                this.sendPlayerToCorrectScreen(code, gameState, canonical, socket);
            } else {
                socket.emit('gameState', {
                    screen: Screens.g1NewGame,
                    error: 'Invalid game code',
                    name: '',
                    emoji: '',
                    sharedState: {
                        users: {},
                        code
                    }
                });
            }
        });

        // Asked for by the host screen, and only when its own address bar says localhost.
        // See buildJoinUrl for why the client decides this rather than the server.
        socket.on('requestJoinHost', () => {
            const lanHost = getLanHost();
            console.log('Join host requested, offering: ' + lanHost);
            socket.emit('joinHost', { lanHost });
        });

        socket.on('startGame', ({ code }: { code: string }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState) {
                console.log('>>> Starting game ' + code + ' <<<');
                console.log('Current phase before start: ' + gameState.getPhase());
                
                const phase = gameState.getPhase();
                
                // If game already in progress, send host to correct screen instead of ignoring
                if (phase !== GamePhase.CollectingUsers) {
                    console.log('Game already in progress, sending host to correct screen');
                    // Send directly to the socket that called startGame (the host)
                    this.sendHostToCorrectScreen(code, gameState, socket);
                    return;
                }
                
                // Get users BEFORE starting
                const userNames = gameState.getUserNames();
                console.log('Users in game:', userNames);
                
                // Check we have enough players
                if (userNames.length < 2) {
                    console.log('Not enough players to start!');
                    this.sendToHost(code, {
                        screen: Screens.h1CollectingUsers,
                        text: 'Need at least 2 players to start!'
                    });
                    return;
                }
                
                // Wipe anything left from a previous game in this room: answers, question
                // assignments, lies, votes, the lie target, and the used-question pool.
                // resetLieData() alone left answers and the pool behind (CNG-010).
                gameState.touch();
                gameState.resetForNewGame();

                this.beginAnsweringRound(code, gameState,
                    'Truthfully answer the questions on your device.', ROUND_SECONDS);
            }
        });

        socket.on('sendQuestionAnswer', ({ name, code, answer, question }: { 
            name: string; 
            code: string; 
            answer: string;
            question: string;
        }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState) {
                // Check if this event makes sense for the current game state
                if (gameState.getPhase() !== GamePhase.AnsweringQuestions) {
                    console.log('ERROR: Received answer but not in AnsweringQuestions phase. Resyncing player.');
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                
                console.log('User ' + name + ' answered: ' + answer);

                // Prefer the question the server actually handed out over the one the
                // client echoed back; fall back only if there's no record.
                const assigned = gameState.getAssignedQuestion(name);
                gameState.addAnswer(name, assigned?.question ?? question, answer);
                
                // Check if all users have answered
                if (gameState.allUsersHaveAnswered()) {
                    console.log('ALL PLAYERS HAVE ANSWERED! Transitioning to lie phase.');
                    this.advanceToNextLieRoundOrEnd(code, gameState);
                } else {
                    // All of this player's devices, not just the one that submitted -
                    // otherwise their other tab sits there still showing the question
                    // (CNG-026).
                    this.sendToUserSockets(code, name, 'gameState', {
                        screen: Screens.c2WaitingScreenJustWhateverText,
                        text: 'Thank you for your answer! Please wait for others to finish...'
                    });
                }
            }
        });

        // Handler for submitting a lie
        socket.on('submitLie', ({ name, code, lie, targetPlayer, question }: { 
            name: string; 
            code: string; 
            lie: string;
            targetPlayer: string;
            question: string;
        }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState) {
                // Check if this event makes sense for the current game state
                if (gameState.getPhase() !== GamePhase.SubmittingLies) {
                    console.log('ERROR: Received lie but not in SubmittingLies phase. Resyncing player.');
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                
                // Verify the targetPlayer matches the current lie target
                const currentTarget = gameState.getCurrentLieTargetPlayer();
                if (targetPlayer !== currentTarget) {
                    console.log('ERROR: Received lie for wrong target. Expected ' + currentTarget + ' but got ' + targetPlayer);
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                
                console.log('User ' + name + ' submitted lie for ' + targetPlayer + ': ' + lie);
                
                // Store the lie
                gameState.addLie(targetPlayer, name, lie);
                
                // Check if all lies are submitted
                if (gameState.allLiesSubmittedForTarget(targetPlayer)) {
                    console.log('All lies submitted, proceeding to voting...');
                    this.beginVoting(code, gameState, targetPlayer);
                } else {
                    // All of this player's devices - see CNG-026.
                    this.sendToUserSockets(code, name, 'gameState', {
                        screen: Screens.c2WaitingScreenJustWhateverText,
                        text: 'Lie submitted! Waiting for others to submit their lies...'
                    });
                }
            }
        });

        // Handler for voting on lies
        socket.on('voteOnLie', ({ name, code, selectedUsername, targetPlayer }: { 
            name: string; 
            code: string; 
            selectedUsername: string;
            targetPlayer: string;
        }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState) {
                // Check if this event makes sense for the current game state
                if (gameState.getPhase() !== GamePhase.VotingOnLies) {
                    console.log('ERROR: Received vote but not in VotingOnLies phase. Resyncing player.');
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                
                // Verify the targetPlayer matches the current lie target
                const currentTarget = gameState.getCurrentLieTargetPlayer();
                if (targetPlayer !== currentTarget) {
                    console.log('ERROR: Received vote for wrong target. Expected ' + currentTarget + ' but got ' + targetPlayer);
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                
                // The ballot hides your own answer, so no honest client can send this -
                // but the server never checked, and calculateLiePoints would happily pay
                // out 500 a head for it (CNG-020).
                if (selectedUsername === name) {
                    console.log('ERROR: ' + name + ' voted for their own answer. Resyncing player.');
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }

                console.log('User ' + name + ' voted for ' + selectedUsername + ' (target: ' + targetPlayer + ')');
                
                // Store the vote
                gameState.addVote(targetPlayer, name, selectedUsername);
                
                // Check if all votes are in
                if (gameState.allVotesSubmittedForTarget(targetPlayer)) {
                    // Stops at the reveal - the host drives what happens next.
                    this.showLieResults(code, gameState, targetPlayer);
                } else {
                    // All of this player's devices. A sibling tab left showing a live
                    // ballot is how one player casts two votes (CNG-026).
                    this.sendToUserSockets(code, name, 'gameState', {
                        screen: Screens.c2WaitingScreenJustWhateverText,
                        text: 'Vote submitted! Waiting for others to vote...'
                    });
                }
            }
        });

        // Host clicks continue on results screen
        socket.on('continueFromResults', ({ code }: { code: string }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState && gameState.getPhase() === GamePhase.ShowingLieResults) {
                gameState.touch();
                this.showPoints(code, gameState);
            }
        });

        // Host clicks continue on scores screen
        socket.on('continueFromScores', ({ code }: { code: string }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState && gameState.getPhase() === GamePhase.ShowingPoints) {
                gameState.touch();
                // Next player's round, or the winner if that was the last one.
                this.advanceToNextLieRoundOrEnd(code, gameState);
            }
        });


        // Nothing in the current client emits this; it stays because the
        // host-exclusion test drives it, and that test depends on its host/player
        // screen split (see CNG-034 for why its two orphaned siblings were deleted).
        socket.on('endGame', ({ code }: { code: string }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            
            if (gameState && gameState.getPhase() !== GamePhase.GameOver) {
                gameState.stopTimer();
                gameState.setPhase(GamePhase.GameOver);
                
                const leaderboard = gameState.getLeaderboard();
                const winner = leaderboard.length > 0 ? leaderboard[0] : null;
                
                // Show winner to host
                this.sendToHost(code, {
                    screen: Screens.h6ShowTheWinner,
                    text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'No winner',
                    leaderboard
                });
                
                // Show leaderboard to players
                this.sendToPlayers(code, {
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: winner ? `Game Over! Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!'
                });
            }
        });

        // Fallback only. The server owns the clock (startPhaseTimer); this exists because
        // the host's browser also counts down, and if the server's timer somehow never
        // started, the host's is a second chance rather than the only chance.
        //
        // Still token-guarded: two host tabs means two of these, and without the guard the
        // second lands in the phase the first just created and cascades (CNG-003). A
        // missing token means a stale client bundle - an event we can't place in time is
        // not one to act on.
        socket.on('timerExpired', ({ code, phaseToken }: { code: string; phaseToken?: number }) => {
            code = normalizeCode(code);
            const gameState = this.games[code];
            if (!gameState) return;

            const currentToken = gameState.getPhaseToken();
            if (phaseToken !== currentToken) {
                console.log('Ignoring stale timerExpired (token ' + phaseToken + ', current ' + currentToken + ')');
                return;
            }

            console.log('Host reported timer expiry for game ' + code);
            this.handleTimerExpiry(code);
        });
    }
}
