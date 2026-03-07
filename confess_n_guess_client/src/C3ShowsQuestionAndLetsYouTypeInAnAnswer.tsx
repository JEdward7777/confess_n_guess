//@ts-ignore
import {socket} from './socket';

import React, {useState, useEffect} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';


interface C3ShowsQuestionAndLetsYouTypeInAnAnswerProps {
    gameState: ClientGameState
}

const C3ShowsQuestionAndLetsYouTypeInAnAnswer = ({gameState}: C3ShowsQuestionAndLetsYouTypeInAnAnswerProps) => {

    const [answer, setAnswer] = useState<string>("");
    // Store the question from gameState so it doesn't change
    const [storedQuestion, setStoredQuestion] = useState<string>("");
    // Check if this is a lie submission (has targetPlayer)
    const [isLieSubmission, setIsLieSubmission] = useState<boolean>(false);
    const [targetPlayer, setTargetPlayer] = useState<string>("");

    useEffect(() => {
        if (gameState.question) {
            setStoredQuestion(gameState.question);
        } else if (gameState.text) {
            // Extract question from text if question field not set
            // The text format is: "Please truthfully answer this question:\n\n{question}"
            // or "Write a LIE for this question about {player}:\n\n{question}"
            const lines = gameState.text.split('\n\n');
            if (lines.length > 1) {
                setStoredQuestion(lines[lines.length - 1]);
            } else {
                setStoredQuestion(gameState.text);
            }
        }
        
        // Check if this is a lie submission
        if (gameState.targetPlayer) {
            setIsLieSubmission(true);
            setTargetPlayer(gameState.targetPlayer);
        } else {
            setIsLieSubmission(false);
            setTargetPlayer("");
        }
    }, [gameState.question, gameState.text, gameState.targetPlayer]);

    const submitAnswer = () => {
        if (!answer.trim()) {
            return; // Don't send empty answers
        }
        
        if (isLieSubmission) {
            // Submit a lie
            socket.emit("submitLie", {
                name: gameState?.name, 
                code: gameState?.sharedState?.code ?? "", 
                lie: answer,
                targetPlayer: targetPlayer,
                question: storedQuestion
            });
        } else {
            // Submit a truth answer
            socket.emit("sendQuestionAnswer", {
                name: gameState?.name, 
                code: gameState?.sharedState?.code ?? "", 
                answer: answer,
                question: storedQuestion
            });
        }
    }


    const error = gameState.error ?? ""; 

    // Use white-space: pre-wrap to render newlines properly instead of <br>
    return (
        <div>
            <h1>{isLieSubmission ? `Write a LIE about ${targetPlayer}` : 'Answer the question'}</h1>
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '20px', fontSize: '18px' }}>
                {storedQuestion}
            </div>
            <input 
                type="text" 
                value={answer} 
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={isLieSubmission ? "Type your lie here..." : "Type your answer here..."}
                style={{ padding: '10px', fontSize: '16px', width: '300px' }}
            />
            <button 
                onClick={submitAnswer}
                disabled={!answer.trim()}
                style={{ marginLeft: '10px', padding: '10px 20px', fontSize: '16px' }}
            >
                {isLieSubmission ? 'Submit Lie' : 'Submit'}
            </button>
            {error && <p>{error}</p>}
        </div>
    );
}

export default C3ShowsQuestionAndLetsYouTypeInAnAnswer;