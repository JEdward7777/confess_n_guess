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
import H5ShowPoints from './H5ShowPoints';
import H6ShowWinner from './H6ShowWinner';

function App() {
  // Check if we should show the new game screen or join with code
  const urlParams = new URLSearchParams(window.location.search);
  const showNewGame = urlParams.get('new') === '1';
  const joinCode = urlParams.get('code');
  const joinName = urlParams.get('name'); // Get name from URL for reconnection

  // Where to start before the server tells us where we really are. The host's URL
  // carries name=<host>, so without this check a refreshing host lands on the player
  // name-entry screen and can type a name and become a player (CNG-007).
  function initialScreen(): Screens {
    if (showNewGame) return Screens.g1NewGame;
    if (!joinCode) return Screens.g1NewGame;
    if (joinName === '<host>') return Screens.h1CollectingUsers;
    return Screens.c1TypeInYourNameAndPickAnEmojiForYourPicture;
  }

  //have a state representing what screen we are on.
  const [gameState, _setGameState] = useState<ClientGameState>({
    sharedState: {
      users: {},
      code: joinCode || "",
    },
    name: joinName || "", // Use name from URL if available
    emoji: "",
    screen : initialScreen(),
    error: "",
  });
  const gameStateRef = useRef<ClientGameState>( gameState );
  // Once the server has told us where we are, its word beats anything cached locally.
  const hasServerState = useRef<boolean>(false);
  
  // Tell the server who we are. The server replies by sending us to the right screen,
  // so this is what makes a refresh land in the right place.
  useEffect(() => {
    function identify() {
      const code = gameStateRef.current?.sharedState?.code;
      const name = gameStateRef.current?.name;
      const isHost = name === '<host>';

      // A player with no name yet has nothing to identify as - they'll register via
      // nameAndEmoji instead.
      if (!code || (!isHost && !name)) return;

      console.log('>>> IDENTIFYING as ' + (isHost ? 'host' : 'player') + ' for game ' + code);
      socket.emit('identify', {
        role: isHost ? 'host' : 'player',
        code,
        name: isHost ? undefined : name
      });
    }

    // Identify on connect rather than waiting to be asked. The socket is created at
    // module load, before this effect runs, so a fast connection can deliver
    // 'identifyMe' before the listener exists and it is then lost forever (CNG-018).
    // Covers reconnects too, since socket.io re-fires 'connect'.
    if (socket.connected) identify();
    socket.on('connect', identify);
    socket.on('identifyMe', identify);
    return () => {
      socket.off('connect', identify);
      socket.off('identifyMe', identify);
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
      hasServerState.current = true;
      setGameState(newState);
    }

    socket.on('gameState', onGameStateChange);
    return () => {
      socket.off('gameState', onGameStateChange);
    };
  }, []);

  useEffect(() => {
    // Restore the last known screen from localStorage. This is only a placeholder for
    // the moment before the server answers our identify - the server decides where we
    // actually belong, so never let this overwrite something it already told us.
    if (hasServerState.current) return;

    // Retrieve game state using game code and name from URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const name = urlParams.get('name');

    if (code && name) {
      // Use gameCode + name as the localStorage key for persistent state
      const storageKey = `gameState-${code}-${name}`;
      const savedStateString = localStorage.getItem(storageKey);
      if (savedStateString) {
        try {
          setGameState(JSON.parse(savedStateString));
        } catch {
          // Corrupt entry - drop it and wait for the server.
          localStorage.removeItem(storageKey);
        }
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
