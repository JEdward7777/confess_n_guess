//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';


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
        <div>
            <h1>Which one is the TRUTH?</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px' }}>{text}</div>
            {filteredAnswers.length === 0 ? (
                <p>No answers available for voting.</p>
            ) : (
            <div>
                {filteredAnswers.map((answer: UserAnswer) => (
                    <div key={answer.username} style={{ margin: '10px', padding: '15px', border: '2px solid #444', borderRadius: '8px' }}>
                        <p style={{ fontSize: '18px' }}>{answer.answer}</p>
                        <button 
                            onClick={() => handleSelectAnswer(answer.username)}
                            style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
                        >
                            Select as Truth
                        </button>
                    </div>
                ))}
            </div>
            )}
        </div>
    );
}

export default C4PickBestAnswer;
