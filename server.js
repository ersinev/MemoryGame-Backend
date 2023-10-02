const express = require('express')
const http = require('http')
const socketIo =require('socket.io')
const cors = require('cors')

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

const PORT= process.env.PORT || 5000

// Use CORS middleware to handle cross-origin requests
app.use(cors());

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join-room', (roomId, playerName) => {
    socket.join(roomId);
    socket.broadcast.to(roomId).emit('player-joined', playerName);

    socket.on('disconnect', () => {
      socket.leave(roomId);
      io.to(roomId).emit('player-left', playerName);
    });
  });

  // Handle game logic, card flips, and points here...
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});