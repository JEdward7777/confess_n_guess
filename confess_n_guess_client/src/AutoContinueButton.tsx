import React, { useEffect, useRef, useState } from 'react';
import { announcer } from './announcer';

interface AutoContinueButtonProps {
    // Called when the host clicks, or automatically once the fill completes.
    onContinue: () => void;
    label?: string;
    durationMs?: number;
}

// How long host presence (mouse movement) pushes the auto-progression out. A host who is
// actively there gets a full minute of quiet before the game advances on its own.
const HOLD_MS = 60000;

// A "Continue" button that fills like a progress bar and auto-clicks itself when the fill
// reaches the end. Used on the mid-game host screens (H3, H5) so the game keeps moving on
// its own while the host can still click to skip ahead.
//
// The fill does not start immediately. It waits until BOTH:
//   - the announcer has finished speaking (never talk over the TTS), and
//   - the host has been still for a full minute (mouse movement means they're present and
//     driving the pace themselves, so don't rush them).
// A mouse move while it is already filling cancels the fill back to waiting. Firing happens
// exactly once - re-emitting a phase advance was CNG-017. A manual click fires immediately;
// that's a deliberate skip and is exempt from both waits.
const AutoContinueButton = ({ onContinue, label = 'Continue', durationMs = 8000 }: AutoContinueButtonProps) => {
    const firedRef = useRef(false);
    const fillingRef = useRef(false);
    const gateAtRef = useRef(0);     // don't start filling before this timestamp
    const [filling, setFilling] = useState(false);
    const [status, setStatus] = useState('Auto-continues on its own');

    const fire = () => {
        if (firedRef.current) return;
        firedRef.current = true;
        setStatus('Continuing…');
        onContinue();
    };

    useEffect(() => {
        gateAtRef.current = Date.now();   // no hold until the host actually moves
        let fillTimer: number | undefined;

        // Fire once the fill has run its course - but never over the announcer.
        const autoFire = () => {
            if (firedRef.current) return;
            if (announcer.isSpeaking()) {
                setStatus('Waiting for the announcer to finish…');
                fillTimer = window.setTimeout(autoFire, 300);
                return;
            }
            fire();
        };

        const resetFill = () => {
            if (!fillingRef.current) return;
            fillingRef.current = false;
            setFilling(false);
            clearTimeout(fillTimer);
        };

        // The gate: begin the fill only when the host is quiet and the announcer isn't talking.
        const startFillIfReady = () => {
            if (firedRef.current || fillingRef.current) return;
            if (Date.now() < gateAtRef.current) {
                setStatus('Auto-continues once the screen is idle');
                return;
            }
            if (announcer.isSpeaking()) {
                setStatus('Auto-continues when the announcer finishes');
                return;
            }
            fillingRef.current = true;
            setFilling(true);
            setStatus('Auto-continuing…');
            fillTimer = window.setTimeout(autoFire, durationMs);
        };

        // Any mouse movement means the host is present: defer the start, and abandon a fill
        // already in progress.
        const onMove = () => {
            gateAtRef.current = Date.now() + HOLD_MS;
            resetFill();
        };
        window.addEventListener('mousemove', onMove);

        const poll = window.setInterval(startFillIfReady, 200);

        return () => {
            window.removeEventListener('mousemove', onMove);
            clearInterval(poll);
            clearTimeout(fillTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <button className="auto-continue-btn" onClick={fire}>
                <span
                    className="auto-continue-fill"
                    style={{
                        transform: filling ? 'scaleX(1)' : 'scaleX(0)',
                        // Fill over the full duration; snap back quickly when a fill is cancelled.
                        transitionDuration: filling ? `${durationMs}ms` : '200ms',
                    }}
                />
                <span className="auto-continue-label">{label}</span>
            </button>
            <p className="faint-text" style={{ marginTop: '0.6rem' }}>{status}</p>
        </>
    );
};

export default AutoContinueButton;
