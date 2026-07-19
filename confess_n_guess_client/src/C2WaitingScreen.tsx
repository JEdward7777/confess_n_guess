//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState } from './../../src/IncludeStuff';
import { DriftingAstronaut } from './SpaceArt';

interface C2WaitingScreenProps {
    gameState: ClientGameState
}

const C2WaitingScreen = ({ gameState }: C2WaitingScreenProps) => {

    const text = gameState.text ?? "Please wait...";

    return (
        <div className="screen rise-in">
            <DriftingAstronaut />
            <p className="tagline">holding orbit</p>
            <h1>Stand by<span className="anim-blink">…</span></h1>
            <div className="panel" style={{ whiteSpace: 'pre-wrap', marginTop: '0.6rem' }}>{text}</div>
        </div>
    );
}

export default C2WaitingScreen;
