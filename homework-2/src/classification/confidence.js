function computeConfidence(matchedKeywords) {
  const hits = Array.isArray(matchedKeywords)
    ? matchedKeywords.length
    : Number(matchedKeywords) || 0;
  if (hits <= 0) return 0;
  return Math.min(1, hits / 3);
}

function aggregateConfidence(categoryConfidence, priorityConfidence) {
  return (categoryConfidence + priorityConfidence) / 2;
}

module.exports = {
  computeConfidence,
  aggregateConfidence,
};
