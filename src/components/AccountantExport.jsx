import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileSpreadsheet, FileText, Eye } from "lucide-react";
import { formatCurrency, formatDateUK, formatMonth, getClientName, getPaidByLabel, COMPANY_INFO } from "@/lib/constants";
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

  // Chronologically sorted, date-filtered
  const filtered = useMemo(() => {
    let exps = [...allExpenses];
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      exps = exps.filter(e => {
        const d = new Date(e.date);
        return d >= from && d <= to;
      });
    }
    return exps.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [allExpenses, dateFrom, dateTo]);

  // Group chronologically by month
  const groupedByMonth = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const key = e.month || formatMonth(e.date) || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [filtered]);

  const overallTotal = filtered.reduce((s, e) => s + (e.paid_amount || 0), 0);
  const dateRange = dateFrom && dateTo ? `${formatDateUK(dateFrom)} — ${formatDateUK(dateTo)}` : "All dates";

  const handleCSVExport = () => {
    setGeneratingCSV(true);
    const headers = ["Date","Description","Category","Paid By","Receipt Code","Total Amount (GBP)","Client Splits","VAT","Currency","Original Amount","Exchange Rate","Reimbursement Required","Reimbursement Paid","Month","Year"];
    const rows = filtered.map(e => [
      formatDateUK(e.date),
      `"${(e.description || "").replace(/"/g, '""')}"`,
      `"${(e.category || "").replace(/"/g, '""')}"`,
      `"${getPaidByLabel(e.paid_by)}"`,
      e.receipt_code || "",
      e.paid_amount || "",
      `"${(e.client_allocations || []).map(a => `${a.client_code} ${a.percentage}% £${(a.amount||0).toFixed(2)}`).join("; ")}"`,
      e.vat ? "Y" : "N",
      e.currency || "GBP",
      e.currency && e.currency !== "GBP" ? (e.original_amount || "") : "",
      e.currency && e.currency !== "GBP" ? (e.exchange_rate || "") : "",
      e.reimbursement_required ? "Y" : "N",
      e.reimbursement_paid ? "Y" : "N",
      e.month || "",
      e.year || "",
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WDT-Accountant-Export-${dateFrom || "all"}-to-${dateTo || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setGeneratingCSV(false);
  };

  const handlePDFExport = async () => {
    try {
      setGeneratingPDF(true);
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF("l", "mm", "a4"); // landscape for more columns
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const usableW = pageW - margin * 2;
      let y = margin;

      const checkPage = (needed = 8) => {
        if (y + needed > pageH - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      // ── Header ──────────────────────────────────────────────────────────
      pdf.setFontSize(16).setFont(undefined, "bold").setTextColor(45, 45, 45);
      pdf.text("FULL EXPENSE REPORT — ACCOUNTANT EXPORT", pageW - margin, y, { align: "right" });
      pdf.setFontSize(9).setFont(undefined, "normal").setTextColor(100);
      y += 6;
      pdf.text(`Period: ${dateRange}`, pageW - margin, y, { align: "right" });
      y += 5;
      pdf.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), pageW - margin, y, { align: "right" });

      y += 10;
      pdf.setDrawColor(200).line(margin, y, pageW - margin, y);
      y += 8;

      // Intro text
      pdf.setFontSize(8.5).setFont(undefined, "normal").setTextColor(80);
      const intro = `Full itemised expense report for ${COMPANY_INFO.name} for the period ${dateRange}. Expenses are listed in date order, grouped by month. All amounts in GBP (£).`;
      const introLines = pdf.splitTextToSize(intro, usableW);
      pdf.text(introLines, margin, y);
      y += introLines.length * 5 + 6;

      // ── Column positions ─────────────────────────────────────────────────
      // Date | Description | Category | Paid By | Receipt | Total | Splits | VAT
      const cols = {
        date:     margin,
        desc:     margin + 20,
        cat:      margin + 75,
        paidBy:   margin + 120,
        receipt:  margin + 152,
        total:    margin + 172,
        splits:   margin + 192,
        vat:      margin + usableW - 6,
      };

      for (const [month, items] of Object.entries(groupedByMonth)) {
        checkPage(16);

        // Month header bar
        pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 7, "F");
        pdf.setFontSize(9).setFont(undefined, "bold").setTextColor(255);
        pdf.text(month.toUpperCase(), margin + 2, y + 5);
        pdf.text(`${items.length} item${items.length !== 1 ? "s" : ""}`, pageW - margin - 2, y + 5, { align: "right" });
        y += 7;

        // Column headers
        pdf.setFillColor(245, 245, 245).rect(margin, y, usableW, 6, "F");
        pdf.setFontSize(7).setFont(undefined, "bold").setTextColor(100);
        pdf.text("Date", cols.date + 1, y + 4.5);
        pdf.text("Description", cols.desc + 1, y + 4.5);
        pdf.text("Category", cols.cat + 1, y + 4.5);
        pdf.text("Paid By", cols.paidBy + 1, y + 4.5);
        pdf.text("Receipt", cols.receipt + 1, y + 4.5);
        pdf.text("Total", cols.total + 1, y + 4.5);
        pdf.text("Client Splits", cols.splits + 1, y + 4.5);
        pdf.text("VAT", cols.vat, y + 4.5, { align: "right" });
        y += 6;

        // Rows
        items.forEach((item, i) => {
          // estimate row height — splits may need extra lines
          const splits = item.client_allocations || [];
          const splitLines = splits.length;
          const rowH = Math.max(7, 4 + splitLines * 4);
          checkPage(rowH + 2);

          if (i % 2 === 1) {
            pdf.setFillColor(250, 250, 250).rect(margin, y, usableW, rowH, "F");
          }

          pdf.setFontSize(7.5).setFont(undefined, "normal").setTextColor(40);

          // Date
          pdf.text(formatDateUK(item.date), cols.date + 1, y + 5);

          // Description — truncated
          const descText = pdf.splitTextToSize(item.description || "", cols.cat - cols.desc - 3);
          pdf.text(descText[0], cols.desc + 1, y + 5);

          // Category — truncated
          const catShort = (item.category || "—").replace(/^(WDT - |Client Expenses - )/, "");
          const catText = pdf.splitTextToSize(catShort, cols.paidBy - cols.cat - 3);
          pdf.text(catText[0], cols.cat + 1, y + 5);

          // Paid By (full label)
          const paidByText = pdf.splitTextToSize(getPaidByLabel(item.paid_by) || item.paid_by || "—", cols.receipt - cols.paidBy - 3);
          pdf.text(paidByText[0], cols.paidBy + 1, y + 5);

          // Receipt code (clickable if URL exists)
          const receiptUrl = item.receipt_files?.[0]?.public_receipt_url || item.primary_receipt_file_url || item.receipt_url || item.receipt_files?.[0]?.file_url || item.receipt_file || null;
          if (receiptUrl && item.receipt_code) {
            pdf.setTextColor(200, 16, 46);
            pdf.text(item.receipt_code || "—", cols.receipt + 1, y + 5);
            const linkW = pdf.getTextWidth(item.receipt_code || "");
            pdf.link(cols.receipt + 1, y + 1, linkW, 5, { url: receiptUrl });
            pdf.setTextColor(40);
          } else {
            pdf.setTextColor(150);
            pdf.text(item.receipt_code || "—", cols.receipt + 1, y + 5);
            pdf.setTextColor(40);
          }

          // Total
          pdf.setFont(undefined, "bold");
          pdf.text(formatCurrency(item.paid_amount), cols.total + 18, y + 5, { align: "right" });
          pdf.setFont(undefined, "normal");

          // Client splits — one per line
          if (splits.length > 0) {
            splits.forEach((a, si) => {
              const splitStr = `${a.client_code}: ${formatCurrency(a.amount)} (${a.percentage}%)`;
              pdf.setFontSize(6.5).setTextColor(80);
              pdf.text(splitStr, cols.splits + 1, y + 4 + si * 4);
              pdf.setFontSize(7.5).setTextColor(40);
            });
          } else {
            pdf.setTextColor(150);
            pdf.text("—", cols.splits + 1, y + 5);
            pdf.setTextColor(40);
          }

          // VAT
          pdf.setFontSize(7.5);
          if (item.vat) {
            pdf.setTextColor(0, 140, 70);
            pdf.setFont(undefined, "bold");
            pdf.text("Y", cols.vat, y + 5, { align: "right" });
          } else {
            pdf.setTextColor(150);
            pdf.setFont(undefined, "normal");
            pdf.text("N", cols.vat, y + 5, { align: "right" });
          }
          pdf.setTextColor(40).setFont(undefined, "normal");

          pdf.setDrawColor(230).line(margin, y + rowH, pageW - margin, y + rowH);
          y += rowH;
        });

        // Month subtotal
        checkPage(8);
        pdf.setFillColor(200, 16, 46).rect(margin, y, usableW, 7, "F");
        pdf.setFontSize(8).setFont(undefined, "bold").setTextColor(255);
        pdf.text(`${month.toUpperCase()} TOTAL`, cols.total - 2, y + 5, { align: "right" });
        pdf.text(formatCurrency(items.reduce((s, e) => s + (e.paid_amount || 0), 0)), cols.total + 18, y + 5, { align: "right" });
        y += 10;
      }

      // ── Grand total ──────────────────────────────────────────────────────
      checkPage(10);
      pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 8, "F");
      pdf.setFontSize(10).setFont(undefined, "bold").setTextColor(255);
      pdf.text("GRAND TOTAL", margin + 2, y + 5.5);
      pdf.text(formatCurrency(overallTotal), pageW - margin - 2, y + 5.5, { align: "right" });
      y += 12;

      // ── Footer ───────────────────────────────────────────────────────────
      checkPage(18);
      pdf.setDrawColor(200).line(margin, y, pageW - margin, y);
      y += 5;
      pdf.setFontSize(7.5).setFont(undefined, "normal").setTextColor(140);
      pdf.text(`${COMPANY_INFO.name} | Reg No. ${COMPANY_INFO.regNumber} | VAT No. ${COMPANY_INFO.vatNumber} | ${COMPANY_INFO.email}`, pageW / 2, y, { align: "center" });

      pdf.save(`WDT-Accountant-Export-${dateFrom || "all"}-to-${dateTo || "all"}.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPDF(false);
    }
  };

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
        <div className="bg-white text-black rounded-xl border border-border overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>

          {/* Download actions */}
          <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border">
            <span className="font-semibold text-foreground">Preview — {filtered.length} expenses · {dateRange}</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCSVExport} disabled={generatingCSV} className="gap-1.5">
                {generatingCSV ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Download CSV
              </Button>
              <Button onClick={handlePDFExport} disabled={generatingPDF} className="gap-1.5">
                {generatingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Download PDF
              </Button>
            </div>
          </div>

          {/* Report body */}
          <div className="p-8">
            {/* Header — logo + title like Client Report */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <img
                  src="https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/5a122ba74_wdt-logo-v1-logo-full-colour-rgb.jpg"
                  alt="We Define Travel"
                  className="h-16 w-auto object-contain mb-3"
                  crossOrigin="anonymous"
                />
                <div className="text-xs text-gray-500">
                  {COMPANY_INFO.address.split(", ").map((line, i) => <div key={i}>{line}</div>)}
                  <div>{COMPANY_INFO.email}</div>
                  <div>{COMPANY_INFO.website}</div>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-bold text-[#2D2D2D] tracking-tight">FULL EXPENSE REPORT</h2>
                <p className="text-sm text-gray-600 mt-1">Accountant Export</p>
                <p className="text-sm text-gray-600 mt-0.5">Period: {dateRange}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>

            <hr className="border-gray-300 mb-6" />

            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Full itemised expense report for {COMPANY_INFO.name} for the period {dateRange}. Expenses are listed in chronological order, grouped by month.
            </p>

            {/* Month sections */}
            {Object.entries(groupedByMonth).map(([month, items]) => (
              <div key={month} className="mb-6">
                {/* Month header */}
                <div className="flex justify-between items-center px-3 py-2 bg-[#2D2D2D] text-white text-sm font-semibold rounded-t">
                  <span>{month.toUpperCase()}</span>
                  <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Column headers */}
                <div className="grid px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50"
                  style={{ gridTemplateColumns: "80px 1fr 140px 120px 80px 80px 130px 36px" }}>
                  <span>Date</span>
                  <span>Description</span>
                  <span>Category</span>
                  <span>Paid By</span>
                  <span>Receipt</span>
                  <span className="text-right">Total</span>
                  <span>Client Splits</span>
                  <span className="text-right">VAT</span>
                </div>

                {/* Rows */}
                {items.map((item, i) => {
                  const receiptUrl = item.receipt_files?.[0]?.public_receipt_url || item.primary_receipt_file_url || item.receipt_url || item.receipt_files?.[0]?.file_url || item.receipt_file;
                  return (
                    <div key={item.id}
                      className={`grid px-3 py-2 text-xs border-b border-gray-100 items-start ${i % 2 === 1 ? "bg-[#F5F5F5]" : ""}`}
                      style={{ gridTemplateColumns: "80px 1fr 140px 120px 80px 80px 130px 36px" }}>

                      <span className="text-gray-600">{formatDateUK(item.date)}</span>

                      <span className="pr-2 font-medium">{item.description}</span>

                      <span className="text-gray-500 pr-2">{(item.category || "—").replace(/^(WDT - |Client Expenses - )/, "")}</span>

                      <span className="text-gray-600 pr-2">{getPaidByLabel(item.paid_by) || item.paid_by || "—"}</span>

                      <span>
                        {receiptUrl ? (
                          <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="text-[#C8102E] hover:underline font-mono">{item.receipt_code || "View"}</a>
                        ) : (
                          <span className="text-gray-400 font-mono">{item.receipt_code || "—"}</span>
                        )}
                      </span>

                      <span className="text-right font-semibold">{formatCurrency(item.paid_amount)}</span>

                      <span className="space-y-0.5">
                        {(item.client_allocations || []).map((a, ai) => (
                          <div key={ai} className="text-gray-500">
                            <span className="font-medium text-gray-700">{a.client_code}</span> {formatCurrency(a.amount)} <span className="text-gray-400">({a.percentage}%)</span>
                          </div>
                        ))}
                      </span>

                      <span className={`text-right font-semibold ${item.vat ? "text-green-600" : "text-gray-400"}`}>
                        {item.vat ? "Y" : "N"}
                      </span>
                    </div>
                  );
                })}

                {/* Month subtotal */}
                <div className="grid px-3 py-2 bg-[#C8102E] text-white text-sm font-bold rounded-b"
                  style={{ gridTemplateColumns: "80px 1fr 140px 120px 80px 80px 130px 36px" }}>
                  <span className="col-span-5 text-right pr-3">
                    {month.toUpperCase()} TOTAL
                  </span>
                  <span className="text-right">{formatCurrency(items.reduce((s, e) => s + (e.paid_amount || 0), 0))}</span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            ))}

            {/* Grand total */}
            {filtered.length > 0 && (
              <div className="flex justify-between px-3 py-3 bg-[#2D2D2D] text-white font-bold rounded mt-2">
                <span>GRAND TOTAL</span>
                <span className="text-lg">{formatCurrency(overallTotal)}</span>
              </div>
            )}

            {filtered.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">No expenses found for the selected date range</div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-sm text-gray-500">
              <p>Warm regards,</p>
              <p className="font-semibold text-gray-700 mt-1">{COMPANY_INFO.director}</p>
              <p>Director, {COMPANY_INFO.name}</p>
              <p>{COMPANY_INFO.directorEmail}</p>
            </div>

            <div className="mt-6 pt-3 border-t border-gray-200 text-xs text-gray-400 text-center">
              {COMPANY_INFO.name} | Registered in England & Wales No. {COMPANY_INFO.regNumber} | VAT No. {COMPANY_INFO.vatNumber}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}