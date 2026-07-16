//generate a react page which shows a list of the current users and a button which says start.
//have the component take a single parameter which includes in it the list of user objects which include the name of the user.

import React, { useEffect, useState } from 'react';

//@ts-ignore
import {socket} from './socket';

//import React from 'react';
import {ClientGameState, buildJoinUrl, isLoopbackHostname} from './../../src/IncludeStuff';
import { QRCodeSVG } from 'qrcode.react';

//Single argument of game state.

//declare the types of teh arguments to include one arg of type GameState.

interface H1CollectingUsersPageProps {
    gameState: ClientGameState,
}


//show a code for people to join in bright snazzy font.

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
        socket.emit('requestJoinHost');
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
        <div style={{ textAlign: 'center', padding: '20px' }}>
            <h1>Collecting Users</h1>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>Code: {gameState?.sharedState?.code ?? "no_code"}</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '40px', flexWrap: 'wrap' }}>
                {joinUrl && (
                    <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '10px' }}>
                        <QRCodeSVG value={joinUrl} size={200} includeMargin={true} />
                        <p style={{ marginTop: '10px', fontSize: '14px', color: '#666', backgroundColor: 'white' }}>Scan to join</p>
                        {/* Show the URL: it's what makes a wrong guess visible, and it's
                            readable out loud when someone's camera won't cooperate. */}
                        <p style={{ margin: 0, fontSize: '11px', color: '#999', backgroundColor: 'white', wordBreak: 'break-all', maxWidth: '200px' }}>
                            {joinUrl}
                        </p>
                        {qrIsUnreachable && (
                            <p style={{ marginTop: '8px', fontSize: '11px', color: '#c00', backgroundColor: 'white', maxWidth: '200px' }}>
                                This address only works on this machine. Open the host page
                                using this computer's network address so phones can join.
                            </p>
                        )}
                    </div>
                )}
                
                <div>
                    <ul style={{ textAlign: 'left', listStyle: 'none', padding: 0 }}>
                        {users.map((user, index) => <li key={index} style={{ padding: '5px', fontSize: '18px' }}>{user.emoji} {user.name}</li>)}
                    </ul>
                </div>
            </div>
            <br />
            <button onClick={startGame} disabled={!canStart}>Start</button>
            {!canStart && <p style={{ color: '#ff6b6b', marginTop: '10px' }}>Need at least 2 players to start</p>}
        </div>
    );
}

export default H1CollectingUsersPage;