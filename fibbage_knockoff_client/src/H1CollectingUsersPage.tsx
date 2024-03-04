//generate a react page which shows a list of the current users and a button which says start.
//have the component take a single parameter which includes in it the list of user objects which include the name of the user.

import React from 'react';

//@ts-ignore
import {socket} from './socket';

//import React from 'react';
import {GameState} from './IncludeStuff';

//Single argument of game state.

//declare the types of teh arguments to include one arg of type GameState.

interface H1CollectingUsersPageProps {
    gameState: GameState,
}


//show a code for people to join in bright snazzy font.

const H1CollectingUsersPage = ({gameState}: H1CollectingUsersPageProps) => {

    const startGame = () => {
        socket.emit( "startGame" );
    }

    return (
        <div>
            <h1>Collecting Users</h1>
            <p>Code: {gameState?.sharedState?.code ?? "no_code"}</p>
            <ul>
                {Object.values(gameState?.sharedState?.users ?? {}).filter( user => user.name !== "<host>" ).map((user, index) => <li key={index}>{user.name}</li>)}
            </ul>
            <button onClick={startGame}>Start</button>
        </div>
    );
}

export default H1CollectingUsersPage;