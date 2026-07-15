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

    // Restart the countdown whenever the server starts a new timed segment. phaseToken
    // changes exactly then, which is more reliable than watching text/timerValue: two
    // consecutive segments can carry the same text and the same 60, and the countdown
    // would silently carry on from the old one.
    useEffect(() => {
        const newTimerValue = gameState.timerValue ?? DEFAULT_COUNTDOWN;
        setCounter(newTimerValue);
        hasSentTimeoutEvent.current = false; // Reset the timeout event flag
    }, [gameState.phaseToken, gameState.timerValue, gameState.text]);

    //decrement the counter until it reaches 0
    useEffect(() => {
        if (count > 0) {
            const timer = setTimeout(() => {
                setCounter(count - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else if (count === 0 && !hasSentTimeoutEvent.current) {
            // Timer reached zero - notify server. Echo back the token of the segment we
            // were timing so the server can tell this apart from a countdown for a
            // segment that has already moved on (CNG-003).
            hasSentTimeoutEvent.current = true;
            socket.emit('timerExpired', {
                code: gameState?.sharedState?.code ?? "",
                phaseToken: gameState?.phaseToken
            });
        }
    }, [count, gameState?.sharedState?.code, gameState?.phaseToken]);

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