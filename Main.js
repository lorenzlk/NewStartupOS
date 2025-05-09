// ===== DEBUG: Only one definition should exist below =====
function getEmailSummaryForLast24Hours() {
  Logger.log('getEmailSummaryForLast24Hours: Function started');
  const scriptProperties = PropertiesService.getScriptProperties();
  const OPENAI_API_KEY = scriptProperties.getProperty('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    Logger.log('getEmailSummaryForLast24Hours: No OpenAI API key found.');
    return 'No OpenAI API key found.';
  }

  const now = new Date();
  Logger.log('getEmailSummaryForLast24Hours: now (ISO):', now.toISOString());
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  Logger.log('getEmailSummaryForLast24Hours: yesterday (ISO):', yesterday.toISOString());
  const formattedYesterday = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm');
  Logger.log('getEmailSummaryForLast24Hours: formattedYesterday for Gmail search:', formattedYesterday);
  const searchQuery = `after:${formattedYesterday}`;
  Logger.log('getEmailSummaryForLast24Hours: Gmail search query:', searchQuery);
  const threads = GmailApp.search(searchQuery);
  let emailContents = [];
  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      emailContents.push({
        subject: msg.getSubject(),
        from: msg.getFrom(),
        date: msg.getDate(),
        body: msg.getPlainBody().substring(0, 1000)
      });
    });
  });
  Logger.log(`getEmailSummaryForLast24Hours: Fetched ${emailContents.length} emails.`);
  if (emailContents.length > 0) {
    Logger.log(`getEmailSummaryForLast24Hours: First email subject: ${emailContents[0].subject}`);
  }
  if (emailContents.length === 0) {
    Logger.log('getEmailSummaryForLast24Hours: No emails found in last 24 hours.');
    return 'No emails found in the past 24 hours.';
  }

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
      return `<b>Summary:</b> ${parsed.summary}<br><b>Actions:</b> ${parsed.actions}`;
    } catch (e) {
      Logger.log('getEmailSummaryForLast24Hours: Failed to parse OpenAI output as JSON:', e);
      return aiContent;
    }
  } catch (e) {
    Logger.log('getEmailSummaryForLast24Hours: Error during OpenAI call:', e);
    return `Error summarizing emails: ${e.message}`;
  }
}

function sendSummaryDigestToEmail(docSummaries, slackDigest) {
  const recipient = Session.getEffectiveUser().getEmail();
  let body = '';

  if (docSummaries.length) {
    body += '📄 <b>Document Changes</b><br><br>';
    docSummaries.forEach(s => {
      body += `<b>${s.title}</b><br>${s.summary}<br>Action Items: ${s.actions || 'None'}<br><br>`;
    });
  } else {
    body += '📄 No document changes detected.<br><br>';
  }

  body += '💬 <b>Slack Summary</b><br>';
  body += slackDigest.summary + '<br>';
  if (slackDigest.actions) {
    body += `<br>Action Items:<br>${slackDigest.actions}<br>`;
  }

  // --- Add Email Activity Summary ---
  const emailSummary = getEmailSummaryForLast24Hours();
  Logger.log('Email summary:', emailSummary);
  if (emailSummary && typeof emailSummary === 'string' && emailSummary.trim() && !/^No emails found/.test(emailSummary)) {
    body += '<br><br>📬 <b>Email Activity Summary (Past 24 Hours)</b><br>';
    body += emailSummary + '<br>';
  } else {
    body += '<br><br>📬 <b>Email Activity Summary (Past 24 Hours)</b><br>No emails found or error summarizing emails.<br>';
  }

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
function sendSummaryDigestToEmail(docSummaries, slackDigest) {
  const recipient = Session.getEffectiveUser().getEmail();
  let body = '';

  if (docSummaries.length) {
    body += '📄 *Document Changes*\n\n';
    docSummaries.forEach(s => {
      body += `${s.title}\n${s.summary}\nAction Items: ${s.actions || 'None'}\n\n`;
    });
  } else {
    body += '📄 No document changes detected.\n\n';
  }

  body += '💬 *Slack Summary*\n';
  body += slackDigest.summary + '\n';
  if (slackDigest.actions) {
    body += `\nAction Items:\n${slackDigest.actions}\n`;
  }

  MailApp.sendEmail({
    to: recipient,
    subject: '🌙 Nightly Review',
    htmlBody: body.replace(/\n/g, '<br>')
  });
}

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