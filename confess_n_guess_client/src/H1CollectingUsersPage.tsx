//generate a react page which shows a list of the current users and a button which says start.
//have the component take a single parameter which includes in it the list of user objects which include the name of the user.

import React, { useEffect, useState } from 'react';

//@ts-ignore
import {socket} from './socket';

//import React from 'react';
import {ClientGameState} from './../../src/IncludeStuff';
import { QRCodeSVG } from 'qrcode.react';

//Single argument of game state.

//declare the types of teh arguments to include one arg of type GameState.

interface H1CollectingUsersPageProps {
    gameState: ClientGameState,
}


//show a code for people to join in bright snazzy font.

const H1CollectingUsersPage = ({gameState}: H1CollectingUsersPageProps) => {

    const [joinUrl, setJoinUrl] = useState<string>("");

    useEffect(() => {
        // Build the join URL
        const code = gameState?.sharedState?.code;
        if (code) {
            const baseUrl = window.location.origin + window.location.pathname;
            setJoinUrl(`${baseUrl}?code=${code}`);
        }
    }, [gameState?.sharedState?.code]);

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