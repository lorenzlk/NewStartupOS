// Utils.gs (Final Debug Version)

/**
 * Logs messages if cfg.DEBUG is true. Includes internal check logging.
 * @param {string} message The message to log.
 * @param {any} [payload] Optional payload (object, array, etc.) to log as JSON.
 */
function logDebug(message, payload) {
  try {
    // --- Internal Check ---
    let shouldLog = false;
    // Check if cfg exists and cfg.DEBUG is explicitly true
    if (typeof cfg !== 'undefined' && cfg && cfg.DEBUG === true) {
        shouldLog = true;
    }
    // Log whether the check passed, using direct console.log
    // Limit message length in this internal check log
    const messagePreview = typeof message === 'string' ? message.slice(0, 50) + '...' : '(Non-string message)';
    console.log(`[logDebug Internal Check] Should log '${messagePreview}'? ${shouldLog}. (cfg.DEBUG is: ${cfg?.DEBUG})`);
    // --- End Internal Check ---

    if (shouldLog) { // Use the checked value
      console.log(message); // Log the actual message
      if (payload !== undefined) {
        // Use null, 2 for pretty printing JSON
        console.log(JSON.stringify(payload, null, 2));
      }
    }
  } catch (e) {
    // Log config loading error only once or handle gracefully
    console.error("[logDebug Error] Error inside logDebug function:", e);
  }
}

/**
 * Calculates the SHA-256 hash of a string.
 * @param {string} text The string to hash.
 * @return {string} The hex representation of the SHA-256 hash.
 */
function hashContent(text) {
  // Ensure input is a string
  const inputText = (typeof text === 'string') ? text : JSON.stringify(text); // Handle non-strings defensively
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, inputText);
  const hash = digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  // Use the centralized logDebug (which now has internal check)
  logDebug('Hashed content', { inputSample: inputText ? inputText.slice(0, 50) + '...' : '', hash });
  return hash;
}

/**
 * Safely parse JSON, returning {} on failure. Includes logging.
 * Moved here for general utility.
 * @param {string} str The JSON string to parse.
 * @return {object} The parsed object or {} on error.
 */
function safeJsonParse(str) {
  try {
    if (!str || typeof str !== 'string') { // Check if input is a non-empty string
         // logDebug('⚠️ safeJsonParse received non-string or empty input', { inputType: typeof str });
         return {};
    }
    return JSON.parse(str);
  } catch (e) {
    // Use logDebug (which now has internal check)
    logDebug('⚠️ Failed to parse JSON response', { error: e.message, inputStart: str.slice(0, 100) + '...' });
    return {}; // Return empty object on parsing error
  }
}
