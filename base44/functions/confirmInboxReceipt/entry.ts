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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';



function getMonthNames() {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
    let item = items[0];
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

    const amt = paid_amount || item.extracted_amount || 0;
    const paidBy = paid_by || item.paid_by || 'CB';
    const desc = description || item.extracted_description || item.extracted_supplier || '';

    // --- STEP 5: Create the Expense ---
    // Use the base44 file URL (not Drive URL) for receipt_file so the
    // syncReceiptToDrive automation fires and handles Drive upload/move
    // exactly the same way as a manually submitted expense.
    const primaryFileUrl = item.primary_receipt_file_url || item.file_url;

    // Strip drive URLs from receipt_files so syncReceiptToDrive re-uploads them
    // into the correct group folder (not the Inbox folder).
    const receiptFilesForExpense = item.receipt_files?.length > 0
      ? item.receipt_files.map(f => ({
          ...f,
          drive_file_id: undefined,
          public_receipt_url: f.file_url, // point to base44 URL so sync picks it up
        }))
      : undefined;

    const expense = await base44.asServiceRole.entities.Expense.create({
      date: date || item.extracted_date,
      description: desc,
      paid_amount: amt,
      actual_cost: actual_cost || amt,
      vat: vat ?? item.extracted_vat ?? false,
      paid_by: paidBy,
      category: category || item.category || '',
      client_allocations: client_allocations || item.client_allocations || [],
      receipt_file: primaryFileUrl,
      receipt_url: primaryFileUrl,          // base44 URL → triggers syncReceiptToDrive
      primary_receipt_file_url: primaryFileUrl,
      receipt_files: receiptFilesForExpense,
      receipt_code: item.receipt_code,
      reimbursement_required: ['CB', 'ST', 'DJ'].includes(paidBy),
      reimbursement_paid: false,
      month,
      year,
      submitted_by: user.email,
      submitted_by_name: user.full_name,
      source: 'manual',
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