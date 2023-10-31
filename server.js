const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { generateUniqueCards } = require("./cards");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

const rooms = {};
const turnInfo = {}; // Define turnInfo to store the current turn in each room
const gameStates = {}; // Maintain game state for each room

const corsOptions = {
  origin: "http://localhost:3000",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
};

app.use(cors(corsOptions));

let totalUsers = 0;

io.on("connection", (socket) => {
  console.log("A user connected");
  totalUsers++;
  console.log(`---------Total Online Users: ${totalUsers}--------------`);

  socket.on("check-room", (roomId, callback) => {
    if (rooms[roomId]) {
      callback(true, rooms[roomId].gameStarted);
    } else {
      callback(false, false);
    }
  });

  socket.on("join-room", (roomId, playerName) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        gameId: generateUniqueId(roomId),
        gameStarted: false,
        currentTurn: null,
      };
    }

    const existingPlayer = rooms[roomId].players.find(
      (player) => player.id === socket.id
    );

    if (!existingPlayer) {
      rooms[roomId].players.push({ id: socket.id, name: playerName });
      io.to(roomId).emit("player-joined", rooms[roomId].players);

      if (rooms[roomId].players.length === 2 && !rooms[roomId].gameStarted) {
        rooms[roomId].gameStarted = true;
        const cardsData = generateUniqueCards();
        io.to(roomId).emit("game-started", rooms[roomId].gameId, cardsData);
        rooms[roomId].currentTurn = rooms[roomId].players[0].id;
        turnInfo[roomId] = rooms[roomId].currentTurn; // Update the turn information
        io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
      }
    }
  });

  socket.on("flip-card", (roomId, playerName, cardId) => {
    // Update the game state for the specified room
    if (!gameStates[roomId]) {
      gameStates[roomId] = {
        turnedCards: [],
        matchedPairs: [],
      };
    }
    gameStates[roomId].turnedCards.push({ playerName, cardId });

    // Broadcast the updated game state to all players in the room
    io.to(roomId).emit("update-game-state", gameStates[roomId]);
  });

  socket.on("end-turn", (roomId) => {
    if (rooms[roomId] && rooms[roomId].currentTurn === socket.id) {
      const currentIndex = rooms[roomId].players.findIndex(
        (player) => player.id === socket.id
      );
      const nextIndex = (currentIndex + 1) % rooms[roomId].players.length;
      rooms[roomId].currentTurn = rooms[roomId].players[nextIndex].id;
      turnInfo[roomId] = rooms[roomId].currentTurn; // Update the turn information
      io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
    }
  });

  socket.on("disconnect", () => {
    totalUsers--;

    console.log("A user disconnected");
    console.log(`---------Total Online Users: ${totalUsers}--------------`);

    const roomIds = Object.keys(socket.rooms);
    roomIds.forEach((roomId) => {
      if (rooms[roomId]) {
        const playerIndex = rooms[roomId].players.findIndex(
          (player) => player.id === socket.id
        );
        if (playerIndex !== -1) {
          rooms[roomId].players.splice(playerIndex, 1);
          io.to(roomId).emit("player-left", rooms[roomId].players);

          if (rooms[roomId].currentTurn === socket.id) {
            const currentIndex = rooms[roomId].players.findIndex(
              (player) => player.id === socket.id
            );
            const nextIndex = (currentIndex + 1) % rooms[roomId].players.length;
            rooms[roomId].currentTurn = rooms[roomId].players[nextIndex].id;
            turnInfo[roomId] = rooms[roomId].currentTurn; 
            io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
          }
        }
      }
    });
  });

  function generateUniqueId(roomId) {
    return roomId + "_gameId";
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
