import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, FileSpreadsheet, FileText } from "lucide-react";
import { formatCurrency, formatDateUK, getClientName, getPaidByLabel, CLIENT_CODES, COMPANY_INFO } from "@/lib/constants";

export default function AccountantExport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
    const headers = ["Date","Client(s)","Description","Category","Paid By","Actual Cost","Paid Amount","VAT","Receipt Code","Split Details","Reimbursement Required","Reimbursement Paid","Month","Year","Receipt URL"];
    const rows = filtered.map(e => [
      formatDateUK(e.date),
      e.client_allocations?.map(a => `${a.client_code}(${a.percentage}%)`).join("; "),
      `"${(e.description || "").replace(/"/g, '""')}"`,
      `"${(e.category || "").replace(/"/g, '""')}"`,
      e.paid_by,
      e.actual_cost || "",
      e.paid_amount || "",
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
            const descStr = item.description.substring(0, 35);
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
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="font-semibold mb-4">Export for Accountant</h3>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <Label className="text-sm">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 w-40" />
        </div>
        <div>
          <Label className="text-sm">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 w-40" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} expenses</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={handleCSVExport} disabled={generatingCSV} className="gap-1.5">
          {generatingCSV ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Full CSV Export
        </Button>
        <Button variant="outline" onClick={handlePDFExport} disabled={generatingPDF} className="gap-1.5">
          {generatingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Full Accountant PDF
        </Button>
      </div>
    </div>
  );
}