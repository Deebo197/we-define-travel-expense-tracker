/**
 * tempAttachBankReceipt — TEMPORARY one-off helper (to be deleted after use).
 * Uploads a receipt file and attaches it to a pending BankTransaction.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const KEY = '5136da9d9e79566aec31d5277aacfeed795eeaf1857ced8c';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST' || req.headers.get('x-upload-key') !== KEY) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const base44 = createClientFromRequest(req);
    const form = await req.formData();
    const file = form.get('file');
    const txnId = String(form.get('txn_id') || '');
    if (!(file instanceof File) || !txnId) {
      return Response.json({ error: 'file and txn_id required' }, { status: 400 });
    }
    const txn = await base44.asServiceRole.entities.BankTransaction.get(txnId);
    if (!txn || txn.status !== 'pending') {
      return Response.json({ error: 'transaction not found or not pending' }, { status: 400 });
    }
    const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/pdf' });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
    await base44.asServiceRole.entities.BankTransaction.update(txnId, {
      receipt_url: file_url,
      receipt_name: file.name,
    });
    return Response.json({ ok: true, txn_id: txnId, file_url });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
