const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 5000;

const rooms = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join-room', (roomId, playerName) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(playerName);
    io.to(roomId).emit('player-joined', rooms[roomId]);
  });

  socket.on('start-game', (roomId) => {
    // Handle game start logic here
    // You can emit game-related events to players in the room
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    const roomId = Object.keys(socket.rooms)[1];
    if (roomId && rooms[roomId]) {
      const playerName = rooms[roomId].find((name) => name === socket.id);
      if (playerName) {
        rooms[roomId] = rooms[roomId].filter((name) => name !== playerName);
        io.to(roomId).emit('player-left', rooms[roomId]);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
