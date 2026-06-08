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

    // Get Drive access token once
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const PAID_BY_GROUP = {
      WD: 'WD-WD1', WD1: 'WD-WD1',
      WCA: 'WCA-CB', CB: 'WCA-CB',
      WSA: 'WSA-ST', ST: 'WSA-ST',
      WDA: 'WDA-DJ', DJ: 'WDA-DJ',
    };
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function getMonthFolderName(dateStr) {
      const d = new Date(dateStr || new Date());
      const year = d.getFullYear();
      const month = d.getMonth();
      const mm = String(month + 1).padStart(2, '0');
      return { year: String(year), monthFolder: `${year}-${mm} ${MONTH_NAMES[month]}` };
    }

    // Folder cache (in-memory for this run)
    const folderCache = {};
    async function getMyDriveRootId() {
      const res = await fetch('https://www.googleapis.com/drive/v3/files/root?fields=id', { headers: authHeader });
      const json = await res.json();
      return json.id;
    }
    async function getOrCreateFolder(name, parentId) {
      const key = `${parentId}/${name}`;
      if (folderCache[key]) return folderCache[key];

      // Search for existing folder with this name under this parent
      const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, { headers: authHeader });
      const searchJson = await searchRes.json();
      if (searchJson.files && searchJson.files.length > 0) {
        folderCache[key] = searchJson.files[0].id;
        return folderCache[key];
      }

      // Not found — create it
      const meta = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(meta),
      });
      const json = await res.json();
      folderCache[key] = json.id;
      return json.id;
    }
    async function uploadFile(fileUrl, fileName, folderId) {
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`Fetch failed: ${fileRes.status}`);
      const fileBlob = await fileRes.blob();
      const contentType = fileBlob.type || 'application/octet-stream';
      const fileBytes = new Uint8Array(await fileBlob.arrayBuffer());
      const boundary = 'WDTBulkBoundary';
      const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
      const encoder = new TextEncoder();
      const metaPart = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
      const closingPart = encoder.encode(`\r\n--${boundary}--`);
      const body = new Uint8Array(metaPart.length + fileBytes.length + closingPart.length);
      body.set(metaPart, 0); body.set(fileBytes, metaPart.length); body.set(closingPart, metaPart.length + fileBytes.length);
      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      return uploadRes.json();
    }
    async function makePublic(fileId) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });
    }

    const myDriveRootId = await getMyDriveRootId();
    // Pre-create root folder
    const rootId = await getOrCreateFolder('WDT Receipts', myDriveRootId);

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const e of expensesToSync) {
      try {
        const dateStr = e.date || new Date().toISOString().split('T')[0];
        const { year, monthFolder } = getMonthFolderName(dateStr);
        const group = PAID_BY_GROUP[e.paid_by] || (e.paid_by ? e.paid_by : 'Inbox');
        const yearId = await getOrCreateFolder(year, rootId);
        const monthId = await getOrCreateFolder(monthFolder, yearId);
        const groupId = await getOrCreateFolder(group, monthId);

        const supplierOrDesc = (e.description || '').replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 40);
        const amt = Number(e.paid_amount || 0).toFixed(2);
        const basePrefix = `${e.receipt_code} - ${e.paid_by || ''} - ${supplierOrDesc} - ${amt}`;

        const hasMultiFile = Array.isArray(e.receipt_files) && e.receipt_files.length > 0;
        let primaryPublicUrl = '';

        if (hasMultiFile) {
          const updatedFiles = [...e.receipt_files];
          let supportingCount = 0;
          for (let i = 0; i < e.receipt_files.length; i++) {
            const rf = e.receipt_files[i];
            const origExt = (rf.original_filename || rf.file_url || 'receipt').split('.').pop().toLowerCase();
            const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(origExt) ? origExt : 'jpg';
            const label = rf.role === 'primary' ? 'Primary' : `Supporting ${++supportingCount}`;
            const fileName = `${basePrefix} - ${label}.${safeExt}`;
            const uploadData = await uploadFile(rf.file_url, fileName, groupId);
            if (!uploadData.id) continue;
            await makePublic(uploadData.id);
            const fileLink = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;
            updatedFiles[i] = { ...rf, drive_file_id: uploadData.id, public_receipt_url: fileLink };
            if (rf.role === 'primary') primaryPublicUrl = fileLink;
          }
          await base44.asServiceRole.entities.Expense.update(e.id, {
            receipt_files: updatedFiles, receipt_url: primaryPublicUrl,
            primary_receipt_file_url: primaryPublicUrl, drive_sync_failed: false,
          });
        } else {
          const urlPath = e.receipt_file.split('?')[0];
          const ext = urlPath.split('.').pop().toLowerCase();
          const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(ext) ? ext : 'jpg';
          const fileName = `${basePrefix} - Primary.${safeExt}`;
          const uploadData = await uploadFile(e.receipt_file, fileName, groupId);
          if (!uploadData.id) throw new Error('Upload returned no ID');
          await makePublic(uploadData.id);
          primaryPublicUrl = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;
          await base44.asServiceRole.entities.Expense.update(e.id, {
            receipt_url: primaryPublicUrl, drive_sync_failed: false,
          });
        }
        synced++;
      } catch (err) {
        failed++;
        errors.push({ id: e.id, description: e.description, error: err.message });
      }
    }

    for (const m of mileageToSync) {
      try {
        const dateStr = m.date || new Date().toISOString().split('T')[0];
        const { year, monthFolder } = getMonthFolderName(dateStr);
        const yearId = await getOrCreateFolder(year, rootId);
        const monthId = await getOrCreateFolder(monthFolder, yearId);
        const groupId = await getOrCreateFolder('Mileage', monthId);
        const urlPath = m.receipt_file.split('?')[0];
        const ext = urlPath.split('.').pop().toLowerCase();
        const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(ext) ? ext : 'jpg';
        const fileName = `${m.receipt_code} - Mileage.${safeExt}`;
        const uploadData = await uploadFile(m.receipt_file, fileName, groupId);
        if (!uploadData.id) throw new Error('Upload returned no ID');
        await makePublic(uploadData.id);
        const shareableLink = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;
        await base44.asServiceRole.entities.MileageJourney.update(m.id, { receipt_url: shareableLink, drive_sync_failed: false });
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
      errors: errors.slice(0, 20),
    });

  } catch (error) {
    console.error('bulkResyncReceiptsToDrive error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});