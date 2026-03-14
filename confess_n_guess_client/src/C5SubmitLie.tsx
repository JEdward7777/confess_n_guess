//@ts-ignore
import {socket} from './socket';

import React, {useState, useEffect} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';


interface C5SubmitLieProps {
    gameState: ClientGameState
}

const C5SubmitLie = ({gameState}: C5SubmitLieProps) => {

    const [lie, setLie] = useState<string>("");
    const [storedQuestion, setStoredQuestion] = useState<string>("");
    const [targetPlayer, setTargetPlayer] = useState<string>("");

    useEffect(() => {
        setLie("");
        
        if (gameState.question) {
            setStoredQuestion(gameState.question);
        } else if (gameState.text) {
            const lines = gameState.text.split('\n\n');
            if (lines.length > 1) {
                setStoredQuestion(lines[lines.length - 1]);
            } else {
                setStoredQuestion(gameState.text);
            }
        }
        
        if (gameState.targetPlayer) {
            setTargetPlayer(gameState.targetPlayer);
        }
    }, [gameState.question, gameState.text, gameState.targetPlayer, gameState.screen]);

    const submitLie = () => {
        if (!lie.trim()) {
            return;
        }
        
        socket.emit("submitLie", {
            name: gameState?.name, 
            code: gameState?.sharedState?.code ?? "", 
            lie: lie,
            targetPlayer: targetPlayer,
            question: storedQuestion
        });
    }

    const error = gameState.error ?? ""; 

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && lie.trim()) {
            submitLie();
        }
    };
    
    return (
        <div>
            <h1>{gameState.instructionText || `Write a fooling answer for this question about ${targetPlayer}`}</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px' }}>
                {storedQuestion}
            </div>
            <input 
                type="text" 
                value={lie} 
                onChange={(e) => setLie(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your fooling answer here..."
                style={{ padding: '10px', fontSize: '16px', width: '300px' }}
            />
            <button 
                onClick={submitLie}
                disabled={!lie.trim()}
                style={{ marginLeft: '10px', padding: '10px 20px', fontSize: '16px' }}
            >
                Submit Lie
            </button>
            {error && <p>{error}</p>}
        </div>
    );
}

export default C5SubmitLie;
