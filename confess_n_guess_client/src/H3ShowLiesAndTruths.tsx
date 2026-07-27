//@ts-ignore
import { socket } from './socket';

import React, { useState, useEffect } from 'react';

import { ClientGameState } from './../../src/IncludeStuff';
import { TruthScanner } from './SpaceArt';
import { announcer } from './announcer';
import AutoContinueButton from './AutoContinueButton';

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

    // Handle the two-stage timing for each entry
    useEffect(() => {
        if (sortedAnswers.length === 0 || allDone) return;

        // Stage 1: Show answer + voters. Family playtest verdict (2026-07-19): the
        // reveal went by too fast to savor - tripled from 2s to 6s per stage.
        if (stage === 'answer') {
            const timer = setTimeout(() => {
                setStage('reveal');
            }, 6000);
            return () => clearTimeout(timer);
        }
        // Stage 2: Show Truth/Lie reveal, then move to next
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
            }, 6000);
            return () => clearTimeout(timer);
        }
    }, [stage, currentIndex, sortedAnswers.length, allDone]);

    // Get current answer - with safe defaults
    const currentAnswer = sortedAnswers[currentIndex] ?? null;

    // The full-announcer reveal (user-chosen): read each answer as its card appears,
    // then call the verdict. Host only - this screen also renders on player phones.
    // allDone re-renders the same last card, so it must not re-announce.
    useEffect(() => {
        if (!isHost || !currentAnswer || allDone) return;
        if (stage === 'answer') {
            announcer.announce('revealAnswer', { answer: `"${currentAnswer.answer}"` }, { interrupt: true });
        } else {
            const noVotes = Array.isArray(currentAnswer.voters) && currentAnswer.voters.length === 0;
            if (currentAnswer.isTruth) {
                announcer.announce(noVotes ? 'verdictTruthNobody' : 'verdictTruth',
                    { target: currentAnswer.username }, { interrupt: true });
            } else {
                announcer.announce('verdictLie', { author: currentAnswer.username }, { interrupt: true });
            }
        }
    }, [currentIndex, stage, allDone, isHost]);
    // Safely get voters array - ensure it's an array
    const voters = (currentAnswer && Array.isArray(currentAnswer.voters)) ? currentAnswer.voters : [];

    // Safe accessors for currentAnswer properties
    const currentIsTruth = currentAnswer?.isTruth ?? false;
    const currentAnswerText = currentAnswer?.answer ?? '';
    const currentUsername = currentAnswer?.username ?? 'Unknown';

    return (
        <div className="screen host-screen">
            <TruthScanner />
            <p className="tagline">signal decryption</p>
            <h1 className={allDone ? 'glow-cyan' : ''}>{allDone ? 'Truth Revealed' : 'Scanning…'}</h1>
            <p className="hint-text" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>

            {/* Show the final truth entry when all done, otherwise show current entry */}
            {currentAnswer && (
                <div key={`${currentIndex}-${stage}-${allDone}`} className={'reveal-card' + ((allDone || stage === 'reveal') && currentIsTruth ? ' is-truth' : '')}>
                    {/* When all done, always show the reveal stage (truth/lie + submitter) */}
                    {(allDone || stage === 'reveal') && (
                        <>
                            {currentIsTruth
                                ? <span className="verdict truth">✓ Truth</span>
                                : <span className="verdict lie">✕ Lie</span>}
                            <p className="reveal-answer">{currentAnswerText}</p>
                            <div className="reveal-by">Submitted by: {currentUsername}</div>
                            {hasVoters && voters.length > 0 && (
                                <div className="reveal-votes">Voted by: {voters.join(', ')}</div>
                            )}
                            {hasVoters && voters.length === 0 && currentIsTruth && (
                                <div className="reveal-nobody">No one guessed the truth!</div>
                            )}
                        </>
                    )}

                    {/* Stage 1: Show answer + voters (only when not all done and in answer stage) */}
                    {!allDone && stage === 'answer' && (
                        <>
                            <p className="reveal-answer">{currentAnswerText}</p>
                            {hasVoters && voters.length > 0 && (
                                <div className="reveal-votes">Voted by: {voters.join(', ')}</div>
                            )}
                            {hasVoters && voters.length === 0 && (
                                <div className="reveal-votes">No votes</div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Show message if no valid answers */}
            {!currentAnswer && !allDone && (
                <div className="panel" style={{ marginTop: '1rem' }}>
                    <p className="hint-text">Waiting for results...</p>
                </div>
            )}

            {!allDone && (
                <p className="faint-text" style={{ marginTop: '1rem' }}>
                    {currentIndex + 1} of {sortedAnswers.length} {stage === 'answer' ? '(answer)' : '(revealed)'}
                </p>
            )}

            {isHost && allDone && (
                <div style={{ marginTop: '1.4rem' }}>
                    <AutoContinueButton onContinue={handleContinue} />
                </div>
            )}
        </div>
    );
}

export default H3ShowLiesAndTruths;
