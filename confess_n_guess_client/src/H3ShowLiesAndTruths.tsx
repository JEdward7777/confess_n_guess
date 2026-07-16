//@ts-ignore
import { socket } from './socket';

import React, { useState, useEffect, useRef } from 'react';

import { ClientGameState } from './../../src/IncludeStuff';


interface H3ShowLiesAndTruthsProps {
    gameState: ClientGameState
}

// Type guard to check if an answer object has required properties
function isValidAnswer(answer: any): answer is { username: string; answer: string; isTruth: boolean; voters?: string[] } {
    return answer && typeof answer === 'object' && 
           typeof answer.username === 'string' && 
           typeof answer.answer === 'string' && 
           typeof answer.isTruth === 'boolean';
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

    // Filter out invalid answers and validate data
    const validAnswers = answers.filter(isValidAnswer);

    // Check if we have voter info (lie results phase) - safely check first valid answer
    const hasVoters = validAnswers.length > 0 && Array.isArray(validAnswers[0]?.voters);

    // Sort answers: lies first, then truth last - with safe property access
    const sortedAnswers = [...validAnswers].sort((a, b) => {
        // Default to false if isTruth is missing
        const aIsTruth = a?.isTruth ?? false;
        const bIsTruth = b?.isTruth ?? false;
        // If one is truth and one is lie, truth goes last
        if (aIsTruth !== bIsTruth) {
            return aIsTruth ? 1 : -1;
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

    // Reset countdown when new results come in (separate effect to access setCountdown)
    useEffect(() => {
        setCountdown(null);
    }, [gameState.text, answers.length]);

    // Handle the two-stage timing for each entry
    useEffect(() => {
        if (sortedAnswers.length === 0 || allDone) return;

        // Stage 1: Show answer + voters (2 seconds)
        if (stage === 'answer') {
            const timer = setTimeout(() => {
                setStage('reveal');
            }, 2000);
            return () => clearTimeout(timer);
        }
        // Stage 2: Show Truth/Lie reveal (2 seconds), then move to next
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
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [stage, currentIndex, sortedAnswers.length, allDone]);

    // Auto-continue timer: 60 seconds after all revealed (for host only). The host drives
    // this screen; the server only has a long backstop for when there is no host at all,
    // deliberately far longer than the reveal takes so it never cuts this short (CNG-028).
    const [countdown, setCountdown] = useState<number | null>(null);
    const hasContinued = useRef(false);

    useEffect(() => {
        if (!allDone || !isHost) return;

        if (countdown === null) {
            setCountdown(60);
            return;
        }
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
        // Fire once and stay at zero - resetting to null re-armed this forever (CNG-017).
        if (!hasContinued.current) {
            hasContinued.current = true;
            handleContinue();
        }
    }, [allDone, isHost, countdown]);

    // Get current answer - with safe defaults
    const currentAnswer = sortedAnswers[currentIndex] ?? null;
    // Safely get voters array - ensure it's an array
    const voters = (currentAnswer && Array.isArray(currentAnswer.voters)) ? currentAnswer.voters : [];
    
    // Safe accessors for currentAnswer properties
    const currentIsTruth = currentAnswer?.isTruth ?? false;
    const currentAnswerText = currentAnswer?.answer ?? '';
    const currentUsername = currentAnswer?.username ?? 'Unknown';

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
            <h1 style={{ color: '#fff' }}>{allDone ? "Truth Revealed!" : "Drumroll..."}</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px', color: '#ccc' }}>{text}</div>

            {/* Show the final truth entry when all done, otherwise show current entry */}
            {currentAnswer && (
                <div style={{
                    margin: '10px',
                    padding: '20px',
                    border: currentIsTruth ? '3px solid #4CAF50' : '2px solid #555',
                    borderRadius: '10px',
                    backgroundColor: currentIsTruth ? '#1e3a1e' : '#2d2d2d',
                    transition: 'all 0.3s ease'
                }}>
                    {/* When all done, always show the reveal stage (truth/lie + submitter) */}
                    {(allDone || stage === 'reveal') && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                {currentIsTruth && (
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
                                {!currentIsTruth && (
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
                                {currentAnswerText}
                            </p>
                            <div style={{ marginTop: '10px', fontSize: '14px', color: '#ccc' }}>
                                Submitted by: {currentUsername}
                            </div>
                            {hasVoters && voters.length > 0 && (
                                <div style={{ marginTop: '5px', fontSize: '14px', color: '#ccc' }}>
                                    Voted by: {voters.join(', ')}
                                </div>
                            )}
                            {hasVoters && voters.length === 0 && currentIsTruth && (
                                <div style={{ marginTop: '10px', fontSize: '16px', color: '#e74c3c' }}>
                                    No one guessed the truth!
                                </div>
                            )}
                        </>
                    )}

                    {/* Stage 1: Show answer + voters (only when not all done and in answer stage) */}
                    {!allDone && stage === 'answer' && (
                        <>
                            <p style={{ fontSize: '24px', margin: '10px 0', color: '#fff', fontWeight: 'bold' }}>
                                {currentAnswerText}
                            </p>
                            {hasVoters && voters.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '16px', color: '#ccc' }}>
                                    Voted by: {voters.join(', ')}
                                </div>
                            )}
                            {hasVoters && voters.length === 0 && (
                                <div style={{ marginTop: '10px', fontSize: '16px', color: '#888' }}>
                                    No votes
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Show message if no valid answers */}
            {!currentAnswer && !allDone && (
                <div style={{ padding: '20px', color: '#888', textAlign: 'center' }}>
                    <p>Waiting for results...</p>
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
