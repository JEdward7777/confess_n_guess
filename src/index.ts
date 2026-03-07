
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

function saveGameState() {
    console.log("saveGameState");
    const gamesData: { [gameCode: string]: any } = {};
    for (const code in games) {
        gamesData[code] = games[code].toJSON();
    }
    fs.writeFileSync('games.json', JSON.stringify(gamesData, null, 2));
}

process.on('exit', saveGameState);
process.on('SIGINT', () => {
    saveGameState();
    process.exit();
});

// Load saved games if they exist
if (fs.existsSync('games.json')) {
    try {
        const loadedGames = JSON.parse(fs.readFileSync('games.json').toString());
        for (const gameCode in loadedGames) {
            games[gameCode] = GameState.fromJSON(loadedGames[gameCode], gameCode);
            console.log("Loaded game", gameCode);
        }
    } catch (e) {
        console.error("Error loading games:", e);
    }
}

const io = new Server(server);

const socketHandlers = new SocketHandlers(io, games);
io.on('connection', (socket) => {
    socketHandlers.handleConnection(socket);
});

// Get port from command line argument or use default
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 3001;

server.listen(PORT, () => {
    console.log('listening on *:' + PORT);
});