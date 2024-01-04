const seedrandom = require('seedrandom');

const generateUniqueCards = (seed) => {
  // Set the seed for the random number generator
  const rng = seedrandom(seed);

  const cards = [];
  for (var i = 1; i <= 36; i += 4) {
    const imageIndex = i;
    const explanationIndex = i + 1;

    cards.push(
      {
        img: `${imageIndex}.png`,
        id: i,
        key: i,
      },
      {
        img: `${explanationIndex}.png`,
        id: i + 1, // Different id for image and explanation
        key: i,
      },
      {
        img: `${imageIndex + 2}.png`,
        id: i + 2,
        key: i + 1,
      },
      {
        img: `${explanationIndex + 2}.png`,
        id: i + 3,
        key: i + 1,
      }
    );
  }

  // Use the seeded random number generator
  return cards.map((card) => ({
    ...card,
    order: Math.floor(rng() * 12),
    isFlipped: false,
  }));
};

module.exports = { generateUniqueCards };