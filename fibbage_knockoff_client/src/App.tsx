import { useRef, useState } from 'react'
import './App.css'
import G1NewGamePage from './G1NewGamePage';
import H1CollectingUsersPage from './H1CollectingUsersPage';
import { ClientState, Screens } from './../../src/IncludeStuff';
import React, { useEffect } from 'react';

//@ts-ignore
import {socket } from './socket';
import C1TypeInYourNameAndPickAnEmojiForYourPicturePage from './C1TypeInYourNameAndPickAnEmojiForYourPicturePage';

function App() {
  //have a state representing what screen we are on.
  const [gameState, _setGameState] = useState<ClientState>({
    sharedState: {
      users: {},
      code: "",
    },
    name: "",
    emoji: "",
    screen : Screens.g1NewGame,
    error: "",
    code: "",
  });
  const gameStateRef = useRef<ClientState>( gameState );

  function setGameState( newState: ClientState ) {
    const beforeState = gameStateRef.current;
    const combinedState = { ...gameStateRef.current, ...newState };
    _setGameState( combinedState );
    gameStateRef.current = combinedState;
    console.log( "setGameState", newState, beforeState );
  }
  const screen = gameState.screen;

  useEffect(() => {
    function onGameStateChange(newState: ClientState) {
      console.log( "onGameStateChange", newState );
      setGameState(newState);
    }
    
    socket.on('gameState', onGameStateChange);
    return () => {
      socket.off('gameState', onGameStateChange);
    };
  }, []);

  console.log( "Screen is ", screen );

  //TODO: Create the next page for the client.

  //show the correct screen based on the screen state.
  return (
    <div className="App">
      {screen === Screens.g1NewGame         && <G1NewGamePage         gameState={gameState} />}
      {screen === Screens.h1CollectingUsers && <H1CollectingUsersPage gameState={gameState} />}{/* 
      {screen === Screens.h2InformationScreenWithTimer && <h2InformationScreenWithTimer />}
      {screen === Screens.h3ShowTheLiesAndTruths && <h3ShowTheLiesAndTruths />}
      {screen === Screens.h4IterateThroughTheDifferentAnswersAndPopUpYesOrNo && <h4IterateThroughTheDifferentAnswersAndPopUpYesOrNo />}
      {screen === Screens.h5ShowThePointsForTheRound && <h5ShowThePointsForTheRound />}
      {screen === Screens.h6ShowTheWinner && <h6ShowTheWinner />}}*/}
      {screen === Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture && <C1TypeInYourNameAndPickAnEmojiForYourPicturePage gameState={gameState}/>}{/* 
      {screen === Screens.c2WaitingScreenJustWhateverText && <c2WaitingScreenJustWhateverText />}
      {screen === Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer && <c3ShowsQuestionAndLetsYouTypeInAnAnswer />}
      {screen === Screens.c4PickTheBestAnswerOutOfAList && <c4PickTheBestAnswerOutOfAList />} */}
      <p>{screen}</p>
    </div>
  )
}

export default App
