/**
 * syncReceiptToDrive — Sync a confirmed Expense or MileageJourney receipt to Google Drive.
 *
 * Supports both single-file and multi-file (receipt_files[]) expenses.
 *
 * Folder structure:
 *   WDT Receipts / YEAR / YYYY-MM Month / GROUP
 *
 * GROUP mapping:
 *   WD, WD1  → WD-WD1
 *   WCA, CB  → WCA-CB
 *   WSA, ST  → WSA-ST
 *   WDA, DJ  → WDA-DJ
 *   Mileage  → Mileage
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

async function flagSyncFailed(base44, entityType, entityId) {
  if (!entityId) return;
  try {
    if (entityType === 'expense') {
      await base44.asServiceRole.entities.Expense.update(entityId, { drive_sync_failed: true });
    } else {
      await base44.asServiceRole.entities.MileageJourney.update(entityId, { drive_sync_failed: true });
    }
  } catch (_) { /* best-effort */ }
}

async function getMyDriveRootId(authHeader) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files/root?fields=id', {
    headers: authHeader,
  });
  const json = await res.json();
  return json.id;
}

async function getOrCreateCachedFolder(base44, authHeader, name, parentFolderId) {
  // For the root folder, resolve My Drive root as parent
  let resolvedParent = parentFolderId;
  if (!resolvedParent) {
    resolvedParent = await getMyDriveRootId(authHeader);
  }

  const cacheKey = `${resolvedParent}/${name}`;

  // Check DB cache first
  const existing = await base44.asServiceRole.entities.DriveFolder.filter({ name: cacheKey });
  if (existing.length > 0) return existing[0].folder_id;

  // Search Drive for an existing folder with this name under this parent
  const q = encodeURIComponent(`name='${name}' and '${resolvedParent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, { headers: authHeader });
  const searchJson = await searchRes.json();
  if (searchJson.files && searchJson.files.length > 0) {
    const folderId = searchJson.files[0].id;
    // Cache it for next time
    await base44.asServiceRole.entities.DriveFolder.create({ name: cacheKey, folder_id: folderId, parent_folder_id: resolvedParent });
    return folderId;
  }

  // Not found — create it
  const meta = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [resolvedParent],
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
    parent_folder_id: resolvedParent,
  });
  return json.id;
}

async function uploadFileToDrive(authHeader, fileUrl, fileName, folderId) {
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileUrl} (${fileRes.status})`);
  const fileBlob = await fileRes.blob();
  const contentType = fileBlob.type || 'application/octet-stream';
  const fileArrayBuffer = await fileBlob.arrayBuffer();
  const fileBytes = new Uint8Array(fileArrayBuffer);

  const boundary = 'WDTReceiptBoundary';
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const encoder = new TextEncoder();
  const metaPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const closingPart = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(metaPart.length + fileBytes.length + closingPart.length);
  body.set(metaPart, 0);
  body.set(fileBytes, metaPart.length);
  body.set(closingPart, metaPart.length + fileBytes.length);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return uploadRes.json();
}

