//@ts-ignore
import { socket } from './socket';

import React from 'react';

import { ClientGameState, UserAnswer } from './../../src/IncludeStuff';


// Type guard to check if an answer object has required properties
function isValidAnswer(answer: any): answer is { username: string; answer: string; isTruth: boolean; voters?: string[] } {
    return answer && typeof answer === 'object' && 
           typeof answer.username === 'string' && 
           typeof answer.answer === 'string' && 
           typeof answer.isTruth === 'boolean';
}

interface H4IterateAnswersProps {
    gameState: ClientGameState
}

const H4IterateAnswers = ({ gameState }: H4IterateAnswersProps) => {

    const answers = gameState.answers ?? [];
    const text = gameState.text ?? "Review the answers";

    // Filter out invalid answers
    const validAnswers = answers.filter(isValidAnswer);

    return (
        <div>
            <h1>Review Answers</h1>
            <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            <div>
                {validAnswers.map((answer: UserAnswer, index: number) => (
                    <div key={index} style={{ margin: '15px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
                        <h3>Answer #{index + 1}</h3>
                        <p><strong>From:</strong> {answer.username ?? 'Unknown'}</p>
                        <p><strong>Answer:</strong> {answer.answer ?? ''}</p>
                        <p><strong>Type:</strong> {answer.isTruth ? 'Truth' : 'Lie'}</p>
                    </div>
                ))}
            </div>
            {validAnswers.length === 0 && (
                <div style={{ padding: '20px', color: '#888', textAlign: 'center' }}>
                    <p>No answers to review</p>
                </div>
            )}
        </div>
    );
}

export default H4IterateAnswers;
