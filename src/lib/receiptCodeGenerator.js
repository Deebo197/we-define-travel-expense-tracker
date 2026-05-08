/**
 * Receipt code generator — calls the server-side generateReceiptCode function
 * to guarantee uniqueness across all entity types.
 * 
 * Format: R-YYMMDD-001
 */
import { base44 } from "@/api/base44Client";

export async function generateReceiptCode(dateStr) {
  const response = await base44.functions.invoke('generateReceiptCode', {
    date: dateStr || new Date().toISOString().split('T')[0],
  });
  return response.data.receipt_code;
}