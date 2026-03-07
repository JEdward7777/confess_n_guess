//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, LeaderboardEntry } from './../../src/IncludeStuff';


interface H5ShowPointsProps {
    gameState: ClientGameState
}

const H5ShowPoints = ({ gameState }: H5ShowPointsProps) => {

    const handleNextRound = () => {
        socket.emit('nextRound', { code: gameState?.sharedState?.code ?? "" });
    }

    const handleEndGame = () => {
        socket.emit('endGame', { code: gameState?.sharedState?.code ?? "" });
    }

    const leaderboard = gameState.leaderboard ?? [];
    const text = gameState.text ?? "Points for this round";

    return (
        <div>
            <h1>Points This Round</h1>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            
            <div style={{ marginTop: '30px' }}>
                <h2>Leaderboard</h2>
                <table style={{ width: '100%', maxWidth: '400px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f2f2f2' }}>
                            <th style={{ padding: '10px', border: '1px solid #ddd' }}>Rank</th>
                            <th style={{ padding: '10px', border: '1px solid #ddd' }}>Player</th>
                            <th style={{ padding: '10px', border: '1px solid #ddd' }}>Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboard.map((entry: LeaderboardEntry, index: number) => (
                            <tr key={entry.name} style={{ 
                                backgroundColor: index === 0 ? '#fff3cd' : 'white',
                                fontWeight: index === 0 ? 'bold' : 'normal'
                            }}>
                                <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>
                                    {index + 1}
                                </td>
                                <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                                    {entry.emoji} {entry.name}
                                </td>
                                <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>
                                    {entry.points}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '30px' }}>
                <button 
                    onClick={handleNextRound}
                    style={{ 
                        padding: '15px 30px', 
                        fontSize: '18px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        marginRight: '10px'
                    }}
                >
                    Next Round
                </button>
                <button 
                    onClick={handleEndGame}
                    style={{ 
                        padding: '15px 30px', 
                        fontSize: '18px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }}
                >
                    End Game
                </button>
            </div>
        </div>
    );
}

export default H5ShowPoints;
