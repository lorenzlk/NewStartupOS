// ===== DEBUG: Only one definition should exist below =====
function getEmailSummaryForLast24Hours() {
  Logger.log('=== ENTERED getEmailSummaryForLast24Hours ===');
  Logger.log('getEmailSummaryForLast24Hours: Function started');
  const scriptProperties = PropertiesService.getScriptProperties();
  const OPENAI_API_KEY = scriptProperties.getProperty('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    Logger.log('getEmailSummaryForLast24Hours: No OpenAI API key found.');
    Logger.log('Returning from getEmailSummaryForLast24Hours:', 'No OpenAI API key found.');
    return 'No OpenAI API key found.';
  }

  const now = new Date();
  Logger.log('getEmailSummaryForLast24Hours: now (ISO): ' + now.toISOString());
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  Logger.log('getEmailSummaryForLast24Hours: yesterday (ISO): ' + yesterday.toISOString());
  const formattedYesterday = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  Logger.log('getEmailSummaryForLast24Hours: formattedYesterday for Gmail search (date only): ' + formattedYesterday);
  const searchQuery = `after:${formattedYesterday}`;
  Logger.log('getEmailSummaryForLast24Hours: Gmail search query: ' + searchQuery);
  const threads = GmailApp.search(searchQuery);
  let emailContents = [];
  // Calculate the 24-hour window using the provided current time (2025-05-09T15:05:51-07:00)
  const nowFixed = new Date('2025-05-09T15:05:51-07:00');
  const twentyFourHoursAgo = new Date(nowFixed.getTime() - 24 * 60 * 60 * 1000);
  Logger.log(`getEmailSummaryForLast24Hours: Filtering emails between ${twentyFourHoursAgo.toISOString()} and ${nowFixed.toISOString()}`);

  let filteredEmailContents = [];
  let totalEmails = 0;
  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      totalEmails++;
      const msgDate = msg.getDate();
      const emailInfo = {
        subject: msg.getSubject(),
        from: msg.getFrom(),
        date: msgDate,
        body: msg.getPlainBody().substring(0, 300) // limit body to 300 chars
      };
      if (msgDate >= twentyFourHoursAgo && msgDate <= nowFixed) {
        filteredEmailContents.push(emailInfo);
        Logger.log(`INCLUDED: [${msgDate.toISOString()}] ${emailInfo.subject}`);
      } else {
        Logger.log(`EXCLUDED: [${msgDate.toISOString()}] ${emailInfo.subject}`);
      }
    });
  });
  Logger.log(`getEmailSummaryForLast24Hours: Total emails processed: ${totalEmails}`);
  Logger.log(`getEmailSummaryForLast24Hours: Emails included in last 24 hours: ${filteredEmailContents.length}`);
  if (filteredEmailContents.length > 0) {
    Logger.log(`getEmailSummaryForLast24Hours: First included email subject: ${filteredEmailContents[0].subject}`);
  }
  if (filteredEmailContents.length === 0) {
    Logger.log('getEmailSummaryForLast24Hours: No emails found in last 24 hours.');
    return 'No emails found in the past 24 hours.';
  }

  // Sort emails by date descending and take the 20 most recent
  filteredEmailContents.sort((a, b) => b.date - a.date);
  emailContents = filteredEmailContents.slice(0, 20);

  const prompt = `\nYou are an assistant that summarizes email activity and extracts action items.\nEmails:\n${JSON.stringify(emailContents, null, 2)}\n\nRespond in JSON exactly as:\n{\n  "summary": "...",\n  "actions": "..."\n}\n`.trim();
  Logger.log('getEmailSummaryForLast24Hours: Sending prompt to OpenAI:', prompt);

  try {
    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      payload: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{role: 'user', content: prompt}],
        max_tokens: 500
      })
    });
    Logger.log('getEmailSummaryForLast24Hours: OpenAI API call completed.');
    const aiResp = JSON.parse(response.getContentText());
    let aiContent = '';
    if (aiResp.choices && aiResp.choices[0] && aiResp.choices[0].message) {
      aiContent = aiResp.choices[0].message.content;
    } else if (aiResp.content) {
      aiContent = aiResp.content;
    }
    Logger.log('getEmailSummaryForLast24Hours: OpenAI response:', aiContent);
    try {
      const parsed = JSON.parse(aiContent);
      Logger.log('getEmailSummaryForLast24Hours: Parsed summary:', parsed);
      Logger.log('Returning from getEmailSummaryForLast24Hours:', `<b>Summary:</b> ${parsed.summary}<br><b>Actions:</b> ${parsed.actions}`);
      return `<b>Summary:</b> ${parsed.summary}<br><b>Actions:</b> ${parsed.actions}`;
    } catch (e) {
      Logger.log('getEmailSummaryForLast24Hours: Failed to parse OpenAI output as JSON:', e);
      Logger.log('Returning from getEmailSummaryForLast24Hours:', aiContent);
      return aiContent;
    }
  } catch (e) {
    Logger.log('getEmailSummaryForLast24Hours: Error during OpenAI call:', e);
    Logger.log('Returning from getEmailSummaryForLast24Hours:', `Error summarizing emails: ${e.message}`);
    return `Error summarizing emails: ${e.message}`;
  }
}

