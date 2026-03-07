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
        if (socketInfo && socketInfo.hostSocketId) {
            this.io.to(socketInfo.hostSocketId).emit('gameState', data);
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
            case GameState_1.GamePhase.PickingBestAnswer:
                return IncludeStuff_1.Screens.h3ShowTheLiesAndTruths;
            case GameState_1.GamePhase.ShowingPoints:
                return IncludeStuff_1.Screens.h5ShowThePointsForTheRound;
            case GameState_1.GamePhase.GameOver:
                return IncludeStuff_1.Screens.h6ShowTheWinner;
            default:
                return IncludeStuff_1.Screens.h1CollectingUsers;
        }
    }
    handleConnection(socket) {
        console.log('a user connected', socket.id);
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
        socket.on('nameAndEmoji', ({ name, emoji, code }) => {
            const gameState = this.games[code];
            if (gameState) {
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
                console.log('User ' + name + ' joined game ' + code);
                // Notify host of new user
                this.sendToHost(code, {
                    sharedState: gameState.getSharedState(),
                    name: '<host>',
                    screen: this.getHostScreen(gameState)
                });
                // Send waiting screen to user (not host)
                socket.emit('gameState', {
                    screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                    text: 'Please wait for the host to start the game...'
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
        socket.on('startGame', ({ code }) => {
            const gameState = this.games[code];
            if (gameState) {
                console.log('Starting game ' + code);
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
                // Send timer screen to host only
                this.sendToHost(code, {
                    screen: IncludeStuff_1.Screens.h2InformationScreenWithTimer,
                    text: 'Truthfully answer the questions on your device.',
                    timerValue: 60
                });
                // Assign questions to each player and send them the question screen
                userNames.forEach(username => {
                    const questionObj = gameState.getNextQuestion();
                    if (questionObj) {
                        // Send to specific player using their socket
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                            const playerSocketId = socketInfo.playerSockets[username];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: IncludeStuff_1.Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                                question: questionObj.question,
                                questionIndex: questionObj.index
                            });
                        }
                    }
                });
            }
        });
        socket.on('sendQuestionAnswer', ({ name, code, answer, question }) => {
            const gameState = this.games[code];
            if (gameState) {
                console.log('User ' + name + ' answered: ' + answer);
                // Store the answer
                gameState.addAnswer(name, question, answer);
                // Check if all users have answered
                if (gameState.allUsersHaveAnswered()) {
                    // Get all answers to show BEFORE clearing
                    const answersWithUsernames = gameState.getAllAnswersWithUsernames();
                    const answers = answersWithUsernames.map(a => ({
                        username: a.username,
                        answer: a.answer.answer,
                        isTruth: a.answer.isTruth
                    }));
                    // Move to picking best answer phase
                    gameState.setPhase(GameState_1.GamePhase.PickingBestAnswer);
                    // Show all answers to host (H3)
                    this.sendToHost(code, {
                        screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                        text: 'Select the best answer!',
                        answers
                    });
                    // Show waiting screen to players
                    this.sendToPlayers(code, {
                        screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                        text: 'All answers in! Waiting for host to select the best answer...'
                    });
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
        socket.on('selectBestAnswer', ({ code, selectedUsername }) => {
            const gameState = this.games[code];
            if (gameState) {
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
                            screen: IncludeStuff_1.Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                            text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                            question: questionObj.question,
                            questionIndex: questionObj.index
                        });
                    }
                });
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
            if (gameState && gameState.getPhase() === GameState_1.GamePhase.AnsweringQuestions) {
                console.log('Timer expired for game ' + code);
                // Get answers BEFORE clearing
                const answersWithUsernames = gameState.getAllAnswersWithUsernames();
                const answers = answersWithUsernames.map((a) => ({
                    username: a.username,
                    answer: a.answer.answer,
                    isTruth: a.answer.isTruth
                }));
                // Move to picking best answer phase
                gameState.setPhase(GameState_1.GamePhase.PickingBestAnswer);
                // Show all answers to host
                this.sendToHost(code, {
                    screen: IncludeStuff_1.Screens.h3ShowTheLiesAndTruths,
                    text: 'Time is up! Select the best answer!',
                    answers
                });
                // Send waiting message to players
                this.sendToPlayers(code, {
                    screen: IncludeStuff_1.Screens.c2WaitingScreenJustWhateverText,
                    text: 'Time is up! Waiting for others to finish...'
                });
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