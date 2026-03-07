//@ts-ignore
import { socket } from './socket';

import React, { useState, useEffect } from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';


interface H3ShowLiesAndTruthsProps {
    gameState: ClientGameState
}

const H3ShowLiesAndTruths = ({ gameState }: H3ShowLiesAndTruthsProps) => {

    const answers = gameState.answers ?? [];
    const text = gameState.text ?? "Results";

    // Check if we have voter info (lie results phase)
    const hasVoters = answers.length > 0 && (answers[0] as any).voters !== undefined;

    // Dramatic reveal state
    const [revealedCount, setRevealedCount] = useState(0);
    const [allRevealed, setAllRevealed] = useState(false);

    // Reset reveal state when new results come in
    useEffect(() => {
        setRevealedCount(0);
        setAllRevealed(false);
    }, [gameState.text]);

    // Dramatic reveal: show one answer at a time
    useEffect(() => {
        if (answers.length === 0) return;
        
        // Start revealing after initial delay
        const initialDelay = setTimeout(() => {
            if (answers.length > 0) {
                setRevealedCount(1);
            }
        }, 1500);

        return () => clearTimeout(initialDelay);
    }, [answers.length]);

    // Reveal subsequent answers with delays
    useEffect(() => {
        if (revealedCount > 0 && revealedCount < answers.length) {
            const delay = setTimeout(() => {
                setRevealedCount(prev => prev + 1);
            }, 1500); // 1.5 seconds per reveal
            return () => clearTimeout(delay);
        } else if (revealedCount >= answers.length && answers.length > 0 && !allRevealed) {
            // All revealed, wait a bit more then show completion
            const finishDelay = setTimeout(() => {
                setAllRevealed(true);
            }, 2000);
            return () => clearTimeout(finishDelay);
        }
    }, [revealedCount, answers.length, allRevealed]);

    return (
        <div>
            <h1 style={{ color: '#333' }}>{allRevealed ? "Results Revealed!" : "Drumroll..."}</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px', color: '#333' }}>{text}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {answers.map((answer: UserAnswer, index: number) => {
                    const voters = (answer as any).voters || [];
                    const isRevealed = revealedCount > index;
                    
                    return (
                        <div key={answer.username} style={{ 
                            margin: '10px', 
                            padding: '20px', 
                            border: isRevealed && answer.isTruth ? '3px solid #4CAF50' : '2px solid #666',
                            borderRadius: '10px',
                            backgroundColor: isRevealed && answer.isTruth ? '#e8f5e9' : '#f5f5f5',
                            opacity: isRevealed ? 1 : 0.5,
                            transform: isRevealed ? 'scale(1.02)' : 'scale(1)',
                            transition: 'all 0.3s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>{answer.username}</span>
                                {isRevealed && answer.isTruth && (
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
                                {isRevealed && !answer.isTruth && (
                                    <span style={{ 
                                        color: '#666', 
                                        fontWeight: 'bold',
                                        backgroundColor: '#e0e0e0',
                                        padding: '4px 12px',
                                        borderRadius: '15px'
                                    }}>
                                        💨 LIE
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: '18px', margin: '10px 0', color: '#333' }}>
                                {isRevealed ? answer.answer : "???"}
                            </p>
                            
                            {/* Show voters if available */}
                            {hasVoters && isRevealed && voters.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                                    Voted by: {voters.join(', ')}
                                </div>
                            )}
                            {hasVoters && isRevealed && voters.length === 0 && answer.isTruth && (
                                <div style={{ marginTop: '10px', fontSize: '14px', color: '#e74c3c' }}>
                                    No one guessed the truth!
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {!allRevealed && (
                <p style={{ fontSize: '14px', color: '#888', marginTop: '20px' }}>
                    {revealedCount} of {answers.length} revealed...
                </p>
            )}
        </div>
    );
}

export default H3ShowLiesAndTruths;
