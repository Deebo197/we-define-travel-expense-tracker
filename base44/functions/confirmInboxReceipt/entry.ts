/**
 * confirmInboxReceipt — Convert a ReceiptInboxItem into a confirmed Expense.
 *
 * POST body: {
 *   inbox_item_id: string,
 *   // All user-edited fields:
 *   date: string,
 *   description: string,
 *   paid_amount: number,
 *   actual_cost: number,
 *   vat: boolean,
 *   paid_by: string,
 *   category: string,
 *   client_allocations: array,
 *   currency: string,
 *   original_amount: number|null,
 *   exchange_rate: number|null
 * }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PAID_BY_GROUP = {
  WD: 'WD-WD1', WD1: 'WD-WD1',
  WCA: 'WCA-CB', CB: 'WCA-CB',
  WSA: 'WSA-ST', ST: 'WSA-ST',
  WDA: 'WDA-DJ', DJ: 'WDA-DJ',
};

function getMonthNames() {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
}

async function getOrCreateCachedFolder(base44, authHeader, name, parentFolderId) {
  const cacheKey = parentFolderId ? `${parentFolderId}/${name}` : name;
  const existing = await base44.asServiceRole.entities.DriveFolder.filter({ name: cacheKey });
  if (existing.length > 0) return existing[0].folder_id;

  const meta = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentFolderId ? { parents: [parentFolderId] } : {}),
  };
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  const json = await res.json();
  await base44.asServiceRole.entities.DriveFolder.create({
    name: cacheKey,
    folder_id: json.id,
    parent_folder_id: parentFolderId || '',
  });
  return json.id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { inbox_item_id, date, description, paid_amount, actual_cost, vat, paid_by, category, client_allocations, currency, original_amount, exchange_rate } = payload;

    if (!inbox_item_id) return Response.json({ error: 'inbox_item_id required' }, { status: 400 });

    const items = await base44.asServiceRole.entities.ReceiptInboxItem.filter({ id: inbox_item_id });
    const item = items[0];
    if (!item) return Response.json({ error: 'Inbox item not found' }, { status: 404 });

    const d = new Date(date || item.extracted_date || new Date());
    const months = getMonthNames();
    const month = `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    const year = d.getFullYear();
    const yearStr = String(year);
    const monthNum = String(d.getMonth() + 1).padStart(2, '0');
    const monthFolder = `${year}-${monthNum} ${months[d.getMonth()]}`;

    const amt = paid_amount || item.extracted_amount || 0;
    const paidBy = paid_by || item.paid_by || 'CB';
    const desc = description || item.extracted_description || item.extracted_supplier || '';

    // --- Create the Expense ---
    const expense = await base44.asServiceRole.entities.Expense.create({
      date: date || item.extracted_date,
      description: desc,
      paid_amount: amt,
      actual_cost: actual_cost || amt,
      vat: vat ?? item.extracted_vat ?? false,
      paid_by: paidBy,
      category: category || item.category || '',
      client_allocations: client_allocations || item.client_allocations || [],
      receipt_file: item.file_url,
      receipt_url: item.public_receipt_url || item.file_url,
      receipt_code: item.receipt_code,
      reimbursement_required: ['CB','ST','DJ'].includes(paidBy),
      reimbursement_paid: false,
      month,
      year,
      submitted_by: user.email,
      submitted_by_name: user.full_name,
      source: item.source || 'manual_upload',
      currency: currency || item.extracted_currency || 'GBP',
      original_amount: currency && currency !== 'GBP' ? (original_amount || null) : null,
      exchange_rate: currency && currency !== 'GBP' ? (exchange_rate || null) : null,
      status: 'confirmed',
    });

    // --- Move/rename file in Drive ---
    let publicUrl = item.public_receipt_url;
    try {
      if (item.drive_file_id) {
        const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
        const authHeader = { Authorization: `Bearer ${accessToken}` };

        const group = PAID_BY_GROUP[paidBy] || 'Inbox';
        const rootId = await getOrCreateCachedFolder(base44, authHeader, 'WDT Receipts', null);
        const yearId = await getOrCreateCachedFolder(base44, authHeader, yearStr, rootId);
        const monthId = await getOrCreateCachedFolder(base44, authHeader, monthFolder, yearId);
        const groupId = await getOrCreateCachedFolder(base44, authHeader, group, monthId);

        // Build confirmed filename: R-260508-001 - CB - Hotel ABC - 212.00.pdf
        const origExt = (item.original_filename || 'receipt').split('.').pop().toLowerCase();
        const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(origExt) ? origExt : 'jpg';
        const supplierPart = (item.extracted_supplier || desc).replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 40);
        const confirmedName = `${item.receipt_code} - ${paidBy} - ${supplierPart} - ${amt.toFixed(2)}.${safeExt}`;

        // Move file: update parents (add group, remove inbox) + rename
        // Get current parent to remove
        const fileMetaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${item.drive_file_id}?fields=parents`,
          { headers: authHeader }
        );
        const fileMeta = await fileMetaRes.json();
        const oldParents = (fileMeta.parents || []).join(',');

        await fetch(
          `https://www.googleapis.com/drive/v3/files/${item.drive_file_id}?addParents=${groupId}&removeParents=${oldParents}&fields=id,webViewLink`,
          {
            method: 'PATCH',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: confirmedName }),
          }
        );

        // Keep public link (permission already set)
        publicUrl = item.public_receipt_url || `https://drive.google.com/file/d/${item.drive_file_id}/view`;

        // Update expense with final drive link
        await base44.asServiceRole.entities.Expense.update(expense.id, { receipt_url: publicUrl });
      }
    } catch (driveErr) {
      console.error('Drive move failed:', driveErr.message);
      // Non-fatal
    }

    // --- Mark inbox item confirmed ---
    await base44.asServiceRole.entities.ReceiptInboxItem.update(inbox_item_id, {
      status: 'confirmed',
      linked_expense_id: expense.id,
      paid_by: paidBy,
      category: category || item.category || '',
      client_allocations: client_allocations || item.client_allocations || [],
      public_receipt_url: publicUrl,
    });

    return Response.json({ success: true, expense_id: expense.id, receipt_code: item.receipt_code });
  } catch (error) {
    console.error('confirmInboxReceipt error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});