function sendSummaryDigestToEmail(docSummaries, slackDigest) {
  Logger.log('=== TOP OF sendSummaryDigestToEmail ===');
  const recipient = Session.getEffectiveUser().getEmail();
  let body = '<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7;">';

  // --- Document Summaries ---
  body += '<h2 style="margin-top: 0;">📄 Document Summaries</h2>';
  if (docSummaries && docSummaries.length > 0) {
    docSummaries.forEach(s => {
      body += `<div style="margin-bottom: 18px;"><strong>${s.title}</strong><br>`;
      body += `<div style="margin-left: 10px;">${s.summary}</div>`;
      if (s.actions) {
        // Split actions into lines and bullet them
        const actionsList = s.actions.split(/\n|\r/).filter(Boolean).map(item => `<li>${item.trim()}</li>`).join('');
        body += `<br><span style="color: #1a73e8;"><b>Action Items:</b></span><ul style="margin: 6px 0 10px 20px;">${actionsList}</ul>`;
      }
      body += '</div>';
    });
  } else {
    body += '<div style="color: #888; margin-bottom: 18px;">No document changes detected.</div>';
  }

  body += '<hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 24px 0;">';

  // --- Slack Summary ---
  body += '<h2>💬 Slack Summary</h2>';
  body += `<div style="margin-bottom: 10px;">${slackDigest.summary}</div>`;
  if (slackDigest.actions) {
    const slackActionsList = slackDigest.actions.split(/\n|\r/).filter(Boolean).map(item => `<li>${item.trim()}</li>`).join('');
    body += `<div style="color: #1a73e8;"><b>Action Items:</b><ul style="margin: 6px 0 10px 20px;">${slackActionsList}</ul></div>`;
  }

  body += '<hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 24px 0;">';

  // --- Email Summary ---
  body += '<h2>📬 Email Activity Summary <span style="font-size: 0.8em; color: #888;">(Past 24 Hours)</span></h2>';
  let emailSummary;
  try {
    emailSummary = getEmailSummaryForLast24Hours();
    // If the result is in the expected <b>Summary:</b> ... <br><b>Actions:</b> ... format, convert actions to a bulleted list
    if (typeof emailSummary === 'string' && emailSummary.match(/<b>Summary:<\/b>/) && emailSummary.match(/<br><b>Actions:<\/b>/)) {
      const summaryMatch = emailSummary.match(/<b>Summary:<\/b>\s*([^<]*)/);
      const actionsMatch = emailSummary.match(/<b>Actions:<\/b>\s*([^<]*)/);
      const summaryText = summaryMatch ? summaryMatch[1].trim() : '';
      let actionsText = actionsMatch ? actionsMatch[1].trim() : '';
      let actionsHtml = '';
      if (actionsText) {
        // Split on numbered or bulleted items, or newlines
        const actionsArr = actionsText.split(/\n|\r|\d+\.\s|•\s|\u2022\s|\-/).filter(Boolean).map(item => item.trim()).filter(Boolean);
        if (actionsArr.length > 0) {
          actionsHtml = '<ul style="margin: 6px 0 10px 20px;">' + actionsArr.map(a => `<li>${a}</li>`).join('') + '</ul>';
        } else {
          actionsHtml = `<div>${actionsText}</div>`;
        }
      }
      emailSummary = `<div style="margin-bottom: 8px;"><b>Summary:</b> ${summaryText}</div>` + (actionsHtml ? `<div style="color: #1a73e8;"><b>Actions:</b>${actionsHtml}</div>` : '');
    }
  } catch (e) {
    Logger.log('sendSummaryDigestToEmail: Error in getEmailSummaryForLast24Hours:', e);
    emailSummary = `<span style="color: red;">Error summarizing emails: ${e.message}</span>`;
  }
  body += `<div>${emailSummary}</div>`;

  body += '</div>';

  Logger.log('sendSummaryDigestToEmail: Final email body:', body);

  MailApp.sendEmail({
    to: recipient,
    subject: '🌙 Nightly Review',
    htmlBody: body
  });
}

