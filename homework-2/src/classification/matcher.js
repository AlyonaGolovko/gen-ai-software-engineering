function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countKeywordHits(lowerText, keyword) {
  if (keyword.includes(' ') || keyword.includes("'")) {
    let count = 0;
    let pos = 0;
    while (true) {
      const i = lowerText.indexOf(keyword, pos);
      if (i === -1) return count;
      count += 1;
      pos = i + keyword.length;
    }
  }
  const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'g');
  return (lowerText.match(re) || []).length;
}

module.exports = { countKeywordHits };
