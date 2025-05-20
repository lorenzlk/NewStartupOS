// Summarize.gs (Optimized Prompt & Enhanced Logging)
// Depends on: Utils.gs, sheets.gs, openai.gs, Pinecone.gs, EmbeddingDiff.gs, Config.gs

/**
 * Summarizes only the new or changed H1-chunks in the given Document ID.
 * Includes enhanced logging for debugging change detection.
 * Retrieves/stores hashes via functions in sheets.gs.
 * Retrieves/stores embeddings via functions in Pinecone.gs.
 * Calls utility functions from Utils.gs.
 * Calls OpenAI via functions in openai.gs.
 *
 * @param {string} docId The Google Document ID.
 * @return {Array<object>} An array of objects { title, summary, actions } for changed chunks.
 */
function summarizeDocWithDelta(docId) {
  // Uses logDebug from Utils.gs
  logDebug(`[Doc Sum] Starting summarization for doc ${docId}`); // Add prefix for clarity

  let doc;
  try {
     doc = DocumentApp.openById(docId);
  } catch (e) {
     logDebug(`[Doc Sum] ❌ ERROR: Failed to open document ID: ${docId}`, { error: e.message });
     return []; // Return empty array if doc cannot be opened
  }
  // Uses local helper extractChunksFromDoc
  const chunks = extractChunksFromDoc(doc); // Use version with list item fix

  // Uses loadPriorHashes from sheets.gs
  const priorHashes = loadPriorHashes(docId);
  logDebug('[Doc Sum] Loaded Prior Hashes:', priorHashes); // Log loaded hashes

  const results = [];
  const currentHashes = {}; // Store current hashes to save later

  logDebug(`[Doc Sum] Processing ${chunks.length} chunks for doc ${docId}`);

  for (const chunk of chunks) {
    logDebug(`[Doc Sum] --- Processing Chunk: "${chunk.title}" ---`);
    // Uses hashContent from Utils.gs
    const currentHash = hashContent(chunk.content);
    currentHashes[chunk.title] = currentHash; // Track current hash
    const priorHash = priorHashes[chunk.title];
    logDebug(`[Doc Sum]   Prior Hash: ${priorHash || 'N/A'} | Current Hash: ${currentHash}`);

    // --- Change Detection: Hash ---
    if (priorHash && priorHash === currentHash) {
      logDebug(`[Doc Sum]   Decision: Skipping chunk (hash match).`);
      continue; // Skip to next chunk
    }
    logDebug(`[Doc Sum]   Hash Check: Chunk is new or hash differs.`);

    // --- Change Detection: Embedding (only if hash changed and prior hash existed) ---
    let processChunk = true; // Assume we process unless embeddings are too similar
    let newEmbedding; // Define here to use later

    if (priorHash && priorHash !== currentHash) { // Only compare embeddings if hash changed
        logDebug(`[Doc Sum]   Checking embedding similarity as hash changed...`);
        // Uses getEmbedding from openai.gs
        newEmbedding = getEmbedding(chunk.content);
        if (!newEmbedding) {
            logDebug(`[Doc Sum]   Decision: Skipping chunk (failed to get new embedding).`);
            continue; // Skip if embedding failed
        }
        logDebug(`[Doc Sum]   Got new embedding.`);

        // Uses loadPriorEmbedding from Pinecone.gs - PASS PRIOR HASH AS ID
        const priorEmbedding = loadPriorEmbedding(docId, priorHash);
        if (priorEmbedding) {
            logDebug(`[Doc Sum]   Got prior embedding.`);
            // Uses embeddingsAreMeaningfullyDifferent from EmbeddingDiff.gs
            const areDifferent = embeddingsAreMeaningfullyDifferent(newEmbedding, priorEmbedding);
            logDebug(`[Doc Sum]   Embeddings meaningfully different? ${areDifferent}`);
            if (!areDifferent) {
              logDebug(`[Doc Sum]   Decision: Skipping chunk (embeddings too similar).`);
              processChunk = false;
              // Note: We are NOT updating Pinecone here if only similarity check fails
            } else {
                logDebug(`[Doc Sum]   Embeddings different, proceeding.`);
                // Uses upsertEmbedding from Pinecone.gs - Update Pinecone with new embedding
                upsertEmbedding(docId, chunk, newEmbedding);
            }
        } else {
            logDebug(`[Doc Sum]   No prior embedding found (or fetch failed), processing as changed.`);
             // Uses upsertEmbedding from Pinecone.gs - Upsert the new embedding
            upsertEmbedding(docId, chunk, newEmbedding);
        }
    } else if (!priorHash) {
        // New chunk (no prior hash)
        logDebug(`[Doc Sum]   Processing as new chunk (no prior hash).`);
         // Uses getEmbedding from openai.gs
        newEmbedding = getEmbedding(chunk.content);
        if (!newEmbedding) {
            logDebug(`[Doc Sum]   Decision: Skipping new chunk (failed to get embedding).`);
            continue;
        }
         // Uses upsertEmbedding from Pinecone.gs - Upsert the new embedding
        upsertEmbedding(docId, chunk, newEmbedding);
    } else {
        // This case shouldn't happen if hash matched, but log just in case
        logDebug(`[Doc Sum]   Unexpected state: Prior hash exists but matched current hash? Skipping summary.`);
        processChunk = false;
    }

    // --- Summarization (only if processChunk is true) ---
    if (processChunk) {
        logDebug(`[Doc Sum]   Decision: Proceeding to summarize chunk "${chunk.title}".`);
        // Ensure we have the embedding for RAG context query
        // Use the newEmbedding calculated earlier if available, otherwise fetch again
        const embeddingForRAG = newEmbedding || getEmbedding(chunk.content);
        let contextChunks = '';
        if (embeddingForRAG) {
            // Uses querySimilarChunks from Pinecone.gs - PASS docId
            contextChunks = querySimilarChunks(docId, embeddingForRAG);
            logDebug(`[Doc Sum]   Retrieved RAG context: ${contextChunks || 'None'}`);
        } else {
            logDebug("[Doc Sum]   Could not get embedding for RAG query.");
        }

        // *** Uses the OPTIMIZED buildSummarizationPrompt (local helper) ***
        const prompt = buildSummarizationPrompt(chunk.content, contextChunks);
        logDebug(`[Doc Sum]   Built summarization prompt for "${chunk.title}".`); // Avoid logging full prompt

        // Uses callOpenAI from openai.gs
        const aiResponse = callOpenAI(prompt, {
          // System message could be simpler here as prompt is detailed
          systemMessage: 'You are an assistant summarizing document sections.'
        });
        logDebug(`[Doc Sum]   Received AI response object for "${chunk.title}":`, aiResponse ? 'Object received' : 'NULL');

        let summary = 'Error: Failed to get summary from AI.';
        let actions = 'No action items (AI error).';

        if (aiResponse?.choices?.[0]?.message?.content) {
          const aiTextContent = aiResponse.choices[0].message.content;
          logDebug(`[Doc Sum]   Raw AI text content received for "${chunk.title}". Length: ${aiTextContent.length}`);
          // Uses local helper parseAIResponse
          const parsed = parseAIResponse(aiTextContent);
          summary = parsed.summary;
          actions = parsed.actions;
          logDebug(`[Doc Sum]   Successfully parsed AI response for "${chunk.title}".`);
        } else {
          logDebug(`[Doc Sum]   ❌ Failed to get valid AI response content for chunk: "${chunk.title}"`);
        }
        results.push({ title: chunk.title, summary, actions });
    } // End if(processChunk)

    logDebug(`[Doc Sum] --- Finished Chunk: "${chunk.title}" ---`);
  } // End chunk loop

  logDebug(`[Doc Sum] Saving ${Object.keys(currentHashes).length} current hashes to Sheet...`);
  // Uses saveHashes from sheets.gs
  saveHashes(docId, currentHashes);

  logDebug(`[Doc Sum] Completed summarization for doc ${docId}`, { summariesGenerated: results.length });
  return results;
}


