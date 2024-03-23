
import * as express from 'express';
const app = express();

import * as http from 'http';

const server = http.createServer(app);
import * as path from 'path';

import * as fs from 'fs';

// const express = require('express');
// const app = express();

// const http = require('http');

// const server = http.createServer(app);
// const path = require('path');

import { Server, Socket } from "socket.io";
import {Screens, SharedState, ClientGameState, UserPoints } from "./IncludeStuff";

var httpPath = path.join( __dirname, "../fibbage_knockoff_client/dist/" );

app.use(express.static(httpPath));

const questions = [
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
]


interface ServerGameStateNonSocketStuff{
    sharedState: SharedState,
    usedQuestionIndexes: number[],
}

interface ServerGameStateSocketStuff{
    hostSocket: Socket;
    userSockets: { [userId: string]: Socket };
}

//const games : { [gameCode: string]: ServerGameState } = {};
const gamesNonSocketStuff : { [gameCode: string]: ServerGameStateNonSocketStuff } = {};
const gamesSocketStuff : { [gameCode: string]: ServerGameStateSocketStuff } = {};


function saveGameState(){
    console.log("saveGameState");
    fs.writeFileSync('gamesNonSocketStuff.json', JSON.stringify(gamesNonSocketStuff));
}

process.on('exit', saveGameState );
process.on( 'SIGINT', () => {
    saveGameState();
    process.exit();
 } );

//load games.json if it exists.
if (fs.existsSync('gamesNonSocketStuff.json')){
    //games is const so we have to push the data into it.
    const loadedGames = JSON.parse(fs.readFileSync('gamesNonSocketStuff.json').toString());
    for (const gameCode in loadedGames){
        gamesNonSocketStuff[gameCode] = loadedGames[gameCode];
        console.log( "Loaded game", gameCode );
    }
}

interface ServerToClientEvents {
    // noArg: () => void;
    // basicEmit: (a: number, b: string, c: Buffer) => void;
    // withAck: (d: string, callback: (e: number) => void) => void;
    gameState: (clientState: ClientGameState) => void;
  }

  interface NameAndEmoji{
    name: string;
    emoji: string;
  }
  
  interface ClientToServerEvents {
    newGame: () => void;
    joinGame: (gameCode: string) => void;
    nameAndEmoji: ({name,emoji,code}:{name:string,emoji:string,code:string}) => void;
    startGame: ( {code}:{code:string}) => void;
    sendQuestionAnswer: ( {name,code,answer}:{name:string,code:string,answer:string}) => void;
  }
  
  interface InterServerEvents {
    ping: () => void;
  }
  
  interface SocketData {
    name: string;
    age: number;
  }

const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>(server);

io.on('connection', (socket) =>{
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    const sendInvalidGameCode = ({code}:{code:string}) => {
        console.log( "invalid code valid codes are " + Object.keys( gamesNonSocketStuff ) );
        //send an error message to the client if the code is invalid
        socket.emit( 'gameState', {
            screen: Screens.g1NewGame, 
            error: "invalid code",
            name: "",
            emoji: "",
            sharedState: {
                users: {},
                code
            }
        } );
    }


    socket.on( 'newGame', () => {
        const charactersToUse = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const code = Array.from( {length: 5}, () => charactersToUse.charAt( Math.floor( Math.random() * charactersToUse.length ) ) ).join( '' );

        gamesNonSocketStuff[code] = {
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
            usedQuestionIndexes: [],
        };
        gamesSocketStuff[code] = {
            hostSocket: socket,
            userSockets: {},
        }

        console.log( "new game " + code + " created." );

        gamesSocketStuff[code].hostSocket.emit( 'gameState', {
            sharedState: gamesNonSocketStuff[code].sharedState,
            name: "<host>",
            screen: Screens.h1CollectingUsers,
            error: ""
        } );
    });

    socket.on( 'joinGame', (code) => {
        console.log( "joinGame received")
        if( gamesNonSocketStuff[code] ) {
            console.log( "joining game " + code + " created.");


            //socket.emit( 'gameState', {code, screen: c1TypeInYourNameAndPickAnEmojiForYourPicture, error:""} );
            socket.emit( 'gameState', {
                sharedState: gamesNonSocketStuff[code].sharedState, 
                name: "", 
                emoji: "",
                screen: Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture, 
                error:""
            } );
        }else{
            sendInvalidGameCode({code})
        }
    });


    socket.on( 'nameAndEmoji', ({name, emoji, code}) => {
        if( gamesNonSocketStuff[code] ) {
            console.log( "User " + name + " joined game " + code );
            //Set game state in host and send it to host.
            gamesNonSocketStuff[code].sharedState.users[name] = {
                name,
                emoji,
                points: 0
            };
            gamesSocketStuff[code].hostSocket.emit( 'gameState', {
                sharedState: gamesNonSocketStuff[code].sharedState,
            } );
            gamesSocketStuff[code].userSockets[name] = socket;

            // Change page on user to go to next screen, also set name and emoji in state.
            const clientState : ClientGameState = {
                sharedState: gamesNonSocketStuff[code].sharedState,
                name,
                emoji,
                screen: Screens.c2WaitingScreenJustWhateverText,
            }
            socket.emit( 'gameState', clientState );
        }else{
            sendInvalidGameCode({code})
        }
    });

    socket.on( 'startGame', ({code}) => {
        //we need to send all the users to questions and we need to send the host to the screen that has a counter counting down.
        if( gamesNonSocketStuff[code] ){
            console.log( "Starting game " + code + "." );

            gamesSocketStuff[code].hostSocket.emit( 'gameState', {
                screen: Screens.h2InformationScreenWithTimer,
                text: "Truthfully answer the questions on your device."
            });

            //now iterate through each person and send each person answer a different question, 
            Object.entries(gamesNonSocketStuff[code].sharedState.users).filter( ([username,user]) => username != "<host>" ).forEach( ([username,user]) => {
                const notUsedQuestions: string[] = questions.filter( (question,index) => {
                    return !gamesNonSocketStuff[code].usedQuestionIndexes.includes(index);
                });
                const pickedQuestionIndex = Math.floor(Math.random() * notUsedQuestions.length);
                const pickedQuestionString = questions[pickedQuestionIndex];
                gamesNonSocketStuff[code].usedQuestionIndexes.push(pickedQuestionIndex);
                gamesSocketStuff[code].userSockets[username].emit( 'gameState', {
                    screen: Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer,
                    text: "Please truthfully answer this question:<br>\n<br>\n" + pickedQuestionString,
                    question: pickedQuestionString,
                });
            });
        }else{
            sendInvalidGameCode({code})
        }
    });

    socket.on( 'sendQuestionAnswer', ({name,code,answer}) => {
        if( gamesNonSocketStuff[code] ){
            console.log( "User " + name + " answered " + answer + " on game " + code );

            //store the users answer,
            //send them to a waiting screen.
            //Then see if all the questions are in.

        }else{
            sendInvalidGameCode({code})
        }
    });

    saveGameState();
})

server.listen(3000, () => {
  console.log('listening on *:3000');
});