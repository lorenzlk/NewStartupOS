function getEmailSummaryForLast24Hours() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const OPENAI_API_KEY = scriptProperties.getProperty('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) return 'No OpenAI API key found.';

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threads = GmailApp.search(`after:${Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm')}`);
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

  if (emailContents.length === 0) {
    return 'No emails found in the past 24 hours.';
  }

  const prompt = `
You are an assistant that summarizes email activity and extracts action items.
Emails:
${JSON.stringify(emailContents, null, 2)}

Respond in JSON exactly as:
{
  "summary": "...",
  "actions": "..."
}
`.trim();

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

    const aiResp = JSON.parse(response.getContentText());
    let aiContent = '';
    if (aiResp.choices && aiResp.choices[0] && aiResp.choices[0].message) {
      aiContent = aiResp.choices[0].message.content;
    } else if (aiResp.content) {
      aiContent = aiResp.content;
    }

    try {
      const parsed = JSON.parse(aiContent);
      return `<b>Summary:</b> ${parsed.summary}<br><b>Actions:</b> ${parsed.actions}`;
    } catch (e) {
      return aiContent;
    }
  } catch (e) {
    return `Error summarizing emails: ${e.message}`;
  }
}function getEmailSummaryForLast24Hours() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const OPENAI_API_KEY = scriptProperties.getProperty('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) return 'No OpenAI API key found.';

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threads = GmailApp.search(`after:${Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm')}`);
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

  if (emailContents.length === 0) {
    return 'No emails found in the past 24 hours.';
  }

  const prompt = `
You are an assistant that summarizes email activity and extracts action items.
Emails:
${JSON.stringify(emailContents, null, 2)}

Respond in JSON exactly as:
{
  "summary": "...",
  "actions": "..."
}
`.trim();

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

    const aiResp = JSON.parse(response.getContentText());
    let aiContent = '';
    if (aiResp.choices && aiResp.choices[0] && aiResp.choices[0].message) {
      aiContent = aiResp.choices[0].message.content;
    } else if (aiResp.content) {
      aiContent = aiResp.content;
    }

    try {
      const parsed = JSON.parse(aiContent);
      return `<b>Summary:</b> ${parsed.summary}<br><b>Actions:</b> ${parsed.actions}`;
    } catch (e) {
      return aiContent;
    }
  } catch (e) {
    return `Error summarizing emails: ${e.message}`;
  }
}function sendSummaryDigestToEmail(docSummaries, slackDigest) {
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
  if (emailSummary) {
    body += '<br><br>📬 <b>Email Activity Summary (Past 24 Hours)</b><br>';
    body += emailSummary + '<br>';
  }

  MailApp.sendEmail({
    to: recipient,
    subject: '🌙 Nightly Review',
    htmlBody: body
  });
}function getEmailSummaryForLast24Hours() {
  // ...function code...
}
function getEmailSummaryForLast24Hours() {
  // ...same function code again...
}function sendSummaryDigestToEmail(docSummaries, slackDigest) {
  const recipient = Session.getEffectiveUser().getEmail();
  let body = '';

  // ...existing code...

  // --- Add Email Activity Summary ---
  const emailSummary = getEmailSummaryForLast24Hours();
  Logger.log('Email summary:', emailSummary); // <-- Add this line
  if (emailSummary) {
    body += '<br><br>📬 <b>Email Activity Summary (Past 24 Hours)</b><br>';
    body += emailSummary + '<br>';
  }

  MailApp.sendEmail({
    to: recipient,
    subject: '🌙 Nightly Review',
    htmlBody: body
  });
}// === main.gs ===

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
      Logger.log('Response for channel', ch.name, resp.getContentText());
      if (data.ok && data.messages) {
        data.messages.forEach(m => {
          all.push({
            channel: ch.name || ch.id,
            user: m.user,
            text: m.text,
            ts: m.ts
          });
        });
      }
    } catch (e) {
      Logger.log(`Failed to fetch history for ${ch.name}: ${e}`);
    }
  });
  Logger.log('All messages collected:', JSON.stringify(all));
  return all;
}

/**
 * List every public channel in the workspace.
 */
function listAllPublicChannels(token) {
  const resp = UrlFetchApp.fetch('https://slack.com/api/conversations.list', {
    method: 'post',
    headers: { Authorization: 'Bearer ' + token },
    payload: {
      exclude_archived: true,
      types: 'public_channel',
      limit: 1000
    }
  });
  const data = JSON.parse(resp.getContentText());
  return data.ok ? data.channels : [];
}