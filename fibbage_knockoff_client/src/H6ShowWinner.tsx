//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, LeaderboardEntry } from './../../src/IncludeStuff';


interface H6ShowWinnerProps {
    gameState: ClientGameState
}

const H6ShowWinner = ({ gameState }: H6ShowWinnerProps) => {

    const handleNewGame = () => {
        socket.emit('newGame');
    }

    const leaderboard = gameState.leaderboard ?? [];
    const text = gameState.text ?? "Game Over!";
    const winner = leaderboard.length > 0 ? leaderboard[0] : null;

    return (
        <div>
            <h1>🎉 Game Over! 🎉</h1>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            
            {winner && (
                <div style={{ 
                    marginTop: '30px', 
                    padding: '30px', 
                    backgroundColor: '#fff3cd',
                    borderRadius: '10px',
                    textAlign: 'center'
                }}>
                    <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>🏆 Winner 🏆</h2>
                    <p style={{ fontSize: '48px', margin: '10px 0' }}>{winner.emoji}</p>
                    <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{winner.name}</p>
                    <p style={{ fontSize: '24px' }}>Total Points: {winner.points}</p>
                </div>
            )}
            
            <div style={{ marginTop: '30px' }}>
                <h2>Final Standings</h2>
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
                    onClick={handleNewGame}
                    style={{ 
                        padding: '15px 30px', 
                        fontSize: '18px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }}
                >
                    Start New Game
                </button>
            </div>
        </div>
    );
}

export default H6ShowWinner;
