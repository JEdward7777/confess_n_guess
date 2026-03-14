//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, LeaderboardEntry } from './../../src/IncludeStuff';


interface H6ShowWinnerProps {
    gameState: ClientGameState
}

const H6ShowWinner = ({ gameState }: H6ShowWinnerProps) => {

    const handleNewGame = () => {
        // Go to the new game/join screen by using hash
        // This prevents all players from becoming hosts
        window.location.hash = '#new';
    }

    const leaderboard = gameState.leaderboard ?? [];
    const text = gameState.text ?? "Game Over!";
    const winner = leaderboard.length > 0 ? leaderboard[0] : null;

    return (
        <div style={{ backgroundColor: '#1a1a1a', minHeight: '100vh', color: '#fff', padding: '20px' }}>
            <h1 style={{ color: '#fff' }}>🎉 Game Over! 🎉</h1>
            <div style={{ whiteSpace: 'pre-wrap', color: '#ccc' }}>{text}</div>
            
            {winner && (
                <div style={{ 
                    marginTop: '30px', 
                    padding: '30px', 
                    backgroundColor: '#2d2d2d',
                    borderRadius: '10px',
                    textAlign: 'center'
                }}>
                    <h2 style={{ fontSize: '36px', marginBottom: '10px', color: '#fff' }}>🏆 Winner 🏆</h2>
                    <p style={{ fontSize: '48px', margin: '10px 0' }}>{winner.emoji}</p>
                    <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{winner.name}</p>
                    <p style={{ fontSize: '24px', color: '#ccc' }}>Total Points: {winner.points}</p>
                </div>
            )}
            
            <div style={{ marginTop: '30px' }}>
                <h2 style={{ color: '#fff' }}>Final Standings</h2>
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

            <div style={{ marginTop: '30px', textAlign: 'center' }}>
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
