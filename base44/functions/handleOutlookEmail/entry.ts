import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Map: shared mailbox address → real user email
const ALIAS_TO_USER = {
  'expenses-dee@wedefine.travel':     'dee@wedefine.travel',
  'expenses-celine@wedefine.travel':  'celine@wedefine.travel',
  'expenses-sophie@wedefine.travel':  'sophie@wedefine.travel',
};

// Also accept main user inboxes as a fallback (if shared mailbox forwards here)
const USER_TO_USER = {
  'dee@wedefine.travel':     'dee@wedefine.travel',
  'celine@wedefine.travel':  'celine@wedefine.travel',
  'sophie@wedefine.travel':  'sophie@wedefine.travel',
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

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

      // Fetch the message from /me
      let message = null;
      try {
        message = await graphRequest(accessToken, `/me/messages/${messageId}?$select=id,subject,toRecipients,hasAttachments,sender`);
      } catch (e) {
        console.log(`Could not fetch message ${messageId}:`, e.message);
        continue;
      }

      if (!message) continue;

      const toAddresses = (message.toRecipients || []).map(r => r.emailAddress?.address?.toLowerCase());
      console.log(`Message subject="${message.subject}", toRecipients:`, toAddresses);

      // First try matching an expense alias directly
      let matchedAlias = EXPENSE_ALIASES.find(alias => toAddresses.includes(alias));
      let toEmail = matchedAlias ? ALIAS_TO_USER[matchedAlias] : null;

      // Fallback: match main user email (shared mailbox may forward here)
      if (!toEmail) {
        const matchedUser = Object.keys(USER_TO_USER).find(u => toAddresses.includes(u));
        if (matchedUser) toEmail = USER_TO_USER[matchedUser];
      }

      // Last resort: if the webhook is for dee's account, default to dee
      if (!toEmail) {
        console.log('No alias or user match in toRecipients — defaulting to dee@wedefine.travel');
        toEmail = 'dee@wedefine.travel';
      }

      if (!message.hasAttachments) {
        console.log('No attachments, skipping');
        results.push({ messageId, skipped: 'no attachments' });
        continue;
      }

      // Fetch attachments
      const attachmentsResp = await graphRequest(accessToken, `/me/messages/${messageId}/attachments`);
      const attachments = attachmentsResp?.value || [];
      console.log(`Found ${attachments.length} attachment(s):`, attachments.map(a => `${a.name} (${a.contentType})`));

      const attachment = attachments.find(a =>
        a['@odata.type'] === '#microsoft.graph.fileAttachment' &&
        ALLOWED_MIME.includes((a.contentType || '').toLowerCase())
      );

      if (!attachment) {
        results.push({ messageId, skipped: 'no valid attachment type', found: attachments.map(a => a.contentType) });
        continue;
      }

      console.log(`Uploading attachment: ${attachment.name}`);

      const binary = Uint8Array.from(atob(attachment.contentBytes), c => c.charCodeAt(0));
      const blob = new Blob([binary], { type: attachment.contentType });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });

      const expenseResult = await base44.asServiceRole.functions.invoke('processEmailExpense', {
        to_email: toEmail,
        from_email: message.sender?.emailAddress?.address || '',
        subject: message.subject || '',
        attachment_url: uploadResult.file_url,
      });

      console.log(`Draft expense created for ${toEmail}, id:`, expenseResult?.data?.expense_id);
      results.push({ messageId, to_email: toEmail, expense_id: expenseResult?.data?.expense_id });
    }

    return Response.json({ processed: results });

  } catch (error) {
    console.error('handleOutlookEmail error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});