//react page showing new game button or join game button where you put a code in.
//import React from 'react';
import {ClientState} from './../../src/IncludeStuff';
//Put a ts ignore on the next line.
import React, {useState} from 'react';
//@ts-ignore
import {socket} from './socket';


interface G1NewGamePageProps {
    gameState: ClientState,
}

const G1NewGamePage = ({gameState}: G1NewGamePageProps ) => {


    const error = gameState.error || "";

    const [inputCode, setInputCode] = useState<string>(gameState?.sharedState?.code || "");

    //action for start game which creates a random code and sets the screen to h2InformationScreenWithTimer.
    const startGame = () => {
        socket.emit("newGame");
    }

    const joinGame = () => {
        //send a join game request including the code in the input
        socket.emit("joinGame", inputCode);
    }
    

    return (
        <div>
            <button onClick={startGame}>New Game</button>
            <input type="text" placeholder="Enter Code" value={inputCode} onChange={(e) => setInputCode(e.target.value)}/>
            <button onClick={joinGame}>Join Game</button>
            {error && <p>{error}</p>}
        </div>
    );
}

export default G1NewGamePage;