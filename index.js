const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const path = require('path');

var httpPath = path.join( __dirname, "fibbage_knockoff_client/dist/" );

app.use(express.static(httpPath));

server.listen(3000, () => {
  console.log('listening on *:3000');
});