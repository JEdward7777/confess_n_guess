//generate a react page which shows a list of the current users and a button which says start.

import React, { useEffect, useState } from 'react';

//@ts-ignore
import {socket} from './socket';

import {ClientGameState, buildJoinUrl, isLoopbackHostname} from './../../src/IncludeStuff';
import { QRCodeSVG } from 'qrcode.react';
import { OrbitalRelay } from './SpaceArt';

interface H1CollectingUsersPageProps {
    gameState: ClientGameState,
}

const H1CollectingUsersPage = ({gameState}: H1CollectingUsersPageProps) => {

    const [joinUrl, setJoinUrl] = useState<string>("");
    const [lanHost, setLanHost] = useState<string | null>(null);

    // Our own address bar is normally the right answer for the QR code, and behind a
    // reverse proxy it is the only right answer - the server's address is internal and no
    // phone can reach it. The one case it can't answer is loopback: "localhost" means
    // "this machine" to whoever scans it, so the phone tries to reach itself. Only then do
    // we ask the server where it actually lives.
    useEffect(() => {
        if (!isLoopbackHostname(window.location.hostname)) return;

        function onJoinHost({ lanHost }: { lanHost: string | null }) {
            setLanHost(lanHost);
        }
        socket.on('joinHost', onJoinHost);
        socket.emit('requestJoinHost', { code: gameState?.sharedState?.code });
        return () => socket.off('joinHost', onJoinHost);
    }, []);

    useEffect(() => {
        const code = gameState?.sharedState?.code;
        if (code) {
            setJoinUrl(buildJoinUrl(window.location.href, lanHost, code));
        }
    }, [gameState?.sharedState?.code, lanHost]);

    // If we're on loopback and the server had no LAN address to offer, the QR is a dud and
    // saying so beats letting people scan it and wonder.
    const qrIsUnreachable = isLoopbackHostname(new URL(joinUrl || window.location.href).hostname);

    const startGame = () => {
        socket.emit( "startGame", {code:gameState?.sharedState?.code} );
    }

    // Get list of users excluding host
    const users = Object.values(gameState?.sharedState?.users ?? {}).filter( user => user.name !== "<host>" );
    const canStart = users.length >= 2;

    return (
        <div className="screen host-screen rise-in">
            <OrbitalRelay />
            <p className="tagline">assembling the crew</p>
            <h1>Boarding Call</h1>
            <p className="hint-text" style={{ margin: 0 }}>Scan or enter the code:</p>
            <p className="lobby-code">{gameState?.sharedState?.code ?? "—"}</p>

            <div className="lobby-grid">
                {joinUrl && (
                    <div className="qr-pad">
                        <QRCodeSVG value={joinUrl} size={200} includeMargin={true} />
                        <p className="qr-caption">Scan to join</p>
                        {/* Show the URL: it's what makes a wrong guess visible, and it's
                            readable out loud when someone's camera won't cooperate. */}
                        <p className="qr-url">{joinUrl}</p>
                        {qrIsUnreachable && (
                            <p className="qr-warning">
                                This address only works on this machine. Open the host page
                                using this computer's network address so phones can join.
                            </p>
                        )}
                    </div>
                )}

                <div>
                    <ul className="crew-list">
                        {users.length === 0 && (
                            <li className="hint-text">
                                <span className="crew-emoji anim-blink">📡</span> Listening for crew…
                            </li>
                        )}
                        {users.map((user, index) => (
                            <li key={index}>
                                <span className="crew-emoji">{user.emoji}</span> {user.name}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div style={{ marginTop: '1.2rem' }}>
                <button onClick={startGame} disabled={!canStart}>Launch Mission</button>
                {!canStart && <p className="hint-text" style={{ marginTop: '0.6rem' }}>Need at least 2 players to start</p>}
                {/* Whatever the server wants the host to know - previously sent but never
                    shown (CNG-041). The lobby-bound emits clear this field explicitly, so a
                    message left over from mid-game can't leak in via the client merge. */}
                {gameState.text && (
                    <p className="error-text" style={{ marginTop: '0.6rem' }}>{gameState.text}</p>
                )}
            </div>
        </div>
    );
}

export default H1CollectingUsersPage;
