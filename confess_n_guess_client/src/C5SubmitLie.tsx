//@ts-ignore
import {socket} from './socket';

import React, {useState, useEffect} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';
import { CloakedShip } from './SpaceArt';

interface C5SubmitLieProps {
    gameState: ClientGameState
}

const C5SubmitLie = ({gameState}: C5SubmitLieProps) => {

    const [lie, setLie] = useState<string>("");
    const [storedQuestion, setStoredQuestion] = useState<string>("");
    const [targetPlayer, setTargetPlayer] = useState<string>("");

    useEffect(() => {
        setLie("");

        if (gameState.question) {
            setStoredQuestion(gameState.question);
        } else if (gameState.text) {
            const lines = gameState.text.split('\n\n');
            if (lines.length > 1) {
                setStoredQuestion(lines[lines.length - 1]);
            } else {
                setStoredQuestion(gameState.text);
            }
        }

        if (gameState.targetPlayer) {
            setTargetPlayer(gameState.targetPlayer);
        }
    }, [gameState.question, gameState.text, gameState.targetPlayer, gameState.screen]);

    const submitLie = () => {
        if (!lie.trim()) {
            return;
        }

        socket.emit("submitLie", {
            name: gameState?.name,
            code: gameState?.sharedState?.code ?? "",
            lie: lie,
            targetPlayer: targetPlayer,
            question: storedQuestion
        });
    }

    const error = gameState.error ?? "";

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && lie.trim()) {
            submitLie();
        }
    };

    return (
        <div className="screen rise-in">
            <CloakedShip />
            <p className="tagline">cloaked transmission</p>
            <h1>{gameState.instructionText || `Write a fooling answer for this question about ${targetPlayer}`}</h1>
            <div className="prompt-panel lie-panel">{storedQuestion}</div>
            <div className="stack">
                <input
                    type="text"
                    value={lie}
                    onChange={(e) => setLie(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Fabricate something believable…"
                />
                <button className="btn-magenta" onClick={submitLie} disabled={!lie.trim()}>
                    Deploy the Lie
                </button>
            </div>
            {error && <p className="error-text">{error}</p>}
        </div>
    );
}

export default C5SubmitLie;
