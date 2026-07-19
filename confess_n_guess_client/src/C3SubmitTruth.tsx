//@ts-ignore
import {socket} from './socket';

import React, {useState, useEffect} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';
import { TruthBeacon } from './SpaceArt';

interface C3SubmitTruthProps {
    gameState: ClientGameState
}

const C3SubmitTruth = ({gameState}: C3SubmitTruthProps) => {

    const [answer, setAnswer] = useState<string>("");
    const [storedQuestion, setStoredQuestion] = useState<string>("");

    useEffect(() => {
        setAnswer("");

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
    }, [gameState.question, gameState.text, gameState.screen]);

    const submitTruth = () => {
        if (!answer.trim()) {
            return;
        }

        socket.emit("sendQuestionAnswer", {
            name: gameState?.name,
            code: gameState?.sharedState?.code ?? "",
            answer: answer,
            question: storedQuestion
        });
    }

    const error = gameState.error ?? "";

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && answer.trim()) {
            submitTruth();
        }
    };

    return (
        <div className="screen rise-in">
            <TruthBeacon />
            <p className="tagline">truth transmission</p>
            <h1>{gameState.instructionText || 'Answer the question about yourself'}</h1>
            <div className="prompt-panel">{storedQuestion}</div>
            <div className="stack">
                <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Broadcast the honest answer…"
                />
                <button onClick={submitTruth} disabled={!answer.trim()}>
                    Transmit Truth
                </button>
            </div>
            {error && <p className="error-text">{error}</p>}
        </div>
    );
}

export default C3SubmitTruth;
