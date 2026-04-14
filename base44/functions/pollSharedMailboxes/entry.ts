import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * pollSharedMailboxes — Scheduled function that reads each shared expense mailbox
 * and creates draft Expense records from emails with PDF/image attachments.
 *
 * Runs every 5 minutes via a scheduled automation.
 * Uses /users/{mailbox}/messages to access shared mailboxes directly.
 */

const SHARED_MAILBOXES = [
  { mailbox: 'expenses-dee@wedefine.travel',    userEmail: 'dee@wedefine.travel' },
  { mailbox: 'expenses-celine@wedefine.travel', userEmail: 'celine@wedefine.travel' },
  { mailbox: 'expenses-sophie@wedefine.travel', userEmail: 'sophie@wedefine.travel' },
];

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
];

// How far back to look (in minutes) — slightly more than the poll interval to avoid gaps
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow admin check for scheduled invocations (no user context in scheduled runs)
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('outlook');

    const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();
    console.log(`Polling shared mailboxes since ${since}`);

    const results = [];

    for (const { mailbox, userEmail } of SHARED_MAILBOXES) {
      console.log(`Checking mailbox: ${mailbox}`);

      let messages;
      try {
        const resp = await graphRequest(
          accessToken,
          `/users/${encodeURIComponent(mailbox)}/messages?$filter=receivedDateTime ge ${since} and hasAttachments eq true&$select=id,subject,sender,hasAttachments,receivedDateTime&$top=20`
        );
        messages = resp?.value || [];
      } catch (e) {
        console.log(`Could not access ${mailbox}: ${e.message}`);
        results.push({ mailbox, error: e.message });
        continue;
      }

      console.log(`Found ${messages.length} message(s) in ${mailbox}`);

      for (const message of messages) {
        console.log(`Processing: "${message.subject}" (${message.id})`);

        // Fetch attachments
        let attachments;
        try {
          const attResp = await graphRequest(
            accessToken,
            `/users/${encodeURIComponent(mailbox)}/messages/${message.id}/attachments`
          );
          attachments = attResp?.value || [];
        } catch (e) {
          console.log(`Could not fetch attachments for ${message.id}: ${e.message}`);
          continue;
        }

        const attachment = attachments.find(a =>
          a['@odata.type'] === '#microsoft.graph.fileAttachment' &&
          ALLOWED_MIME.includes((a.contentType || '').toLowerCase())
        );

        if (!attachment) {
          console.log(`No valid attachment in message "${message.subject}"`);
          results.push({ mailbox, messageId: message.id, skipped: 'no valid attachment' });
          continue;
        }

        // Check if we already processed this message (avoid duplicates)
        const existing = await base44.asServiceRole.entities.Expense.filter({
          source: 'email_intake',
          submitted_by: userEmail,
        });

        // Use subject + date as a simple dedup key
        const msgDate = message.receivedDateTime?.split('T')[0];
        const isDup = existing.some(e =>
          e.description && message.subject &&
          e.description.toLowerCase().includes((message.subject || '').toLowerCase().slice(0, 20)) &&
          e.date === msgDate
        );

        if (isDup) {
          console.log(`Already processed "${message.subject}", skipping`);
          results.push({ mailbox, messageId: message.id, skipped: 'duplicate' });
          continue;
        }

        // Upload attachment
        console.log(`Uploading attachment: ${attachment.name} (${attachment.contentType})`);
        const binary = Uint8Array.from(atob(attachment.contentBytes), c => c.charCodeAt(0));
        const blob = new Blob([binary], { type: attachment.contentType });
        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });

        // Create draft expense via processEmailExpense
        const expenseResult = await base44.asServiceRole.functions.invoke('processEmailExpense', {
          to_email: userEmail,
          from_email: message.sender?.emailAddress?.address || '',
          subject: message.subject || '',
          attachment_url: uploadResult.file_url,
        });

        console.log(`Draft expense created for ${userEmail}:`, expenseResult?.data?.expense_id);
        results.push({
          mailbox,
          messageId: message.id,
          userEmail,
          expense_id: expenseResult?.data?.expense_id,
        });
      }
    }

    return Response.json({ success: true, processed: results });

  } catch (error) {
    console.error('pollSharedMailboxes error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});