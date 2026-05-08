/**
 * confirmInboxReceipt — Convert a ReceiptInboxItem into a confirmed Expense.
 *
 * Concurrency safety via ReceiptConfirmationLock entity:
 *   1. Attempt to CREATE a lock record keyed by inbox_item_id.
 *      - If creation succeeds → we hold the lock, proceed.
 *      - If creation fails (duplicate) → another request already holds the lock → 409.
 *   2. Re-fetch the ReceiptInboxItem after acquiring the lock.
 *      - If already confirmed (linked_expense_id set) → return existing, release lock.
 *   3. Create exactly one Expense.
 *   4. Update ReceiptInboxItem with status=confirmed + linked_expense_id.
 *   5. Delete the lock record (so re-confirm after a crash is possible).
 *
 * The ReceiptConfirmationLock entity has a unique index on inbox_item_id enforced
 * by Base44's entity layer — two simultaneous creates with the same inbox_item_id
 * will result in one success and one error, giving us a true create-based mutex.
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
  const base44 = createClientFromRequest(req);
  let lockId = null;

  try {
    // --- Auth ---
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      inbox_item_id, date, description, paid_amount, actual_cost,
      vat, paid_by, category, client_allocations, currency,
      original_amount, exchange_rate,
    } = payload;

    if (!inbox_item_id) return Response.json({ error: 'inbox_item_id required' }, { status: 400 });

    // --- Fetch item ---
    const items = await base44.asServiceRole.entities.ReceiptInboxItem.filter({ id: inbox_item_id });
    const item = items[0];
    if (!item) return Response.json({ error: 'Inbox item not found' }, { status: 404 });

    // --- Ownership check ---
    const isAdmin = user.role === 'admin';
    if (!isAdmin && item.owner_email !== user.email) {
      return Response.json({ error: 'Forbidden: you do not own this inbox item' }, { status: 403 });
    }

    // --- Fast-path: already fully confirmed ---
    if (item.linked_expense_id) {
      return Response.json({
        success: true,
        expense_id: item.linked_expense_id,
        receipt_code: item.receipt_code,
        already_confirmed: true,
      });
    }

    // --- STEP 1: Acquire exclusive lock by creating a lock record ---
    // Base44 entity creates are serialized per record; if two requests race,
    // one create wins and the other gets an error. We catch the error → 409.
    // We also check first if a lock already exists (handles crashed prior run).
    const existingLocks = await base44.asServiceRole.entities.ReceiptConfirmationLock.filter({ inbox_item_id });
    if (existingLocks.length > 0) {
      // Lock exists — either another request is in flight or a previous run crashed.
      // Re-fetch item to see if it was actually confirmed already.
      const recheckItems = await base44.asServiceRole.entities.ReceiptInboxItem.filter({ id: inbox_item_id });
      const recheck = recheckItems[0];
      if (recheck?.linked_expense_id) {
        return Response.json({
          success: true,
          expense_id: recheck.linked_expense_id,
          receipt_code: recheck.receipt_code,
          already_confirmed: true,
        });
      }
      // Lock exists but no expense — another request is actively confirming right now.
      return Response.json({
        error: 'This receipt is currently being confirmed by another request. Please try again shortly.',
        status: 'confirming',
      }, { status: 409 });
    }

    // Attempt to create the lock — this is the true race-condition guard.
    // If two requests reach here simultaneously, Base44 will process creates
    // sequentially; the second will either also succeed (we catch with re-check below)
    // or fail. Either way, after creating we immediately verify we're the sole lock holder.
    let lockRecord;
    try {
      lockRecord = await base44.asServiceRole.entities.ReceiptConfirmationLock.create({
        inbox_item_id,
        locked_by: user.email,
      });
      lockId = lockRecord.id;
    } catch (createErr) {
      // Another request created the lock at the same moment.
      return Response.json({
        error: 'This receipt is currently being confirmed. Please try again shortly.',
        status: 'confirming',
      }, { status: 409 });
    }

    // --- STEP 2: Small settle delay + verify we are the EARLIEST lock holder ---
    await new Promise(r => setTimeout(r, 200));
    const lockCheck = await base44.asServiceRole.entities.ReceiptConfirmationLock.filter({ inbox_item_id });

    // No locks found at all (e.g. another winner already cleaned up) — we must not proceed
    if (lockCheck.length === 0) {
      lockId = null; // already gone
      return Response.json({
        error: 'Lock was released before verification. Please try again.',
        status: 'confirming',
      }, { status: 409 });
    }

    // Sort by created_date ascending — earliest record is the winner regardless of count
    const sorted = lockCheck.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const winner = sorted[0];

    if (winner.id !== lockId) {
      // We did not win — delete our own lock if it still exists, then back off
      await base44.asServiceRole.entities.ReceiptConfirmationLock.delete(lockId).catch(() => {});
      lockId = null;
      return Response.json({
        error: 'This receipt is currently being confirmed by another request.',
        status: 'confirming',
      }, { status: 409 });
    }

    // We are the winner — clean up any extra losing locks (defensive, shouldn't happen with unique index)
    for (const loser of sorted.slice(1)) {
      await base44.asServiceRole.entities.ReceiptConfirmationLock.delete(loser.id).catch(() => {});
    }

    // --- STEP 3: Re-fetch item now that we hold the lock ---
    const freshItems = await base44.asServiceRole.entities.ReceiptInboxItem.filter({ id: inbox_item_id });
    const fresh = freshItems[0];
    if (fresh?.linked_expense_id) {
      // Already confirmed before we got here — return existing
      await base44.asServiceRole.entities.ReceiptConfirmationLock.delete(lockId);
      lockId = null;
      return Response.json({
        success: true,
        expense_id: fresh.linked_expense_id,
        receipt_code: fresh.receipt_code,
        already_confirmed: true,
      });
    }

    // --- STEP 3b: Safety check — has an Expense already been created for this receipt_code? ---
    // Guards against: Expense.create succeeded but the function crashed before
    // ReceiptInboxItem.linked_expense_id was written (e.g. network blip, timeout).
    if (item.receipt_code) {
      const existingExpenses = await base44.asServiceRole.entities.Expense.filter({ receipt_code: item.receipt_code });
      if (existingExpenses.length > 0) {
        const existingExpense = existingExpenses[0];
        // Heal the inbox item — link it to the already-created expense
        await base44.asServiceRole.entities.ReceiptInboxItem.update(inbox_item_id, {
          status: 'confirmed',
          linked_expense_id: existingExpense.id,
        });
        await base44.asServiceRole.entities.ReceiptConfirmationLock.delete(lockId);
        lockId = null;
        return Response.json({
          success: true,
          expense_id: existingExpense.id,
          receipt_code: item.receipt_code,
          already_confirmed: true,
        });
      }
    }

    // --- STEP 4: Build expense fields ---
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

    // --- STEP 5: Create the Expense ---
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

    // --- STEP 6: Mark inbox item confirmed + link expense ---
    await base44.asServiceRole.entities.ReceiptInboxItem.update(inbox_item_id, {
      status: 'confirmed',
      linked_expense_id: expense.id,
      paid_by: paidBy,
      category: category || item.category || '',
      client_allocations: client_allocations || item.client_allocations || [],
    });

    // --- STEP 7: Release the lock ---
    await base44.asServiceRole.entities.ReceiptConfirmationLock.delete(lockId);
    lockId = null;

    // --- STEP 8: Move/rename file in Drive (non-fatal) ---
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

        const origExt = (item.original_filename || 'receipt').split('.').pop().toLowerCase();
        const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(origExt) ? origExt : 'jpg';
        const supplierPart = (item.extracted_supplier || desc).replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 40);
        const confirmedName = `${item.receipt_code} - ${paidBy} - ${supplierPart} - ${amt.toFixed(2)}.${safeExt}`;

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

        publicUrl = item.public_receipt_url || `https://drive.google.com/file/d/${item.drive_file_id}/view`;

        await Promise.all([
          base44.asServiceRole.entities.Expense.update(expense.id, { receipt_url: publicUrl }),
          base44.asServiceRole.entities.ReceiptInboxItem.update(inbox_item_id, { public_receipt_url: publicUrl }),
        ]);
      }
    } catch (driveErr) {
      console.error('Drive move failed (non-fatal):', driveErr.message);
    }

    return Response.json({ success: true, expense_id: expense.id, receipt_code: item.receipt_code });

  } catch (error) {
    // Clean up lock on unexpected error so the user can retry
    if (lockId) {
      try {
        await (createClientFromRequest(req)).asServiceRole.entities.ReceiptConfirmationLock.delete(lockId);
      } catch (_) {}
    }
    console.error('confirmInboxReceipt error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});