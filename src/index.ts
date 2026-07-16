
import * as express from 'express';
const app = express();

import * as http from 'http';
const server = http.createServer(app);
import * as path from 'path';

import * as fs from 'fs';

import { Server } from "socket.io";
import { GameState } from "./GameState";
import { SocketHandlers } from "./socketHandlers";
import { Screens, ClientGameState } from "./IncludeStuff";

var httpPath = path.join(__dirname, "../confess_n_guess_client/dist/");
app.use(express.static(httpPath));

// Game state store
const games: { [gameCode: string]: GameState } = {};

// Games idle longer than this are dropped rather than saved or loaded. Long enough to
// survive a restart mid-game (the point of saving at all), short enough that the store
// doesn't grow forever. Overridable so tests can watch the sweep work in seconds.
const GAME_MAX_IDLE_MS = Number(process.env.CNG_GAME_MAX_IDLE_MS) || 12 * 60 * 60 * 1000; // 12 hours

function isExpired(gameState: GameState): boolean {
    return Date.now() - gameState.getLastActivity() > GAME_MAX_IDLE_MS;
}

function saveGameState() {
    console.log("saveGameState");
    const gamesData: { [gameCode: string]: any } = {};
    let skipped = 0;
    for (const code in games) {
        if (isExpired(games[code])) { skipped++; continue; }
        gamesData[code] = games[code].toJSON();
    }
    fs.writeFileSync('games.json', JSON.stringify(gamesData, null, 2));
    console.log(`saved ${Object.keys(gamesData).length} games` + (skipped ? `, dropped ${skipped} idle` : ''));
}

process.on('exit', saveGameState);
process.on('SIGINT', () => {
    saveGameState();
    process.exit();
});

// Load saved games if they exist. Restoring mid-game state is deliberate: it lets the
// server be restarted to pick up a code change during a live game without replaying
// the round from the start. Anything we can't restore faithfully is dropped - a game
// that looks playable but isn't is worse than one that's gone (CNG-002).
if (fs.existsSync('games.json')) {
    try {
        const loadedGames = JSON.parse(fs.readFileSync('games.json').toString());
        let loaded = 0, dropped = 0;
        for (const gameCode in loadedGames) {
            const gameState = GameState.fromJSON(loadedGames[gameCode], gameCode);
            if (!gameState) {
                console.log("Dropped unreadable save for game", gameCode);
                dropped++;
                continue;
            }
            if (isExpired(gameState)) {
                console.log("Dropped idle game", gameCode);
                dropped++;
                continue;
            }
            games[gameCode] = gameState;
            loaded++;
        }
        console.log(`Loaded ${loaded} games` + (dropped ? `, dropped ${dropped}` : ''));
    } catch (e) {
        console.error("Error loading games:", e);
    }
}

const io = new Server(server);

const socketHandlers = new SocketHandlers(io, games);

// Restart the clock on anything that was mid-round when we went down. Timers aren't
// serialisable, so without this a restored game resumes and then never advances.
socketHandlers.resumeTimers();

io.on('connection', (socket) => {
    socketHandlers.handleConnection(socket);
});

// Get port from command line argument or use default
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 3001;

server.listen(PORT, () => {
    console.log('listening on *:' + PORT);
});