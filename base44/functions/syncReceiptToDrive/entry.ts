/**
 * syncReceiptToDrive — Sync a confirmed Expense or MileageJourney receipt to Google Drive.
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
  let base44, entityId, entityType;
  try {
    base44 = createClientFromRequest(req);
    const payload = await req.json();

    const isAutomation = !!payload.event;
    const entityName = isAutomation ? payload.event?.entity_name : payload.entity_type;
    entityId = isAutomation ? payload.event?.entity_id : payload.entity_id;
    const data = isAutomation ? payload.data : payload;
    entityType = entityName === 'Expense' ? 'expense' : 'mileage';

    if (!data) return Response.json({ error: 'No data' }, { status: 400 });

    const receiptFile = data.receipt_file;
    const receiptCode = data.receipt_code;
    const paidBy = data.paid_by;

    if (!receiptFile || !receiptCode) {
      return Response.json({ skipped: true, reason: 'Missing receipt_file or receipt_code' });
    }

    // Skip if already synced to Drive
    if (data.receipt_url?.includes('drive.google.com')) {
      return Response.json({ skipped: true, reason: 'Already synced to Drive' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Build folder path: WDT Receipts / YEAR / YYYY-MM Month / GROUP
    const dateStr = data.date || new Date().toISOString().split('T')[0];
    const { year, monthFolder } = getMonthFolderName(dateStr);

    let group;
    if (entityType === 'mileage') {
      group = 'Mileage';
    } else {
      group = PAID_BY_GROUP[paidBy] || (paidBy ? `${paidBy}` : 'Inbox');
    }

    const rootId = await getOrCreateCachedFolder(base44, authHeader, 'WDT Receipts', null);
    const yearId = await getOrCreateCachedFolder(base44, authHeader, year, rootId);
    const monthId = await getOrCreateCachedFolder(base44, authHeader, monthFolder, yearId);
    const groupId = await getOrCreateCachedFolder(base44, authHeader, group, monthId);

    // Download the receipt file
    const fileRes = await fetch(receiptFile);
    if (!fileRes.ok) {
      await flagSyncFailed(base44, entityType, entityId);
      return Response.json({ error: 'Failed to fetch receipt file' }, { status: 500 });
    }

    const fileBlob = await fileRes.blob();
    const contentType = fileBlob.type || 'application/octet-stream';
    const urlPath = receiptFile.split('?')[0];
    const ext = urlPath.split('.').pop().toLowerCase();
    const safeExt = ['jpg','jpeg','png','gif','pdf','webp','heic'].includes(ext) ? ext : 'jpg';

    // Confirmed filename format: R-260508-001 - CB - Hotel ABC - 212.00.pdf
    let fileName;
    if (entityType === 'mileage') {
      fileName = `${receiptCode} - Mileage.${safeExt}`;
    } else {
      const supplierOrDesc = (data.description || '').replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 40);
      const amt = (data.paid_amount || 0).toFixed(2);
      fileName = `${receiptCode} - ${paidBy || ''} - ${supplierOrDesc} - ${amt}.${safeExt}`;
    }

    // Multipart upload to Drive
    const boundary = 'WDTReceiptBoundary';
    const metadata = JSON.stringify({ name: fileName, parents: [groupId] });
    const fileArrayBuffer = await fileBlob.arrayBuffer();
    const fileBytes = new Uint8Array(fileArrayBuffer);
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

    const uploadData = await uploadRes.json();
    if (!uploadData.id) {
      await flagSyncFailed(base44, entityType, entityId);
      return Response.json({ error: 'Upload failed', details: uploadData }, { status: 500 });
    }

    // Make file shareable
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    const shareableLink = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;

    if (entityType === 'expense') {
      await base44.asServiceRole.entities.Expense.update(entityId, { receipt_url: shareableLink, drive_sync_failed: false });
    } else {
      await base44.asServiceRole.entities.MileageJourney.update(entityId, { receipt_url: shareableLink, drive_sync_failed: false });
    }

    return Response.json({ success: true, drive_link: shareableLink, file_id: uploadData.id, folder_path: `WDT Receipts/${year}/${monthFolder}/${group}` });
  } catch (error) {
    await flagSyncFailed(base44, entityType, entityId);
    return Response.json({ error: error.message }, { status: 500 });
  }
});