//@ts-ignore
import {socket} from './socket';

import React, {useState} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';
import EmojiPicker from './EmojiPicker'; // Import the EmojiPicker component


interface C1TypeInYourNameAndPickAnEmojiForYourPicturePageProps {
    gameState: ClientGameState
}

const C1TypeInYourNameAndPickAnEmojiForYourPicturePage = ({gameState}: C1TypeInYourNameAndPickAnEmojiForYourPicturePageProps) => {

    const [inputName, setInputName] = useState<string>(gameState.name ?? "");
    const [inputEmoji, setInputEmoji] = useState<string>(gameState?.sharedState?.users[gameState?.name || ""]?.emoji ?? "😊");
    const [error, setError] = useState<string>("");

    const sendNameAndEmoji = () => {
        // Validate name
        const trimmedName = inputName.trim();
        if (!trimmedName) {
            setError("Please enter a name");
            return;
        }
        if (trimmedName === "<host>") {
            setError("Name cannot be <host>");
            return;
        }
        
        setError("");
        socket.emit("nameAndEmoji", {name: trimmedName, emoji: inputEmoji, code: gameState?.sharedState?.code ?? ""});
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && inputName.trim()) {
            sendNameAndEmoji();
        }
    }

    return (
        <div>
            <h1>Type in your name and pick an emoji for your picture</h1>
            <input 
                type="text" 
                placeholder="Enter Name" 
                value={inputName} 
                onChange={(e) => setInputName(e.target.value)}
                onKeyPress={handleKeyPress}
            />
            <EmojiPicker selectedEmoji={inputEmoji} onSelectEmoji={(selectedEmoji) => setInputEmoji(selectedEmoji)}/>
            <button onClick={sendNameAndEmoji}>Submit</button>
            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
}

export default C1TypeInYourNameAndPickAnEmojiForYourPicturePage;