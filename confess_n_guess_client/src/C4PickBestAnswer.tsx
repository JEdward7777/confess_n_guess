//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';
import { SignalPicker } from './SpaceArt';

interface C4PickBestAnswerProps {
    gameState: ClientGameState
}

const C4PickBestAnswer = ({ gameState }: C4PickBestAnswerProps) => {

    const handleSelectAnswer = (username: string) => {
        // Send vote - targetPlayer comes from sharedState or we need to track it
        const targetPlayer = (gameState as any).targetPlayer || '';
        socket.emit('voteOnLie', {
            name: gameState?.name,
            code: gameState?.sharedState?.code ?? "",
            selectedUsername: username,
            targetPlayer: targetPlayer
        });
    }

    const answers = gameState.answers ?? [];
    const text = gameState.text ?? "Pick the best answer!";
    const currentPlayerName = gameState?.name ?? '';

    // Filter out user's own answer to prevent giving themselves points
    const filteredAnswers = answers.filter((answer: UserAnswer) => answer.username !== currentPlayerName);

    return (
        <div className="screen rise-in">
            <SignalPicker />
            <p className="tagline">signal analysis</p>
            <h1>Find the true signal</h1>
            <p className="hint-text" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
            {filteredAnswers.length === 0 ? (
                <p className="hint-text">No answers available for voting.</p>
            ) : (
                <div className="stack" style={{ marginTop: '0.6rem' }}>
                    {filteredAnswers.map((answer: UserAnswer) => (
                        <button
                            key={answer.username}
                            className="ballot-card"
                            onClick={() => handleSelectAnswer(answer.username)}
                        >
                            <span>{answer.answer}</span>
                            <span className="pick">lock on ▸</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default C4PickBestAnswer;
