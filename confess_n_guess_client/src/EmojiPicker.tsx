import React from 'react';

interface EmojiPickerProps {
  selectedEmoji: string;
  onSelectEmoji: (emoji: string) => void;
}

const EmojiPicker = ({ selectedEmoji, onSelectEmoji }: EmojiPickerProps) => {
  // Space-crew portraits to match the theme; the server stores whatever string it gets,
  // so a reclaimimg player with an old-style smiley keeps it.
  const emojiList = ['🚀', '🦉', '🛸', '🪐', '🌟', '🤖', '🌍', '☄️', '🌙', '😎', '⚡', '🔭', '🧑‍🚀', '💫', '🌈'];

  return (
    <div className="emoji-grid" role="listbox" aria-label="Pick your portrait">
      {emojiList.map((emoji, index) => (
        <span
          key={index}
          role="option"
          aria-selected={selectedEmoji === emoji}
          onClick={() => onSelectEmoji(emoji)}
          className={'emoji-cell' + (selectedEmoji === emoji ? ' selected' : '')}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
};

export default EmojiPicker;
