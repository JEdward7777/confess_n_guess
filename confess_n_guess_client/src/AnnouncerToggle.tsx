import React, { useEffect, useState } from 'react';
import { announcer } from './announcer';

/**
 * The host's mute switch, fixed in the corner of every host screen. Doubles as the
 * user gesture that unlocks speech after a refresh (browsers block audio until the
 * page is touched), which is why enabling it speaks a sound check.
 */
const AnnouncerToggle = () => {
    const [enabled, setEnabled] = useState(announcer.enabled);

    useEffect(() => announcer.onChange(() => setEnabled(announcer.enabled)), []);

    const toggle = () => {
        const next = !announcer.enabled;
        announcer.setEnabled(next);
        if (next) {
            // Feedback + the activation gesture in one.
            const u = new SpeechSynthesisUtterance('Mission audio online.');
            u.rate = 1.02; u.pitch = 0.95;
            window.speechSynthesis?.speak(u);
        }
    };

    return (
        <button
            className={'announcer-toggle' + (enabled ? '' : ' muted')}
            onClick={toggle}
            title={enabled ? 'Mute the announcer' : 'Unmute the announcer'}
            aria-label={enabled ? 'Mute the announcer' : 'Unmute the announcer'}
        >
            {enabled ? '🔊' : '🔇'}
        </button>
    );
};

export default AnnouncerToggle;
