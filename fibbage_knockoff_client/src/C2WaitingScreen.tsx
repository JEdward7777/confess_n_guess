//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState } from './../../src/IncludeStuff';


interface C2WaitingScreenProps {
    gameState: ClientGameState
}

const C2WaitingScreen = ({ gameState }: C2WaitingScreenProps) => {

    const text = gameState.text ?? "Please wait...";

    return (
        <div>
            <h1>Waiting...</h1>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
        </div>
    );
}

export default C2WaitingScreen;
