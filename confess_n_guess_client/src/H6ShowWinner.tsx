//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { useEffect } from 'react';
import { ClientGameState, LeaderboardEntry } from './../../src/IncludeStuff';
import { ChampionPlanet } from './SpaceArt';
import { announcer } from './announcer';

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

    // The grand finale, once. Host only - players see this screen too.
    useEffect(() => {
        if (gameState.name !== '<host>' || !winner) return;
        announcer.announce('winner',
            { name: winner.name, points: String(winner.points) }, { interrupt: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="screen host-screen rise-in">
            <ChampionPlanet />
            <p className="tagline">mission complete</p>
            <h1 className="glow-gold">Game Over</h1>
            <p className="hint-text" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>

            {winner && (
                <div className="panel" style={{ maxWidth: '24rem', margin: '1rem auto 0', borderColor: 'rgba(251, 191, 36, 0.5)', boxShadow: '0 0 30px rgba(251, 191, 36, 0.18)' }}>
                    <p className="tagline" style={{ color: 'var(--gold)' }}>champion of the void</p>
                    <span className="winner-emoji">{winner.emoji}</span>
                    <p className="winner-name">{winner.name}</p>
                    <p className="hint-text">Total Points: <strong style={{ color: 'var(--ink)' }}>{winner.points}</strong></p>
                </div>
            )}

            <div className="panel" style={{ maxWidth: '28rem', margin: '1.2rem auto 0' }}>
                <h2 style={{ marginTop: 0 }}>Final Standings</h2>
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

            <div style={{ marginTop: '1.4rem' }}>
                <button onClick={handleNewGame}>Start New Game</button>
            </div>
        </div>
    );
}

export default H6ShowWinner;
