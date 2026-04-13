import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * processEmailExpense — Inbound email intake endpoint.
 *
 * Expected JSON payload (sent by your email provider's inbound webhook):
 * {
 *   "to_email":        "celine@wedefine.travel",   // recipient — used to identify the staff member
 *   "from_email":      "supplier@example.com",
 *   "subject":         "Invoice #1234",
 *   "attachment_url":  "https://..."               // publicly accessible URL to the PDF/image attachment
 *                                                  // OR use "attachment_base64" + "attachment_mime"
 * }
 *
 * Configure your email provider (e.g. SendGrid Inbound Parse, Mailgun, Postmark)
 * to POST to this function's URL when a message arrives at your intake address.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { to_email, from_email, subject, attachment_url, attachment_base64, attachment_mime } = payload;

    if (!to_email) {
      return Response.json({ error: 'to_email is required' }, { status: 400 });
    }

    let fileUrl = attachment_url || null;

    // If attachment was sent as base64, upload it first
    if (!fileUrl && attachment_base64 && attachment_mime) {
      const binary = Uint8Array.from(atob(attachment_base64), c => c.charCodeAt(0));
      const blob = new Blob([binary], { type: attachment_mime });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
      fileUrl = uploadResult.file_url;
    }

    if (!fileUrl) {
      return Response.json({ error: 'No attachment provided (attachment_url or attachment_base64 required)' }, { status: 400 });
    }

    // Use OCR via InvokeLLM to extract expense fields from the attachment
    const extracted = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are an expense extraction assistant. Examine this invoice or receipt document and extract the following fields. Be precise and thorough.

Fields to extract:
- date: The invoice/receipt date in YYYY-MM-DD format. If not found, use today's date.
- supplier: The supplier or merchant name (who issued the invoice).
- description: A concise description of what was purchased (1-2 sentences max).
- amount: The total amount paid in GBP (numeric, no currency symbol). Use the grand total including VAT if shown.
- vat: true if VAT is shown on the document, false otherwise.

Return only valid JSON with those exact keys. If a field cannot be determined, use an empty string or 0 for amount.`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          supplier: { type: 'string' },
          description: { type: 'string' },
          amount: { type: 'number' },
          vat: { type: 'boolean' }
        }
      }
    });

    const today = new Date().toISOString().split('T')[0];
    const date = extracted.date || today;
    const description = extracted.description || extracted.supplier || subject || 'Email intake expense';
    const amount = extracted.amount || 0;

    // Determine month/year
    const d = new Date(date);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    const year = d.getFullYear();

    // Create draft Expense — submitted_by set to recipient so they see it via RLS
    const expense = await base44.asServiceRole.entities.Expense.create({
      date,
      description,
      paid_amount: amount,
      actual_cost: amount,
      vat: extracted.vat || false,
      paid_by: 'CB', // placeholder — user will correct in the review form
      category: '',
      client_allocations: [],
      receipt_file: fileUrl,
      receipt_url: fileUrl,
      receipt_code: '',
      reimbursement_required: false,
      reimbursement_paid: false,
      month,
      year,
      submitted_by: to_email,
      submitted_by_name: '',
      source: 'email_intake',
      status: 'draft',
    });

    return Response.json({
      success: true,
      expense_id: expense.id,
      extracted: { date, supplier: extracted.supplier, description, amount }
    });

  } catch (error) {
    console.error('processEmailExpense error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});