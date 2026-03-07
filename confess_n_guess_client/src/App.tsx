import { useRef, useState } from 'react'
import './App.css'
import G1NewGamePage from './G1NewGamePage';
import H1CollectingUsersPage from './H1CollectingUsersPage';
import { ClientGameState, Screens } from './../../src/IncludeStuff';
import React, { useEffect } from 'react';

//@ts-ignore
import {socket } from './socket';
import C1TypeInYourNameAndPickAnEmojiForYourPicturePage from './C1TypeInYourNameAndPickAnEmojiForYourPicturePage';
import C2WaitingScreen from './C2WaitingScreen';
import C3ShowsQuestionAndLetsYouTypeInAnAnswer from './C3ShowsQuestionAndLetsYouTypeInAnAnswer';
import C4PickBestAnswer from './C4PickBestAnswer';
import H2InformationScreenWithTimer from './H2InformationScreenWithTimer';
import H3ShowLiesAndTruths from './H3ShowLiesAndTruths';
import H4IterateAnswers from './H4IterateAnswers';
import H5ShowPoints from './H5ShowPoints';
import H6ShowWinner from './H6ShowWinner';

function App() {
  //have a state representing what screen we are on.
  const [gameState, _setGameState] = useState<ClientGameState>({
    sharedState: {
      users: {},
      code: "",
    },
    name: "",
    emoji: "",
    screen : Screens.g1NewGame,
    error: "",
  });
  const gameStateRef = useRef<ClientGameState>( gameState );

  function setGameState( newState: ClientGameState ) {
    const beforeState = gameStateRef.current;
    const combinedState = { ...gameStateRef.current, ...newState };
    _setGameState( combinedState );
    gameStateRef.current = combinedState;
    console.log( "setGameState", newState, beforeState );
  }
  const screen = gameState.screen;

  useEffect(() => {
    function onGameStateChange(newState: ClientGameState) {
      console.log( "onGameStateChange", newState );
      setGameState(newState);
    }
    
    socket.on('gameState', onGameStateChange);
    return () => {
      socket.off('gameState', onGameStateChange);
    };
  }, []);

  useEffect(() => {
    // Retrieve the client ID from the URL hash on component remount.
    const urlParams = new URLSearchParams(window.location.hash.substring(1));
    const savedClientId = urlParams.get('clientId');
    if( savedClientId ) {
      //check localStorage for the client id
      const savedStateString = localStorage.getItem( 'gameState-' + savedClientId );
      if( savedStateString ) {
        const savedState = JSON.parse( savedStateString );
        setGameState(savedState);
      }
    } else {
      //generate a new client id
      const clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      urlParams.set('clientId', clientId);
      window.location.hash = urlParams.toString();
      localStorage.setItem( 'gameState-' + clientId, JSON.stringify( gameStateRef.current ) );
    }
  }, []);

  //now use useEffect to save the game state each time it changes.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.hash.substring(1));
    let savedClientId = urlParams.get('clientId');
    if( !savedClientId ) {
      savedClientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      urlParams.set('clientId', savedClientId);
      window.location.hash = urlParams.toString();
    }
    localStorage.setItem( 'gameState-' + savedClientId, JSON.stringify( gameStateRef.current ) );
  }, [gameState]);

  console.log( "Screen is ", screen );

  //show the correct screen based on the screen state.
  return (
    <div className="App">
      {screen === Screens.g1NewGame && <G1NewGamePage gameState={gameState} />}
      {screen === Screens.h1CollectingUsers && <H1CollectingUsersPage gameState={gameState} />}
      {screen === Screens.h2InformationScreenWithTimer && <H2InformationScreenWithTimer gameState={gameState} />}
      {screen === Screens.h3ShowTheLiesAndTruths && <H3ShowLiesAndTruths gameState={gameState} />}
      {screen === Screens.h4IterateThroughTheDifferentAnswersAndPopUpYesOrNo && <H4IterateAnswers gameState={gameState} />}
      {screen === Screens.h5ShowThePointsForTheRound && <H5ShowPoints gameState={gameState} />}
      {screen === Screens.h6ShowTheWinner && <H6ShowWinner gameState={gameState} />}
      {screen === Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture && <C1TypeInYourNameAndPickAnEmojiForYourPicturePage gameState={gameState}/>}
      {screen === Screens.c2WaitingScreenJustWhateverText && <C2WaitingScreen gameState={gameState} />}
      {screen === Screens.c3ShowsQuestionAndLetsYouTypeInAnAnswer && <C3ShowsQuestionAndLetsYouTypeInAnAnswer gameState={gameState} />}
      {screen === Screens.c4PickTheBestAnswerOutOfAList && <C4PickBestAnswer gameState={gameState} />}
    </div>
  )
}

export default App
