"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const path = require("path");
const fs = require("fs");
const socket_io_1 = require("socket.io");
const GameState_1 = require("./GameState");
const socketHandlers_1 = require("./socketHandlers");
var httpPath = path.join(__dirname, "../fibbage_knockoff_client/dist/");
app.use(express.static(httpPath));
// Game state store
const games = {};
function saveGameState() {
    console.log("saveGameState");
    const gamesData = {};
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
            games[gameCode] = GameState_1.GameState.fromJSON(loadedGames[gameCode], gameCode);
            console.log("Loaded game", gameCode);
        }
    }
    catch (e) {
        console.error("Error loading games:", e);
    }
}
const io = new socket_io_1.Server(server);
const socketHandlers = new socketHandlers_1.SocketHandlers(io, games);
io.on('connection', (socket) => {
    socketHandlers.handleConnection(socket);
});
server.listen(3001, () => {
    console.log('listening on *:3001');
});
//# sourceMappingURL=index.js.map