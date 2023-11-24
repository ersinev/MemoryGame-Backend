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
const shuffledCardsMap = {};

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
        gameData: {
          cardsData: null,
          turnedCards: [],
          matchedPairs: [],
        },
      };
    }

    // Check if the cards are already shuffled for this room
    if (!shuffledCardsMap[roomId]) {
      const shuffledCards = generateUniqueCards();
      shuffleCards(shuffledCards);
      shuffledCardsMap[roomId] = shuffledCards;
    }

    // Broadcast the "game-started" event to all clients in the room
    io.to(roomId).emit("game-started", rooms[roomId].gameId, shuffledCardsMap[roomId], Date.now());

    const existingPlayer = rooms[roomId].players.find(
      (player) => player.id === socket.id
    );

    if (!existingPlayer) {
      const newPlayer = { id: socket.id, name: playerName };
      rooms[roomId].players.push(newPlayer);

      // Inform the new player that the game has already started
      io.to(socket.id).emit("game-already-started", rooms[roomId].gameId);

      // Update the new player's game state with the current game data
      io.to(socket.id).emit("update-game-state", rooms[roomId].gameData);

      // Emit "player-joined" event to all clients in the room
      io.to(roomId).emit("player-joined", rooms[roomId].players);
    }

    // Set the current turn if there are players in the room
    if (!rooms[roomId].currentTurn && rooms[roomId].players.length > 0) {
      rooms[roomId].currentTurn = rooms[roomId].players[0].id;
      turnInfo[roomId] = rooms[roomId].currentTurn;
      io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
    }

    // Emit the current turn and the game state to the newly joined player
    if (rooms[roomId].currentTurn) {
      io.to(socket.id).emit("turn-change", rooms[roomId].currentTurn);
      io.to(socket.id).emit("update-game-state", rooms[roomId].gameData);
    }
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

    // Broadcast the flip event to all clients in the same room,
    // including the sender
    io.to(roomId).emit("flip-card", playerName, cardId);
  });

  socket.on("close-cards", (roomId, cardIds) => {
    // Update the game state to close the specified cards
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
  
      // Broadcast the updated game state to all clients in the room
      io.to(roomId).emit("update-game-state", gameStates[roomId]);
    }
  
    // Broadcast the close-cards event to all clients in the same room
    io.to(roomId).emit("close-cards", gameStates[roomId]);
  
    // Add this line to ensure synchronization
    socket.broadcast.to(roomId).emit("update-game-state", gameStates[roomId]);
  });
  

  socket.on("end-turn", (roomId) => {
    if (rooms[roomId] && rooms[roomId].currentTurn === socket.id) {
      const currentTurnIndex = rooms[roomId].players.findIndex(
        (player) => player.id === socket.id
      );
      const nextTurnIndex = (currentTurnIndex + 1) % rooms[roomId].players.length;
      rooms[roomId].currentTurn = rooms[roomId].players[nextTurnIndex].id;
      turnInfo[roomId] = rooms[roomId].currentTurn;

      // Broadcast the turn-change event to all clients in the room
      io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
    }
  });

  socket.on("disconnect", () => {
    totalUsers--;

    console.log("A user disconnected");
    console.log(`---------Total Online Users: ${totalUsers}--------------`);

    // Remove the user from the onlineUsers array
    const userIndex = onlineUsers.indexOf(socket.id);
    if (userIndex !== -1) {
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

          // Call the startGame function when a player leaves
          startGame(roomId);

          io.to(roomId).emit("player-left", rooms[roomId].players);
        }
      }
    });
  });

  function generateUniqueId(roomId) {
    return roomId + "_gameId";
  }

  // Function to initialize the game
  function startGame(roomId) {
    if (rooms[roomId].players.length >= 2 && !rooms[roomId].gameStarted) {
      
      const shuffledCards = shuffledCardsMap[roomId];
  
      // Update game state with shuffled cards
      rooms[roomId].gameData.cardsData = shuffledCards;
  
      // Set game started flag
      rooms[roomId].gameStarted = true;
  
      // Broadcast the "game-started" event to all clients in the room
      io.to(roomId).emit("game-started", rooms[roomId].gameId, shuffledCards);
  
      // Set the current turn and emit turn change event
      rooms[roomId].currentTurn = rooms[roomId].players[0].id;
      turnInfo[roomId] = rooms[roomId].currentTurn;
      io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
    } else {
      // Inform the new player that the game has already started
      io.to(socket.id).emit("game-already-started", rooms[roomId].gameId);
  
      // Update the new player's game state with the current game data
      io.to(socket.id).emit("update-game-state", rooms[roomId].gameData);
    }
  }

  // Kartları karıştıran fonksiyon
  function shuffleCards(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