/**
 * Breaks a Google Document into chunks based on H1 headings.
 * Includes H2 headings (prefixed with '## ') and paragraph text within each chunk.
 * Correctly handles list items.
 *
 * @param {GoogleAppsScript.Document.Document} doc The Document object.
 * @return {Array<object>} An array of objects { title: string, content: string }.
 */
function extractChunksFromDoc(doc) {
  const paras = doc.getBody().getParagraphs();
  // Debug: Log each paragraph's text and heading type
  paras.forEach(para => {
    Logger.log(`"${para.getText()}" - Heading: ${para.getHeading()}`);
  });
  const paras = doc.getBody().getParagraphs();
  const chunks = [];
  let currentH1 = null;
  let currentH1Obj = null;
  let currentH2 = null;
  let currentSection = null;

  logDebug(`[Doc Extract] Extracting chunks from document: ${doc.getName()}`);

  paras.forEach((p, index) => {
    let txt = '';
    let isListItem = false;
    try {
      const elementType = p.getType();
      if (elementType === DocumentApp.ElementType.PARAGRAPH) {
        txt = p.asText().getText().trim();
      } else if (elementType === DocumentApp.ElementType.LIST_ITEM) {
        isListItem = true;
        const glyph = (typeof p.getGlyphType === 'function' && p.getGlyphType()) ? '* ' : '- ';
        txt = glyph + p.asText().getText().trim();
      }
    } catch (e) {
      logDebug(`[Doc Extract] Warning: Could not get text from element ${index + 1}`, { error: e.message, type: p.getType() });
      return;
    }
    if (!txt) {
      return;
    }
    const style = p.getHeading();
    if (style === DocumentApp.ParagraphHeading.HEADING1) {
      // Save previous H1 chunk
      if (currentH1Obj) {
        // Save last section if exists
        if (currentSection) {
          currentH1Obj.sections.push(currentSection);
        }
        chunks.push(currentH1Obj);
        logDebug(`[Doc Extract] Completed chunk: ${currentH1Obj.h1}`);
      }
      // Start new H1 chunk
      currentH1 = txt;
      currentH1Obj = { h1: currentH1, sections: [] };
      currentH2 = null;
      currentSection = null;
      logDebug(`[Doc Extract] Started new chunk: ${currentH1}`);
    } else if (style === DocumentApp.ParagraphHeading.HEADING2) {
      if (currentH1Obj) {
        // Save previous section if exists
        if (currentSection) {
          currentH1Obj.sections.push(currentSection);
        }
        currentH2 = txt;
        currentSection = { h2: currentH2, content: '' };
      } else {
        logDebug(`[Doc Extract] Skipping H2 found before first H1: ${txt}`);
      }
    } else {
      // Normal text or list
      if (currentH1Obj) {
        if (!currentSection) {
          // If we have text under H1 with no H2, create an 'Uncategorized' section
          currentSection = { h2: 'Uncategorized', content: '' };
        }
        currentSection.content += txt + '\n\n';
      } else {
        logDebug(`[Doc Extract] Skipping text found before first H1: "${txt.slice(0,50)}..."`);
      }
    }
  });
  // Save the last H1 chunk
  if (currentH1Obj) {
    if (currentSection) {
      currentH1Obj.sections.push(currentSection);
    }
    chunks.push(currentH1Obj);
    logDebug(`[Doc Extract] Completed final chunk: ${currentH1Obj.h1}`);
  }
  logDebug('[Doc Extract] Finished extracting document chunks', { count: chunks.length, titles: chunks.map(c=>c.h1) });
  return chunks;
}

