//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';


interface H4IterateAnswersProps {
    gameState: ClientGameState
}

const H4IterateAnswers = ({ gameState }: H4IterateAnswersProps) => {

    const answers = gameState.answers ?? [];
    const text = gameState.text ?? "Review the answers";

    return (
        <div>
            <h1>Review Answers</h1>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            <div>
                {answers.map((answer: UserAnswer, index: number) => (
                    <div key={index} style={{ margin: '15px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
                        <h3>Answer #{index + 1}</h3>
                        <p><strong>From:</strong> {answer.username}</p>
                        <p><strong>Answer:</strong> {answer.answer}</p>
                        <p><strong>Type:</strong> {answer.isTruth ? 'Truth' : 'Lie'}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default H4IterateAnswers;
