const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const cors = require('cors');

const PORT = process.env.PORT || 5000;

const rooms = {};

app.use(cors());

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join-room', (roomId, playerName) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    
    // Store the playerName associated with the socket.id
    rooms[roomId].push({ id: socket.id, name: playerName });
    
    io.to(roomId).emit('player-joined', rooms[roomId]); // Emit the updated players list
  });

  socket.on('start-game', (roomId) => {
    // Handle game start logic here
    // You can emit a 'game-started' event to all players in the room
    io.to(roomId).emit('game-started');
  });

  socket.on('flip-card', (roomId, cardId) => {
    // Handle when a player flips a card
    // You can broadcast the card flip to all players in the room
    io.to(roomId).emit('flip-card', cardId);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    const roomId = Object.keys(socket.rooms)[1];
    if (roomId && rooms[roomId]) {
      const playerIndex = rooms[roomId].findIndex((player) => player.id === socket.id);
      if (playerIndex !== -1) {
        rooms[roomId].splice(playerIndex, 1);
        io.to(roomId).emit('player-left', rooms[roomId]);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
