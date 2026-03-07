//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';


interface H3ShowLiesAndTruthsProps {
    gameState: ClientGameState
}

const H3ShowLiesAndTruths = ({ gameState }: H3ShowLiesAndTruthsProps) => {

    const answers = gameState.answers ?? [];
    const text = gameState.text ?? "Results";

    // Check if we have voter info (lie results phase)
    const hasVoters = answers.length > 0 && (answers[0] as any).voters !== undefined;

    return (
        <div>
            <h1>Results</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px' }}>{text}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {answers.map((answer: UserAnswer) => {
                    const voters = (answer as any).voters || [];
                    return (
                        <div key={answer.username} style={{ 
                            margin: '10px', 
                            padding: '20px', 
                            border: answer.isTruth ? '3px solid #4CAF50' : '2px solid #666',
                            borderRadius: '10px',
                            backgroundColor: answer.isTruth ? '#e8f5e9' : '#f5f5f5'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{answer.username}</span>
                                {answer.isTruth && (
                                    <span style={{ 
                                        color: '#4CAF50', 
                                        fontWeight: 'bold',
                                        backgroundColor: '#c8e6c9',
                                        padding: '4px 12px',
                                        borderRadius: '15px'
                                    }}>
                                        ✓ TRUTH
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: '18px', margin: '10px 0' }}>{answer.answer}</p>
                            
                            {/* Show voters if available */}
                            {hasVoters && voters.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                                    Voted by: {voters.join(', ')}
                                </div>
                            )}
                            {hasVoters && voters.length === 0 && answer.isTruth && (
                                <div style={{ marginTop: '10px', fontSize: '14px', color: '#e74c3c' }}>
                                    No one guessed the truth!
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default H3ShowLiesAndTruths;