/**
 * TEST FUNCTION: Simulates a document structure and logs the output of extractChunksFromDoc.
 * Run this in the Apps Script editor to verify extraction logic.
 */
function summarizeAllSectionsInDoc(docId) {
  logDebug(`[Doc Sum] Starting full-section summarization for doc ${docId}`);
  let doc;
  try {
    doc = DocumentApp.openById(docId);
  } catch (e) {
    logDebug(`[Doc Sum] ERROR: Failed to open doc ${docId}: ${e.message}`);
    return;
  }
  const chunks = extractChunksFromDoc(doc);
  chunks.forEach(day => {
    day.sections.forEach(section => {
      // Call the summarizer (replace with your real summarizer)
      const summary = summarizeSection(day.h1, section.h2, section.content);
      logDebug(`[SUMMARY] Date: ${day.h1} | Section: ${section.h2}\nSummary: ${summary}`);
    });
  });
}

// Placeholder summarizer function. Replace with your real summarization logic.
function summarizeSection(h1, h2, content) {
  // For now, just return the first 100 chars as a 'summary'
  return content.slice(0, 100) + (content.length > 100 ? '...' : '');
}

function testExtractChunksFromDoc() {
  // Mock Paragraph class
  function MockParagraph(text, heading, type) {
    this.text = text;
    this.heading = heading;
    this.type = type || DocumentApp.ElementType.PARAGRAPH;
    this.asText = function() { return { getText: () => this.text }; };
    this.getHeading = () => this.heading;
    this.getType = () => this.type;
    this.getGlyphType = () => null;
  }

  // Simulate paragraphs in the doc
  var mockParas = [
    new MockParagraph('May 7, 2025', DocumentApp.ParagraphHeading.HEADING1),
    new MockParagraph('Offline Venture Studio', DocumentApp.ParagraphHeading.HEADING2),
    new MockParagraph('Email from Elliott Easterling to Mariya at Offline ventures. Potential advisory job.'),
    new MockParagraph('Mariya,\n\nI chatted with Logan today and he is interested in the Customer Success advisor role that we laid out. Logan is a former Bonboner who really gets the pub tech space. He is advising a company on building a Chief of Staff AI Agent in place for startup founders, so I think that he would be a good fit. He may also be good for other studio projects as he is a media maven.\n\nWho is the right person for him to chat with at the studio next? I have not had any conversations with him on comp as of yet.'),
    new MockParagraph('Thunder Compute', DocumentApp.ParagraphHeading.HEADING2),
    new MockParagraph('April 2025 Updates: Hiring and Product (continued)'),
    new MockParagraph('We have a growing number of returning ‘power users.’ ...'),
    new MockParagraph('Logan’s response: Thanks for the update as always. Seems like a new baseline has been set! ...'),
    new MockParagraph('Carl’s response: Thank you Logan :) It has been a journey, it feels great to see some early signs of traction.'),
    new MockParagraph('May 19, 2025', DocumentApp.ParagraphHeading.HEADING1),
    new MockParagraph('Mula', DocumentApp.ParagraphHeading.HEADING2),
    new MockParagraph('Started work on PRD for CS co-pilot. Not sure how much we’ll be able to accomplish in 2 months and the time is probably better spent on identifying the signals for PMF and drilling down on ICP + TTV (time to value).'),
  ];

  // Mock Document object
  var mockDoc = {
    getBody: function() {
      return {
        getParagraphs: function() { return mockParas; }
      };
    },
    getName: function() { return 'Mock Test Document'; }
  };

  var result = extractChunksFromDoc(mockDoc);
  logDebug('[TEST] extractChunksFromDoc output:', JSON.stringify(result, null, 2));
  // For Apps Script: Logger.log(JSON.stringify(result, null, 2));

  // --- Example: How to use the nested structure for summarization ---
  // result.forEach(day => {
  //   day.sections.forEach(section => {
  //     // Call your summarization logic here
  //     // e.g., summarizeSection(section.h2, section.content);
  //   });
  // });
}


