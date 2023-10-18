// cards.js

const generateUniqueCards = () => {
  const cards = [];
  for (var i = 1; i <= 48; i += 4) {
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

  return cards.map((card) => ({
    ...card,
    order: Math.floor(Math.random() * 12),
    isFlipped: false,
  }));
};

module.exports = { generateUniqueCards };
