//@ts-ignore
import { socket } from './socket';

import React, { useState, useEffect } from 'react';

import { ClientGameState } from './../../src/IncludeStuff';


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

    // Sort answers: lies first, then truth last
    const sortedAnswers = [...answers].sort((a, b) => {
        // If one is truth and one is lie, truth goes last
        if (a.isTruth !== b.isTruth) {
            return a.isTruth ? 1 : -1;
        }
        return 0;
    });

    // State for the two-stage reveal
    const [currentIndex, setCurrentIndex] = useState(0);
    const [stage, setStage] = useState<'answer' | 'reveal'>('answer');
    const [allDone, setAllDone] = useState(false);

    // Reset state when new results come in
    useEffect(() => {
        setCurrentIndex(0);
        setStage('answer');
        setAllDone(false);
    }, [gameState.text, answers.length]);

    // Handle the two-stage timing for each entry
    useEffect(() => {
        if (sortedAnswers.length === 0 || allDone) return;

        // Stage 1: Show answer + voters (1 second)
        if (stage === 'answer') {
            const timer = setTimeout(() => {
                setStage('reveal');
            }, 1000);
            return () => clearTimeout(timer);
        }
        // Stage 2: Show Truth/Lie reveal (1 second), then move to next
        else if (stage === 'reveal') {
            const timer = setTimeout(() => {
                if (currentIndex < sortedAnswers.length - 1) {
                    // Move to next answer
                    setCurrentIndex(prev => prev + 1);
                    setStage('answer');
                } else {
                    // All done
                    setAllDone(true);
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [stage, currentIndex, sortedAnswers.length, allDone]);

    // Auto-continue timer: 60 seconds after all revealed (for host only)
    const [countdown, setCountdown] = useState<number | null>(null);
    
    useEffect(() => {
        if (allDone && isHost && countdown === null) {
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
    }, [allDone, isHost, countdown]);
    
    // Get current answer
    const currentAnswer = sortedAnswers[currentIndex];
    const voters = currentAnswer ? (currentAnswer as any).voters || [] : [];

    // Dark theme styles - use inline styles to bypass App constraints
    return (
        <div style={{ 
            backgroundColor: '#1a1a1a', 
            minHeight: '100vh', 
            color: '#fff', 
            padding: '20px',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
        }}>
            <h1 style={{ color: '#fff' }}>{allDone ? "Results Revealed!" : "Drumroll..."}</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px', color: '#ccc' }}>{text}</div>
            
            {!allDone && currentAnswer && (
                <div style={{ 
                    margin: '10px', 
                    padding: '20px', 
                    border: stage === 'reveal' && currentAnswer.isTruth ? '3px solid #4CAF50' : '2px solid #555',
                    borderRadius: '10px',
                    backgroundColor: stage === 'reveal' && currentAnswer.isTruth ? '#1e3a1e' : '#2d2d2d',
                    transition: 'all 0.3s ease'
                }}>
                    {/* Stage 1: Show answer + voters */}
                    {stage === 'answer' && (
                        <>
                            <p style={{ fontSize: '24px', margin: '10px 0', color: '#fff', fontWeight: 'bold' }}>
                                {currentAnswer.answer}
                            </p>
                            {hasVoters && voters.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '16px', color: '#ccc' }}>
                                    Voted by: {voters.join(', ')}
                                </div>
                            )}
                            {hasVoters && voters.length === 0 && (
                                <div style={{ marginTop: '10px', fontSize: '16px', color: '#888' }}>
                                    No votes yet
                                </div>
                            )}
                        </>
                    )}

                    {/* Stage 2: Reveal Truth/Lie + who submitted */}
                    {stage === 'reveal' && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                {currentAnswer.isTruth && (
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
                                {!currentAnswer.isTruth && (
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
                            <p style={{ fontSize: '24px', margin: '10px 0', color: '#fff', fontWeight: 'bold' }}>
                                {currentAnswer.answer}
                            </p>
                            <div style={{ marginTop: '10px', fontSize: '14px', color: '#ccc' }}>
                                Submitted by: {currentAnswer.username}
                            </div>
                            {hasVoters && voters.length > 0 && (
                                <div style={{ marginTop: '5px', fontSize: '14px', color: '#ccc' }}>
                                    Voted by: {voters.join(', ')}
                                </div>
                            )}
                            {hasVoters && voters.length === 0 && currentAnswer.isTruth && (
                                <div style={{ marginTop: '10px', fontSize: '16px', color: '#e74c3c' }}>
                                    No one guessed the truth!
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            
            {!allDone && (
                <p style={{ fontSize: '14px', color: '#888', marginTop: '20px' }}>
                    {currentIndex + 1} of {sortedAnswers.length} {stage === 'answer' ? '(answer)' : '(revealed)'}
                </p>
            )}
            
            {isHost && allDone && (
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
