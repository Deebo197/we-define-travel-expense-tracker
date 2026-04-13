import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const EXPENSE_ALIASES = [
  'expenses-dee@wedefine.travel',
  'expenses-celine@wedefine.travel',
  'expenses-sophie@wedefine.travel',
];

// Map intake alias → real user email
const ALIAS_TO_USER = {
  'expenses-dee@wedefine.travel':     'dee@wedefine.travel',
  'expenses-celine@wedefine.travel':  'celine@wedefine.travel',
  'expenses-sophie@wedefine.travel':  'sophie@wedefine.travel',
};

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
  if (!res.ok) throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { data } = await req.json();

    if (!data?.value?.length) {
      return Response.json({ skipped: 'no notifications' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('outlook');

    const results = [];

    for (const notification of data.value) {
      if (notification.changeType !== 'created') continue;

      const messageId = notification.resourceData?.id;
      if (!messageId) continue;

      // Fetch full message with toRecipients and hasAttachments
      const message = await graphRequest(accessToken, `/me/messages/${messageId}?$select=id,subject,toRecipients,hasAttachments`);
      if (!message) continue;

      // Find which expense alias this was sent to
      const toAddresses = (message.toRecipients || []).map(r => r.emailAddress?.address?.toLowerCase());
      const matchedAlias = EXPENSE_ALIASES.find(alias => toAddresses.includes(alias));
      if (!matchedAlias) continue;

      if (!message.hasAttachments) {
        results.push({ messageId, skipped: 'no attachments' });
        continue;
      }

      // Fetch attachments
      const attachmentsResp = await graphRequest(accessToken, `/me/messages/${messageId}/attachments`);
      const attachments = attachmentsResp?.value || [];

      // Find first PDF or image attachment
      const attachment = attachments.find(a =>
        a['@odata.type'] === '#microsoft.graph.fileAttachment' &&
        ALLOWED_MIME.includes((a.contentType || '').toLowerCase())
      );

      if (!attachment) {
        results.push({ messageId, skipped: 'no valid attachment type' });
        continue;
      }

      // Upload attachment to base44 storage
      const binary = Uint8Array.from(atob(attachment.contentBytes), c => c.charCodeAt(0));
      const blob = new Blob([binary], { type: attachment.contentType });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });

      // Call processEmailExpense
      const expenseResult = await base44.asServiceRole.functions.invoke('processEmailExpense', {
        to_email: ALIAS_TO_USER[matchedAlias],
        from_email: message.sender?.emailAddress?.address || '',
        subject: message.subject || '',
        attachment_url: uploadResult.file_url,
      });

      results.push({ messageId, alias: matchedAlias, expense_id: expenseResult?.expense_id });
    }

    return Response.json({ processed: results });

  } catch (error) {
    console.error('handleOutlookEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});