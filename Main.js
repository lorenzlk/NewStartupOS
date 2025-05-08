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

/**
 * Fetch all messages from every public channel in the last 24h.
 */
function fetchAllSlackMessagesForToday() {
  const token = cfg.SLACK.BOT_TOKEN;
  const since = (Date.now() / 1000) - 24 * 3600;
  const channels = listAllPublicChannels(token);

  const all = [];
  channels.forEach(ch => {
    try {
      const resp = UrlFetchApp.fetch('https://slack.com/api/conversations.history', {
        method: 'post',
        headers: { Authorization: 'Bearer ' + token },
        payload: { channel: ch.id, oldest: since }
      });
      const data = JSON.parse(resp.getContentText());
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
      logDebug(`Failed to fetch history for ${ch.name}`, e);
    }
  });
  return all;
}

/**
 * List every public channel in the workspace.
 */
function listAllPublicChannels(token) {
  let channels = [];
  let cursor = '';
  do {
    const resp = UrlFetchApp.fetch('https://slack.com/api/conversations.list', {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      payload: {
        types: 'public_channel',
        limit: 1000,
        cursor: cursor
      },
      muteHttpExceptions: true
    });
    const data = JSON.parse(resp.getContentText());
    if (data.ok && data.channels) {
      channels = channels.concat(data.channels);
      cursor = data.response_metadata && data.response_metadata.next_cursor ? data.response_metadata.next_cursor : '';
    } else {
      cursor = '';
    }
  } while (cursor);

  // Ensure the bot joins each public channel
  channels.forEach(ch => {
    if (!ch.is_member) {
      try {
        UrlFetchApp.fetch('https://slack.com/api/conversations.join', {
          method: 'post',
          headers: { Authorization: 'Bearer ' + token },
          payload: { channel: ch.id },
          muteHttpExceptions: true
        });
      } catch (e) {
        logDebug(`Failed to join channel ${ch.name}:`, e);
      }
    }
  });

  // Filter to only channels the bot is a member of
  const memberChannels = channels.filter(ch => ch.is_member);
  logDebug('Channels bot is a member of:', memberChannels.map(ch => ch.name || ch.id));
  return memberChannels;
}