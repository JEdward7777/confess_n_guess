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
import C3SubmitTruth from './C3SubmitTruth';
import C4PickBestAnswer from './C4PickBestAnswer';
import C5SubmitLie from './C5SubmitLie';
import H2InformationScreenWithTimer from './H2InformationScreenWithTimer';
import H3ShowLiesAndTruths from './H3ShowLiesAndTruths';
import H4IterateAnswers from './H4IterateAnswers';
import H5ShowPoints from './H5ShowPoints';
import H6ShowWinner from './H6ShowWinner';

function App() {
  // Check if we should show the new game screen or join with code
  const urlParams = new URLSearchParams(window.location.search);
  const showNewGame = urlParams.get('new') === '1';
  const joinCode = urlParams.get('code');
  const joinName = urlParams.get('name'); // Get name from URL for reconnection
  
  //have a state representing what screen we are on.
  const [gameState, _setGameState] = useState<ClientGameState>({
    sharedState: {
      users: {},
      code: joinCode || "",
    },
    name: joinName || "", // Use name from URL if available
    emoji: "",
    screen : showNewGame ? Screens.g1NewGame : (joinCode ? Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture : Screens.g1NewGame),
    error: "",
  });
  const gameStateRef = useRef<ClientGameState>( gameState );
  
  // Listen for server asking us to identify
  useEffect(() => {
    function onIdentifyMe() {
      const code = gameStateRef.current?.sharedState?.code;
      const name = gameStateRef.current?.name;
      const isHost = name === '<host>' || gameStateRef.current?.screen === Screens.h1CollectingUsers || 
                     gameStateRef.current?.screen === Screens.h2InformationScreenWithTimer ||
                     gameStateRef.current?.screen === Screens.h3ShowTheLiesAndTruths ||
                     gameStateRef.current?.screen === Screens.h5ShowThePointsForTheRound ||
                     gameStateRef.current?.screen === Screens.h6ShowTheWinner;
      
      if (code) {
        console.log('>>> IDENTIFYING as ' + (isHost ? 'host' : 'player') + ' for game ' + code);
        socket.emit('identify', { 
          role: isHost ? 'host' : 'player', 
          code, 
          name: isHost ? undefined : name 
        });
      }
    }
    
    socket.on('identifyMe', onIdentifyMe);
    return () => {
      socket.off('identifyMe', onIdentifyMe);
    };
  }, []);

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
    // Retrieve game state using game code and name from URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const name = urlParams.get('name');
    
    if (code && name) {
      // Use gameCode + name as the localStorage key for persistent state
      const storageKey = `gameState-${code}-${name}`;
      const savedStateString = localStorage.getItem(storageKey);
      if (savedStateString) {
        const savedState = JSON.parse(savedStateString);
        setGameState(savedState);
      }
    }
  }, []);
  
  // Handle hash changes for navigation
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash;
      if (hash === '#new') {
        // Clear the hash and go to new game screen
        window.location.hash = '';
        
        // Also clear the saved state from localStorage to prevent old data persisting
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const name = urlParams.get('name');
        if (code && name) {
          localStorage.removeItem(`gameState-${code}-${name}`);
        }
        
        // Reset to fresh state
        setGameState({
          sharedState: {
            users: {},
            code: "",
          },
          name: "",
          emoji: "",
          screen: Screens.g1NewGame,
          error: "",
        });
      }
    }
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  //now use useEffect to save the game state each time it changes.
  useEffect(() => {
    const code = gameStateRef.current?.sharedState?.code;
    const name = gameStateRef.current?.name;
    
    // Only save if we have both code and name
    if (code && name) {
      const storageKey = `gameState-${code}-${name}`;
      localStorage.setItem(storageKey, JSON.stringify(gameStateRef.current));
      
      // Update URL to include name for easy reconnection
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('code') !== code || urlParams.get('name') !== name) {
        urlParams.set('code', code);
        urlParams.set('name', name);
        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
        window.history.replaceState({}, '', newUrl);
      }
    }
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
      {screen === Screens.c3SubmitTruth && <C3SubmitTruth gameState={gameState} />}
      {screen === Screens.c4PickTheBestAnswerOutOfAList && <C4PickBestAnswer gameState={gameState} />}
      {screen === Screens.c5SubmitLie && <C5SubmitLie gameState={gameState} />}
    </div>
  )
}

export default App
