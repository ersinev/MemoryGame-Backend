const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { generateUniqueCards } = require("./cards");
const app = express();
const server = http.createServer(app);
const { setInterval } = require('timers');
const Player = require('./models/Player');
const player = require('./routes/player')
const PORT = process.env.PORT || 5000;
app.use(express.json())
app.use('/player', player)
const mongoose = require('mongoose');
require('dotenv').config();


const io = socketIo(server, {
  cors: {
    /////
    //http://localhost:3000 
    //https://itgaragememorygame.netlify.app
    origin: ["https://itgaragememorygame.netlify.app", "https://itgaragememorygame.netlify.app/admin"],
    methods: ["GET", "POST", "DELETE"],
  },
});

// const corsOptions = {
//   origin: ["http://localhost:3000", "http://localhost:3000/admin","http://localhost:5000/player/start"],
//   methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
// };
// app.use(cors(corsOptions));
app.use(cors({
  origin: "https://itgaragememorygame.netlify.app",
  methods: ["GET", "POST","DELETE"],
}));


console.log("MongoDB URL:", process.env.MONGO_URL);

// MongoDB'ye bağlanmak için URI


// Bağlantıyı kurma
mongoose
  .connect(process.env.MONGO_URL, {
   
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
  });


const rooms = {};
const turnInfo = {};
const gameStates = {};
const shuffledCardsMap = {};
let totalUsers = 0;
const onlineUsers = [];




