//@ts-ignore
import { socket } from './socket';

import React, { useState, useEffect } from 'react';

import { ClientGameState, LeaderboardEntry } from './../../src/IncludeStuff';


interface H5ShowPointsProps {
    gameState: ClientGameState
}

const H5ShowPoints = ({ gameState }: H5ShowPointsProps) => {

    const isHost = gameState.name === '<host>';
    const code = gameState.sharedState?.code;
    
    // Auto-continue timer: 60 seconds
    const [countdown, setCountdown] = useState<number | null>(null);
    
    useEffect(() => {
        if (isHost && countdown === null) {
            setCountdown(60);
        }
        
        if (countdown !== null && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            // Auto-continue when timer expires
            if (code) {
                socket.emit('continueFromScores', { code });
            }
            setCountdown(null);
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
        <div style={{ backgroundColor: '#1a1a1a', minHeight: '100vh', color: '#fff', padding: '20px' }}>
            <h1 style={{ color: '#fff' }}>Points This Round</h1>
            <div style={{ whiteSpace: 'pre-wrap', color: '#ccc' }}>{text}</div>
            
            <div style={{ marginTop: '30px' }}>
                <h2 style={{ color: '#fff' }}>Leaderboard</h2>
                <table style={{ width: '100%', maxWidth: '400px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#333' }}>
                            <th style={{ padding: '10px', border: '1px solid #555', color: '#fff' }}>Rank</th>
                            <th style={{ padding: '10px', border: '1px solid #555', color: '#fff' }}>Player</th>
                            <th style={{ padding: '10px', border: '1px solid #555', color: '#fff' }}>Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboard.map((entry: LeaderboardEntry, index: number) => (
                            <tr key={entry.name} style={{ 
                                backgroundColor: index === 0 ? '#2d2d2d' : '#1a1a1a',
                                color: '#fff',
                                fontWeight: index === 0 ? 'bold' : 'normal'
                            }}>
                                <td style={{ padding: '10px', border: '1px solid #555', textAlign: 'center', color: '#fff' }}>
                                    {index + 1}
                                </td>
                                <td style={{ padding: '10px', border: '1px solid #555', color: '#fff' }}>
                                    {entry.emoji} {entry.name}
                                </td>
                                <td style={{ padding: '10px', border: '1px solid #555', textAlign: 'center', color: '#fff' }}>
                                    {entry.points}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isHost && (
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

export default H5ShowPoints;
