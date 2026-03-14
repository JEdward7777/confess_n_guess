//generate a react page which shows a list of the current users and a button which says start.
//have the component take a single parameter which includes in it the list of user objects which include the name of the user.

import React from 'react';

//@ts-ignore
import {socket} from './socket';

//import React from 'react';
import {ClientGameState} from './../../src/IncludeStuff';

//Single argument of game state.

//declare the types of teh arguments to include one arg of type GameState.

interface H1CollectingUsersPageProps {
    gameState: ClientGameState,
}


//show a code for people to join in bright snazzy font.

const H1CollectingUsersPage = ({gameState}: H1CollectingUsersPageProps) => {

    const startGame = () => {
        socket.emit( "startGame", {code:gameState?.sharedState?.code} );
    }

    // Get list of users excluding host
    const users = Object.values(gameState?.sharedState?.users ?? {}).filter( user => user.name !== "<host>" );
    const canStart = users.length >= 2;

    return (
        <div>
            <h1>Collecting Users</h1>
            <p>Code: {gameState?.sharedState?.code ?? "no_code"}</p>
            <ul>
                {users.map((user, index) => <li key={index}>{user.emoji} {user.name}</li>)}
            </ul>
            <button onClick={startGame} disabled={!canStart}>Start</button>
            {!canStart && <p style={{ color: '#ff6b6b', marginTop: '10px' }}>Need at least 2 players to start</p>}
        </div>
    );
}

export default H1CollectingUsersPage;