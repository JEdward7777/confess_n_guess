//@ts-ignore
import {socket} from './socket';

import React, {useEffect, useState, useRef} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';


interface H2InformationScreenWithTimerProps {
    gameState: ClientGameState
}

const DEFAULT_COUNTDOWN = 60;

const H2InformationScreenWithTimer = ({gameState}: H2InformationScreenWithTimerProps) => {

    const [count, setCounter] = useState<number>(gameState.timerValue ?? DEFAULT_COUNTDOWN);
    const hasSentTimeoutEvent = useRef(false);

    // Use the timerValue from server if available
    useEffect(() => {
        if (gameState.timerValue !== undefined && gameState.timerValue !== count) {
            setCounter(gameState.timerValue);
        }
    }, [gameState.timerValue]);

    //decrement the counter until it reaches 0
    useEffect(() => {
        if (count > 0) {
            const timer = setTimeout(() => {
                setCounter(count - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else if (count === 0 && !hasSentTimeoutEvent.current) {
            // Timer reached zero - notify server
            hasSentTimeoutEvent.current = true;
            socket.emit('timerExpired', { code: gameState?.sharedState?.code ?? "" });
        }
    }, [count, gameState?.sharedState?.code]);

    const text = gameState.text ?? "Please wait...";

    return (
        <div>
            <h1 style={{ fontSize: '24px' }}>{text}</h1>
            <h2 style={{ fontSize: '48px', marginTop: '20px' }}>{count}</h2>
            <p>Seconds remaining</p>
        </div>
    );
}

export default H2InformationScreenWithTimer;