// routes/player.js
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Player = require('../models/Player');
const { v4: uuidv4 } = require('uuid');
const cors = require("cors");

const corsOptions = {
    origin: "https://itgaragememorygame.netlify.app",
    methods: ["GET", "POST", "DELETE"], // Adding DELETE method to CORS options
};

router.use(cors(corsOptions));

// Route to save start time
router.post('/start', async (req, res) => {
  try {
    const { name, startTime} = req.body;
    const player = new Player({ _id:uuidv4(), name, startTime, exitTime: null, elapsedTime: null });
    await player.save();
    res.status(201).json({ message: 'Start time saved successfully.' });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern.name) {
      res.status(400).json({ error: 'A player with the same name already exists.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Route to get player records
router.get('/records', async (req, res) => {
  try {
    const players = await Player.find();
    res.status(200).json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Route to delete all player records

router.delete('/delete-all', async (req, res) => {
  try {
    await Player.deleteMany({});
    res.status(200).json({ message: 'All player records deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to delete a player record by ID
// router.delete('/:id', async (req, res) => {
//   const { id } = req.params;
//   try {
//     const deletedPlayer = await Player.findByIdAndDelete(id);
//     if (!deletedPlayer) {
//       res.status(404).json({ error: 'Player not found.' });
//     } else {
//       res.status(200).json({ message: 'Player deleted successfully.' });
//     }
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });     




module.exports = router;