// === main.gs ===

/**
 * Entry point for your nightly review.
 */
function runNightlyReview() {
  logDebug('Starting nightly review');

  // 1) Summarize Docs with delta
  const docIds = getRegisteredDocs();
  logDebug('Documents to process:', docIds);
  const docSummaries = docIds.flatMap(id => summarizeDocWithDelta(id));
  logDebug('Document summaries:', docSummaries);

  // 2) Fetch raw Slack messages from all channels
  const rawMessages = fetchAllSlackMessagesForToday();
  logDebug('Fetched Slack messages:', rawMessages);

  // 3) Summarize Slack activity
  const slackDigest = summarizeSlackActivity(rawMessages);
  logDebug('Slack digest:', slackDigest);

  // 4) Send combined digest to Slack + email
  sendSummaryToSlackChannel(docSummaries, slackDigest, 'C08PVGETDD2');
  Logger.log('=== ABOUT TO CALL sendSummaryDigestToEmail ===');
  sendSummaryDigestToEmail(docSummaries, slackDigest);

  logDebug('Nightly review completed');
}

/**
 * Summarize an array of raw Slack messages via OpenAI.
 * Returns { summary: string, actions: string }.
 */
function summarizeSlackActivity(messages) {
  if (!messages || messages.length === 0) {
    return { summary: 'No Slack activity in the past 24 hours.', actions: '' };
  }

  // Build a human‑readable dump
  const dump = messages
    .map(m =>
      `[${m.channel} @ ${new Date(parseFloat(m.ts) * 1000).toLocaleString()}] ${m.text}`
    )
    .join('\n');

  // Prompt for the LLM
  const prompt = `
You are a helpful assistant. Here's a dump of all Slack messages across every public channel in the last 24 hours:

---
${dump}
---

Your job:
1. Provide a concise *summary* of the major discussions or events.
2. Extract any *action items* (assignments, follow-ups, decisions) implied by the messages.

Respond in JSON exactly as:
{
  "summary": "...",
  "actions": "..."
}
`.trim();

  // Call the LLM
  const aiResp = callOpenAI(prompt);
  logDebug('OpenAI raw response:', aiResp);

  // Pull out the content safely
  let aiContent = '';
  if (aiResp.choices && aiResp.choices[0] && aiResp.choices[0].message) {
    aiContent = aiResp.choices[0].message.content;
  } else if (aiResp.content) {
    aiContent = aiResp.content;
  }

  // Parse JSON or fall back to plain text
  try {
    const parsed = JSON.parse(aiContent);
    return {
      summary: parsed.summary || '',
      actions: parsed.actions || ''
    };
  } catch (e) {
    return { summary: aiContent.trim(), actions: '' };
  }
}

