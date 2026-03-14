"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketHandlers = void 0;
const GameState_1 = require("./GameState");
const IncludeStuff_1 = require("./IncludeStuff");
class SocketHandlers {
    constructor(io, games) {
        this.io = io;
        this.games = games;
        this.socketStuff = {};
    }
    generateGameCode() {
        const charactersToUse = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return Array.from({ length: 5 }, () => charactersToUse.charAt(Math.floor(Math.random() * charactersToUse.length))).join('');
    }
    sendToRoom(gameCode, event, data) {
        this.io.to(gameCode).emit(event, data);
    }
    sendToSocket(socketId, event, data) {
        this.io.to(socketId).emit(event, data);
    }
    sendToHost(gameCode, data) {
        const socketInfo = this.socketStuff[gameCode];
        console.log('sendToHost called:', { gameCode, hasSocketInfo: !!socketInfo, hostSocketId: socketInfo === null || socketInfo === void 0 ? void 0 : socketInfo.hostSocketId, screen: data.screen });
        if (socketInfo && socketInfo.hostSocketId) {
            this.io.to(socketInfo.hostSocketId).emit('gameState', data);
        }
        else {
            console.log('WARNING: sendToHost no host socket found for game', gameCode);
        }
    }
    sendToPlayers(gameCode, data) {
        const socketInfo = this.socketStuff[gameCode];
        if (socketInfo && socketInfo.hostSocketId) {
            // Send to all except host
            this.io.in(gameCode).except(socketInfo.hostSocketId).emit('gameState', data);
        }
        else {
            // Fallback: send to everyone
            this.io.to(gameCode).emit('gameState', data);
        }
    }
    getClientState(gameState, name = '', screen) {
        const state = {
            sharedState: gameState.getSharedState(),
            name,
            emoji: '',
            screen: screen,
            error: '',
            text: ''
        };
        if (name && gameState.getSharedState().users[name]) {
            state.emoji = gameState.getSharedState().users[name].emoji;
        }
        return state;
    }
    getHostScreen(gameState) {
        switch (gameState.getPhase()) {
            case GameState_1.GamePhase.CollectingUsers:
                return IncludeStuff_1.Screens.h1CollectingUsers;
            case GameState_1.GamePhase.AnsweringQuestions:
                return IncludeStuff_1.Screens.h2InformationScreenWithTimer;
            case GameState_1.GamePhase.SubmittingLies:
                return IncludeStuff_1.Screens.h2InformationScreenWithTimer;
            case GameState_1.GamePhase.VotingOnLies:
                return IncludeStuff_1.Screens.h2InformationScreenWithTimer;
            case GameState_1.GamePhase.ShowingLieResults:
                return IncludeStuff_1.Screens.h3ShowTheLiesAndTruths;
            case GameState_1.GamePhase.ShowingPoints:
                return IncludeStuff_1.Screens.h5ShowThePointsForTheRound;
            case GameState_1.GamePhase.GameOver:
                return IncludeStuff_1.Screens.h6ShowTheWinner;
            default:
                return IncludeStuff_1.Screens.h1CollectingUsers;
        }
    }
    sendHostToCorrectScreen(code, gameState, hostSocket) {
        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();
        const baseState = {
            sharedState: gameState.getSharedState(),
            name: '<host>'
        };
        // Helper to send to host - either via stored socket or provided socket
        const sendState = (state) => {
            if (hostSocket) {
                // Send directly to the socket that called startGame
                hostSocket.emit('gameState', state);
            }
            else {
                // Fallback to stored host socket
                this.sendToHost(code, state);
            }
        };
        switch (phase) {
            case GameState_1.GamePhase.AnsweringQuestions:
                sendState({
                    ...baseState,
                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                    text: 'Truthfully answer the questions on your device.',
                    timerValue: gameState.getTimerValue() || 60
                });
                break;
            case GameState_1.GamePhase.SubmittingLies:
                sendState({
                    ...baseState,
                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                    text: targetPlayer ? `Now submitting lies for ${targetPlayer}!` : 'Submitting lies...',
                    timerValue: gameState.getTimerValue() || 60
                });
                break;
            case GameState_1.GamePhase.VotingOnLies:
                sendState({
                    ...baseState,
                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                    text: targetPlayer ? `Voting on lies for ${targetPlayer}!` : 'Voting...',
                    timerValue: gameState.getTimerValue() || 60
                });
                break;
            case GameState_1.GamePhase.ShowingLieResults:
                const truth1 = targetPlayer ? gameState.getTruthForPlayer(targetPlayer) : null;
                const lies1 = targetPlayer ? gameState.getLiesForPlayer(targetPlayer) : [];
                const votes1 = targetPlayer ? gameState.getVotesForPlayer(targetPlayer) : [];
                if (targetPlayer && truth1) {
                    const allAnswers = [
                        { username: targetPlayer, answer: truth1.answer, isTruth: true },
                        ...lies1.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    const voteCounts = {};
                    votes1.forEach(v => {
                        if (!voteCounts[v.selectedUsername])
                            voteCounts[v.selectedUsername] = [];
                        voteCounts[v.selectedUsername].push(v.voter);
                    });
                    const results = allAnswers.map(a => ({
                        username: a.username,
                        answer: a.answer,
                        isTruth: a.isTruth,
                        voters: voteCounts[a.username] || []
                    }));
                    sendState({
                        ...baseState,
                        screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                        text: `Results for ${targetPlayer}!`,
                        answers: results
                    });
                }
                else {
                    sendState({ ...baseState, screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths });
                }
                break;
            case GameState_1.GamePhase.ShowingPoints:
                sendState({
                    ...baseState,
                    screen: IncludeStuff_1.Screens.h5ShowThePointsForTheRound,
                    text: targetPlayer ? `Points for ${targetPlayer}'s round!` : 'Points!',
                    leaderboard: gameState.getLeaderboard()
                });
                break;
            case GameState_1.GamePhase.GameOver:
                const leaderboard = gameState.getLeaderboard();
                const winner = leaderboard[0];
                sendState({
                    ...baseState,
                    screen: IncludeStuff_1.Screens.h6ShowTheWinner,
                    text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!',
                    leaderboard
                });
                break;
            default:
                sendState({ ...baseState, screen: IncludeStuff_1.Screens.h1CollectingUsers });
        }
    }
    /**
     * Sends a player to the correct screen based on game state and their name.
     * This is the single source of truth for where a player should be.
     * Used for reconnects and when players send events at wrong times.
     */
    sendPlayerToCorrectScreen(code, gameState, playerName, socket) {
        var _a, _b;
        const phase = gameState.getPhase();
        const targetPlayer = gameState.getCurrentLieTargetPlayer();
        const baseState = {
            sharedState: gameState.getSharedState(),
            name: playerName
        };
        // Get user emoji if available
        if (gameState.getSharedState().users[playerName]) {
            baseState.emoji = gameState.getSharedState().users[playerName].emoji;
        }
        let screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
        let textToSend = 'Please wait...';
        let questionText = '';
        let instructionText = '';
        let answers = [];
        switch (phase) {
            case GameState_1.GamePhase.CollectingUsers:
                screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'Please wait for the host to start the game...';
                break;
            case GameState_1.GamePhase.AnsweringQuestions:
                // Check if user already answered
                const userAnswers = gameState['userAnswers'];
                if (userAnswers && userAnswers[playerName]) {
                    screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Your answer has been submitted! Please wait for others...';
                }
                else {
                    // Send question to answer
                    const questionObj = gameState.getNextQuestion();
                    screenToSend = IncludeStuff_1.Screens.c3SubmitTruth;
                    questionText = (questionObj === null || questionObj === void 0 ? void 0 : questionObj.question) || '';
                    instructionText = 'Please answer this question truthfully about yourself';
                    textToSend = questionObj ? `Please answer this question:\n\n${questionObj.question}` : 'No question available';
                }
                break;
            case GameState_1.GamePhase.SubmittingLies:
                if (targetPlayer === playerName) {
                    screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Your truth has been submitted! Now others will submit lies for your question.';
                }
                else {
                    const truth = gameState.getTruthForPlayer(targetPlayer || '');
                    const userLies = gameState['lies'];
                    if (userLies && ((_a = userLies[targetPlayer]) === null || _a === void 0 ? void 0 : _a.some((l) => l.username === playerName))) {
                        screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                        textToSend = 'Your lie has been submitted! Please wait for others...';
                    }
                    else {
                        screenToSend = IncludeStuff_1.Screens.c5SubmitLie;
                        questionText = (truth === null || truth === void 0 ? void 0 : truth.question) || '';
                        instructionText = `Write a fooling answer for this question about ${targetPlayer}`;
                        textToSend = truth ? `Write a LIE for this question about ${targetPlayer}:\n\n${truth.question}` : 'No question available';
                    }
                }
                break;
            case GameState_1.GamePhase.VotingOnLies:
                const userVotes = gameState['votes'];
                if (userVotes && ((_b = userVotes[targetPlayer]) === null || _b === void 0 ? void 0 : _b.some((v) => v.voter === playerName))) {
                    screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Your vote has been submitted! Please wait for others...';
                }
                else {
                    const truth = gameState.getTruthForPlayer(targetPlayer || '');
                    const lies = gameState.getLiesForPlayer(targetPlayer || '');
                    const allAnswers = [
                        { username: targetPlayer, answer: (truth === null || truth === void 0 ? void 0 : truth.answer) || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    answers = allAnswers.sort(() => Math.random() - 0.5);
                    screenToSend = IncludeStuff_1.Screens.c4PickTheBestAnswerOutOfAList;
                    textToSend = 'Vote for the TRUTH!';
                }
                break;
            case GameState_1.GamePhase.ShowingLieResults:
                // Send to results screen too so they can see what happened
                const truth2 = targetPlayer ? gameState.getTruthForPlayer(targetPlayer) : null;
                const lies2 = targetPlayer ? gameState.getLiesForPlayer(targetPlayer) : [];
                const votes2 = targetPlayer ? gameState.getVotesForPlayer(targetPlayer) : [];
                const leaderboard = gameState.getLeaderboard();
                if (targetPlayer && truth2) {
                    const allAnswers2 = [
                        { username: targetPlayer, answer: truth2.answer, isTruth: true },
                        ...lies2.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    const voteCounts = {};
                    votes2.forEach(v => {
                        if (!voteCounts[v.selectedUsername]) {
                            voteCounts[v.selectedUsername] = [];
                        }
                        voteCounts[v.selectedUsername].push(v.voter);
                    });
                    answers = allAnswers2.map(a => ({
                        username: a.username,
                        answer: a.answer,
                        isTruth: a.isTruth,
                        voters: voteCounts[a.username] || []
                    }));
                }
                screenToSend = IncludeStuff_1.Screens.h3ShowTheLiesAndTruths;
                textToSend = targetPlayer ? `Results for ${targetPlayer}!` : 'Results';
                break;
            case GameState_1.GamePhase.ShowingPoints:
                screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'Please wait while results are being shown...';
                break;
            case GameState_1.GamePhase.GameOver:
                screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'The game has ended!';
                break;
            default:
                screenToSend = IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText;
                textToSend = 'Please wait...';
        }
        // Send the corrected state to the player
        socket.emit('gameState', {
            ...baseState,
            screen: screenToSend,
            text: textToSend,
            question: questionText,
            instructionText: instructionText,
            answers: answers,
            leaderboard: phase === GameState_1.GamePhase.GameOver || phase === GameState_1.GamePhase.ShowingPoints ? gameState.getLeaderboard() : undefined
        });
    }
    handleConnection(socket) {
        console.log('a user connected', socket.id);
        // Ask the client to identify themselves
        socket.emit('identifyMe');
        socket.on('disconnect', () => {
            console.log('user disconnected', socket.id);
        });
        socket.on('newGame', () => {
            const code = this.generateGameCode();
            const gameState = new GameState_1.GameState(code);
            // Add host as a user
            gameState.addUser('<host>', '🏠');
            this.games[code] = gameState;
            // Track host socket ID and player sockets
            this.socketStuff[code] = {
                hostSocketId: socket.id,
                playerSockets: {}
            };
            // Join the socket to the game room
            socket.join(code);
            console.log('new game ' + code + ' created.');
            socket.emit('gameState', {
                sharedState: gameState.getSharedState(),
                name: '<host>',
                screen: IncludeStuff_1.Screens.h1CollectingUsers,
                error: ''
            });
        });
        socket.on('joinGame', (code) => {
            const gameState = this.games[code];
            if (gameState) {
                console.log('joining game ' + code);
                socket.join(code);
                // Initialize socket tracking if not exists (for loaded games)
                if (!this.socketStuff[code]) {
                    this.socketStuff[code] = { hostSocketId: undefined, playerSockets: {} };
                }
                socket.emit('gameState', {
                    sharedState: gameState.getSharedState(),
                    name: '',
                    emoji: '',
                    screen: IncludeStuff_1.Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture,
                    error: ''
                });
            }
            else {
                socket.emit('gameState', {
                    screen: IncludeStuff_1.Screens.g1NewGame,
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
        // Client identifies themselves as host or player after joining
        socket.on('identify', ({ role, code, name }) => {
            // Initialize socket tracking if not exists
            if (!this.socketStuff[code]) {
                this.socketStuff[code] = { hostSocketId: undefined, playerSockets: {} };
            }
            if (role === 'host') {
                this.socketStuff[code].hostSocketId = socket.id;
                console.log('>>> HOST IDENTIFIED for game ' + code + ' (socket: ' + socket.id + ')');
            }
            else if (role === 'player' && name) {
                this.socketStuff[code].playerSockets[name] = socket.id;
                console.log('>>> PLAYER ' + name + ' IDENTIFIED for game ' + code + ' (socket: ' + socket.id + ')');
            }
        });
        socket.on('nameAndEmoji', ({ name, emoji, code }) => {
            const gameState = this.games[code];
            if (gameState) {
                // Initialize socket tracking if not exists (for loaded games)
                if (!this.socketStuff[code]) {
                    this.socketStuff[code] = { hostSocketId: undefined, playerSockets: {} };
                }
                // If user already exists, replace them (allows reconnection)
                if (gameState.userExists(name)) {
                    gameState.removeUser(name);
                    // Remove old socket mapping
                    if (this.socketStuff[code] && this.socketStuff[code].playerSockets) {
                        delete this.socketStuff[code].playerSockets[name];
                    }
                }
                gameState.addUser(name, emoji);
                socket.join(code);
                // Track player socket
                if (this.socketStuff[code]) {
                    this.socketStuff[code].playerSockets[name] = socket.id;
                }
                console.log('User ' + name + ' joined game ' + code + ' (phase: ' + gameState.getPhase() + ')');
                // Notify host of new user
                this.sendToHost(code, {
                    sharedState: gameState.getSharedState(),
                    name: '<host>',
                    screen: this.getHostScreen(gameState)
                });
                // Use the single source of truth function to send player to correct screen
                this.sendPlayerToCorrectScreen(code, gameState, name, socket);
            }
            else {
                socket.emit('gameState', {
                    screen: IncludeStuff_1.Screens.g1NewGame,
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
        socket.on('startGame', ({ code }) => {
            const gameState = this.games[code];
            if (gameState) {
                console.log('>>> Starting game ' + code + ' <<<');
                console.log('Current phase before start: ' + gameState.getPhase());
                const phase = gameState.getPhase();
                // If game already in progress, send host to correct screen instead of ignoring
                if (phase !== GameState_1.GamePhase.CollectingUsers) {
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
                        screen: IncludeStuff_1.Screens.h1CollectingUsers,
                        text: 'Need at least 2 players to start!'
                    });
                    return;
                }
                gameState.setPhase(GameState_1.GamePhase.AnsweringQuestions);
                // Set timer start time
                gameState.setTimerValue(60);
                // Send timer screen to host only
                this.sendToHost(code, {
                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                    text: 'Truthfully answer the questions on your device.',
                    timerValue: 60
                });
                // Assign DIFFERENT question to each player
                userNames.forEach(username => {
                    // Get a unique question for each player
                    const questionObj = gameState.getNextQuestion();
                    if (questionObj) {
                        // Send to specific player using their socket
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                            const playerSocketId = socketInfo.playerSockets[username];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.c3SubmitTruth,
                                text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                                question: questionObj.question,
                                questionIndex: questionObj.index,
                                instructionText: 'Please answer this question truthfully about yourself'
                            });
                        }
                    }
                });
            }
        });
        socket.on('sendQuestionAnswer', ({ name, code, answer, question }) => {
            const gameState = this.games[code];
            if (gameState) {
                // Check if this event makes sense for the current game state
                if (gameState.getPhase() !== GameState_1.GamePhase.AnsweringQuestions) {
                    console.log('ERROR: Received answer but not in AnsweringQuestions phase. Resyncing player.');
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                console.log('User ' + name + ' answered: ' + answer);
                // Store the answer
                gameState.addAnswer(name, question, answer);
                // Check if all users have answered
                if (gameState.allUsersHaveAnswered()) {
                    console.log('ALL PLAYERS HAVE ANSWERED! Transitioning to lie phase.');
                    // All truths are in! Start the lie phase.
                    // Get first player to target
                    const firstTarget = gameState.getNextLieTargetPlayer();
                    console.log('First target player:', firstTarget);
                    if (firstTarget) {
                        gameState.setCurrentLieTargetPlayer(firstTarget);
                        gameState.setPhase(GameState_1.GamePhase.SubmittingLies);
                        gameState.setTimerValue(60);
                        const truth = gameState.getTruthForPlayer(firstTarget);
                        const userNames = gameState.getUserNames();
                        // Send timer to host
                        console.log('Sending h2 to host with text: Now submitting lies for ' + firstTarget);
                        this.sendToHost(code, {
                            screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                            text: 'Now submitting lies for ' + firstTarget + '!',
                            timerValue: 60
                        });
                        // Send lie prompt to all OTHER players
                        userNames.forEach(username => {
                            if (username !== firstTarget) {
                                // This player should submit a lie for firstTarget's question
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: IncludeStuff_1.Screens.c5SubmitLie,
                                        text: 'Write a LIE for this question about ' + firstTarget + ':\n\n' + ((truth === null || truth === void 0 ? void 0 : truth.question) || ''),
                                        question: (truth === null || truth === void 0 ? void 0 : truth.question) || '',
                                        targetPlayer: firstTarget,
                                        instructionText: `Write a fooling answer for this question about ${firstTarget}`
                                    });
                                }
                            }
                        });
                        // Send waiting to target player (they already answered truth)
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[firstTarget]) {
                            const playerSocketId = socketInfo.playerSockets[firstTarget];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                                text: 'Your truth has been submitted! Now others will submit lies for your question.'
                            });
                        }
                    }
                }
                else {
                    // Send thank you / waiting screen to player
                    socket.emit('gameState', {
                        screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                        text: 'Thank you for your answer! Please wait for others to finish...'
                    });
                }
            }
        });
        // Handler for submitting a lie
        socket.on('submitLie', ({ name, code, lie, targetPlayer, question }) => {
            const gameState = this.games[code];
            if (gameState) {
                // Check if this event makes sense for the current game state
                if (gameState.getPhase() !== GameState_1.GamePhase.SubmittingLies) {
                    console.log('ERROR: Received lie but not in SubmittingLies phase. Resyncing player.');
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                console.log('User ' + name + ' submitted lie for ' + targetPlayer + ': ' + lie);
                // Store the lie
                gameState.addLie(targetPlayer, name, lie);
                // Check if all lies are submitted
                if (gameState.allLiesSubmittedForTarget(targetPlayer)) {
                    // All lies in! Move to voting immediately
                    console.log('All lies submitted, proceeding to voting...');
                    const userNames = gameState.getUserNames();
                    gameState.setPhase(GameState_1.GamePhase.VotingOnLies);
                    gameState.setTimerValue(60);
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    // Build all answers (truth + lies)
                    const allAnswers = [
                        { username: targetPlayer, answer: (truth === null || truth === void 0 ? void 0 : truth.answer) || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    // Shuffle for voting
                    const shuffledAnswers = [...allAnswers].sort(() => Math.random() - 0.5);
                    // Send timer to host
                    this.sendToHost(code, {
                        screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                        text: 'Voting on lies for ' + targetPlayer + '!',
                        timerValue: 60
                    });
                    // Send voting to all players except target
                    userNames.forEach(username => {
                        if (username !== targetPlayer) {
                            const socketInfo = this.socketStuff[code];
                            if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                const playerSocketId = socketInfo.playerSockets[username];
                                this.io.to(playerSocketId).emit('gameState', {
                                    screen: IncludeStuff_1.Screens.c4PickTheBestAnswerOutOfAList,
                                    text: 'Which one is the TRUTH about ' + targetPlayer + '?',
                                    answers: shuffledAnswers
                                });
                            }
                        }
                    });
                    // Send waiting to target player
                    const socketInfo = this.socketStuff[code];
                    if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[targetPlayer]) {
                        const playerSocketId = socketInfo.playerSockets[targetPlayer];
                        this.io.to(playerSocketId).emit('gameState', {
                            screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                            text: 'Others are voting on your question!'
                        });
                    }
                }
                else {
                    // Send waiting to player
                    socket.emit('gameState', {
                        screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                        text: 'Lie submitted! Waiting for others to submit their lies...'
                    });
                }
            }
        });
        // Handler for voting on lies
        socket.on('voteOnLie', ({ name, code, selectedUsername, targetPlayer }) => {
            const gameState = this.games[code];
            if (gameState) {
                // Check if this event makes sense for the current game state
                if (gameState.getPhase() !== GameState_1.GamePhase.VotingOnLies) {
                    console.log('ERROR: Received vote but not in VotingOnLies phase. Resyncing player.');
                    this.sendPlayerToCorrectScreen(code, gameState, name, socket);
                    return;
                }
                console.log('User ' + name + ' voted for ' + selectedUsername + ' (target: ' + targetPlayer + ')');
                // Store the vote
                gameState.addVote(targetPlayer, name, selectedUsername);
                // Check if all votes are in
                if (gameState.allVotesSubmittedForTarget(targetPlayer)) {
                    // All votes in! Calculate points and show results
                    gameState.calculateLiePoints(targetPlayer);
                    gameState.setPhase(GameState_1.GamePhase.ShowingLieResults);
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    const votes = gameState.getVotesForPlayer(targetPlayer);
                    const leaderboard = gameState.getLeaderboard();
                    // Build results
                    const allAnswers = [
                        { username: targetPlayer, answer: (truth === null || truth === void 0 ? void 0 : truth.answer) || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    // Count votes per answer
                    const voteCounts = {};
                    votes.forEach(v => {
                        if (!voteCounts[v.selectedUsername]) {
                            voteCounts[v.selectedUsername] = [];
                        }
                        voteCounts[v.selectedUsername].push(v.voter);
                    });
                    const results = allAnswers.map(a => ({
                        username: a.username,
                        answer: a.answer,
                        isTruth: a.isTruth,
                        voters: voteCounts[a.username] || []
                    }));
                    // Show results to host
                    this.sendToHost(code, {
                        screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                        text: 'Results for ' + targetPlayer + '!',
                        answers: results
                    });
                    // Show results to all players
                    const userNames = gameState.getUserNames();
                    userNames.forEach(username => {
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                            const playerSocketId = socketInfo.playerSockets[username];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                                text: 'Results for ' + targetPlayer + '!',
                                answers: results
                            });
                        }
                    });
                    // DO NOT auto-continue - wait for host to click Continue
                }
                else {
                    // Send waiting to player
                    socket.emit('gameState', {
                        screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                        text: 'Vote submitted! Waiting for others to vote...'
                    });
                }
            }
        });
        socket.on('selectBestAnswer', ({ code, selectedUsername }) => {
            const gameState = this.games[code];
            if (gameState) {
                // This is a legacy handler - we now use voteOnLie instead
                // But keep for backward compatibility - check phase
                if (gameState.getPhase() !== GameState_1.GamePhase.VotingOnLies && gameState.getPhase() !== GameState_1.GamePhase.ShowingPoints) {
                    console.log('ERROR: Received selectBestAnswer at wrong phase. Resyncing host.');
                    this.sendHostToCorrectScreen(code, gameState);
                    return;
                }
                console.log('Best answer selected: ' + selectedUsername);
                // Award points to the selected player
                gameState.addPoints(selectedUsername, 10);
                // Move to showing points phase
                gameState.setPhase(GameState_1.GamePhase.ShowingPoints);
                // Show points to host (H5)
                const leaderboard = gameState.getLeaderboard();
                this.sendToHost(code, {
                    screen: IncludeStuff_1.Screens.h5ShowThePointsForTheRound,
                    text: `${selectedUsername} got the most votes!`,
                    leaderboard
                });
                // Show waiting to players
                this.sendToPlayers(code, {
                    screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                    text: `The best answer was "${selectedUsername}"! Check the leaderboard on the host screen.`
                });
            }
        });
        socket.on('nextRound', ({ code }) => {
            const gameState = this.games[code];
            if (gameState) {
                // Start a new round
                gameState.setPhase(GameState_1.GamePhase.AnsweringQuestions);
                gameState.clearAnswers();
                // Send timer screen to host only
                this.sendToHost(code, {
                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                    text: 'Truthfully answer the questions on your device.',
                    timerValue: 30
                });
                // Assign new questions to each player
                const userNames = gameState.getUserNames();
                userNames.forEach(username => {
                    const questionObj = gameState.getNextQuestion();
                    if (questionObj) {
                        this.sendToPlayers(code, {
                            screen: IncludeStuff_1.Screens.c3SubmitTruth,
                            text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                            question: questionObj.question,
                            questionIndex: questionObj.index,
                            instructionText: 'Please answer this question truthfully about yourself'
                        });
                    }
                });
            }
        });
        // Host clicks continue on results screen
        socket.on('continueFromResults', ({ code }) => {
            const gameState = this.games[code];
            if (gameState && gameState.getPhase() === GameState_1.GamePhase.ShowingLieResults) {
                gameState.setPhase(GameState_1.GamePhase.ShowingPoints);
                this.sendToHost(code, {
                    screen: IncludeStuff_1.Screens.h5ShowThePointsForTheRound,
                    text: 'Points for this round!',
                    leaderboard: gameState.getLeaderboard()
                });
                this.sendToPlayers(code, {
                    screen: IncludeStuff_1.Screens.h5ShowThePointsForTheRound,
                    text: 'Points for this round!',
                    leaderboard: gameState.getLeaderboard()
                });
            }
        });
        // Host clicks continue on scores screen
        socket.on('continueFromScores', ({ code }) => {
            const gameState = this.games[code];
            if (gameState && gameState.getPhase() === GameState_1.GamePhase.ShowingPoints) {
                const targetPlayer = gameState.getCurrentLieTargetPlayer();
                const hasMoreTargets = gameState.getNextLieTargetPlayer() !== null;
                if (hasMoreTargets) {
                    // More players to process - move to next lie target
                    gameState.nextLieTarget();
                    const nextTargetPlayer = gameState.getCurrentLieTargetPlayer();
                    gameState.setPhase(GameState_1.GamePhase.SubmittingLies);
                    gameState.setTimerValue(60);
                    this.sendToHost(code, {
                        screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                        text: nextTargetPlayer + ' - submit your lies!',
                        timerValue: 60
                    });
                    const nextTruth = gameState.getTruthForPlayer(nextTargetPlayer);
                    const userNames = gameState.getUserNames();
                    const socketInfo = this.socketStuff[code];
                    // Send lie submission to next target
                    if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[nextTargetPlayer]) {
                        const playerSocketId = socketInfo.playerSockets[nextTargetPlayer];
                        this.io.to(playerSocketId).emit('gameState', {
                            screen: IncludeStuff_1.Screens.c5SubmitLie,
                            text: nextTruth ? `Write a LIE for this question about ${nextTargetPlayer}:\n\n${nextTruth.question}` : 'No question available',
                            question: nextTruth === null || nextTruth === void 0 ? void 0 : nextTruth.question,
                            instructionText: `Write a fooling answer for this question about ${nextTargetPlayer}`
                        });
                    }
                    // Send waiting to others
                    userNames.forEach(username => {
                        if (username !== nextTargetPlayer && socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                            const playerSocketId = socketInfo.playerSockets[username];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                                text: nextTargetPlayer + ' is writing a lie! Wait for your turn...'
                            });
                        }
                    });
                }
                else {
                    // No more players - end game
                    gameState.setPhase(GameState_1.GamePhase.GameOver);
                    this.sendToHost(code, {
                        screen: IncludeStuff_1.Screens.h6ShowTheWinner,
                        text: 'Game Over!',
                        leaderboard: gameState.getLeaderboard()
                    });
                    this.sendToPlayers(code, {
                        screen: IncludeStuff_1.Screens.h6ShowTheWinner,
                        text: 'Game Over!',
                        leaderboard: gameState.getLeaderboard()
                    });
                }
            }
        });
        socket.on('endGame', ({ code }) => {
            const gameState = this.games[code];
            if (gameState) {
                gameState.setPhase(GameState_1.GamePhase.GameOver);
                const leaderboard = gameState.getLeaderboard();
                const winner = leaderboard.length > 0 ? leaderboard[0] : null;
                // Show winner to host
                this.sendToHost(code, {
                    screen: IncludeStuff_1.Screens.h6ShowTheWinner,
                    text: winner ? `Winner: ${winner.name} with ${winner.points} points!` : 'No winner',
                    leaderboard
                });
                // Show leaderboard to players
                this.sendToPlayers(code, {
                    screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                    text: winner ? `Game Over! Winner: ${winner.name} with ${winner.points} points!` : 'Game Over!'
                });
            }
        });
        socket.on('timerExpired', ({ code }) => {
            const gameState = this.games[code];
            if (!gameState)
                return;
            const phase = gameState.getPhase();
            const prevPhase = gameState.getPhase(); // This is the same, but we'll check in handler
            console.log('Timer expired for game ' + code + ' phase: ' + phase);
            // If we're no longer in answeringQuestions, ignore this timer event
            // (It might be from a previous timer that was still running)
            if (phase !== GameState_1.GamePhase.AnsweringQuestions &&
                phase !== GameState_1.GamePhase.SubmittingLies &&
                phase !== GameState_1.GamePhase.VotingOnLies) {
                console.log('Ignoring timerExpired for phase: ' + phase);
                return;
            }
            if (phase === GameState_1.GamePhase.AnsweringQuestions) {
                // Timer expired during truth phase - check if we have answers, then start lie phase
                if (gameState.allUsersHaveAnswered()) {
                    // All answered, start lie phase (same logic as in sendQuestionAnswer)
                    const firstTarget = gameState.getNextLieTargetPlayer();
                    if (firstTarget) {
                        gameState.setCurrentLieTargetPlayer(firstTarget);
                        gameState.setPhase(GameState_1.GamePhase.SubmittingLies);
                        const truth = gameState.getTruthForPlayer(firstTarget);
                        const userNames = gameState.getUserNames();
                        this.sendToHost(code, {
                            screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                            text: 'Now submitting lies for ' + firstTarget + '!',
                            timerValue: 60
                        });
                        userNames.forEach(username => {
                            if (username !== firstTarget) {
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: IncludeStuff_1.Screens.c5SubmitLie,
                                        text: 'Write a LIE for this question about ' + firstTarget + ':\n\n' + ((truth === null || truth === void 0 ? void 0 : truth.question) || ''),
                                        question: (truth === null || truth === void 0 ? void 0 : truth.question) || '',
                                        targetPlayer: firstTarget,
                                        instructionText: `Write a fooling answer for this question about ${firstTarget}`
                                    });
                                }
                            }
                        });
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[firstTarget]) {
                            const playerSocketId = socketInfo.playerSockets[firstTarget];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                                text: 'Your truth has been submitted! Now others will submit lies for your question.'
                            });
                        }
                    }
                }
                else {
                    // Not all answered - check if ANY answers were submitted
                    const answerCount = Object.keys(gameState['userAnswers'] || {}).length;
                    if (answerCount === 0) {
                        // No one submitted any answers - restart the round
                        console.log('No answers submitted - restarting round');
                        gameState.setPhase(GameState_1.GamePhase.AnsweringQuestions);
                        gameState.clearAnswers();
                        gameState.setTimerValue(30);
                        // Send timer screen to host only
                        this.sendToHost(code, {
                            screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                            text: 'No answers submitted! Please answer the questions.',
                            timerValue: 30
                        });
                        // Re-send questions to all players
                        const userNames = gameState.getUserNames();
                        userNames.forEach(username => {
                            const questionObj = gameState.getNextQuestion();
                            if (questionObj) {
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: IncludeStuff_1.Screens.c3SubmitTruth,
                                        text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                                        question: questionObj.question,
                                        questionIndex: questionObj.index,
                                        instructionText: 'Please answer this question truthfully about yourself'
                                    });
                                }
                            }
                        });
                        return;
                    }
                    // PROCEED with game using available answers!
                    console.log('Timer expired but not all answered - proceeding with ' + answerCount + ' answers');
                    const firstTarget = gameState.getNextLieTargetPlayer();
                    if (firstTarget) {
                        gameState.setCurrentLieTargetPlayer(firstTarget);
                        gameState.setPhase(GameState_1.GamePhase.SubmittingLies);
                        gameState.setTimerValue(60);
                        const truth = gameState.getTruthForPlayer(firstTarget);
                        const userNames = gameState.getUserNames();
                        this.sendToHost(code, {
                            screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                            text: 'Now submitting lies for ' + firstTarget + '!',
                            timerValue: 60
                        });
                        userNames.forEach(username => {
                            if (username !== firstTarget) {
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: IncludeStuff_1.Screens.c5SubmitLie,
                                        text: 'Write a LIE for this question about ' + firstTarget + ':\n\n' + ((truth === null || truth === void 0 ? void 0 : truth.question) || ''),
                                        question: (truth === null || truth === void 0 ? void 0 : truth.question) || '',
                                        targetPlayer: firstTarget,
                                        instructionText: `Write a fooling answer for this question about ${firstTarget}`
                                    });
                                }
                            }
                        });
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[firstTarget]) {
                            const playerSocketId = socketInfo.playerSockets[firstTarget];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                                text: 'Your truth has been submitted! Now others will submit lies for your question.'
                            });
                        }
                    }
                }
            }
            else if (phase === GameState_1.GamePhase.SubmittingLies) {
                // Timer expired during lie submission - check if enough lies submitted
                const targetPlayer = gameState.getCurrentLieTargetPlayer();
                if (targetPlayer && gameState.allLiesSubmittedForTarget(targetPlayer)) {
                    // All lies in, move to voting (same as submitLie handler)
                    gameState.setPhase(GameState_1.GamePhase.VotingOnLies);
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    const userNames = gameState.getUserNames();
                    const allAnswers = [
                        { username: targetPlayer, answer: (truth === null || truth === void 0 ? void 0 : truth.answer) || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    const shuffledAnswers = [...allAnswers].sort(() => Math.random() - 0.5);
                    this.sendToHost(code, {
                        screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                        text: 'Voting on lies for ' + targetPlayer + '!',
                        timerValue: 60
                    });
                    userNames.forEach(username => {
                        if (username !== targetPlayer) {
                            const socketInfo = this.socketStuff[code];
                            if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                const playerSocketId = socketInfo.playerSockets[username];
                                this.io.to(playerSocketId).emit('gameState', {
                                    screen: IncludeStuff_1.Screens.c4PickTheBestAnswerOutOfAList,
                                    text: 'Which one is the TRUTH about ' + targetPlayer + '?',
                                    answers: shuffledAnswers
                                });
                            }
                        }
                    });
                    const socketInfo = this.socketStuff[code];
                    if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[targetPlayer]) {
                        const playerSocketId = socketInfo.playerSockets[targetPlayer];
                        this.io.to(playerSocketId).emit('gameState', {
                            screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                            text: 'Others are voting on your question!'
                        });
                    }
                }
                else {
                    // Not all lies in - PROCEED with game using available lies!
                    // Don't go back to lobby - just continue with who we have
                    console.log('Lie timer expired but not all lies submitted - proceeding with available lies');
                    const targetPlayer = gameState.getCurrentLieTargetPlayer();
                    if (targetPlayer) {
                        const truth = gameState.getTruthForPlayer(targetPlayer);
                        const lies = gameState.getLiesForPlayer(targetPlayer);
                        const userNames = gameState.getUserNames();
                        // If no lies were submitted, check if this is the first target
                        // If so, restart the round
                        if (lies.length === 0) {
                            const allUserNames = gameState.getUserNames();
                            // Check if this is the first target
                            const firstTarget = allUserNames[0];
                            if (targetPlayer === firstTarget) {
                                // No lies for the first player - restart the game
                                console.log('No lies submitted for first player - restarting round');
                                gameState.setPhase(GameState_1.GamePhase.AnsweringQuestions);
                                gameState.clearAnswers();
                                gameState.setTimerValue(30);
                                // Send timer screen to host only
                                this.sendToHost(code, {
                                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                                    text: 'No lies submitted! Starting fresh round.',
                                    timerValue: 30
                                });
                                // Re-send questions to all players
                                allUserNames.forEach(username => {
                                    const questionObj = gameState.getNextQuestion();
                                    if (questionObj) {
                                        const socketInfo = this.socketStuff[code];
                                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                            const playerSocketId = socketInfo.playerSockets[username];
                                            this.io.to(playerSocketId).emit('gameState', {
                                                screen: IncludeStuff_1.Screens.c3SubmitTruth,
                                                text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                                                question: questionObj.question,
                                                questionIndex: questionObj.index,
                                                instructionText: 'Please answer this question truthfully about yourself'
                                            });
                                        }
                                    }
                                });
                                return;
                            }
                            // Not first target - skip to next player
                            console.log('No lies submitted for ' + targetPlayer + ', skipping to next player');
                            // Move to next target player
                            gameState.nextLieTarget();
                            const nextTargetPlayer = gameState.getCurrentLieTargetPlayer();
                            if (nextTargetPlayer) {
                                // Send host to next round
                                this.sendToHost(code, {
                                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                                    text: nextTargetPlayer + ' - submit your lies!',
                                    timerValue: 60
                                });
                                // Send lie submission to next target
                                const nextTruth = gameState.getTruthForPlayer(nextTargetPlayer);
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[nextTargetPlayer]) {
                                    const playerSocketId = socketInfo.playerSockets[nextTargetPlayer];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: IncludeStuff_1.Screens.c5SubmitLie,
                                        text: nextTruth ? `Write a LIE for this question about ${nextTargetPlayer}:\n\n${nextTruth.question}` : 'No question available',
                                        question: nextTruth === null || nextTruth === void 0 ? void 0 : nextTruth.question,
                                        instructionText: `Write a fooling answer for this question about ${nextTargetPlayer}`
                                    });
                                }
                                // Send waiting to others
                                userNames.forEach(username => {
                                    if (username !== nextTargetPlayer && socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                        const playerSocketId = socketInfo.playerSockets[username];
                                        this.io.to(playerSocketId).emit('gameState', {
                                            screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                                            text: nextTargetPlayer + ' is writing a lie! Wait for your turn...'
                                        });
                                    }
                                });
                            }
                            else {
                                // No more players to process, move to showing results or end
                                console.log('No more lie targets, ending round');
                                gameState.setPhase(GameState_1.GamePhase.ShowingPoints);
                                this.sendToHost(code, {
                                    screen: IncludeStuff_1.Screens.h5ShowThePointsForTheRound,
                                    text: 'Round complete!',
                                    leaderboard: gameState.getLeaderboard()
                                });
                            }
                            return;
                        }
                        // Proceed with voting (at least 1 lie exists)
                        gameState.setPhase(GameState_1.GamePhase.VotingOnLies);
                        gameState.setTimerValue(60);
                        const allAnswers = [
                            { username: targetPlayer, answer: (truth === null || truth === void 0 ? void 0 : truth.answer) || '', isTruth: true },
                            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                        ];
                        const shuffledAnswers = [...allAnswers].sort(() => Math.random() - 0.5);
                        this.sendToHost(code, {
                            screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                            text: 'Voting on lies for ' + targetPlayer + '!',
                            timerValue: 60
                        });
                        userNames.forEach(username => {
                            if (username !== targetPlayer) {
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: IncludeStuff_1.Screens.c4PickTheBestAnswerOutOfAList,
                                        text: 'Which one is the TRUTH about ' + targetPlayer + '?',
                                        answers: shuffledAnswers
                                    });
                                }
                            }
                        });
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[targetPlayer]) {
                            const playerSocketId = socketInfo.playerSockets[targetPlayer];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                                text: 'Others are voting on your question!'
                            });
                        }
                    }
                }
            }
            else if (phase === GameState_1.GamePhase.VotingOnLies) {
                // Timer expired during voting - check if all voted
                const targetPlayer = gameState.getCurrentLieTargetPlayer();
                if (targetPlayer && gameState.allVotesSubmittedForTarget(targetPlayer)) {
                    // All voted, process results (same as voteOnLie handler)
                    gameState.calculateLiePoints(targetPlayer);
                    gameState.setPhase(GameState_1.GamePhase.ShowingLieResults);
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    const votes = gameState.getVotesForPlayer(targetPlayer);
                    const leaderboard = gameState.getLeaderboard();
                    const allAnswers = [
                        { username: targetPlayer, answer: (truth === null || truth === void 0 ? void 0 : truth.answer) || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    const voteCounts = {};
                    votes.forEach(v => {
                        if (!voteCounts[v.selectedUsername]) {
                            voteCounts[v.selectedUsername] = [];
                        }
                        voteCounts[v.selectedUsername].push(v.voter);
                    });
                    const results = allAnswers.map(a => ({
                        username: a.username,
                        answer: a.answer,
                        isTruth: a.isTruth,
                        voters: voteCounts[a.username] || []
                    }));
                    this.sendToHost(code, {
                        screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                        text: 'Results for ' + targetPlayer + '!',
                        answers: results
                    });
                    const userNames = gameState.getUserNames();
                    userNames.forEach(username => {
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                            const playerSocketId = socketInfo.playerSockets[username];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                                text: 'Results for ' + targetPlayer + '!',
                                answers: results
                            });
                        }
                    });
                    // DO NOT auto-continue - wait for host to click continue
                }
                else {
                    // Not all voted - PROCEED with game using available votes!
                    console.log('Voting timer expired but not all voted - proceeding with available votes');
                    const targetPlayer = gameState.getCurrentLieTargetPlayer();
                    if (targetPlayer) {
                        gameState.calculateLiePoints(targetPlayer);
                        gameState.setPhase(GameState_1.GamePhase.ShowingLieResults);
                        const truth = gameState.getTruthForPlayer(targetPlayer);
                        const lies = gameState.getLiesForPlayer(targetPlayer);
                        const votes = gameState.getVotesForPlayer(targetPlayer);
                        const leaderboard = gameState.getLeaderboard();
                        const allAnswers = [
                            { username: targetPlayer, answer: (truth === null || truth === void 0 ? void 0 : truth.answer) || '', isTruth: true },
                            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                        ];
                        const voteCounts = {};
                        votes.forEach(v => {
                            if (!voteCounts[v.selectedUsername]) {
                                voteCounts[v.selectedUsername] = [];
                            }
                            voteCounts[v.selectedUsername].push(v.voter);
                        });
                        const results = allAnswers.map(a => ({
                            username: a.username,
                            answer: a.answer,
                            isTruth: a.isTruth,
                            voters: voteCounts[a.username] || []
                        }));
                        this.sendToHost(code, {
                            screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                            text: 'Results for ' + targetPlayer + '!',
                            answers: results
                        });
                        const userNames = gameState.getUserNames();
                        userNames.forEach(username => {
                            const socketInfo = this.socketStuff[code];
                            if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                const playerSocketId = socketInfo.playerSockets[username];
                                this.io.to(playerSocketId).emit('gameState', {
                                    screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                                    text: 'Results for ' + targetPlayer + '!',
                                    answers: results
                                });
                            }
                        });
                        // Continue with results delay - then move to next player or end game
                        setTimeout(() => {
                            this.sendToHost(code, {
                                screen: IncludeStuff_1.Screens.h5ShowThePointsForTheRound,
                                text: 'Points for round!',
                                leaderboard
                            });
                            this.sendToPlayers(code, {
                                screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                                text: 'Points have been awarded!'
                            });
                            setTimeout(() => {
                                const nextTarget = gameState.getNextLieTargetPlayer();
                                if (nextTarget) {
                                    gameState.setCurrentLieTargetPlayer(nextTarget);
                                    gameState.setPhase(GameState_1.GamePhase.SubmittingLies);
                                    gameState.setTimerValue(60);
                                    const nextTruth = gameState.getTruthForPlayer(nextTarget);
                                    const nextUserNames = gameState.getUserNames();
                                    this.sendToHost(code, {
                                        screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                                        text: 'Now submitting lies for ' + nextTarget + '!',
                                        timerValue: 60
                                    });
                                    nextUserNames.forEach(username => {
                                        if (username !== nextTarget) {
                                            const socketInfo = this.socketStuff[code];
                                            if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                                const playerSocketId = socketInfo.playerSockets[username];
                                                this.io.to(playerSocketId).emit('gameState', {
                                                    screen: IncludeStuff_1.Screens.c5SubmitLie,
                                                    text: 'Write a LIE for ' + nextTarget + '!',
                                                    question: (nextTruth === null || nextTruth === void 0 ? void 0 : nextTruth.question) || '',
                                                    targetPlayer: nextTarget,
                                                    instructionText: `Write a fooling answer for this question about ${nextTarget}`
                                                });
                                            }
                                        }
                                    });
                                }
                                else {
                                    gameState.setPhase(GameState_1.GamePhase.GameOver);
                                    const finalLeaderboard = gameState.getLeaderboard();
                                    const winner = finalLeaderboard[0];
                                    this.sendToHost(code, {
                                        screen: IncludeStuff_1.Screens.h6ShowTheWinner,
                                        text: 'Winner: ' + winner.name + '!',
                                        leaderboard: finalLeaderboard
                                    });
                                    this.sendToPlayers(code, {
                                        screen: IncludeStuff_1.Screens.h6ShowTheWinner,
                                        text: 'Winner: ' + winner.name + '!',
                                        leaderboard: finalLeaderboard
                                    });
                                }
                            }, 5000);
                        }, 5000);
                    }
                }
            }
        });
        socket.on('killServer', () => {
            console.log('Kill server requested');
            // Save all game states
            // Then exit
            process.exit(0);
        });
    }
}
exports.SocketHandlers = SocketHandlers;
//# sourceMappingURL=socketHandlers.js.map