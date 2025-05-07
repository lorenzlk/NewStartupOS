// EmbeddingDiff.js

function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (normA * normB);
  }
  
  function embeddingsAreMeaningfullyDifferent(newEmbedding, oldEmbedding, threshold = 0.98) {
    if (!newEmbedding || !oldEmbedding) return true; // Assume different if missing
    const similarity = cosineSimilarity(newEmbedding, oldEmbedding);
    return similarity < threshold;
  }