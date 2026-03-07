import { Server, Socket } from 'socket.io';
import { GameState, GamePhase } from './GameState';
import { Screens, ClientGameState } from './IncludeStuff';

interface GamesStore {
    [gameCode: string]: GameState;
}

interface SocketStuff {
    hostSocketId: string;
    playerSockets: { [username: string]: string };
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

    private sendToRoom(gameCode: string, event: string, data: any): void {
        this.io.to(gameCode).emit(event, data);
    }

    private sendToSocket(socketId: string, event: string, data: any): void {
        this.io.to(socketId).emit(event, data);
    }

    private sendToHost(gameCode: string, data: ClientGameState): void {
        const socketInfo = this.socketStuff[gameCode];
        if (socketInfo && socketInfo.hostSocketId) {
            this.io.to(socketInfo.hostSocketId).emit('gameState', data);
        }
    }

    private sendToPlayers(gameCode: string, data: ClientGameState): void {
        const socketInfo = this.socketStuff[gameCode];
        if (socketInfo && socketInfo.hostSocketId) {
            // Send to all except host
            this.io.in(gameCode).except(socketInfo.hostSocketId).emit('gameState', data);
        } else {
            // Fallback: send to everyone
            this.io.to(gameCode).emit('gameState', data);
        }
    }

    private getClientState(gameState: GameState, name: string = '', screen?: Screens): ClientGameState {
        const state: ClientGameState = {
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

    private getHostScreen(gameState: GameState): Screens {
        switch (gameState.getPhase()) {
            case GamePhase.CollectingUsers:
                return Screens.h1CollectingUsers;
            case GamePhase.AnsweringQuestions:
                return Screens.h2InformationScreenWithTimer;
            case GamePhase.PickingBestAnswer:
                return Screens.h3ShowTheLiesAndTruths;
            case GamePhase.ShowingPoints:
                return Screens.h5ShowThePointsForTheRound;
            case GamePhase.GameOver:
                return Screens.h6ShowTheWinner;
            default:
                return Screens.h1CollectingUsers;
        }
    }

    handleConnection(socket: Socket): void {
        console.log('a user connected', socket.id);

        socket.on('disconnect', () => {
            console.log('user disconnected', socket.id);
        });

        socket.on('newGame', () => {
            const code = this.generateGameCode();
            const gameState = new GameState(code);
            
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
                screen: Screens.h1CollectingUsers,
                error: ''
            });
        });

        socket.on('joinGame', (code: string) => {
            const gameState = this.games[code];
            
            if (gameState) {
                console.log('joining game ' + code);
                socket.join(code);
                
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

        socket.on('nameAndEmoji', ({ name, emoji, code }: { name: string; emoji: string; code: string }) => {
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
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: 'Please wait for the host to start the game...'
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

        socket.on('startGame', ({ code }: { code: string }) => {
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
                        screen: Screens.h1CollectingUsers,
                        text: 'Need at least 2 players to start!'
                    });
                    return;
                }
                
                gameState.setPhase(GamePhase.AnsweringQuestions);
                
                // Get the question ONCE before the loop (not inside!)
                const questionObj = gameState.getNextQuestion();
                
                // Send timer screen to host only
                this.sendToHost(code, {
                    screen: Screens.h2InformationScreenWithTimer,
                    text: 'Truthfully answer the questions on your device.',
                    timerValue: 60
                });
                
                // Assign SAME question to each player
                userNames.forEach(username => {
                    if (questionObj) {
                        // Send to specific player using their socket
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                            const playerSocketId = socketInfo.playerSockets[username];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                                question: questionObj.question,
                                questionIndex: questionObj.index
                            });
                        }
                    }
                });
            }
        });

        socket.on('sendQuestionAnswer', ({ name, code, answer, question }: { 
            name: string; 
            code: string; 
            answer: string;
            question: string;
        }) => {
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
                    gameState.setPhase(GamePhase.PickingBestAnswer);
                    
                    // Show all answers to host (H3)
                    this.sendToHost(code, {
                        screen: Screens.h3ShowTheLiesAndTruths,
                        text: 'Select the best answer!',
                        answers
                    });
                    
                    // Show waiting screen to players
                    this.sendToPlayers(code, {
                        screen: Screens.c2WaitingScreenJustWhateverText,
                        text: 'All answers in! Waiting for host to select the best answer...'
                    });
                } else {
                    // Send thank you / waiting screen to player
                    socket.emit('gameState', {
                        screen: Screens.c2WaitingScreenJustWhateverText,
                        text: 'Thank you for your answer! Please wait for others to finish...'
                    });
                }
            }
        });

        socket.on('selectBestAnswer', ({ code, selectedUsername }: { code: string; selectedUsername: string }) => {
            const gameState = this.games[code];
            
            if (gameState) {
                console.log('Best answer selected: ' + selectedUsername);
                
                // Award points to the selected player
                gameState.addPoints(selectedUsername, 10);
                
                // Move to showing points phase
                gameState.setPhase(GamePhase.ShowingPoints);
                
                // Show points to host (H5)
                const leaderboard = gameState.getLeaderboard();
                this.sendToHost(code, {
                    screen: Screens.h5ShowThePointsForTheRound,
                    text: `${selectedUsername} got the most votes!`,
                    leaderboard
                });
                
                // Show waiting to players
                this.sendToPlayers(code, {
                    screen: Screens.c2WaitingScreenJustWhateverText,
                    text: `The best answer was "${selectedUsername}"! Check the leaderboard on the host screen.`
                });
            }
        });

        socket.on('nextRound', ({ code }: { code: string }) => {
            const gameState = this.games[code];
            
            if (gameState) {
                // Start a new round
                gameState.setPhase(GamePhase.AnsweringQuestions);
                gameState.clearAnswers();
                
                // Send timer screen to host only
                this.sendToHost(code, {
                    screen: Screens.h2InformationScreenWithTimer,
                    text: 'Truthfully answer the questions on your device.',
                    timerValue: 30
                });
                
                // Assign new questions to each player
                const userNames = gameState.getUserNames();
                userNames.forEach(username => {
                    const questionObj = gameState.getNextQuestion();
                    if (questionObj) {
                        this.sendToPlayers(code, {
                            screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                            text: `Please truthfully answer this question:\n\n${questionObj.question}`,
                            question: questionObj.question,
                            questionIndex: questionObj.index
                        });
                    }
                });
            }
        });

        socket.on('endGame', ({ code }: { code: string }) => {
            const gameState = this.games[code];
            
            if (gameState) {
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

        socket.on('timerExpired', ({ code }: { code: string }) => {
            const gameState = this.games[code];
            
            if (gameState && gameState.getPhase() === GamePhase.AnsweringQuestions) {
                console.log('Timer expired for game ' + code);
                
                // Get answers BEFORE clearing
                const answersWithUsernames = gameState.getAllAnswersWithUsernames();
                const answers: Array<{ username: string; answer: string; isTruth: boolean }> = 
                    answersWithUsernames.map((a: { username: string; answer: { answer: string; isTruth: boolean } }) => ({
                        username: a.username,
                        answer: a.answer.answer,
                        isTruth: a.answer.isTruth
                    }));
                
                // Move to picking best answer phase
                gameState.setPhase(GamePhase.PickingBestAnswer);
                
                // Show all answers to host
                this.sendToHost(code, {
                    screen: Screens.h3ShowTheLiesAndTruths,
                    text: 'Time is up! Select the best answer!',
                    answers
                });
                
                // Send waiting message to players
                this.sendToPlayers(code, {
                    screen: Screens.c2WaitingScreenJustWhateverText,
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
