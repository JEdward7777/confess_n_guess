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
                
                console.log('User ' + name + ' joined game ' + code + ' (phase: ' + gameState.getPhase() + ')');
                
                // Notify host of new user
                this.sendToHost(code, {
                    sharedState: gameState.getSharedState(),
                    name: '<host>',
                    screen: this.getHostScreen(gameState)
                });
                
                // Determine what screen to send based on game phase
                const phase = gameState.getPhase();
                let screenToSend = Screens.c2WaitingScreenJustWhateverText;
                let textToSend = 'Please wait...';
                
                if (phase === GamePhase.CollectingUsers) {
                    screenToSend = Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Please wait for the host to start the game...';
                } else if (phase === GamePhase.AnsweringQuestions) {
                    // Check if user already answered
                    const userAnswers = gameState['userAnswers'] as any;
                    if (userAnswers && userAnswers[name]) {
                        screenToSend = Screens.c2WaitingScreenJustWhateverText;
                        textToSend = 'Your answer has been submitted! Please wait for others...';
                    } else {
                        // Send question to answer
                        const questionObj = gameState.getNextQuestion();
                        screenToSend = Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer;
                        textToSend = questionObj ? `Please answer this question:\n\n${questionObj.question}` : 'No question available';
                    }
                } else if (phase === GamePhase.SubmittingLies) {
                    const targetPlayer = gameState.getCurrentLieTargetPlayer();
                    if (targetPlayer === name) {
                        screenToSend = Screens.c2WaitingScreenJustWhateverText;
                        textToSend = 'Your truth has been submitted! Now others will submit lies for your question.';
                    } else {
                        const truth = gameState.getTruthForPlayer(targetPlayer || '');
                        const userLies = gameState['lies'] as any;
                        if (userLies && userLies[targetPlayer]?.some((l: any) => l.username === name)) {
                            screenToSend = Screens.c2WaitingScreenJustWhateverText;
                            textToSend = 'Your lie has been submitted! Please wait for others...';
                        } else {
                            screenToSend = Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer;
                            textToSend = truth ? `Write a LIE for this question about ${targetPlayer}:\n\n${truth.question}` : 'No question available';
                        }
                    }
                } else if (phase === GamePhase.VotingOnLies) {
                    const targetPlayer = gameState.getCurrentLieTargetPlayer();
                    const userVotes = gameState['votes'] as any;
                    if (userVotes && userVotes[targetPlayer]?.some((v: any) => v.voter === name)) {
                        screenToSend = Screens.c2WaitingScreenJustWhateverText;
                        textToSend = 'Your vote has been submitted! Please wait for others...';
                    } else {
                        screenToSend = Screens.c4PickTheBestAnswerOutOfAList;
                        textToSend = 'Vote for the TRUTH!';
                    }
                } else if (phase === GamePhase.ShowingLieResults || phase === GamePhase.ShowingPoints) {
                    screenToSend = Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'Please wait while results are being shown...';
                } else if (phase === GamePhase.GameOver) {
                    screenToSend = Screens.c2WaitingScreenJustWhateverText;
                    textToSend = 'The game has ended!';
                }
                
                // Send appropriate screen to user
                socket.emit('gameState', {
                    sharedState: gameState.getSharedState(),
                    name: name,
                    emoji: emoji,
                    screen: screenToSend,
                    text: textToSend
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
                console.log('>>> Starting game ' + code + ' <<<');
                console.log('Current phase before start: ' + gameState.getPhase());
                
                // Don't restart if game is already in progress
                if (gameState.getPhase() !== GamePhase.CollectingUsers) {
                    console.log('Game already in progress, ignoring startGame');
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
                
                gameState.setPhase(GamePhase.AnsweringQuestions);
                
                // Set timer start time
                gameState.setTimerValue(60);
                
                // Send timer screen to host only
                this.sendToHost(code, {
                    screen: Screens.h2InformationScreenWithTimer,
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
                    console.log('ALL PLAYERS HAVE ANSWERED! Transitioning to lie phase.');
                    
                    // All truths are in! Start the lie phase.
                    // Get first player to target
                    const firstTarget = gameState.getNextLieTargetPlayer();
                    console.log('First target player:', firstTarget);
                    if (firstTarget) {
                        gameState.setCurrentLieTargetPlayer(firstTarget);
                        gameState.setPhase(GamePhase.SubmittingLies);
                        gameState.setTimerValue(60);
                        
                        const truth = gameState.getTruthForPlayer(firstTarget);
                        const userNames = gameState.getUserNames();
                        
                        // Send timer to host
                        console.log('Sending h2 to host with text: Now submitting lies for ' + firstTarget);
                        this.sendToHost(code, {
                            screen: Screens.h2InformationScreenWithTimer,
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
                                        screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                        text: 'Write a LIE for this question about ' + firstTarget + ':\n\n' + (truth?.question || ''),
                                        question: truth?.question || '',
                                        targetPlayer: firstTarget
                                    });
                                }
                            }
                        });
                        
                        // Send waiting to target player (they already answered truth)
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[firstTarget]) {
                            const playerSocketId = socketInfo.playerSockets[firstTarget];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: Screens.c2WaitingScreenJustWhateverText,
                                text: 'Your truth has been submitted! Now others will submit lies for your question.'
                            });
                        }
                    }
                } else {
                    // Send thank you / waiting screen to player
                    socket.emit('gameState', {
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
            const gameState = this.games[code];
            
            if (gameState && gameState.getPhase() === GamePhase.SubmittingLies) {
                console.log('User ' + name + ' submitted lie for ' + targetPlayer + ': ' + lie);
                
                // Store the lie
                gameState.addLie(targetPlayer, name, lie);
                
                // Check if all lies are submitted
                if (gameState.allLiesSubmittedForTarget(targetPlayer)) {
                    // All lies in! Move to voting phase
                    gameState.setPhase(GamePhase.VotingOnLies);
                    
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    const userNames = gameState.getUserNames();
                    
                    // Build all answers (truth + lies)
                    const allAnswers = [
                        { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    
                    // Shuffle for voting
                    const shuffledAnswers = [...allAnswers].sort(() => Math.random() - 0.5);
                    
                    // Send timer to host
                    this.sendToHost(code, {
                        screen: Screens.h2InformationScreenWithTimer,
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
                                    screen: Screens.c4PickTheBestAnswerOutOfAList,
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
                            screen: Screens.c2WaitingScreenJustWhateverText,
                            text: 'Others are voting on your question!'
                        });
                    }
                } else {
                    // Send waiting to player
                    socket.emit('gameState', {
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
            const gameState = this.games[code];
            
            if (gameState && gameState.getPhase() === GamePhase.VotingOnLies) {
                console.log('User ' + name + ' voted for ' + selectedUsername + ' (target: ' + targetPlayer + ')');
                
                // Store the vote
                gameState.addVote(targetPlayer, name, selectedUsername);
                
                // Check if all votes are in
                if (gameState.allVotesSubmittedForTarget(targetPlayer)) {
                    // All votes in! Calculate points and show results
                    gameState.calculateLiePoints(targetPlayer);
                    gameState.setPhase(GamePhase.ShowingLieResults);
                    
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    const votes = gameState.getVotesForPlayer(targetPlayer);
                    const leaderboard = gameState.getLeaderboard();
                    
                    // Build results
                    const allAnswers = [
                        { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    
                    // Count votes per answer
                    const voteCounts: { [username: string]: string[] } = {};
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
                        screen: Screens.h3ShowTheLiesAndTruths,
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
                                screen: Screens.h3ShowTheLiesAndTruths,
                                text: 'Results for ' + targetPlayer + '!',
                                answers: results
                            });
                        }
                    });
                    
                    // After a delay, show points then move to next player
                    setTimeout(() => {
                        this.sendToHost(code, {
                            screen: Screens.h5ShowThePointsForTheRound,
                            text: 'Points for ' + targetPlayer + "'s round!",
                            leaderboard
                        });
                        
                        this.sendToPlayers(code, {
                            screen: Screens.c2WaitingScreenJustWhateverText,
                            text: 'Points have been awarded! Check the leaderboard on the host screen.'
                        });
                        
                        // Move to next player or end game
                        setTimeout(() => {
                            const nextTarget = gameState.getNextLieTargetPlayer();
                            
                            if (nextTarget) {
                                // Continue to next player
                                gameState.setCurrentLieTargetPlayer(nextTarget);
                                gameState.setPhase(GamePhase.SubmittingLies);
                                
                                const nextTruth = gameState.getTruthForPlayer(nextTarget);
                                const nextUserNames = gameState.getUserNames();
                                
                                // Send timer to host
                                this.sendToHost(code, {
                                    screen: Screens.h2InformationScreenWithTimer,
                                    text: 'Now submitting lies for ' + nextTarget + '!',
                                    timerValue: 60
                                });
                                
                                // Send lie prompt to all OTHER players
                                nextUserNames.forEach(username => {
                                    if (username !== nextTarget) {
                                        const socketInfo = this.socketStuff[code];
                                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                            const playerSocketId = socketInfo.playerSockets[username];
                                            this.io.to(playerSocketId).emit('gameState', {
                                                screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                                text: 'Write a LIE for this question about ' + nextTarget + ':\n\n' + (nextTruth?.question || ''),
                                                question: nextTruth?.question || '',
                                                targetPlayer: nextTarget
                                            });
                                        }
                                    }
                                });
                                
                                // Send waiting to target player
                                if (this.socketStuff[code] && this.socketStuff[code].playerSockets && this.socketStuff[code].playerSockets[nextTarget]) {
                                    const playerSocketId = this.socketStuff[code].playerSockets[nextTarget];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: Screens.c2WaitingScreenJustWhateverText,
                                        text: 'Your turn! Others will submit lies for your question.'
                                    });
                                }
                            } else {
                                // All rounds done! Show winner
                                gameState.setPhase(GamePhase.GameOver);
                                const finalLeaderboard = gameState.getLeaderboard();
                                const winner = finalLeaderboard[0];
                                
                                this.sendToHost(code, {
                                    screen: Screens.h6ShowTheWinner,
                                    text: 'Winner: ' + winner.name + ' with ' + winner.points + ' points!',
                                    leaderboard: finalLeaderboard
                                });
                                
                                this.sendToPlayers(code, {
                                    screen: Screens.h6ShowTheWinner,
                                    text: 'Winner: ' + winner.name + ' with ' + winner.points + ' points!',
                                    leaderboard: finalLeaderboard
                                });
                            }
                        }, 5000); // 5 second delay before next round
                    }, 5000); // 5 second delay before showing points
                } else {
                    // Send waiting to player
                    socket.emit('gameState', {
                        screen: Screens.c2WaitingScreenJustWhateverText,
                        text: 'Vote submitted! Waiting for others to vote...'
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
            if (!gameState) return;
            
            const phase = gameState.getPhase();
            const prevPhase = gameState.getPhase(); // This is the same, but we'll check in handler
            
            console.log('Timer expired for game ' + code + ' phase: ' + phase);
            
            // If we're no longer in answeringQuestions, ignore this timer event
            // (It might be from a previous timer that was still running)
            if (phase !== GamePhase.AnsweringQuestions && 
                phase !== GamePhase.SubmittingLies && 
                phase !== GamePhase.VotingOnLies) {
                console.log('Ignoring timerExpired for phase: ' + phase);
                return;
            }
            
            if (phase === GamePhase.AnsweringQuestions) {
                // Timer expired during truth phase - check if we have answers, then start lie phase
                if (gameState.allUsersHaveAnswered()) {
                    // All answered, start lie phase (same logic as in sendQuestionAnswer)
                    const firstTarget = gameState.getNextLieTargetPlayer();
                    if (firstTarget) {
                        gameState.setCurrentLieTargetPlayer(firstTarget);
                        gameState.setPhase(GamePhase.SubmittingLies);
                        
                        const truth = gameState.getTruthForPlayer(firstTarget);
                        const userNames = gameState.getUserNames();
                        
                        this.sendToHost(code, {
                            screen: Screens.h2InformationScreenWithTimer,
                            text: 'Now submitting lies for ' + firstTarget + '!',
                            timerValue: 60
                        });
                        
                        userNames.forEach(username => {
                            if (username !== firstTarget) {
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                        text: 'Write a LIE for this question about ' + firstTarget + ':\n\n' + (truth?.question || ''),
                                        question: truth?.question || '',
                                        targetPlayer: firstTarget
                                    });
                                }
                            }
                        });
                        
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[firstTarget]) {
                            const playerSocketId = socketInfo.playerSockets[firstTarget];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: Screens.c2WaitingScreenJustWhateverText,
                                text: 'Your truth has been submitted! Now others will submit lies for your question.'
                            });
                        }
                    }
                } else {
                    // Not all answered - PROCEED with game using available answers!
                    // Don't go back to lobby - just continue with who we have
                    console.log('Timer expired but not all answered - proceeding with ' + 
                        Object.keys(gameState['userAnswers'] || {}).length + ' answers');
                    
                    const firstTarget = gameState.getNextLieTargetPlayer();
                    if (firstTarget) {
                        gameState.setCurrentLieTargetPlayer(firstTarget);
                        gameState.setPhase(GamePhase.SubmittingLies);
                        gameState.setTimerValue(60);
                        
                        const truth = gameState.getTruthForPlayer(firstTarget);
                        const userNames = gameState.getUserNames();
                        
                        this.sendToHost(code, {
                            screen: Screens.h2InformationScreenWithTimer,
                            text: 'Now submitting lies for ' + firstTarget + '!',
                            timerValue: 60
                        });
                        
                        userNames.forEach(username => {
                            if (username !== firstTarget) {
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                        text: 'Write a LIE for this question about ' + firstTarget + ':\n\n' + (truth?.question || ''),
                                        question: truth?.question || '',
                                        targetPlayer: firstTarget
                                    });
                                }
                            }
                        });
                        
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[firstTarget]) {
                            const playerSocketId = socketInfo.playerSockets[firstTarget];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: Screens.c2WaitingScreenJustWhateverText,
                                text: 'Your truth has been submitted! Now others will submit lies for your question.'
                            });
                        }
                    }
                }
            }
            else if (phase === GamePhase.SubmittingLies) {
                // Timer expired during lie submission - check if enough lies submitted
                const targetPlayer = gameState.getCurrentLieTargetPlayer();
                if (targetPlayer && gameState.allLiesSubmittedForTarget(targetPlayer)) {
                    // All lies in, move to voting (same as submitLie handler)
                    gameState.setPhase(GamePhase.VotingOnLies);
                    
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    const userNames = gameState.getUserNames();
                    
                    const allAnswers = [
                        { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    
                    const shuffledAnswers = [...allAnswers].sort(() => Math.random() - 0.5);
                    
                    this.sendToHost(code, {
                        screen: Screens.h2InformationScreenWithTimer,
                        text: 'Voting on lies for ' + targetPlayer + '!',
                        timerValue: 60
                    });
                    
                    userNames.forEach(username => {
                        if (username !== targetPlayer) {
                            const socketInfo = this.socketStuff[code];
                            if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                const playerSocketId = socketInfo.playerSockets[username];
                                this.io.to(playerSocketId).emit('gameState', {
                                    screen: Screens.c4PickTheBestAnswerOutOfAList,
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
                            screen: Screens.c2WaitingScreenJustWhateverText,
                            text: 'Others are voting on your question!'
                        });
                    }
                } else {
                    // Not all lies in - PROCEED with game using available lies!
                    // Don't go back to lobby - just continue with who we have
                    console.log('Lie timer expired but not all lies submitted - proceeding with available lies');
                    
                    const targetPlayer = gameState.getCurrentLieTargetPlayer();
                    if (targetPlayer) {
                        gameState.setPhase(GamePhase.VotingOnLies);
                        gameState.setTimerValue(60);
                        
                        const truth = gameState.getTruthForPlayer(targetPlayer);
                        const lies = gameState.getLiesForPlayer(targetPlayer);
                        const userNames = gameState.getUserNames();
                        
                        const allAnswers = [
                            { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
                            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                        ];
                        
                        const shuffledAnswers = [...allAnswers].sort(() => Math.random() - 0.5);
                        
                        this.sendToHost(code, {
                            screen: Screens.h2InformationScreenWithTimer,
                            text: 'Voting on lies for ' + targetPlayer + '!',
                            timerValue: 60
                        });
                        
                        userNames.forEach(username => {
                            if (username !== targetPlayer) {
                                const socketInfo = this.socketStuff[code];
                                if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                    const playerSocketId = socketInfo.playerSockets[username];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: Screens.c4PickTheBestAnswerOutOfAList,
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
                                screen: Screens.c2WaitingScreenJustWhateverText,
                                text: 'Others are voting on your question!'
                            });
                        }
                    }
                }
            }
            else if (phase === GamePhase.VotingOnLies) {
                // Timer expired during voting - check if all voted
                const targetPlayer = gameState.getCurrentLieTargetPlayer();
                if (targetPlayer && gameState.allVotesSubmittedForTarget(targetPlayer)) {
                    // All voted, process results (same as voteOnLie handler)
                    gameState.calculateLiePoints(targetPlayer);
                    gameState.setPhase(GamePhase.ShowingLieResults);
                    
                    const truth = gameState.getTruthForPlayer(targetPlayer);
                    const lies = gameState.getLiesForPlayer(targetPlayer);
                    const votes = gameState.getVotesForPlayer(targetPlayer);
                    const leaderboard = gameState.getLeaderboard();
                    
                    const allAnswers = [
                        { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
                        ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                    ];
                    
                    const voteCounts: { [username: string]: string[] } = {};
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
                        screen: Screens.h3ShowTheLiesAndTruths,
                        text: 'Results for ' + targetPlayer + '!',
                        answers: results
                    });
                    
                    const userNames = gameState.getUserNames();
                    userNames.forEach(username => {
                        const socketInfo = this.socketStuff[code];
                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                            const playerSocketId = socketInfo.playerSockets[username];
                            this.io.to(playerSocketId).emit('gameState', {
                                screen: Screens.h3ShowTheLiesAndTruths,
                                text: 'Results for ' + targetPlayer + '!',
                                answers: results
                            });
                        }
                    });
                    
                    // Continue with results delay (same as voteOnLie)
                    setTimeout(() => {
                        this.sendToHost(code, {
                            screen: Screens.h5ShowThePointsForTheRound,
                            text: 'Points for ' + targetPlayer + "'s round!",
                            leaderboard
                        });
                        
                        this.sendToPlayers(code, {
                            screen: Screens.c2WaitingScreenJustWhateverText,
                            text: 'Points have been awarded! Check the leaderboard on the host screen.'
                        });
                        
                        setTimeout(() => {
                            const nextTarget = gameState.getNextLieTargetPlayer();
                            
                            if (nextTarget) {
                                gameState.setCurrentLieTargetPlayer(nextTarget);
                                gameState.setPhase(GamePhase.SubmittingLies);
                                
                                const nextTruth = gameState.getTruthForPlayer(nextTarget);
                                const nextUserNames = gameState.getUserNames();
                                
                                this.sendToHost(code, {
                                    screen: Screens.h2InformationScreenWithTimer,
                                    text: 'Now submitting lies for ' + nextTarget + '!',
                                    timerValue: 60
                                });
                                
                                nextUserNames.forEach(username => {
                                    if (username !== nextTarget) {
                                        const socketInfo = this.socketStuff[code];
                                        if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                            const playerSocketId = socketInfo.playerSockets[username];
                                            this.io.to(playerSocketId).emit('gameState', {
                                                screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                                text: 'Write a LIE for this question about ' + nextTarget + ':\n\n' + (nextTruth?.question || ''),
                                                question: nextTruth?.question || '',
                                                targetPlayer: nextTarget
                                            });
                                        }
                                    }
                                });
                                
                                if (this.socketStuff[code] && this.socketStuff[code].playerSockets && this.socketStuff[code].playerSockets[nextTarget]) {
                                    const playerSocketId = this.socketStuff[code].playerSockets[nextTarget];
                                    this.io.to(playerSocketId).emit('gameState', {
                                        screen: Screens.c2WaitingScreenJustWhateverText,
                                        text: 'Your turn! Others will submit lies for your question.'
                                    });
                                }
                            } else {
                                gameState.setPhase(GamePhase.GameOver);
                                const finalLeaderboard = gameState.getLeaderboard();
                                const winner = finalLeaderboard[0];
                                
                                this.sendToHost(code, {
                                    screen: Screens.h6ShowTheWinner,
                                    text: 'Winner: ' + winner.name + ' with ' + winner.points + ' points!',
                                    leaderboard: finalLeaderboard
                                });
                                
                                this.sendToPlayers(code, {
                                    screen: Screens.h6ShowTheWinner,
                                    text: 'Winner: ' + winner.name + ' with ' + winner.points + ' points!',
                                    leaderboard: finalLeaderboard
                                });
                            }
                        }, 5000);
                    }, 5000);
                } else {
                    // Not all voted - PROCEED with game using available votes!
                    console.log('Voting timer expired but not all voted - proceeding with available votes');
                    
                    const targetPlayer = gameState.getCurrentLieTargetPlayer();
                    if (targetPlayer) {
                        gameState.calculateLiePoints(targetPlayer);
                        gameState.setPhase(GamePhase.ShowingLieResults);
                        
                        const truth = gameState.getTruthForPlayer(targetPlayer);
                        const lies = gameState.getLiesForPlayer(targetPlayer);
                        const votes = gameState.getVotesForPlayer(targetPlayer);
                        const leaderboard = gameState.getLeaderboard();
                        
                        const allAnswers = [
                            { username: targetPlayer, answer: truth?.answer || '', isTruth: true },
                            ...lies.map(l => ({ username: l.username, answer: l.lie, isTruth: false }))
                        ];
                        
                        const voteCounts: { [username: string]: string[] } = {};
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
                            screen: Screens.h3ShowTheLiesAndTruths,
                            text: 'Results for ' + targetPlayer + '!',
                            answers: results
                        });
                        
                        const userNames = gameState.getUserNames();
                        userNames.forEach(username => {
                            const socketInfo = this.socketStuff[code];
                            if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                const playerSocketId = socketInfo.playerSockets[username];
                                this.io.to(playerSocketId).emit('gameState', {
                                    screen: Screens.h3ShowTheLiesAndTruths,
                                    text: 'Results for ' + targetPlayer + '!',
                                    answers: results
                                });
                            }
                        });
                        
                        // Continue with results delay - then move to next player or end game
                        setTimeout(() => {
                            this.sendToHost(code, {
                                screen: Screens.h5ShowThePointsForTheRound,
                                text: 'Points for round!',
                                leaderboard
                            });
                            
                            this.sendToPlayers(code, {
                                screen: Screens.c2WaitingScreenJustWhateverText,
                                text: 'Points have been awarded!'
                            });
                            
                            setTimeout(() => {
                                const nextTarget = gameState.getNextLieTargetPlayer();
                                
                                if (nextTarget) {
                                    gameState.setCurrentLieTargetPlayer(nextTarget);
                                    gameState.setPhase(GamePhase.SubmittingLies);
                                    gameState.setTimerValue(60);
                                    
                                    const nextTruth = gameState.getTruthForPlayer(nextTarget);
                                    const nextUserNames = gameState.getUserNames();
                                    
                                    this.sendToHost(code, {
                                        screen: Screens.h2InformationScreenWithTimer,
                                        text: 'Now submitting lies for ' + nextTarget + '!',
                                        timerValue: 60
                                    });
                                    
                                    nextUserNames.forEach(username => {
                                        if (username !== nextTarget) {
                                            const socketInfo = this.socketStuff[code];
                                            if (socketInfo && socketInfo.playerSockets && socketInfo.playerSockets[username]) {
                                                const playerSocketId = socketInfo.playerSockets[username];
                                                this.io.to(playerSocketId).emit('gameState', {
                                                    screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                                                    text: 'Write a LIE for ' + nextTarget + '!',
                                                    question: nextTruth?.question || '',
                                                    targetPlayer: nextTarget
                                                });
                                            }
                                        }
                                    });
                                } else {
                                    gameState.setPhase(GamePhase.GameOver);
                                    const finalLeaderboard = gameState.getLeaderboard();
                                    const winner = finalLeaderboard[0];
                                    
                                    this.sendToHost(code, {
                                        screen: Screens.h6ShowTheWinner,
                                        text: 'Winner: ' + winner.name + '!',
                                        leaderboard: finalLeaderboard
                                    });
                                    
                                    this.sendToPlayers(code, {
                                        screen: Screens.h6ShowTheWinner,
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
