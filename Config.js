// Config.gs (Complete Structure)

/**
 * Central configuration for the Agentic CoS scripts.
 * Reads secrets and IDs from Script Properties.
 * Ensure all referenced Script Properties are set in Project Settings > Script properties.
 */
const cfg = {
  /**
   * Debug Flag: Set to true to enable detailed logging via logDebug.
   * Set to false for production runs to reduce log noise.
   */
  DEBUG: true,

  // --- Google Docs & Sheets ---
  /**
   * The ID of the Google Sheet used to store document chunk hashes.
   * Required Script Property: GOOGLE_SHEET_ID
   */
  GOOGLE_SHEET_ID: PropertiesService.getScriptProperties()
                     .getProperty('GOOGLE_SHEET_ID'),

  // --- OpenAI Configuration ---
  OPENAI: {
    /**
     * Your OpenAI API Key.
     * Required Script Property: OPENAI_API_KEY
     */
    API_KEY: PropertiesService.getScriptProperties()
               .getProperty('OPENAI_API_KEY'),
    /**
     * The chat completion model to use for summarization.
     * Required Script Property: OPENAI_MODEL
     * Example values: 'gpt-4o-mini', 'gpt-3.5-turbo'
     */
    MODEL:   PropertiesService.getScriptProperties()
               .getProperty('OPENAI_MODEL') || 'gpt-3.5-turbo', // Default fallback
    /**
     * The embedding model to use.
     * Required Script Property: OPENAI_EMBEDDING_MODEL
     * Example value: 'text-embedding-3-small'
     */
    EMBEDDING_MODEL: PropertiesService.getScriptProperties()
                       .getProperty('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small' // Default fallback
  },

  // --- Pinecone Configuration ---
  PINECONE: {
    /**
     * Your Pinecone API Key.
     * Required Script Property: PINECONE_API_KEY
     */
    API_KEY:    PropertiesService.getScriptProperties()
                  .getProperty('PINECONE_API_KEY'),
    /**
     * Your Pinecone index host URL (e.g., "your-index-xxxxxx.svc.environment.pinecone.io").
     * Required Script Property: PINECONE_INDEX_HOST
     */
    INDEX_HOST: PropertiesService.getScriptProperties()
                  .getProperty('PINECONE_INDEX_HOST')
  },

  // --- Slack Configuration ---
  SLACK: {
    /**
     * Your Slack Bot User OAuth Token (starts with xoxb-).
     * Required Script Property: SLACK_BOT_TOKEN
     */
    BOT_TOKEN:   PropertiesService.getScriptProperties()
                   .getProperty('SLACK_BOT_TOKEN'),
    /**
     * Slack Incoming Webhook URL (if used by other parts, currently unused by main workflow).
     * Optional Script Property: SLACK_WEBHOOK_URL
     */
    WEBHOOK_URL: PropertiesService.getScriptProperties()
                   .getProperty('SLACK_WEBHOOK_URL'),
    /**
     * Specific Slack channel IDs.
     */
    CHANNELS: {
      /**
       * The channel ID where the nightly review summary should be posted.
       * Value is currently hardcoded but could be read from a property like SLACK_NIGHTLY_REVIEW_CHANNEL_ID.
       */
      NIGHTLY_REVIEW: 'C08PVGETDD2', // Hardcoded target channel
      /**
       * Example: General channel ID (if needed elsewhere).
       * Optional Script Property: SLACK_CHANNEL_GENERAL
       */
      GENERAL: PropertiesService.getScriptProperties()
                  .getProperty('SLACK_CHANNEL_GENERAL'),
      /**
       * Example: Updates channel ID (if needed elsewhere).
       * Optional Script Property: SLACK_CHANNEL_UPDATES
       */
      UPDATES: PropertiesService.getScriptProperties()
                  .getProperty('SLACK_CHANNEL_UPDATES')
    }
  },

  // --- Miscellaneous ---
  /**
   * Email address for sending error alerts or digests.
   * Optional Script Property: ALERT_EMAIL
   */
  ALERT_EMAIL: PropertiesService.getScriptProperties()
                  .getProperty('ALERT_EMAIL'),

  /**
   * List of Google Doc IDs to process (Currently unused as workflow focuses on single doc).
   * Reads comma-separated list from Script Property DOC_IDS.
   */
  DOC_IDS: (PropertiesService.getScriptProperties()
             .getProperty('DOC_IDS') || '') // Default to empty string if property missing
             .split(',')
             .map(s => s.trim()) // Trim whitespace
             .filter(Boolean) // Remove empty strings resulting from split
};

// --- Optional: Log loaded config on script start (if DEBUG is true) ---
// Note: This log might run before logDebug's internal check confirms cfg.DEBUG,
// so it might not appear reliably unless placed inside a function called later.
/*
if (cfg.DEBUG) {
  console.log("Configuration Loaded:", JSON.stringify(cfg, (key, value) => {
    // Basic redaction for logging config - improve if needed
    if (key && (key.includes('API_KEY') || key.includes('BOT_TOKEN'))) {
      return value ? '********' : value;
    }
    return value;
  }, 2));
}
*/
