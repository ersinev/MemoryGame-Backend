const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { generateUniqueCards } = require("./cards");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3000/admin"],
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

const rooms = {};
const turnInfo = {};
const gameStates = {};

const corsOptions = {
  origin: ["http://localhost:3000", "http://localhost:3000/admin"],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
};

app.use(cors(corsOptions));

let totalUsers = 0;

// Store online users and room data
const onlineUsers = [];

io.on("connection", (socket) => {
  console.log("A user connected");
  totalUsers++;
  console.log(`---------Total Online Users: ${totalUsers}--------------`);

  // Add the user to the onlineUsers array
  onlineUsers.push(socket.id);

  // Emit the updated onlineUsers array to the admin room
  io.to("admin").emit("online-users", onlineUsers);
  io.to("admin").emit("room-data", rooms);

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

    // Check if the player with the same socket ID already exists
    const existingPlayer = rooms[roomId].players.find(
      (player) => player.id === socket.id
    );

    if (!existingPlayer) {
      rooms[roomId].players.push({ id: socket.id, name: playerName });
      io.to(roomId).emit("player-joined", rooms[roomId].players);

      if (rooms[roomId].players.length >= 2 && !rooms[roomId].gameStarted) {
        // Reset the game state
        rooms[roomId].gameStarted = true;

        // Emit the "game-started" event only once when the game starts
        const cardsData = generateUniqueCards();
        io.to(roomId).emit("game-started", rooms[roomId].gameId, cardsData);
        rooms[roomId].currentTurn = rooms[roomId].players[0].id;
        turnInfo[roomId] = rooms[roomId].currentTurn;
        io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
      }
    }

    // Emit the updated room data after player joining
    io.to("admin").emit("room-data", rooms);
  });

  socket.on("flip-card", (roomId, playerName, cardId) => {
    if (!gameStates[roomId]) {
      gameStates[roomId] = {
        turnedCards: [],
        matchedPairs: [],
      };
    }
    gameStates[roomId].turnedCards.push({ playerName, cardId });
    io.to(roomId).emit("update-game-state", gameStates[roomId]);

    // Broadcast the flip event to all clients in the same room, including the sender
    io.to(roomId).emit("flip-card", playerName, cardId);
  });

  socket.on("close-cards", (roomId, cardIds) => {
    // Update the game state to close the specified cards
    io.to(roomId).emit("close-cards", cardIds);

    // Update the game state for all users
    if (gameStates[roomId]) {
      gameStates[roomId].turnedCards = gameStates[roomId].turnedCards.filter(
        (turn) => !cardIds.includes(turn.cardId)
      );

      // Update the matchedPairs array for the closed cards
      gameStates[roomId].matchedPairs = gameStates[roomId].matchedPairs.concat(
        cardIds.map((cardId) =>
          gameStates[roomId].turnedCards.find((turn) => turn.cardId === cardId)
            .playerName
        )
      );

      io.to(roomId).emit("update-game-state", gameStates[roomId]);
    }
  });

  socket.on("end-turn", (roomId) => {
    if (rooms[roomId] && rooms[roomId].currentTurn === socket.id) {
      const currentTurnIndex = rooms[roomId].players.findIndex(
        (player) => player.id === socket.id
      );
      const nextTurnIndex =
        (currentTurnIndex + 1) % rooms[roomId].players.length;
      rooms[roomId].currentTurn = rooms[roomId].players[nextTurnIndex].id;
      turnInfo[roomId] = rooms[roomId].currentTurn;
      io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
    }
  });

  socket.on("disconnect", () => {
    totalUsers--;

    console.log("A user disconnected");
    console.log(
      `---------Total Online Users: ${totalUsers}--------------`
    );

    // Remove the user from the onlineUsers array
    const userIndex = onlineUsers.indexOf(socket.id);
    if (userIndex !== -1) {
      console.log("dasdsadasd");
      onlineUsers.splice(userIndex, 1);
      io.to("admin").emit("online-users", onlineUsers);
    }

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
            const nextIndex =
              (currentIndex + 1) % rooms[roomId].players.length;
            rooms[roomId].currentTurn =
              rooms[roomId].players[nextIndex].id;
            turnInfo[roomId] = rooms[roomId].currentTurn;
            io.to(roomId).emit(
              "turn-change",
              rooms[roomId].currentTurn
            );
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
