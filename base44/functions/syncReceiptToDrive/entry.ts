import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Support both direct calls and entity automation payloads
    const isAutomation = !!payload.event;
    const entityName = isAutomation ? payload.event?.entity_name : payload.entity_type;
    const entityId = isAutomation ? payload.event?.entity_id : payload.entity_id;
    const data = isAutomation ? payload.data : payload;

    if (!data) return Response.json({ error: 'No data' }, { status: 400 });

    const receiptFile = data.receipt_file;
    const receiptCode = data.receipt_code;
    const clientCode = data.client_allocations?.[0]?.client_code;
    const entityType = entityName === 'Expense' ? 'expense' : 'mileage';

    if (!receiptFile || !receiptCode || !clientCode) {
      return Response.json({ skipped: true, reason: 'Missing receipt_file, receipt_code, or client_code' });
    }

    // Skip if already synced to Drive
    if (data.receipt_url?.includes('drive.google.com')) {
      return Response.json({ skipped: true, reason: 'Already synced to Drive' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    async function createDriveFolder(folderName, parentFolderId) {
      const meta = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentFolderId ? { parents: [parentFolderId] } : {}),
      };
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(meta),
      });
      const json = await res.json();
      return json.id;
    }

    async function getOrCreateCachedFolder(name, parentFolderId) {
      const cacheKey = parentFolderId ? `${parentFolderId}/${name}` : name;
      const existing = await base44.asServiceRole.entities.DriveFolder.filter({ name: cacheKey });
      if (existing.length > 0) return existing[0].folder_id;

      const folderId = await createDriveFolder(name, parentFolderId);
      await base44.asServiceRole.entities.DriveFolder.create({
        name: cacheKey,
        folder_id: folderId,
        parent_folder_id: parentFolderId || '',
      });
      return folderId;
    }

    // Ensure WDT Receipts root folder
    const rootFolderId = await getOrCreateCachedFolder('WDT Receipts', null);
    // Ensure client subfolder
    const clientFolderId = await getOrCreateCachedFolder(clientCode, rootFolderId);

    // Download the receipt file
    const fileRes = await fetch(receiptFile);
    if (!fileRes.ok) return Response.json({ error: 'Failed to fetch receipt file' }, { status: 500 });

    const fileBlob = await fileRes.blob();
    const contentType = fileBlob.type || 'application/octet-stream';

    // Determine file extension
    const urlPath = receiptFile.split('?')[0];
    const ext = urlPath.split('.').pop().toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'webp'].includes(ext) ? ext : 'jpg';
    const fileName = `${receiptCode}.${safeExt}`;

    // Multipart upload to Drive
    const boundary = 'WDTReceiptBoundary';
    const metadata = JSON.stringify({ name: fileName, parents: [clientFolderId] });

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
      return Response.json({ error: 'Upload failed', details: uploadData }, { status: 500 });
    }

    // Make file shareable (anyone with link)
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    const shareableLink = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;

    // Update entity receipt_url
    if (entityType === 'expense') {
      await base44.asServiceRole.entities.Expense.update(entityId, { receipt_url: shareableLink });
    } else {
      await base44.asServiceRole.entities.MileageJourney.update(entityId, { receipt_url: shareableLink });
    }

    return Response.json({ success: true, drive_link: shareableLink, file_id: uploadData.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});