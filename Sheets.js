// sheets.gs (Updated Logging)
// Depends on: Config.gs, Utils.gs

/**
 * Loads prior chunk hashes for a specific docId from the 'Hashes' sheet.
 * @param {string} docId The ID of the document.
 * @return {object} A map where keys are chunk titles and values are hashes.
 */
function loadPriorHashes(docId) {
  // Uses logDebug from Utils.gs
  logDebug(`[Sheets] Loading prior hashes for doc ${docId}`);
  try {
      const ssId = cfg?.GOOGLE_SHEET_ID;
      if (!ssId) { logDebug("❌ ERROR: cfg.GOOGLE_SHEET_ID not configured."); return {}; }
      const ss = SpreadsheetApp.openById(ssId);
      const sheet = ss.getSheetByName('Hashes');
      if (!sheet) {
          logDebug("❌ ERROR: 'Hashes' sheet not found in Spreadsheet ID:", ssId);
          return {};
      }
      const rows = sheet.getDataRange().getValues();
      const hashes = {};

      rows.forEach((row, idx) => {
        // Check row length to prevent errors, assume headers exist (idx > 0)
        if (idx > 0 && row && row.length >= 3 && row[0] === docId) {
          const chunkTitle = row[1]; // Column B: ChunkTitle
          const hashValue = row[2]; // Column C: ContentHash
          if (chunkTitle) { // Ensure title exists
             hashes[chunkTitle] = hashValue;
          }
        }
      });

      logDebug(`[Sheets] Loaded ${Object.keys(hashes).length} prior hashes for doc ${docId}`);
      return hashes;
  } catch (e) {
      logDebug(`❌ ERROR loading prior hashes for doc ${docId}`, { error: e.message });
      return {}; // Return empty object on error
  }
}

/**
 * Saves the current chunk hashes for a specific docId to the 'Hashes' sheet.
 * Overwrites previous entries for this docId.
 * @param {string} docId The ID of the document.
 * @param {object} currentHashesMap A map where keys are chunk titles and values are current hashes.
 */
function saveHashes(docId, currentHashesMap) {
  // Uses logDebug from Utils.gs
  logDebug(`[Sheets] Saving current hashes for doc ${docId}`);
  try {
      const ssId = cfg?.GOOGLE_SHEET_ID;
       if (!ssId) { logDebug("❌ ERROR: cfg.GOOGLE_SHEET_ID not configured."); return; }
      const ss = SpreadsheetApp.openById(ssId);
      const sheet = ss.getSheetByName('Hashes');
       if (!sheet) {
          logDebug("❌ ERROR: 'Hashes' sheet not found in Spreadsheet ID:", ssId);
          // Optionally create the sheet? For now, just return.
          // sheet = ss.insertSheet('Hashes');
          // sheet.appendRow(['DocID', 'ChunkTitle', 'ContentHash', 'Timestamp']);
          return;
      }

      const headers = ['DocID', 'ChunkTitle', 'ContentHash', 'Timestamp']; // Define expected headers
      let existingData = [];
      try {
           existingData = sheet.getDataRange().getValues();
           if (existingData.length === 0) { // Handle empty sheet case
               logDebug("[Sheets] 'Hashes' sheet is empty, adding headers.");
               sheet.appendRow(headers);
               existingData = [headers];
           }
      } catch(e) {
           logDebug("[Sheets] Could not get data range, assuming sheet is empty.", e.message);
           // If sheet is empty, ensure headers are written
           if (sheet.getLastRow() === 0) {
               sheet.appendRow(headers);
               existingData = [headers]; // Start with headers
           } else {
               throw e; // Rethrow if it's another error
           }
      }


      // Filter out old rows for this docId, keep header and other docs' rows
      const newData = existingData.filter((row, idx) => {
           // Ensure row exists and has at least one element for comparison
           return idx === 0 || !row || row.length === 0 || row[0] !== docId;
      });
      logDebug(`[Sheets] Filtered existing data. Kept ${newData.length} rows (excluding old rows for ${docId}).`);


      // Prepare new rows for the current document
      const timestamp = new Date().toISOString();
      const rowsToAppend = Object.keys(currentHashesMap).map(chunkTitle => [
        docId,
        chunkTitle,
        currentHashesMap[chunkTitle], // The current hash
        timestamp
      ]);
      logDebug(`[Sheets] Prepared ${rowsToAppend.length} new rows to append for doc ${docId}.`);


      // Clear the sheet and write back filtered data + headers
      sheet.clearContents();
      if (newData.length > 0) {
          // Ensure the range matches the dimensions of newData
          const numRows = newData.length;
          // Find max columns needed, default to headers length
          const numCols = newData[0] ? newData[0].length : headers.length;
          sheet.getRange(1, 1, numRows, numCols).setValues(newData);
          logDebug(`[Sheets] Wrote back ${numRows} rows of filtered data.`);
      } else {
          // If newData is empty (e.g., sheet only had data for this docId), write headers
           sheet.appendRow(headers);
           logDebug(`[Sheets] Wrote headers as sheet was empty after filtering.`);
      }


      // Append the new rows for the current document
      if (rowsToAppend.length > 0) {
          sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
          logDebug(`[Sheets] Saved ${rowsToAppend.length} current hashes for doc ${docId}`);
      } else {
          logDebug(`[Sheets] No current hashes to save for doc ${docId}`);
      }

  } catch (e) {
      logDebug(`❌ ERROR saving hashes for doc ${docId}`, { error: e.message, stack: e.stack });
      // Consider implications of failing to save hashes - next run might re-process unchanged chunks
  }
}
