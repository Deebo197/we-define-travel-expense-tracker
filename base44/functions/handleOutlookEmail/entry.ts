import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALIAS_TO_USER = {
  'expenses-dee@wedefine.travel':     'dee@wedefine.travel',
  'expenses-celine@wedefine.travel':  'celine@wedefine.travel',
  'expenses-sophie@wedefine.travel':  'sophie@wedefine.travel',
};

const EXPENSE_ALIASES = Object.keys(ALIAS_TO_USER);

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
];

async function graphRequest(accessToken, path, options = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph API error ${res.status}: ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Try fetching a message from /me or from a shared mailbox path
async function fetchMessage(accessToken, messageId) {
  // First try /me/messages (alias on same account or main inbox)
  try {
    const msg = await graphRequest(accessToken, `/me/messages/${messageId}?$select=id,subject,toRecipients,hasAttachments,sender`);
    if (msg) return { msg, basePath: '/me' };
  } catch (e) {
    console.log('Not found in /me/messages, trying shared mailboxes...');
  }

  // Try each shared mailbox
  for (const alias of EXPENSE_ALIASES) {
    try {
      const msg = await graphRequest(accessToken, `/users/${encodeURIComponent(alias)}/messages/${messageId}?$select=id,subject,toRecipients,hasAttachments,sender`);
      if (msg) return { msg, basePath: `/users/${encodeURIComponent(alias)}` };
    } catch (e) {
      // not in this mailbox
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // The platform wraps the Graph notification in { data: { value: [...] } }
    const notifications = body?.data?.value || body?.value || [];

    if (!notifications.length) {
      return Response.json({ skipped: 'no notifications' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('outlook');

    const results = [];

    for (const notification of notifications) {
      if (notification.changeType !== 'created') continue;

      const messageId = notification.resourceData?.id;
      if (!messageId) continue;

      const found = await fetchMessage(accessToken, messageId);
      if (!found) {
        console.log(`Message ${messageId} not found in any mailbox`);
        results.push({ messageId, skipped: 'message not found' });
        continue;
      }

      const { msg: message, basePath } = found;
      console.log(`Found message in ${basePath}: subject="${message.subject}"`);

      // Determine which expense alias it was sent to
      const toAddresses = (message.toRecipients || []).map(r => r.emailAddress?.address?.toLowerCase());
      console.log('toRecipients:', toAddresses);

      const matchedAlias = EXPENSE_ALIASES.find(alias => toAddresses.includes(alias));

      // If not matched by toRecipients, infer from basePath (shared mailbox)
      const inferredAlias = matchedAlias || EXPENSE_ALIASES.find(alias => basePath.includes(encodeURIComponent(alias)));

      if (!inferredAlias) {
        console.log('No matching expense alias found for this message');
        results.push({ messageId, skipped: 'no matching alias' });
        continue;
      }

      if (!message.hasAttachments) {
        results.push({ messageId, skipped: 'no attachments' });
        continue;
      }

      // Fetch attachments
      const attachmentsResp = await graphRequest(accessToken, `${basePath}/messages/${messageId}/attachments`);
      const attachments = attachmentsResp?.value || [];
      console.log(`Found ${attachments.length} attachment(s)`);

      const attachment = attachments.find(a =>
        a['@odata.type'] === '#microsoft.graph.fileAttachment' &&
        ALLOWED_MIME.includes((a.contentType || '').toLowerCase())
      );

      if (!attachment) {
        results.push({ messageId, skipped: 'no valid attachment type', found: attachments.map(a => a.contentType) });
        continue;
      }

      console.log(`Processing attachment: ${attachment.name} (${attachment.contentType})`);

      // Upload attachment to base44 storage
      const binary = Uint8Array.from(atob(attachment.contentBytes), c => c.charCodeAt(0));
      const blob = new Blob([binary], { type: attachment.contentType });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });

      const toEmail = ALIAS_TO_USER[inferredAlias];

      // Call processEmailExpense
      const expenseResult = await base44.asServiceRole.functions.invoke('processEmailExpense', {
        to_email: toEmail,
        from_email: message.sender?.emailAddress?.address || '',
        subject: message.subject || '',
        attachment_url: uploadResult.file_url,
      });

      console.log(`Created draft expense for ${toEmail}:`, expenseResult?.expense_id);
      results.push({ messageId, alias: inferredAlias, to_email: toEmail, expense_id: expenseResult?.data?.expense_id });
    }

    return Response.json({ processed: results });

  } catch (error) {
    console.error('handleOutlookEmail error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});