io.on("connection", (socket) => {
  //console.log("A user connected");
  totalUsers++;
  //console.log(`---------Total Online Users: ${totalUsers}--------------`);

  // Add the user to the onlineUsers array
  onlineUsers.push(socket.id);



  io.to("admin").emit("online-users", onlineUsers);
  io.to("admin").emit("room-data", rooms);

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

    if (!shuffledCardsMap[roomId]) {
      const shuffledCards = generateUniqueCards();
      shuffleCards(shuffledCards);
      shuffledCardsMap[roomId] = shuffledCards;
    }

    io.to(roomId).emit("game-started", rooms[roomId].gameId, shuffledCardsMap[roomId], Date.now());

    const existingPlayer = rooms[roomId].players.find(
      (player) => player.id === socket.id
    );

    if (!existingPlayer) {
      const newPlayer = { id: socket.id, name: playerName };
      rooms[roomId].players.push(newPlayer);

      io.to(socket.id).emit("update-game-state", rooms[roomId].gameData);
      io.to(roomId).emit("player-joined", rooms[roomId].players);
    }

    if (!rooms[roomId].currentTurn && rooms[roomId].players.length > 0) {
      rooms[roomId].currentTurn = rooms[roomId].players[0].id;
      turnInfo[roomId] = rooms[roomId].currentTurn;
      io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
    }

    if (rooms[roomId].currentTurn) {
      io.to(socket.id).emit("turn-change", rooms[roomId].currentTurn);
      io.to(socket.id).emit("update-game-state", rooms[roomId].gameData);
    }
  });


  socket.on("flip-card", (roomId, playerName, cardId, selectedCards) => {
    if (!gameStates[roomId]) {
      gameStates[roomId] = {
        turnedCards: [],
        matchedPairs: [],
      };
    }

    gameStates[roomId].turnedCards.push({ playerName, cardId });
    //io.to(roomId).emit("update-game-state", gameStates[roomId]);

    //console.log("SELECTED CARDS", selectedCards)

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

      // Broadcast the close-cards event to all clients in the room, including the sender
      socket.to(roomId).emit("close-cards", cardIds);
    }
  });

  socket.on("update-game-state", (roomId, playerName, cardId) => {
    gameStates[roomId].turnedCards.push({ playerName, cardId });

    // Emit the updated game state to all clients in the room
    io.to(roomId).emit("update-game-state", gameStates[roomId]);

    // Check if the updated card is part of a matched pair
    const matchedPair = gameStates[roomId].matchedPairs.find(
      (matchedCardId) => matchedCardId === cardId
    );

    if (matchedPair) {
      // If it's part of a matched pair, also emit the flip-card event
      io.to(roomId).emit("flip-card", playerName, cardId);
    }
  });

  socket.on("end-turn", (roomId, selectedCards) => {
    if (rooms[roomId] && rooms[roomId].currentTurn === socket.id) {
      const currentTurnIndex = rooms[roomId].players.findIndex(
        (player) => player.id === socket.id
      );
      const nextTurnIndex = (currentTurnIndex + 1) % rooms[roomId].players.length;
      rooms[roomId].currentTurn = rooms[roomId].players[nextTurnIndex].id;

      // Check if the two flipped cards match
      const turnedCards = gameStates[roomId].turnedCards;
      if (selectedCards.length === 2 && selectedCards[0].key === selectedCards[1].key) {
        // The cards match, so keep them open and update points
        const matchedCardKey = selectedCards[0].key;

        if (!gameStates[roomId].matchedPairs.includes(matchedCardKey)) {
          gameStates[roomId].turnedCards.push({ playerName: socket.id, cardId: matchedCardKey });
          gameStates[roomId].matchedPairs.push(matchedCardKey);

          // Award points to the current player
          const currentPlayerId = socket.id;
          rooms[roomId].points[currentPlayerId] = (rooms[roomId].points[currentPlayerId] || 0) + 1;

          // Broadcast the updated game state to all clients in the room
          io.to(roomId).emit("update-game-state", gameStates[roomId]);

          // Emit the "matched-pairs" event after updating game state
          io.to(roomId).emit("matched-pairs", gameStates[roomId].matchedPairs);

          // Emit "turn-change" event to update the current turn
          io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);

          // console.log("Matched cards, points awarded, and turn changed.");
        }
      } else {
        // The cards do not match, so close only the unmatched cards
        const unmatchedCardIds = selectedCards.map((card) => card.id);

        // Emit the "close-cards" event to all clients in the room
        io.to(roomId).emit("close-cards", unmatchedCardIds);

        // console.log("Unmatched cards closed.");

        // Update the game state to clear the turned cards
        io.to(roomId).emit("update-game-state", gameStates[roomId]);
        // Emit "turn-change" event to update the current turn
        io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
      }
    }
  })

  socket.on("update-points", (roomId, updatedPoints) => {
    // Update server-side points data
    rooms[roomId].points = updatedPoints;

    // Broadcast the updated points to all clients in the room
    io.to(roomId).emit("update-points", updatedPoints);
  });


  socket.on("disconnect", async () => {
    // When a player disconnects
    totalUsers--;

    const userIndex = onlineUsers.indexOf(socket.id);

    if (userIndex !== -1) {
      onlineUsers.splice(userIndex, 1);
      io.to("admin").emit("online-users", onlineUsers);
    }

    Object.keys(rooms).forEach(async (roomId) => {
      if (rooms[roomId] && rooms[roomId].players) {
        const disconnectedPlayer = rooms[roomId].players.find(
          (player) => player.id === socket.id
        );
        
        if (disconnectedPlayer) {
          const playerName = disconnectedPlayer.name;
          

          try {
            // Find the player in MongoDB
            const players = await Player.find({ name: playerName, exitTime: null });
            const player = players.find((player) => player.exitTime === null);
            if (player) {
              // If player is found, update exitTime
              player.exitTime = Date.now(); // Set player's exit time
              
              // Calculate elapsed time
              const elapsedTimeInMillis = player.exitTime - player.startTime;
              const totalSeconds = Math.floor(elapsedTimeInMillis / 1000);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              let elapsedTime;
              if (minutes >= 1) {
                // If elapsed time is 1 minute or more, include minutes and seconds
                elapsedTime = `${minutes}m ${seconds}s`;
              } else {
                // If elapsed time is less than 1 minute, only include seconds
                elapsedTime = `${seconds}s`;
              }

              // Assign elapsedTime to player
              player.elapsedTime = elapsedTime;
              await player.save();
              console.log("Exit time updated:", player.exitTime);
            } else {
              console.log("Player not found or already exited.");
            }
          } catch (error) {
            console.error("Database error:", error);
          }

          // Remove player from room
          rooms[roomId].players = rooms[roomId].players.filter(
            (player) => player.id !== socket.id
          );

          if (rooms[roomId].currentTurn === socket.id) {
            if (rooms[roomId].players.length > 0) {
              const currentTurnIndex = rooms[roomId].players.findIndex(
                (player) => player.id === socket.id
              );
              const nextTurnIndex = (currentTurnIndex + 1) % rooms[roomId].players.length;
              rooms[roomId].currentTurn = rooms[roomId].players[nextTurnIndex].id;

              io.to(roomId).emit("turn-change", rooms[roomId].currentTurn);
            } else {
              delete rooms[roomId];
              delete shuffledCardsMap[roomId];
              delete gameStates[roomId];
            }
          }

          startGame(roomId);

          if (rooms[roomId]) {
            io.to(roomId).emit("player-left", rooms[roomId].players);
            io.to(roomId).emit("update-game-state", rooms[roomId].gameData);
          }
        }
      }
    });
  });









  function generateUniqueId(roomId) {
    return roomId + "_gameId";
  }

  function startGame(roomId) {
    // Check if the room exists and has players
    if (rooms[roomId] && rooms[roomId].players && rooms[roomId].players.length >= 2 && !rooms[roomId].gameStarted) {
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
      io.to(socket.id).emit("game-already-started", rooms[roomId] ? rooms[roomId].gameId : null);

      // Update the new player's game state with the current game data
      io.to(socket.id).emit("update-game-state", rooms[roomId] ? rooms[roomId].gameData : null);
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

try {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.error("Error starting the server:", error);
}