import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileSpreadsheet, FileText, Eye } from "lucide-react";
import { formatCurrency, formatDateUK, getClientName, getPaidByLabel, CLIENT_CODES, COMPANY_INFO } from "@/lib/constants";
import MonthEndReadiness from "./MonthEndReadiness";

export default function AccountantExport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [generatingCSV, setGeneratingCSV] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const { data: allExpenses = [] } = useQuery({
    queryKey: ["allExpenses"],
    queryFn: () => base44.entities.Expense.list("-date", 2000),
  });

  const filtered = useMemo(() => {
    if (!dateFrom || !dateTo) return allExpenses;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    return allExpenses.filter(e => {
      const d = new Date(e.date);
      return d >= from && d <= to;
    });
  }, [allExpenses, dateFrom, dateTo]);

  const handleCSVExport = () => {
    setGeneratingCSV(true);
    const headers = ["Date","Client(s)","Description","Category","Paid By","Actual Cost (GBP)","Paid Amount (GBP)","Currency","Original Amount","Exchange Rate","VAT","Receipt Code","Split Details","Reimbursement Required","Reimbursement Paid","Month","Year","Receipt URL"];
    const rows = filtered.map(e => [
      formatDateUK(e.date),
      e.client_allocations?.map(a => `${a.client_code}(${a.percentage}%)`).join("; "),
      `"${(e.description || "").replace(/"/g, '""')}"`,
      `"${(e.category || "").replace(/"/g, '""')}"`,
      e.paid_by,
      e.actual_cost || "",
      e.paid_amount || "",
      e.currency || "GBP",
      e.currency && e.currency !== "GBP" ? (e.original_amount || "") : "",
      e.currency && e.currency !== "GBP" ? (e.exchange_rate || "") : "",
      e.vat ? "Y" : "N",
      e.receipt_code || "",
      e.client_allocations?.map(a => `${a.client_code}:£${a.amount}`).join("; "),
      e.reimbursement_required ? "Y" : "N",
      e.reimbursement_paid ? "Y" : "N",
      e.month || "",
      e.year || "",
      e.receipt_file || "",
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WDT-Expenses-Export-${dateFrom || "all"}-to-${dateTo || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setGeneratingCSV(false);
  };

  // Group by client then month for PDF
  const groupedByClient = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      e.client_allocations?.forEach(a => {
        if (!map[a.client_code]) map[a.client_code] = {};
        const month = e.month || "Unknown";
        if (!map[a.client_code][month]) map[a.client_code][month] = [];
        map[a.client_code][month].push({ ...e, clientAmount: a.amount || e.paid_amount });
      });
    });
    return map;
  }, [filtered]);

  const handlePDFExport = async () => {
    try {
      setGeneratingPDF(true);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      let yPos = margin;

      // Header
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("FULL EXPENSE REPORT — ALL CLIENTS", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;

      // Table content
      Object.entries(groupedByClient).forEach(([clientCode, months]) => {
        // Client header
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(200, 16, 46); // WDT red
        pdf.text(`${clientCode} — ${getClientName(clientCode)}`, margin, yPos);
        yPos += 8;

        // Months
        Object.entries(months).forEach(([month, items]) => {
          // Month header row
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(45, 45, 45); // Dark gray
          pdf.setFillColor(245, 245, 245);
          pdf.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, "F");
          pdf.text(month.toUpperCase(), margin + 2, yPos);
          pdf.text(`${items.length} items`, pageWidth - margin - 15, yPos);
          yPos += 6;

          // Items
          items.forEach((item, idx) => {
            if (yPos > pageHeight - 20) {
              pdf.addPage();
              yPos = margin;
            }

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(8);
            pdf.setTextColor(0, 0, 0);
            if (idx % 2 === 1) {
              pdf.setFillColor(245, 245, 245);
              pdf.rect(margin, yPos - 2.5, pageWidth - 2 * margin, 4.5, "F");
            }

            const dateStr = formatDateUK(item.date);
            const hasForeign = item.currency && item.currency !== "GBP" && item.original_amount;
            const descStr = (item.description.substring(0, 30)) + (hasForeign ? ` [${item.currency}]` : "");
            const amountStr = formatCurrency(item.clientAmount);

            pdf.text(dateStr, margin + 1, yPos);
            pdf.text(descStr, margin + 18, yPos);
            
            // Receipt code as clickable link
            if (item.receipt_file) {
              pdf.setTextColor(200, 16, 46);
              pdf.textWithLink(item.receipt_code, pageWidth - margin - 45, yPos, { url: item.receipt_file });
              pdf.setTextColor(0, 0, 0);
            } else {
              pdf.setTextColor(150, 150, 150);
              pdf.text(item.receipt_code, pageWidth - margin - 45, yPos);
              pdf.setTextColor(0, 0, 0);
            }
            pdf.text(amountStr, pageWidth - margin - 10, yPos, { align: "right" });
            yPos += 4.5;
          });

          // Month total
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(255, 255, 255);
          pdf.setFillColor(200, 16, 46);
          const monthTotal = items.reduce((s, e) => s + (e.clientAmount || 0), 0);
          pdf.rect(margin, yPos - 2.5, pageWidth - 2 * margin, 4.5, "F");
          pdf.text(`${month.toUpperCase()} TOTAL`, margin + 2, yPos);
          pdf.text(formatCurrency(monthTotal), pageWidth - margin - 10, yPos, { align: "right" });
          yPos += 6;
        });

        // Client total
        const clientTotal = Object.values(months).flat().reduce((s, e) => s + (e.clientAmount || 0), 0);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(45, 45, 45);
        pdf.text(`${clientCode} Total:`, margin + 1, yPos);
        pdf.text(formatCurrency(clientTotal), pageWidth - margin - 10, yPos, { align: "right" });
        yPos += 8;
      });

      // Grand total
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(255, 255, 255);
      pdf.setFillColor(200, 16, 46);
      pdf.rect(margin, yPos - 3, pageWidth - 2 * margin, 6, "F");
      pdf.text("OVERALL GRAND TOTAL", margin + 2, yPos);
      pdf.text(formatCurrency(overallTotal), pageWidth - margin - 10, yPos, { align: "right" });

      pdf.save(`WDT-Full-Accountant-Report-${dateFrom || "all"}-to-${dateTo || "all"}.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPDF(false);
    }
  };

  const overallTotal = filtered.reduce((s, e) => s + (e.paid_amount || 0), 0);

  return (
    <div className="space-y-4">
    <MonthEndReadiness expenses={filtered} />
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="font-semibold mb-4">Export for Accountant</h3>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <Label className="text-sm">From</Label>
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setShowPreview(false); }} className="mt-1 w-40" />
        </div>
        <div>
          <Label className="text-sm">To</Label>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setShowPreview(false); }} className="mt-1 w-40" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} expenses</span>
        <Button onClick={() => setShowPreview(true)} disabled={filtered.length === 0} className="gap-1.5">
          <Eye className="h-4 w-4" /> Preview
        </Button>
      </div>
    </div>

    {/* Preview */}
    {showPreview && (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Preview — {filtered.length} expenses</h3>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCSVExport} disabled={generatingCSV} className="gap-1.5">
              {generatingCSV ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Download CSV
            </Button>
            <Button variant="outline" onClick={handlePDFExport} disabled={generatingPDF} className="gap-1.5">
              {generatingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </Button>
          </div>
        </div>

        {/* Summary by client */}
        <div className="space-y-4">
          {Object.entries(groupedByClient).map(([clientCode, months]) => {
            const clientTotal = Object.values(months).flat().reduce((s, e) => s + (e.clientAmount || 0), 0);
            const allItems = Object.values(months).flat();
            return (
              <div key={clientCode} className="rounded-xl overflow-hidden border border-border">
                {/* Client header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/60">
                  <span className="font-semibold text-sm">{clientCode} — {getClientName(clientCode)}</span>
                  <span className="font-bold text-sm tabular-nums">{formatCurrency(clientTotal)}</span>
                </div>
                {/* Month sections */}
                {Object.entries(months).map(([month, items]) => (
                  <div key={month}>
                    <div className="flex items-center justify-between px-4 py-1.5 bg-muted/20 border-t border-border">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{month}</span>
                      <span className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""} · {formatCurrency(items.reduce((s, e) => s + (e.clientAmount || 0), 0))}</span>
                    </div>
                    {items.map((item, i) => (
                      <div key={item.id} className={`flex items-center gap-3 px-4 py-2 text-sm border-t border-border/50 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                        <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{formatDateUK(item.date)}</span>
                        <span className="flex-1 truncate text-xs">{item.description}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{item.paid_by}</span>
                        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{item.receipt_code}</span>
                        <span className="text-xs font-semibold tabular-nums flex-shrink-0">{formatCurrency(item.clientAmount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Grand total */}
        <div className="flex items-center justify-between mt-4 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
          <span className="font-bold">Overall Total</span>
          <span className="text-lg font-bold tabular-nums">{formatCurrency(overallTotal)}</span>
        </div>
      </div>
    )}
    </div>
  );
}