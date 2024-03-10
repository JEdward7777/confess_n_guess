//@ts-ignore
import {socket} from './socket';

import React, {useState} from 'react';

import {ClientState} from './../../src/IncludeStuff';
import EmojiPicker from './EmojiPicker'; // Import the EmojiPicker component


interface C1TypeInYourNameAndPickAnEmojiForYourPicturePageProps {
    gameState: ClientState
}

const C1TypeInYourNameAndPickAnEmojiForYourPicturePage = ({gameState}: C1TypeInYourNameAndPickAnEmojiForYourPicturePageProps) => {

    const [inputName, setInputName] = useState<string>(gameState.name ?? "");
    const [inputEmoji, setInputEmoji] = useState<string>(gameState?.sharedState?.users[gameState?.name || ""]?.emoji ?? "" );

    const sendNameAndEmoji = () => {
        socket.emit("nameAndEmoji", {name: inputName, emoji: inputEmoji, code: gameState?.sharedState?.code ?? ""});
    }


    const error = gameState.error ?? ""; 

    // Update the input for the Emoji to use the EmojiPicker component
    return (
        <div>
            <h1>Type in your name and pick an emoji for your picture</h1>
            <input type="text" placeholder="Enter Name" value={inputName} onChange={(e) => setInputName(e.target.value)}/>
            <EmojiPicker selectedEmoji={inputEmoji} onSelectEmoji={(selectedEmoji) => setInputEmoji(selectedEmoji)}/>
            <button onClick={sendNameAndEmoji}>Submit</button>
            {error && <p>{error}</p>}
        </div>
    );
}

export default C1TypeInYourNameAndPickAnEmojiForYourPicturePage;