//@ts-ignore
import { socket } from './socket';

import React, { useState, useEffect, useRef } from 'react';

import { ClientGameState, LeaderboardEntry } from './../../src/IncludeStuff';
import { ScoreConstellation } from './SpaceArt';

interface H5ShowPointsProps {
    gameState: ClientGameState
}

const H5ShowPoints = ({ gameState }: H5ShowPointsProps) => {

    const isHost = gameState.name === '<host>';
    const code = gameState.sharedState?.code;

    // Auto-continue timer: 60 seconds. The host drives this screen; the server only has a
    // long backstop for when there is no host at all (CNG-028).
    const [countdown, setCountdown] = useState<number | null>(null);
    const hasContinued = useRef(false);

    useEffect(() => {
        if (!isHost) return;

        if (countdown === null) {
            setCountdown(60);
            return;
        }
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
        // Fire once and stay at zero. This used to reset countdown to null, which
        // retriggered the arming branch above and re-armed at 60 forever - invisible
        // while the screen changes underneath it, but a silent 60s re-emit loop whenever
        // it didn't (CNG-017).
        if (!hasContinued.current) {
            hasContinued.current = true;
            if (code) {
                socket.emit('continueFromScores', { code });
            }
        }
    }, [isHost, countdown, code]);

    const handleContinue = () => {
        if (code) {
            socket.emit('continueFromScores', { code });
        }
    };

    const leaderboard = gameState.leaderboard ?? [];
    const text = gameState.text ?? "Points for this round";

    return (
        <div className="screen host-screen rise-in">
            <ScoreConstellation />
            <p className="tagline">telemetry</p>
            <h1>Round Scores</h1>
            <p className="hint-text" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>

            <div className="panel" style={{ maxWidth: '28rem', margin: '1rem auto 0' }}>
                <table>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'center' }}>Rank</th>
                            <th>Player</th>
                            <th style={{ textAlign: 'right' }}>Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboard.map((entry: LeaderboardEntry, index: number) => (
                            <tr key={entry.name} className={index === 0 ? 'lb-first' : ''}>
                                <td style={{ textAlign: 'center' }}>{index + 1}</td>
                                <td>{entry.emoji} {entry.name}</td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{entry.points}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isHost && (
                <div style={{ marginTop: '1.4rem' }}>
                    <button onClick={handleContinue}>Continue</button>
                    {countdown !== null && (
                        <p className="faint-text" style={{ marginTop: '0.6rem' }}>
                            Auto-continue in {countdown} seconds
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default H5ShowPoints;
