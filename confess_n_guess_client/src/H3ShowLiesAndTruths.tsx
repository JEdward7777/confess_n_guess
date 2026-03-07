//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';


interface H3ShowLiesAndTruthsProps {
    gameState: ClientGameState
}

const H3ShowLiesAndTruths = ({ gameState }: H3ShowLiesAndTruthsProps) => {

    const handleSelectBestAnswer = (username: string) => {
        socket.emit('selectBestAnswer', { 
            code: gameState?.sharedState?.code ?? "", 
            selectedUsername: username 
        });
    }

    const answers = gameState.answers ?? [];
    const text = gameState.text ?? "Select the best answer!";

    return (
        <div>
            <h1>All Answers</h1>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '20px' }}>
                {answers.map((answer: UserAnswer) => (
                    <div key={answer.username} style={{ 
                        margin: '10px', 
                        padding: '15px', 
                        border: '2px solid #4CAF50',
                        borderRadius: '8px',
                        minWidth: '200px'
                    }}>
                        <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{answer.username}</p>
                        <p style={{ fontSize: '16px' }}>{answer.answer}</p>
                        {answer.isTruth && <span style={{ color: 'green' }}>✓ Truth</span>}
                        <br /><br />
                        <button 
                            onClick={() => handleSelectBestAnswer(answer.username)}
                            style={{ 
                                padding: '10px 20px', 
                                fontSize: '16px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: 'pointer'
                            }}
                        >
                            Select as Best
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default H3ShowLiesAndTruths;
