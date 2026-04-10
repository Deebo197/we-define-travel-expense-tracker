import { useState, useRef, useMemo } from "react";
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
  const pdfRef = useRef(null);
  const [showPDF, setShowPDF] = useState(false);

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
      const margin = 10;
      let yPos = margin;
      const lineHeight = 6;
      const colWidths = { date: 20, desc: 80, receipt: 30, amount: 30 };

      // Helper to add new page
      const addNewPage = () => {
        pdf.addPage();
        yPos = margin;
      };

      // Header
      pdf.setFontSize(14);
      pdf.setTextColor(45, 45, 45);
      pdf.text("FULL EXPENSE REPORT — ALL CLIENTS", margin, yPos);
      yPos += 10;

      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, margin, yPos);
      yPos += 8;
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;

      // Iterate by client and month
      Object.entries(groupedByClient).forEach(([clientCode, months]) => {
        // Client header
        if (yPos > pageHeight - 30) addNewPage();
        pdf.setFontSize(12);
        pdf.setTextColor(200, 16, 46);
        pdf.text(`${clientCode} — ${getClientName(clientCode)}`, margin, yPos);
        yPos += 8;

        Object.entries(months).forEach(([month, items]) => {
          if (yPos > pageHeight - 25) addNewPage();

          // Month subheader
          pdf.setFontSize(9);
          pdf.setTextColor(45, 45, 45);
          pdf.setFont(undefined, "bold");
          pdf.text(month.toUpperCase(), margin, yPos);
          yPos += 5;
          pdf.setFont(undefined, "normal");
          pdf.setTextColor(100, 100, 100);
          pdf.setFontSize(8);

          // Column headers
          const headerY = yPos;
          pdf.text("Date", margin, headerY);
          pdf.text("Description", margin + colWidths.date + 2, headerY);
          pdf.text("Receipt", margin + colWidths.date + colWidths.desc + 2, headerY);
          pdf.text("Amount", pageWidth - margin - colWidths.amount, headerY);
          yPos += 4;
          pdf.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 2;

          // Items
          items.forEach((item) => {
            if (yPos > pageHeight - 10) {
              addNewPage();
              pdf.setFontSize(8);
            }

            pdf.setTextColor(0, 0, 0);
            pdf.text(formatDateUK(item.date), margin, yPos);
            pdf.text(item.description.substring(0, 35), margin + colWidths.date + 2, yPos);

            // Receipt code with link
            if (item.receipt_file) {
              pdf.setTextColor(200, 16, 46);
              pdf.textWithLink(item.receipt_code, margin + colWidths.date + colWidths.desc + 2, yPos, { pageNumber: 1, url: item.receipt_file });
              pdf.setTextColor(0, 0, 0);
            } else {
              pdf.setTextColor(150, 150, 150);
              pdf.text(item.receipt_code, margin + colWidths.date + colWidths.desc + 2, yPos);
              pdf.setTextColor(0, 0, 0);
            }

            pdf.text(formatCurrency(item.clientAmount), pageWidth - margin - colWidths.amount, yPos, { align: "right" });
            yPos += 5;
          });

          // Month total
          yPos += 2;
          pdf.setFont(undefined, "bold");
          pdf.setTextColor(200, 16, 46);
          const monthTotal = items.reduce((s, e) => s + (e.clientAmount || 0), 0);
          pdf.text(`${month.toUpperCase()} TOTAL: ${formatCurrency(monthTotal)}`, pageWidth - margin - colWidths.amount, yPos, { align: "right" });
          yPos += 6;
          pdf.setFont(undefined, "normal");
          pdf.setTextColor(0, 0, 0);
        });
      });

      // Grand total
      yPos += 4;
      pdf.setFont(undefined, "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(200, 16, 46);
      pdf.text(`OVERALL TOTAL: ${formatCurrency(overallTotal)}`, pageWidth - margin - colWidths.amount, yPos, { align: "right" });

      pdf.save(`WDT-Full-Accountant-Report-${dateFrom || "all"}-to-${dateTo || "all"}.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPDF(false);
      setShowPDF(false);
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

      {/* Hidden PDF content */}
      {showPDF && (
        <div className="absolute left-[-9999px]">
          <div ref={pdfRef} className="bg-white text-black p-8 w-[800px]" style={{ fontFamily: "Inter, sans-serif" }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <img
                  src="https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/5a122ba74_wdt-logo-v1-logo-full-colour-rgb.jpg"
                  alt="We Define Travel"
                  className="h-16 w-auto object-contain mb-3"
                  crossOrigin="anonymous"
                />
                <div className="text-xs text-gray-500 leading-relaxed">
                  {COMPANY_INFO.address}<br />{COMPANY_INFO.email}<br />{COMPANY_INFO.website}
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-bold text-[#2D2D2D]">FULL EXPENSE REPORT — ALL CLIENTS</h2>
                <p className="text-xs text-gray-400 mt-1">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>
            <hr className="border-gray-300 mb-6" />

            {Object.entries(groupedByClient).map(([clientCode, months]) => {
              const clientTotal = Object.values(months).flat().reduce((s, e) => s + (e.clientAmount || 0), 0);
              return (
                <div key={clientCode} className="mb-6">
                  <h3 className="font-bold text-[#C8102E] text-base mb-3">{clientCode} — {getClientName(clientCode)}</h3>
                  {Object.entries(months).map(([month, items]) => (
                    <div key={month} className="mb-3">
                      <div className="flex justify-between items-center px-3 py-1.5 bg-[#2D2D2D] text-white text-xs font-semibold rounded-t">
                        <span>{month.toUpperCase()}</span>
                        <span>{items.length} items</span>
                      </div>
                      {items.map((item, i) => (
                        <div key={item.id + "-" + i} className={`grid grid-cols-[80px_1fr_90px_70px] px-3 py-1.5 text-xs border-b border-gray-100 ${i % 2 === 1 ? "bg-[#F5F5F5]" : ""}`}>
                          <span>{formatDateUK(item.date)}</span>
                          <span>{item.description}</span>
                          <span>{item.receipt_file ? <a href={item.receipt_file} className="text-[#C8102E]">{item.receipt_code}</a> : <span className="text-gray-400">{item.receipt_code}</span>}</span>
                          <span className="text-right">{formatCurrency(item.clientAmount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-3 py-1.5 bg-[#C8102E] text-white text-xs font-bold rounded-b">
                        <span>{month.toUpperCase()} TOTAL</span>
                        <span>{formatCurrency(items.reduce((s, e) => s + (e.clientAmount || 0), 0))}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end px-3 py-1 text-sm font-bold text-[#2D2D2D]">
                    {clientCode} Total: {formatCurrency(clientTotal)}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-between px-3 py-3 bg-[#C8102E] text-white font-bold rounded mt-4">
              <span>OVERALL GRAND TOTAL</span>
              <span className="text-lg">{formatCurrency(overallTotal)}</span>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500">
              <p className="italic mb-3">All amounts shown are Zero Rated for VAT purposes. No VAT is applicable on these expenses.</p>
              <hr className="border-gray-200 mb-3" />
              <p>Warm regards,</p>
              <p className="font-semibold text-gray-700 mt-1">{COMPANY_INFO.director}</p>
              <p>Director, {COMPANY_INFO.name}</p>
              <p>{COMPANY_INFO.directorEmail}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200 text-[10px] text-gray-400 text-center">
              {COMPANY_INFO.name} | Registered in England & Wales No. {COMPANY_INFO.regNumber} | VAT No. {COMPANY_INFO.vatNumber}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}