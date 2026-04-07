import { base44 } from "@/api/base44Client";
import { formatMonthCode } from "./constants";

export async function generateReceiptCode(clientCode, dateStr) {
  const monthCode = formatMonthCode(dateStr);
  const prefix = `${clientCode}-${monthCode}-`;
  
  // Find existing expenses with this prefix
  const expenses = await base44.entities.Expense.filter(
    { receipt_code: { $regex: `^${prefix}` } }
  );
  
  const mileageJourneys = await base44.entities.MileageJourney.filter(
    { receipt_code: { $regex: `^${prefix}` } }
  );
  
  const allCodes = [
    ...expenses.map(e => e.receipt_code),
    ...mileageJourneys.map(m => m.receipt_code),
  ].filter(Boolean);
  
  let maxNum = 0;
  allCodes.forEach(code => {
    const match = code.match(/-(\d{3})$/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  });
  
  const nextNum = String(maxNum + 1).padStart(3, "0");
  return `${prefix}${nextNum}`;
}