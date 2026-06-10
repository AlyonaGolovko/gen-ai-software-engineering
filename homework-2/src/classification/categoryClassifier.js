const { CATEGORY_KEYWORDS } = require('./keywords');
const { countKeywordHits } = require('./matcher');

function classifyCategory({ subject = '', description = '' } = {}) {
  const text = `${subject} ${description}`.toLowerCase();

  const scoresByCategory = {};
  const matchedByCategory = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    const matched = [];
    for (const keyword of keywords) {
      const hits = countKeywordHits(text, keyword);
      if (hits > 0) {
        score += hits;
        matched.push(keyword);
      }
    }
    scoresByCategory[category] = score;
    matchedByCategory[category] = matched;
  }

  let bestCategory = 'other';
  let bestScore = 0;
  for (const [category, score] of Object.entries(scoresByCategory)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return {
    category: bestCategory,
    score: bestScore,
    matchedKeywords: bestCategory === 'other' ? [] : matchedByCategory[bestCategory],
    scoresByCategory,
  };
}

module.exports = { classifyCategory };
