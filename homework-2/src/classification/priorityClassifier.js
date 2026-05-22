const { PRIORITY_KEYWORDS } = require('./keywords');
const { countKeywordHits } = require('./matcher');

const PRIORITY_ORDER = ['urgent', 'high', 'low', 'medium'];

function classifyPriority({ subject = '', description = '' } = {}) {
  const text = `${subject} ${description}`.toLowerCase();

  const scoresByPriority = {};
  const matchedByPriority = {};

  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    let score = 0;
    const matched = [];
    for (const keyword of keywords) {
      const hits = countKeywordHits(text, keyword);
      if (hits > 0) {
        score += hits;
        matched.push(keyword);
      }
    }
    scoresByPriority[priority] = score;
    matchedByPriority[priority] = matched;
  }

  let bestPriority = 'medium';
  let bestScore = 0;
  for (const priority of PRIORITY_ORDER) {
    const score = scoresByPriority[priority] || 0;
    if (score > bestScore) {
      bestScore = score;
      bestPriority = priority;
    }
  }

  return {
    priority: bestPriority,
    score: bestScore,
    matchedKeywords: bestScore === 0 ? [] : matchedByPriority[bestPriority],
    scoresByPriority,
  };
}

module.exports = { classifyPriority };
