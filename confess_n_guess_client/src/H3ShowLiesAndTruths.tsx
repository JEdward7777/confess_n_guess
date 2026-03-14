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
    const isHost = gameState.name === '<host>';

    const handleContinue = () => {
        const code = gameState.sharedState?.code;
        if (code) {
            socket.emit('continueFromResults', { code });
        }
    };

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

    // Dramatic reveal subsequent answers with delays
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

    // Auto-continue timer: 60 seconds after all revealed (for host only)
    const [countdown, setCountdown] = useState<number | null>(null);
    
    useEffect(() => {
        if (allRevealed && isHost && countdown === null) {
            setCountdown(60);
        }
        
        if (countdown !== null && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            // Auto-continue when timer expires
            handleContinue();
            setCountdown(null);
        }
    }, [allRevealed, isHost, countdown]);
    
    // Dark theme styles
    const containerStyle = {
        backgroundColor: '#1a1a1a',
        minHeight: '100vh',
        color: '#fff',
        padding: '20px'
    };

    return (
        <div style={containerStyle}>
            <h1 style={{ color: '#fff' }}>{allRevealed ? "Results Revealed!" : "Drumroll..."}</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px', color: '#ccc' }}>{text}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {answers.map((answer: UserAnswer, index: number) => {
                    const voters = (answer as any).voters || [];
                    const isRevealed = revealedCount > index;
                    
                    return (
                        <div key={answer.username} style={{ 
                            margin: '10px', 
                            padding: '20px', 
                            border: isRevealed && answer.isTruth ? '3px solid #4CAF50' : '2px solid #555',
                            borderRadius: '10px',
                            backgroundColor: isRevealed && answer.isTruth ? '#1e3a1e' : '#2d2d2d',
                            opacity: isRevealed ? 1 : 0.5,
                            transform: isRevealed ? 'scale(1.02)' : 'scale(1)',
                            transition: 'all 0.3s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>{answer.username}</span>
                                {isRevealed && answer.isTruth && (
                                    <span style={{ 
                                        color: '#1a1a1a', 
                                        fontWeight: 'bold',
                                        backgroundColor: '#4CAF50',
                                        padding: '4px 12px',
                                        borderRadius: '15px'
                                    }}>
                                        ✓ TRUTH
                                    </span>
                                )}
                                {isRevealed && !answer.isTruth && (
                                    <span style={{ 
                                        color: '#1a1a1a', 
                                        fontWeight: 'bold',
                                        backgroundColor: '#888',
                                        padding: '4px 12px',
                                        borderRadius: '15px'
                                    }}>
                                        💨 LIE
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: '18px', margin: '10px 0', color: '#fff' }}>
                                {isRevealed ? answer.answer : "???"}
                            </p>
                            
                            {/* Show voters if available */}
                            {hasVoters && isRevealed && voters.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '14px', color: '#ccc' }}>
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
            
            {isHost && allRevealed && (
                <div style={{ marginTop: '30px', textAlign: 'center' }}>
                    <button 
                        onClick={handleContinue}
                        style={{ 
                            padding: '15px 30px', 
                            fontSize: '18px',
                            backgroundColor: '#2196F3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                        }}
                    >
                        Continue
                    </button>
                    {countdown !== null && (
                        <p style={{ marginTop: '10px', color: '#888', fontSize: '14px' }}>
                            Auto-continue in {countdown} seconds
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default H3ShowLiesAndTruths;
