// Pinecone.gs (Refactored to avoid global dependency issue & Corrected Fetch)

/**
 * Helper function to get Pinecone config safely from the global cfg object.
 * @return {object|null} Object { host: string, apiKey: string } or null if config error.
 */
function getPineconeConfig() {
    try {
        if (typeof cfg === 'undefined' || !cfg || !cfg.PINECONE) {
            logDebug('ERROR: cfg.PINECONE configuration is missing or undefined.');
            return null;
        }
        // Get host, remove protocol, handle if property is missing/null
        const host = (cfg.PINECONE.INDEX_HOST || '').replace(/^https?:\/\//i, '');
        const apiKey = cfg.PINECONE.API_KEY;

        if (!host || !apiKey) {
            logDebug('ERROR: PINECONE_INDEX_HOST or PINECONE_API_KEY is missing in configuration or script properties.');
            return null;
        }
        // Return the needed config values
        return { host: host, apiKey: apiKey };
    } catch (e) {
        logDebug("ERROR accessing Pinecone config from cfg object.", { error: e.message });
        return null;
    }
}


/**
 * Upsert a single chunk embedding into Pinecone under its doc namespace.
 * Uses the content hash as the vector ID.
 */
function upsertEmbedding(docId, chunk, embedding) {
  const config = getPineconeConfig(); // Get config inside the function
  if (!config) return; // Stop if config is invalid/missing

  if (!embedding) {
     logDebug('⚠️ Skipping Pinecone upsert: no embedding provided', { docId, title: chunk.title });
     return;
  }
  const contentHash = hashContent(chunk.content); // ID is the content hash
  const url = `https://${config.host}/vectors/upsert`; // Use config.host
  const vector = {
    id:       contentHash, // Use content hash as ID
    values:   embedding,
    metadata: {
      docId,
      title:     chunk.title,
      hash:      contentHash, // Store the hash in metadata too
      timestamp: new Date().toISOString()
    }
  };

  const payload = {
    namespace: docId,
    vectors:   [vector]
  };

  const options = {
    method:            'post',
    contentType:       'application/json',
    headers:           { 'Api-Key': config.apiKey }, // Use config.apiKey
    payload:           JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
      const res = UrlFetchApp.fetch(url, options);
      const data = safeJsonParse(res.getContentText()); // Use Utils.gs safeJsonParse

      if (res.getResponseCode() !== 200 || data?.upsertedCount !== 1) { // Check response code too
        logDebug('⚠️ Pinecone upsert warning/error', { docId, title: chunk.title, code: res.getResponseCode(), response: data });
      } else {
        logDebug('✅ Upserted embedding to Pinecone', { docId, title: chunk.title, id: contentHash });
      }
  } catch (e) {
      logDebug('❌ Exception during Pinecone upsert', { error: e.message });
  }
}

/**
 * Query Pinecone for similar chunks in this doc’s namespace.
 */
function querySimilarChunks(docId, embedding) {
  const config = getPineconeConfig(); // Get config inside the function
  if (!config) return ''; // Return empty context on config error

  if (!embedding) {
      logDebug('⚠️ Skipping Pinecone query: no embedding provided', { docId });
      return '';
  }
  const url = `https://${config.host}/query`; // Use config.host
  const payload = {
    namespace:       docId,
    vector:          embedding,
    topK:            5,
    includeMetadata: true
  };
  const options = {
    method:            'post',
    contentType:       'application/json',
    headers:           { 'Api-Key': config.apiKey }, // Use config.apiKey
    payload:           JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
      const res = UrlFetchApp.fetch(url, options);
      const data = safeJsonParse(res.getContentText()); // Use Utils.gs safeJsonParse

      if (res.getResponseCode() !== 200 || !data?.matches || data.matches.length === 0) { // Check response code
        logDebug(' Pinecone query returned no matches or error', { docId, code: res.getResponseCode(), response: data });
        return '';
      }

      // Only keep titles for high-confidence matches
      const context = data.matches
        .filter(m => m.score > 0.7) // Keep threshold or adjust as needed
        .map(m => `(${m?.metadata?.title || 'Unknown Title'})`) // Add safe access to metadata title
        .join(' \n ');

      logDebug('✅ Retrieved similar context from Pinecone', { docId, context });
      return context;
  } catch (e) {
       logDebug('❌ Exception during Pinecone query', { error: e.message });
       return '';
  }
}


/**
 * Load a prior embedding by its vector ID (content hash) from the doc namespace.
 */
function loadPriorEmbedding(docId, vectorId) {
  const config = getPineconeConfig(); // Get config inside the function
  if (!config) return null; // Return null on config error

  if (!vectorId) {
    logDebug('⚠️ Skipping loadPriorEmbedding: no vectorId (prior hash) provided');
    return null;
  }
  try {
    logDebug('Attempting to load prior embedding', { docId, vectorId });
    // Construct URL for GET request to fetch by ID
    const url = `https://${config.host}/vectors/fetch?namespace=${encodeURIComponent(docId)}&ids=${encodeURIComponent(vectorId)}`;

    const options = {
      method:            'get',
      headers:           { 'Api-Key': config.apiKey }, // Use config.apiKey
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
        logDebug('⚠️ Pinecone fetch API error', { docId, vectorId, code: responseCode, response: responseBody });
        return null;
    }

    // Use Utils.gs safeJsonParse
    const data = safeJsonParse(responseBody);

    // Access the vector using the provided vectorId key
    const vec = data?.vectors?.[vectorId];

    if (!vec || !vec.values) {
        logDebug('Vector not found or missing values in Pinecone response', { docId, vectorId });
        // Don't log full response here unless debugging, it can be large
        return null;
    }

    logDebug('✅ Loaded prior embedding successfully', { docId, vectorId });
    return vec.values; // Return only the embedding array

  } catch (e) {
    logDebug('⚠️ Failed during loadPriorEmbedding execution', { docId, vectorId, error: e.message });
    return null;
  }
}
