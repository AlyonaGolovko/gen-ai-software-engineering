function buildReasoning(categoryResult, priorityResult) {
  const parts = [];

  if (!categoryResult || categoryResult.category === 'other' || categoryResult.score === 0) {
    parts.push("No category keywords matched; defaulted to 'other'.");
  } else {
    const kws = (categoryResult.matchedKeywords || []).join(', ');
    parts.push(`Category '${categoryResult.category}' inferred from keywords: [${kws}].`);
  }

  if (!priorityResult || priorityResult.score === 0) {
    parts.push("No priority keywords matched; defaulted to 'medium'.");
  } else {
    const kws = (priorityResult.matchedKeywords || []).join(', ');
    parts.push(`Priority '${priorityResult.priority}' inferred from keywords: [${kws}].`);
  }

  return parts.join(' ');
}

module.exports = { buildReasoning };
