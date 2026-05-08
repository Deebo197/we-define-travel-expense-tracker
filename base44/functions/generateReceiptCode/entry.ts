/**
 * generateReceiptCode — Atomic server-side receipt code generator.
 *
 * Format: R-YYMMDD-001
 *
 * Strategy:
 *   1. Query all existing codes for the date from Expense, MileageJourney,
 *      ReceiptInboxItem, AND ReceiptCodeCounter.
 *   2. Pick next sequence = max + 1.
 *   3. Write a ReceiptCodeCounter record keyed to the full date+seq (e.g. "260508-001").
 *   4. Read back to verify we're the only claimer. If collision, retry with +1.
 *
 * ReceiptCodeCounter records use date_key = "YYMMDD-NNN" (unique per claimed code).
 *
 * POST body: { date: "YYYY-MM-DD" }  (optional — defaults to today)
 * Returns:   { receipt_code: "R-260508-001" }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const dateStr = payload.date || new Date().toISOString().split('T')[0];

    const d = new Date(dateStr);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const datePart = `${yy}${mm}${dd}`;
    const prefix = `R-${datePart}-`;

    const MAX_RETRIES = 8;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // 1. Find highest used sequence across all sources including counter reservations
      const [expenses, mileage, inboxItems, counterRecords] = await Promise.all([
        base44.asServiceRole.entities.Expense.filter({ receipt_code: { $regex: `^${prefix}` } }),
        base44.asServiceRole.entities.MileageJourney.filter({ receipt_code: { $regex: `^${prefix}` } }),
        base44.asServiceRole.entities.ReceiptInboxItem.filter({ receipt_code: { $regex: `^${prefix}` } }),
        // Counter records use date_key = "YYMMDD-NNN" — filter by prefix "YYMMDD-"
        base44.asServiceRole.entities.ReceiptCodeCounter.filter({ date_key: { $regex: `^${datePart}-` } }),
      ]);

      const allCodes = [
        ...expenses.map(e => e.receipt_code),
        ...mileage.map(m => m.receipt_code),
        ...inboxItems.map(i => i.receipt_code),
      ].filter(Boolean);

      let maxSeq = 0;

      for (const code of allCodes) {
        const match = code.match(/-(\d{3})$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }

      // Also check counter reservations (date_key = "YYMMDD-NNN")
      for (const rec of counterRecords) {
        const match = rec.date_key.match(/-(\d{3})$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }

      const claimSeq = maxSeq + 1;
      const claimSeqStr = String(claimSeq).padStart(3, '0');
      const claimKey = `${datePart}-${claimSeqStr}`;
      const receipt_code = `${prefix}${claimSeqStr}`;

      // 2. Attempt to claim by creating a counter record with this unique key
      await base44.asServiceRole.entities.ReceiptCodeCounter.create({
        date_key: claimKey,
        last_sequence: claimSeq,
      });

      // 3. Verify we're the sole claimer for this exact key
      const verification = await base44.asServiceRole.entities.ReceiptCodeCounter.filter({
        date_key: claimKey,
      });

      if (verification.length === 1) {
        // Won the race — return the reserved code
        return Response.json({ receipt_code });
      }

      // Collision — another request grabbed the same sequence. Retry.
      console.warn(`generateReceiptCode: collision on ${claimKey}, attempt ${attempt + 1}`);
      await new Promise(r => setTimeout(r, 50 + Math.random() * 150));
    }

    return Response.json({ error: 'Failed to generate unique receipt code after retries' }, { status: 500 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});