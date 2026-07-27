//@ts-ignore
import { socket } from './socket';

import React, { useEffect } from 'react';

import { ClientGameState, LeaderboardEntry } from './../../src/IncludeStuff';
import { ScoreConstellation } from './SpaceArt';
import { announcer } from './announcer';
import AutoContinueButton from './AutoContinueButton';

interface H5ShowPointsProps {
    gameState: ClientGameState
}

const H5ShowPoints = ({ gameState }: H5ShowPointsProps) => {

    const isHost = gameState.name === '<host>';
    const code = gameState.sharedState?.code;

    const handleContinue = () => {
        if (code) {
            socket.emit('continueFromScores', { code });
        }
    };

    const leaderboard = gameState.leaderboard ?? [];
    const text = gameState.text ?? "Points for this round";

    // One line on arrival, naming the leader. The screen remounts per round.
    useEffect(() => {
        if (!isHost || leaderboard.length === 0) return;
        announcer.announce('points',
            { leader: leaderboard[0].name, points: String(leaderboard[0].points) },
            { interrupt: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                    <AutoContinueButton onContinue={handleContinue} />
                </div>
            )}
        </div>
    );
}

export default H5ShowPoints;
