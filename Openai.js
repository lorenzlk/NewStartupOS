// openai.gs (Refactored to access cfg inside functions)

/**
 * Helper function to safely get OpenAI config values from the global cfg object.
 * @return {object|null} Object { apiKey, chatModel, embeddingModel } or null if config error.
 */
function getOpenAIConfig() {
    try {
        // Check if cfg and cfg.OPENAI exist
        if (typeof cfg === 'undefined' || !cfg || !cfg.OPENAI) {
            logDebug('ERROR: cfg.OPENAI configuration is missing or undefined. Check Config.gs.');
            return null;
        }
        // Retrieve values from cfg.OPENAI
        const apiKey = cfg.OPENAI.API_KEY;
        const chatModel = cfg.OPENAI.MODEL;
        const embeddingModel = cfg.OPENAI.EMBEDDING_MODEL;

        // Check if required values were actually retrieved (handles missing script properties)
        if (!apiKey || !chatModel || !embeddingModel) {
            logDebug('ERROR: OPENAI_API_KEY, MODEL, or EMBEDDING_MODEL is missing in cfg.OPENAI configuration. Check Script Properties.');
            // Return null only if API key is missing, allow fallbacks for models? Or be strict:
            return null; // Be strict: all OpenAI config must be present
        }
        // Return the needed config values
        return { apiKey: apiKey, chatModel: chatModel, embeddingModel: embeddingModel };
    } catch (e) {
        logDebug("ERROR accessing OpenAI config from cfg object.", { error: e.message });
        return null;
    }
}


/**
 * Fetches an embedding for the given text using the configured model.
 * @param {string} text The text to embed.
 * @return {number[]|null} The embedding vector or null on error/size limit.
 */
function getEmbedding(text) {
  const config = getOpenAIConfig(); // Get config inside function
  if (!config) {
      logDebug("Aborting getEmbedding due to missing OpenAI config.");
      return null; // Stop if config is invalid/missing
  }

  const maxTokens = 8192; // Specific to text-embedding-3-small, make configurable?
  const approxTokens = Math.ceil((text || '').length / 4); // Estimate

  if (!text || approxTokens === 0) {
      logDebug('Skipping embedding: empty text');
      return null;
  }
  if (approxTokens > maxTokens) {
    logDebug('Skipping embedding: chunk too large', { title: text.slice(0,30)+'...', approxTokens, maxTokens });
    return null;
  }

  const url = 'https://api.openai.com/v1/embeddings';
  const payload = {
    model: config.embeddingModel, // Use config.embeddingModel
    input: text
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${config.apiKey}` }, // Use config.apiKey
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
        logDebug('OpenAI embedding API error', { code: responseCode, response: responseBody });
        return null;
    }

    // Use safeJsonParse (assuming it's globally available or defined elsewhere, e.g., Utils.gs)
    const data = safeJsonParse(responseBody);

    if (!data?.data?.[0]?.embedding) { // More robust check
       logDebug('OpenAI embedding unexpected response format', data);
       return null;
    }

    logDebug('Received OpenAI embedding');
    return data.data[0].embedding;

  } catch (e) {
     logDebug('Failed to call OpenAI embedding API', { error: e.message });
     return null;
  }
}


/**
 * Calls the OpenAI Chat Completions API with a given prompt.
 * Returns the raw API response object on success, allowing the caller
 * to parse the content as needed (text or JSON).
 *
 * @param {string} prompt The user prompt for the AI.
 * @param {object} [options] Optional parameters like temperature, system message.
 * @param {string} [options.systemMessage='You are a helpful assistant.'] Custom system prompt.
 * @param {number} [options.temperature=0.3] Sampling temperature.
 * @return {object|null} The parsed JSON response object from OpenAI, or null on error.
 */
function callOpenAI(prompt, options) {
  const config = getOpenAIConfig(); // Get config inside function
  if (!config) {
    logDebug("Aborting callOpenAI due to missing OpenAI config.");
    return null; // Stop if config is invalid/missing
  }

  logDebug('Calling OpenAI Chat Completions...'); // Avoid logging prompt unless debugging sensitive info

  // Defaults
  const systemMessage = options?.systemMessage || 'You are a helpful assistant.';
  const temperature = options?.temperature || 0.3;
  // Example: Check for response_format in options if needed later
  // const responseFormat = options?.response_format;

  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: config.chatModel, // Use config.chatModel
    temperature: temperature,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ]
  };
  // Add response_format if needed and passed in options
  // if (responseFormat) { payload.response_format = responseFormat; }


   const fetchOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${config.apiKey}` }, // Use config.apiKey
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // Prevent script termination on API errors
  };

  try {
    const response = UrlFetchApp.fetch(url, fetchOptions);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    // Use safeJsonParse (assuming it's globally available or defined elsewhere)
    const responseJson = safeJsonParse(responseBody);

    if (responseCode !== 200 || !responseJson || responseJson.error) { // Check if parsing failed too
      logDebug('OpenAI API error', {
        code: responseCode,
        error: responseJson?.error || 'Non-200 response or JSON parse error',
        response: responseBody // Log raw response on error
      });
      return null; // Indicate failure
    }

    // Add a check for expected structure before returning
    if (!responseJson.choices || !responseJson.choices[0] || !responseJson.choices[0].message) {
        logDebug('OpenAI response missing expected structure (choices[0].message)', { response: responseJson });
        return null; // Indicate failure due to unexpected structure
    }


    logDebug('OpenAI API call successful.');
    return responseJson; // Return the entire parsed response object

  } catch (e) {
    logDebug('Failed to call OpenAI API or parse response', { error: e.message });
    return null; // Indicate failure
  }
}

// Note: This file now relies on safeJsonParse. Ensure it's defined in Utils.gs.