async function makeFilePublic(authHeader, fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

Deno.serve(async (req) => {
  let base44, entityId, entityType;
  try {
    base44 = createClientFromRequest(req);
    const payload = await req.json();

    const isAutomation = !!payload.event;
    const entityName = isAutomation ? payload.event?.entity_name : (payload.entity_type || 'Expense');
    entityId = isAutomation ? payload.event?.entity_id : payload.entity_id;
    const data = isAutomation ? payload.data : payload;
    // Normalise: accept "Expense", "expense", "MileageJourney", "mileage"
    entityType = (entityName === 'Expense' || entityName === 'expense') ? 'expense' : 'mileage';

    if (!data) return Response.json({ error: 'No data' }, { status: 400 });

    const receiptCode = data.receipt_code;
    const paidBy = data.paid_by;
    const receiptFiles = data.receipt_files; // may be array or undefined

    // For mileage, only single-file is supported
    if (entityType === 'mileage') {
      const receiptFile = data.receipt_file;
      if (!receiptFile || !receiptCode) {
        return Response.json({ skipped: true, reason: 'Missing receipt_file or receipt_code' });
      }
      if (data.receipt_url?.includes('drive.google.com')) {
        return Response.json({ skipped: true, reason: 'Already synced to Drive' });
      }

      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      const dateStr = data.date || new Date().toISOString().split('T')[0];
      const { year, monthFolder } = getMonthFolderName(dateStr);

      const rootId = await getOrCreateCachedFolder(base44, authHeader, 'WDT Receipts', null);
      const yearId = await getOrCreateCachedFolder(base44, authHeader, year, rootId);
      const monthId = await getOrCreateCachedFolder(base44, authHeader, monthFolder, yearId);
      const groupId = await getOrCreateCachedFolder(base44, authHeader, 'Mileage', monthId);

      const urlPath = receiptFile.split('?')[0];
      const ext = urlPath.split('.').pop().toLowerCase();
      const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(ext) ? ext : 'jpg';
      const fileName = `${receiptCode} - Mileage.${safeExt}`;

      const uploadData = await uploadFileToDrive(authHeader, receiptFile, fileName, groupId);
      if (!uploadData.id) {
        await flagSyncFailed(base44, entityType, entityId);
        return Response.json({ error: 'Upload failed', details: uploadData }, { status: 500 });
      }
      await makeFilePublic(authHeader, uploadData.id);
      const shareableLink = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;
      await base44.asServiceRole.entities.MileageJourney.update(entityId, { receipt_url: shareableLink, drive_sync_failed: false });
      return Response.json({ success: true, drive_link: shareableLink, file_id: uploadData.id });
    }

    // ── Expense path ──────────────────────────────────────────────────────────

    if (!receiptCode) {
      return Response.json({ skipped: true, reason: 'Missing receipt_code' });
    }

    // Skip entirely if primary receipt_url is already in Drive AND every receipt_file also has a drive link
    const hasMultiFile = Array.isArray(receiptFiles) && receiptFiles.length > 0;
    const primaryAlreadyInDrive = data.receipt_url?.includes('drive.google.com') || data.primary_receipt_file_url?.includes('drive.google.com');
    const allFilesInDrive = hasMultiFile && receiptFiles.every(f => f.drive_file_id && f.public_receipt_url?.includes('drive.google.com'));

    if (primaryAlreadyInDrive && (!hasMultiFile || allFilesInDrive)) {
      return Response.json({ skipped: true, reason: 'Already synced to Drive' });
    }

    // We need at least one uploadable file
    const singleReceiptFile = data.receipt_file;
    if (!hasMultiFile && !singleReceiptFile) {
      return Response.json({ skipped: true, reason: 'No receipt file to upload' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const dateStr = data.date || new Date().toISOString().split('T')[0];
    const { year, monthFolder } = getMonthFolderName(dateStr);
    const group = PAID_BY_GROUP[paidBy] || (paidBy ? paidBy : 'Inbox');

    const rootId = await getOrCreateCachedFolder(base44, authHeader, 'WDT Receipts', null);
    const yearId = await getOrCreateCachedFolder(base44, authHeader, year, rootId);
    const monthId = await getOrCreateCachedFolder(base44, authHeader, monthFolder, yearId);
    const groupId = await getOrCreateCachedFolder(base44, authHeader, group, monthId);

    const supplierOrDesc = (data.description || '').replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 40);
    const amt = Number(data.paid_amount || 0).toFixed(2);
    const basePrefix = `${receiptCode} - ${paidBy || ''} - ${supplierOrDesc} - ${amt}`;

    let primaryPublicUrl = data.receipt_url || '';
    let updatedReceiptFiles = hasMultiFile ? [...receiptFiles] : null;

    if (hasMultiFile) {
      // Upload/move each file that doesn't yet have a drive_file_id
      let supportingCount = 0;
      for (let i = 0; i < receiptFiles.length; i++) {
        const rf = receiptFiles[i];

        // Already in Drive — skip
        if (rf.drive_file_id && rf.public_receipt_url?.includes('drive.google.com')) {
          if (rf.role === 'primary') primaryPublicUrl = rf.public_receipt_url;
          continue;
        }

        const origExt = (rf.original_filename || rf.file_url || 'receipt').split('.').pop().toLowerCase();
        const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(origExt) ? origExt : 'jpg';
        const label = rf.role === 'primary' ? 'Primary' : `Supporting ${++supportingCount}`;
        const fileName = `${basePrefix} - ${label}.${safeExt}`;

        const uploadData = await uploadFileToDrive(authHeader, rf.file_url, fileName, groupId);
        if (!uploadData.id) {
          console.error(`Upload failed for receipt_file index ${i}:`, uploadData);
          continue; // best-effort — don't abort the whole sync
        }
        await makeFilePublic(authHeader, uploadData.id);
        const fileLink = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;

        updatedReceiptFiles[i] = { ...rf, drive_file_id: uploadData.id, public_receipt_url: fileLink };
        if (rf.role === 'primary') primaryPublicUrl = fileLink;
      }

      await base44.asServiceRole.entities.Expense.update(entityId, {
        receipt_files: updatedReceiptFiles,
        receipt_url: primaryPublicUrl,
        primary_receipt_file_url: primaryPublicUrl,
        drive_sync_failed: false,
      });

    } else {
      // Single-file fallback
      const urlPath = singleReceiptFile.split('?')[0];
      const ext = urlPath.split('.').pop().toLowerCase();
      const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(ext) ? ext : 'jpg';
      const fileName = `${basePrefix} - Primary.${safeExt}`;

      const uploadData = await uploadFileToDrive(authHeader, singleReceiptFile, fileName, groupId);
      if (!uploadData.id) {
        await flagSyncFailed(base44, entityType, entityId);
        return Response.json({ error: 'Upload failed', details: uploadData }, { status: 500 });
      }
      await makeFilePublic(authHeader, uploadData.id);
      primaryPublicUrl = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;

      await base44.asServiceRole.entities.Expense.update(entityId, {
        receipt_url: primaryPublicUrl,
        drive_sync_failed: false,
      });
    }

    return Response.json({
      success: true,
      drive_link: primaryPublicUrl,
      folder_path: `WDT Receipts/${year}/${monthFolder}/${group}`,
    });

  } catch (error) {
    await flagSyncFailed(base44, entityType, entityId);
    console.error('syncReceiptToDrive error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});