function buildSummarizationPrompt(content, context) {
  const contextString = context || 'None provided.';
  return `
1. Review the "New Content" and the "Relevant Context" below, which may include historical summaries or prior discussions from Pinecone.
2. Identify and explicitly connect ongoing threads, unresolved issues, or recurring themes. If any previous action items are now resolved or still pending, mention their status.
3. Prioritize and summarize the most important decisions, blockers, or new directions. Group related updates under themes or projects when possible.
4. When referencing a channel or thread, include the channel name or a citation for traceability.
5. List all current and outstanding action items, marking any carried over from previous context as "Still Pending".

Respond in exactly three labeled sections:

Summary of Changes (with Context and Progress):
- [Concise, prioritized summary connecting new information to historical context, highlighting progress, blockers, and ongoing themes]

Outstanding Action Items:
- [Pending action item 1 (Owner: X, Deadline: Y, Still Pending)]
- [Pending action item 2]
- (Mark as "Still Pending" if carried over from previous summaries)

New Action Items:
- [New action item 1 (Owner: X, Deadline: Y)]
- [New action item 2]
- (Use "No new action items." if none are present)

---
Relevant Context (from Pinecone, including prior summaries or discussions):
${contextString}
---
New Content:
${content}
---
`.trim();
}

/**
 * Parses the raw text response from OpenAI (expected to follow the format
 * requested by buildSummarizationPrompt) into a structured object.
 *
 * @param {string} text The raw text response from the AI.
 * @return {object} An object { summary: string, actions: string }.
 */
function parseAIResponse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    logDebug('[Parse AI] parseAIResponse received invalid input', { input: text });
    return { summary: 'Error: Invalid AI response.', actions: 'No action items.' };
  }

  const lines = text.split('\n');
  let mode = 'summary'; // Start by collecting summary lines
  const summaryLines = [];
  const actionLines = [];

  const summaryHeaderRegex = /summary of changes:/i;
  const actionHeaderRegex = /action items?:/i; // Match "Action Item:" or "Action Items:"

  for (let line of lines) {
    const trimmedLine = line.trim();

    // Detect headers to switch mode
    if (actionHeaderRegex.test(trimmedLine)) {
      mode = 'actions';
      continue; // Skip the header line itself
    }
    // Also check for summary header in case AI response starts differently, but stay in summary mode if found
    if (summaryHeaderRegex.test(trimmedLine)) {
      mode = 'summary';
      continue; // Skip the header line itself
    }

    // Add non-empty lines to the current mode's collection
    if (trimmedLine) {
      // Keep original formatting including list markers like '-' or '*'
      const cleanLine = trimmedLine;
      if (cleanLine) { // Add only if line has content after trimming
          if (mode === 'summary') {
              summaryLines.push(cleanLine);
          } else { // mode === 'actions'
              actionLines.push(cleanLine);
          }
      }
    }
  }

  // Join lines and provide defaults
  let summary = summaryLines.join('\n').trim();
  let actions = actionLines.join('\n').trim();

  if (!summary) {
      summary = 'No summary provided.';
      logDebug("[Parse AI] AI response parsing resulted in empty summary.", { rawText: text.slice(0, 100) + '...' });
  }
  // Check for explicit "No action items." variants from AI or if empty
  if (!actions || /no action items?\.?/i.test(actions)) {
      actions = 'No action items.';
  } else {
      // Optional: Clean up common AI phrases if needed
      // actions = actions.replace(/^Here are the action items:\s*/i, '').trim();
  }

  logDebug("[Parse AI] Parsed summary and actions.", { summaryLength: summary.length, actionsLength: actions.length });
  return { summary, actions };
}
