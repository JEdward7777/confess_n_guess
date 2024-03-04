const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const path = require('path');
const { Server } = require("socket.io");
const io = new Server(server);

var httpPath = path.join( __dirname, "fibbage_knockoff_client/dist/" );

app.use(express.static(httpPath));


const g1NewGame = 0;
const h1CollectingUsers = 1;
const h2InformationScreenWithTimer = 2;
const h3ShowTheLiesAndTruths = 3;
const h4IterateThroughTheDifferentAnswersAndPopUpYesOrNo = 4;
const h5ShowThePointsForTheRound = 5;
const h6ShowTheWinner = 6;
const c1TypeInYourNameAndPickAnEmojiForYourPicture = 7;
const c2WaitingScreenJustWhateverText = 8;
const c3ShowsQuestionAndLetsYouTypeInAnAnswer = 9;
const c4PickTheBestAnswerOutOfAList = 10;


const games = {};

io.on('connection', (socket) =>{
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });


    socket.on( 'newGame', (msg) => {
        const charactersToUse = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const code = Array.from( {length: 5}, () => charactersToUse.charAt( Math.floor( Math.random() * charactersToUse.length ) ) ).join( '' );

        games[code] = {
            hostSocket: socket,
            userSockets: {},
            sharedState: {
                users: {
                    "<host>": {
                        name: "<host>",
                        emoji: "🏠",
                        points: 0,
                    }
                },
                code
            },
        };

        console.log( "new game " + code + " created." );

        games[code].hostSocket.emit( 'gameState', {
            sharedState: games[code].sharedState,
            name: "<host>",
            screen: h1CollectingUsers,
            error: ""
        } );
    });

    socket.on( 'joinGame', (code) => {
        console.log( "joinGame received")
        if( games[code] ) {
            console.log( "joining game " + code + " created.");


            //socket.emit( 'gameState', {code, screen: c1TypeInYourNameAndPickAnEmojiForYourPicture, error:""} );
            socket.emit( 'gameState', {
                sharedState: games[code].sharedState, 
                name: "", 
                screen: c1TypeInYourNameAndPickAnEmojiForYourPicture, 
                error:""
            } );
        }else{
            console.log( "invalid code valid codes are " + Object.keys( games ) );
            //send an error message to the client if the code is invalid
            socket.emit( 'gameState', {
                code, screen: g1NewGame, 
                error: "invalid code"
            } );
        }
    });


    socket.on( 'nameAndEmoji', ({name, emoji, code}) => {
        if( games[code] ) {
            console.log( "User " + name + " joined game " + code );
            //Set game state in host and send it to host.
            games[code].sharedState.users[name] = {
                name,
                emoji,
                points: 0
            };
            games[code].hostSocket.emit( 'gameState', {
                sharedState: games[code].sharedState,
            } );
            games[code].userSockets[name] = socket;

            // Change page on user to go to next screen, also set name and emoji in state.
            socket.emit( 'gameState', {
                sharedState: games[code].sharedState,
                name,
                emoji,
                screen: h2InformationScreenWithTimer
            } );
        }else{
            console.log( "invalid code valid codes are " + Object.keys( games ) );
            //send an error message to the client if the code is invalid
            socket.emit( 'gameState', {
                code, screen: g1NewGame, 
                error: "invalid game code"
            } );
        }
    });
})

server.listen(3000, () => {
  console.log('listening on *:3000');
});