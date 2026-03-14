//@ts-ignore
import {socket} from './socket';

import React, {useState, useEffect} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';


interface C3SubmitTruthProps {
    gameState: ClientGameState
}

const C3SubmitTruth = ({gameState}: C3SubmitTruthProps) => {

    const [answer, setAnswer] = useState<string>("");
    const [storedQuestion, setStoredQuestion] = useState<string>("");

    useEffect(() => {
        setAnswer("");
        
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
    }, [gameState.question, gameState.text, gameState.screen]);

    const submitTruth = () => {
        if (!answer.trim()) {
            return;
        }
        
        socket.emit("sendQuestionAnswer", {
            name: gameState?.name, 
            code: gameState?.sharedState?.code ?? "", 
            answer: answer,
            question: storedQuestion
        });
    }

    const error = gameState.error ?? ""; 

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && answer.trim()) {
            submitTruth();
        }
    };
    
    return (
        <div>
            <h1 style={{ fontSize: '1.5rem' }}>{gameState.instructionText || 'Answer the question about yourself'}</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px' }}>
                {storedQuestion}
            </div>
            <input 
                type="text" 
                value={answer} 
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer here..."
                style={{ padding: '10px', fontSize: '16px', width: '300px' }}
            />
            <button 
                onClick={submitTruth}
                disabled={!answer.trim()}
                style={{ marginLeft: '10px', padding: '10px 20px', fontSize: '16px' }}
            >
                Submit
            </button>
            {error && <p>{error}</p>}
        </div>
    );
}

export default C3SubmitTruth;
