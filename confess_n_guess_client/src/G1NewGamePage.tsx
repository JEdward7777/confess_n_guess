//react page showing new game button or join game button where you put a code in.
import {ClientGameState} from './../../src/IncludeStuff';
import React, {useState} from 'react';
//@ts-ignore
import {socket} from './socket';
import { RingedPlanet } from './SpaceArt';

interface G1NewGamePageProps {
    gameState: ClientGameState,
}

const G1NewGamePage = ({gameState}: G1NewGamePageProps ) => {

    const error = gameState.error || "";

    const [inputCode, setInputCode] = useState<string>(gameState?.sharedState?.code || "");

    const startGame = () => {
        socket.emit("newGame");
    }

    const joinGame = () => {
        //send a join game request including the code in the input
        socket.emit("joinGame", inputCode);
    }

    return (
        <div className="screen rise-in">
            <RingedPlanet />
            <p className="tagline">deep signal · party transmission</p>
            <h1 className="g1-title">Confess <span className="accent">'n'</span> Guess</h1>
            <p className="hint-text">One truth per player. Everyone else lies about it. Trust no one.</p>

            <div className="stack" style={{ marginTop: '1.2rem' }}>
                <button onClick={startGame}>Launch New Game</button>

                <div className="g1-divider">or dock with a crew</div>

                <input
                    type="text"
                    placeholder="GAME CODE"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && inputCode.trim()) joinGame(); }}
                    style={{ textAlign: 'center', letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}
                    maxLength={8}
                />
                <button className="btn-magenta" onClick={joinGame}>Join Game</button>
            </div>

            {error && <p className="error-text">{error}</p>}
        </div>
    );
}

export default G1NewGamePage;
