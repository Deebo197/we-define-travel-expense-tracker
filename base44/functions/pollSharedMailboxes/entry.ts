import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * pollSharedMailboxes — Polls dee's inbox for forwarded emails from the shared
 * expense mailboxes (expenses-dee, expenses-celine, expenses-sophie).
 *
 * Since the shared mailboxes auto-forward to dee@wedefine.travel, we read dee's
 * inbox and detect the original recipient from the email's toRecipients or subject.
 */

// Maps shared mailbox address → real user email
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

// How far back to look (in minutes) — slightly more than the poll interval
const LOOKBACK_MINUTES = 8;

async function graphRequest(accessToken, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph API error ${res.status}: ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Determine which staff member this email belongs to.
 * When a shared mailbox forwards an email, the original "To" address is usually
 * preserved in the toRecipients list alongside dee's address.
 */
function resolveUserEmail(message) {
  const allRecipients = [
    ...(message.toRecipients || []),
    ...(message.ccRecipients || []),
  ].map(r => r.emailAddress?.address?.toLowerCase()).filter(Boolean);

  // Check if any recipient matches a shared expense alias
  const matchedAlias = EXPENSE_ALIASES.find(alias => allRecipients.includes(alias));
  if (matchedAlias) {
    return ALIAS_TO_USER[matchedAlias];
  }

  // Fallback: check subject for forwarding patterns like "FW: [expenses-celine]"
  const subject = (message.subject || '').toLowerCase();
  for (const alias of EXPENSE_ALIASES) {
    const localPart = alias.split('@')[0]; // e.g. "expenses-celine"
    if (subject.includes(localPart)) {
      return ALIAS_TO_USER[alias];
    }
  }

  // Default to dee if no match found
  return 'dee@wedefine.travel';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('outlook');

    const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();
    console.log(`Polling dee's inbox for forwarded expense emails since ${since}`);

    // Read dee's inbox — forwarded emails from shared mailboxes land here
    const resp = await graphRequest(
      accessToken,
      `/me/messages?$filter=receivedDateTime ge ${since} and hasAttachments eq true&$select=id,subject,sender,toRecipients,ccRecipients,hasAttachments,receivedDateTime&$top=50`
    );

    const messages = resp?.value || [];
    console.log(`Found ${messages.length} message(s) with attachments`);

    const results = [];

    for (const message of messages) {
      console.log(`Processing: "${message.subject}" from ${message.sender?.emailAddress?.address}`);

      // Only process emails that originated from or were forwarded for an expense alias
      const allRecipients = [
        ...(message.toRecipients || []),
        ...(message.ccRecipients || []),
      ].map(r => r.emailAddress?.address?.toLowerCase()).filter(Boolean);

      const subject = (message.subject || '').toLowerCase();
      const isExpenseEmail =
        EXPENSE_ALIASES.some(alias => allRecipients.includes(alias)) ||
        EXPENSE_ALIASES.some(alias => subject.includes(alias.split('@')[0]));

      if (!isExpenseEmail) {
        console.log(`Not an expense email, skipping "${message.subject}"`);
        continue;
      }

      const userEmail = resolveUserEmail(message);
      console.log(`Resolved to user: ${userEmail}`);

      // Fetch attachments
      const attResp = await graphRequest(accessToken, `/me/messages/${message.id}/attachments`);
      const attachments = attResp?.value || [];

      const attachment = attachments.find(a =>
        a['@odata.type'] === '#microsoft.graph.fileAttachment' &&
        ALLOWED_MIME.includes((a.contentType || '').toLowerCase())
      );

      if (!attachment) {
        console.log(`No valid attachment in "${message.subject}"`);
        results.push({ messageId: message.id, skipped: 'no valid attachment' });
        continue;
      }

      // Dedup check: same subject + date + user
      const existing = await base44.asServiceRole.entities.Expense.filter({
        source: 'email_intake',
        submitted_by: userEmail,
      });

      const msgDate = message.receivedDateTime?.split('T')[0];
      const isDup = existing.some(e =>
        e.description && message.subject &&
        e.description.toLowerCase().includes((message.subject || '').toLowerCase().slice(0, 20)) &&
        e.date === msgDate
      );

      if (isDup) {
        console.log(`Already processed "${message.subject}", skipping`);
        results.push({ messageId: message.id, skipped: 'duplicate' });
        continue;
      }

      // Upload attachment
      console.log(`Uploading: ${attachment.name} (${attachment.contentType})`);
      const binary = Uint8Array.from(atob(attachment.contentBytes), c => c.charCodeAt(0));
      const blob = new Blob([binary], { type: attachment.contentType });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });

      // Create draft expense
      const expenseResult = await base44.asServiceRole.functions.invoke('processEmailExpense', {
        to_email: userEmail,
        from_email: message.sender?.emailAddress?.address || '',
        subject: message.subject || '',
        attachment_url: uploadResult.file_url,
      });

      console.log(`Draft expense created for ${userEmail}:`, expenseResult?.data?.expense_id);
      results.push({
        messageId: message.id,
        userEmail,
        expense_id: expenseResult?.data?.expense_id,
      });
    }

    return Response.json({ success: true, processed: results });

  } catch (error) {
    console.error('pollSharedMailboxes error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});