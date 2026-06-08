/**
 * bulkResyncReceiptsToDrive — Admin-only function that re-syncs all expense and mileage
 * receipts to Google Drive, clearing old Drive IDs first so everything gets re-uploaded fresh.
 *
 * This is useful when the Google Drive account was changed and the WDT Receipts folder
 * needs to be fully repopulated.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const dryRun = payload.dry_run === true;

    // Clear all cached Drive folder records so folders get recreated in the correct place
    if (!dryRun) {
      const folders = await base44.asServiceRole.entities.DriveFolder.list();
      for (const folder of folders) {
        await base44.asServiceRole.entities.DriveFolder.delete(folder.id);
      }
    }

    // Fetch all expenses with a receipt file (but not already correctly synced)
    const allExpenses = await base44.asServiceRole.entities.Expense.list();
    const allMileage = await base44.asServiceRole.entities.MileageJourney.list();

    const expensesToSync = allExpenses.filter(e => {
      const hasFile = e.receipt_file || (Array.isArray(e.receipt_files) && e.receipt_files.length > 0);
      return hasFile;
    });

    const mileageToSync = allMileage.filter(m => m.receipt_file);

    if (dryRun) {
      return Response.json({
        dry_run: true,
        expenses_to_sync: expensesToSync.length,
        mileage_to_sync: mileageToSync.length,
        total: expensesToSync.length + mileageToSync.length,
      });
    }

    // Reset drive fields on all expenses that will be re-synced
    for (const e of expensesToSync) {
      const updatedFiles = Array.isArray(e.receipt_files)
        ? e.receipt_files.map(f => ({ ...f, drive_file_id: null, public_receipt_url: null }))
        : e.receipt_files;
      await base44.asServiceRole.entities.Expense.update(e.id, {
        receipt_url: '',
        primary_receipt_file_url: null,
        receipt_files: updatedFiles,
        drive_sync_failed: false,
      });
    }

    // Reset drive fields on mileage
    for (const m of mileageToSync) {
      await base44.asServiceRole.entities.MileageJourney.update(m.id, {
        receipt_url: '',
        drive_sync_failed: false,
      });
    }

    // Now trigger syncReceiptToDrive for each one
    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const e of expensesToSync) {
      try {
        await base44.asServiceRole.functions.invoke('syncReceiptToDrive', {
          entity_id: e.id,
          entity_type: 'Expense',
          ...e,
        });
        synced++;
      } catch (err) {
        failed++;
        errors.push({ id: e.id, description: e.description, error: err.message });
      }
    }

    for (const m of mileageToSync) {
      try {
        await base44.asServiceRole.functions.invoke('syncReceiptToDrive', {
          entity_id: m.id,
          entity_type: 'MileageJourney',
          ...m,
        });
        synced++;
      } catch (err) {
        failed++;
        errors.push({ id: m.id, purpose: m.purpose, error: err.message });
      }
    }

    return Response.json({
      success: true,
      synced,
      failed,
      errors: errors.slice(0, 20), // cap error list
    });

  } catch (error) {
    console.error('bulkResyncReceiptsToDrive error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});