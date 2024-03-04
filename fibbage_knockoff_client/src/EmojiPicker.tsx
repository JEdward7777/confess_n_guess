
import React from 'react';

//Add the type declarations.
interface EmojiPickerProps {
  selectedEmoji: string;
  onSelectEmoji: (emoji: string) => void;
}

const EmojiPicker = ({ selectedEmoji, onSelectEmoji }: EmojiPickerProps) => {
  const emojiList = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇']; // Add more emojis as needed

  return (
    <div>
      {emojiList.map((emoji, index) => (
        <span
          key={index}
          onClick={() => onSelectEmoji(emoji)}
          style={{
            fontSize: '24px',
            cursor: 'pointer',
            marginRight: '5px',
            border: selectedEmoji === emoji ? '2px solid blue' : 'none',
            padding: '5px',
            borderRadius: '5px',
          }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
};

export default EmojiPicker;