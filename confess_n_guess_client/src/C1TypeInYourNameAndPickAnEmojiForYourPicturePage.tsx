//@ts-ignore
import {socket} from './socket';

import React, {useState} from 'react';

import {ClientGameState} from './../../src/IncludeStuff';
import EmojiPicker from './EmojiPicker';
import { HelmetBadge } from './SpaceArt';

interface C1TypeInYourNameAndPickAnEmojiForYourPicturePageProps {
    gameState: ClientGameState
}

const C1TypeInYourNameAndPickAnEmojiForYourPicturePage = ({gameState}: C1TypeInYourNameAndPickAnEmojiForYourPicturePageProps) => {

    const [inputName, setInputName] = useState<string>(gameState.name ?? "");
    const [inputEmoji, setInputEmoji] = useState<string>(gameState?.sharedState?.users[gameState?.name || ""]?.emoji ?? "🚀");
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
        <div className="screen rise-in">
            <HelmetBadge emoji={inputEmoji} />
            <p className="tagline">crew registration</p>
            <h1>Suit up</h1>
            <p className="hint-text">Call sign and portrait for the mission roster.</p>

            <div className="stack" style={{ marginTop: '0.8rem' }}>
                <input
                    type="text"
                    placeholder="Your name"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    onKeyPress={handleKeyPress}
                    style={{ textAlign: 'center' }}
                    maxLength={40}
                />
                <EmojiPicker selectedEmoji={inputEmoji} onSelectEmoji={(selectedEmoji) => setInputEmoji(selectedEmoji)}/>
                <button onClick={sendNameAndEmoji}>Board the Ship</button>
            </div>

            {error && <p className="error-text">{error}</p>}
        </div>
    );
}

export default C1TypeInYourNameAndPickAnEmojiForYourPicturePage;
