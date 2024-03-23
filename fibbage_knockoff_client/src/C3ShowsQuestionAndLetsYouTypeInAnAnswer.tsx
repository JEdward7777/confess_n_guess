//@ts-ignore
import {socket} from './socket';

import React, {useState} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';


interface C3ShowsQuestionAndLetsYouTypeInAnAnswerProps {
    gameState: ClientGameState
}

const C3ShowsQuestionAndLetsYouTypeInAnAnswer = ({gameState}: C3ShowsQuestionAndLetsYouTypeInAnAnswerProps) => {

    const [answer, setAnswer] = useState<string>("");

    const sendAnswer = () => {
        socket.emit("sendQuestionAnswer", {name: gameState?.name, code: gameState?.sharedState?.code ?? "", answer: answer });
    }


    const error = gameState.error ?? ""; 

    // Update the input for the Emoji to use the EmojiPicker component
    return (
        <div>
            <h1>Answer the question</h1>
            <div>{ gameState?.text }</div>
            <input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)}/>
            <button onClick={sendAnswer}>Submit</button>
            {error && <p>{error}</p>}
        </div>
    );
}

export default C3ShowsQuestionAndLetsYouTypeInAnAnswer;