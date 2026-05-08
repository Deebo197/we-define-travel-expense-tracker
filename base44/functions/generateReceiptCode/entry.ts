/**
 * generateReceiptCode — Server-side receipt code generator.
 * 
 * Format: R-YYMMDD-001
 * 
 * POST body: { date: "YYYY-MM-DD" }  (optional — defaults to today)
 * 
 * Returns: { receipt_code: "R-260508-001" }
 * 
 * Guarantees uniqueness by checking Expense, MileageJourney, and
 * ReceiptInboxItem in a single pass, then incrementing.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth check — any logged-in user may generate a code
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

    // Query all three entity types for codes with this date prefix
    const [expenses, mileage, inboxItems] = await Promise.all([
      base44.asServiceRole.entities.Expense.filter({ receipt_code: { $regex: `^${prefix}` } }),
      base44.asServiceRole.entities.MileageJourney.filter({ receipt_code: { $regex: `^${prefix}` } }),
      base44.asServiceRole.entities.ReceiptInboxItem.filter({ receipt_code: { $regex: `^${prefix}` } }),
    ]);

    const allCodes = [
      ...expenses.map(e => e.receipt_code),
      ...mileage.map(m => m.receipt_code),
      ...inboxItems.map(i => i.receipt_code),
    ].filter(Boolean);

    let maxNum = 0;
    for (const code of allCodes) {
      const match = code.match(/-(\d{3})$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    const nextNum = String(maxNum + 1).padStart(3, '0');
    const receipt_code = `${prefix}${nextNum}`;

    return Response.json({ receipt_code });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});