/**
 * Posts the combined document + Slack digest to a specific Slack channel.
 */
function sendSummaryToSlackChannel(docSummaries, slackDigest, channelId) {
  const blocks = [];

  // Document section
  if (docSummaries.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📄 Document Summaries*' }
    });
    docSummaries.forEach(s => {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${s.title}*\n${s.summary}` }
      });
      if (s.actions) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*Action Items:*\n${s.actions}` }
        });
      }
      blocks.push({ type: 'divider' });
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📄 Document Summaries*\n_No changes detected._' }
    });
    blocks.push({ type: 'divider' });
  }

  // Slack section
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*💬 Slack Summary*' }
  });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: slackDigest.summary }
  });
  if (slackDigest.actions) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Action Items:*\n${slackDigest.actions}` }
    });
  }

  const payload = {
    channel: channelId,
    blocks
  };

  // Mute HTTP exceptions so we can log the full response if it fails
  const resp = UrlFetchApp.fetch(cfg.SLACK.WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  logDebug('Slack webhook response:', resp.getContentText());
}

/**
 * Sends the same summary via email to the script owner.
 */


/**
 * Simple debug logger (only logs when DEBUG_LOGGING = 'true').
 */
function logDebug(msg, data) {
  if (PropertiesService.getScriptProperties().getProperty('DEBUG_LOGGING') !== 'true') {
    return;
  }
  if (data !== undefined) {
    console.log(msg, data);
  } else {
    console.log(msg);
  }
}

/**
 * Load comma‑separated DOC_IDS from Script Properties.
 */
function getRegisteredDocs() {
  const prop = PropertiesService.getScriptProperties().getProperty('DOC_IDS') || '';
  return prop.split(',').filter(id => id);
}

function fetchAllSlackMessagesForToday() {
  const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
  if (!token) {
    Logger.log('SLACK_BOT_TOKEN not set in Script Properties!');
    return [];
  }
  const since = (Date.now() / 1000) - 24 * 3600;
  const channels = listAllPublicChannels(token);

  Logger.log('Channels found:', JSON.stringify(channels));

  const all = [];
  channels.forEach(ch => {
    try {
      const url = `https://slack.com/api/conversations.history?channel=${ch.id}&oldest=${since}`;
      const resp = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = JSON.parse(resp.getContentText());
      Logger.log(`Response for channel ${ch.name}: ${resp.getContentText()}`);
      if (data.ok && data.messages) {
        Logger.log(`Channel ${ch.name} - messages found: ${data.messages.length}`);
        data.messages.forEach(m => {
          all.push({
            channel: ch.name || ch.id,
            user: m.user,
            text: m.text,
            ts: m.ts
          });
        });
      } else {
        Logger.log(`No messages or error in channel ${ch.name}: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      Logger.log(`Failed to fetch history for ${ch.name}: ${e}`);
    }
  });
  Logger.log('All messages collected:', JSON.stringify(all));
  return all;
}

function listAllPublicChannels(token) {
  const url = 'https://slack.com/api/conversations.list?exclude_archived=true&types=public_channel';
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token }
  });
  var rawText = resp.getContentText();
  Logger.log('===RAW RESPONSE START===');
  Logger.log(rawText);
  Logger.log('===RAW RESPONSE END===');
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    Logger.log('JSON parse error:', e);
    return [];
  }
  if (data.ok && data.channels) {
    return data.channels;
  } else {
    Logger.log('===FAILED RESPONSE START===');
    Logger.log(JSON.stringify(data));
    Logger.log('===FAILED RESPONSE END===');
    return [];
  }
}