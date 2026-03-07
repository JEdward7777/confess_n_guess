//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';


interface C4PickBestAnswerProps {
    gameState: ClientGameState
}

const C4PickBestAnswer = ({ gameState }: C4PickBestAnswerProps) => {

    const handleSelectAnswer = (username: string) => {
        socket.emit('selectAnswer', { 
            code: gameState?.sharedState?.code ?? "", 
            selectedUsername: username 
        });
    }

    const answers = gameState.answers ?? [];
    const text = gameState.text ?? "Pick the best answer!";

    return (
        <div>
            <h1>Pick the Best Answer</h1>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            <div>
                {answers.map((answer: UserAnswer) => (
                    <div key={answer.username} style={{ margin: '10px', padding: '10px', border: '1px solid #ccc' }}>
                        <p>{answer.answer}</p>
                        <button onClick={() => handleSelectAnswer(answer.username)}>
                            Select
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default C4PickBestAnswer;
