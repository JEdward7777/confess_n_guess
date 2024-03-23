//@ts-ignore
import {socket} from './socket';

import React, {useEffect, useState} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';


interface H2InformationScreenWithTimerProps {
    gameState: ClientGameState
}

const DEFAULT_COUNTDOWN = 60;

const H2InformationScreenWithTimer = ({gameState}: H2InformationScreenWithTimerProps) => {

    const [count, setCounter] = useState<number>(DEFAULT_COUNTDOWN);

    //decrement the counter until it reaches 0
    useEffect(() => {
        if (count > 0) {
            const timer = setTimeout(() => {
                setCounter(count - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [count]);

    const error = gameState.error ?? ""; 

    // Update the input for the Emoji to use the EmojiPicker component
    return (
        <div>
            <h1>{ gameState?.text } {count}</h1>
            {error && <p>{error}</p>}
        </div>
    );
}

export default H2InformationScreenWithTimer;