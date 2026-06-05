import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileDown, Eye } from "lucide-react";
import { CLIENT_CODES, getClientName, formatCurrency, formatForeignCurrency, formatDateUK, COMPANY_INFO } from "@/lib/constants";
import { downloadSoMaldivesExcel } from "@/lib/soMaldivesExcel";

export default function ClientReport() {
  const [clientCode, setClientCode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef(null);

  const { data: allExpenses = [] } = useQuery({
    queryKey: ["allExpenses"],
    queryFn: () => base44.entities.Expense.list("-date", 1000),
  });

  const { data: allMileage = [] } = useQuery({
    queryKey: ["allMileage"],
    queryFn: () => base44.entities.MileageJourney.list("-date", 1000),
  });

  // Filter expenses for this client in date range
  const reportData = useMemo(() => {
    if (!clientCode || !dateFrom || !dateTo) return [];

    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    const clientExpenses = allExpenses
      .filter(e => {
        const d = new Date(e.date);
        return d >= from && d <= to && e.client_allocations?.some(a => a.client_code === clientCode);
      })
      .map(e => {
        const alloc = e.client_allocations.find(a => a.client_code === clientCode);
        return { ...e, clientAmount: alloc?.amount || e.paid_amount, type: "expense" };
      });

    const clientMileage = allMileage
      .filter(m => {
        const d = new Date(m.date);
        return d >= from && d <= to && m.client_allocations?.some(a => a.client_code === clientCode);
      })
      .map(m => {
        const alloc = m.client_allocations.find(a => a.client_code === clientCode);
        return {
          ...m,
          clientAmount: alloc?.amount || m.total_cost,
          description: `Mileage: ${m.purpose} (${m.stops?.map(s => s.postcode).join(" → ")})`,
          paid_amount: m.total_cost,
          type: "mileage",
        };
      });

    return [...clientExpenses, ...clientMileage].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [clientCode, dateFrom, dateTo, allExpenses, allMileage]);

  // Group by month
  const grouped = useMemo(() => {
    const map = {};
    reportData.forEach(item => {
      const key = item.month || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [reportData]);

  const grandTotal = reportData.reduce((s, e) => s + (e.clientAmount || 0), 0);
  const clientName = getClientName(clientCode);
  const dateRange = dateFrom && dateTo ? `${formatDateUK(dateFrom)} — ${formatDateUK(dateTo)}` : "";

  const handleGenerate = () => {
    setShowPreview(true);
  };

  const handleDownload = async () => {
    setGenerating(true);
    const { default: jsPDF } = await import("jspdf");

    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 14;
    const usableW = pageW - margin * 2;
    let y = margin;

    const checkPage = (needed = 8) => {
      if (y + needed > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
    };

    // ── Header ──────────────────────────────────────────────────────────
    pdf.setFontSize(16).setFont(undefined, "bold");
    pdf.text("EXPENSE BREAKDOWN SUMMARY", pageW - margin, y, { align: "right" });
    pdf.setFontSize(10).setFont(undefined, "normal").setTextColor(100);
    y += 6;
    pdf.text(`Prepared for: ${clientName}`, pageW - margin, y, { align: "right" });
    y += 5;
    pdf.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), pageW - margin, y, { align: "right" });

    y += 10;
    pdf.setDrawColor(200).line(margin, y, pageW - margin, y);
    y += 8;

    // ── TO block ────────────────────────────────────────────────────────
    pdf.setFontSize(11).setFont(undefined, "bold").setTextColor(200, 16, 46);
    pdf.text(`TO: ${clientName}`, margin, y);
    y += 6;
    pdf.setFontSize(8.5).setFont(undefined, "normal").setTextColor(80);
    const intro = `Please find below a full itemised breakdown of all expenses charged to ${clientName} by We Define Travel for the period ${dateRange}. All amounts are in GBP (£).`;
    const introLines = pdf.splitTextToSize(intro, usableW);
    pdf.text(introLines, margin, y);
    y += introLines.length * 5 + 6;

    // ── Column layout ────────────────────────────────────────────────────
    const cols = { date: margin, desc: margin + 22, receipt: margin + usableW * 0.58, total: margin + usableW * 0.73, split: margin + usableW * 0.87 };

    for (const [month, items] of Object.entries(grouped)) {
      checkPage(14);

      // Month header bar
      pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 7, "F");
      pdf.setFontSize(9).setFont(undefined, "bold").setTextColor(255);
      pdf.text(month.toUpperCase(), margin + 2, y + 5);
      pdf.text(`${items.length} item${items.length !== 1 ? "s" : ""}`, pageW - margin - 2, y + 5, { align: "right" });
      y += 7;

      // Column headers
      pdf.setFillColor(245, 245, 245).rect(margin, y, usableW, 6, "F");
      pdf.setFontSize(7.5).setFont(undefined, "bold").setTextColor(120);
      pdf.text("Date", cols.date + 1, y + 4.5);
      pdf.text("Description", cols.desc + 1, y + 4.5);
      pdf.text("Receipt", cols.receipt + 1, y + 4.5);
      pdf.text("Total Amt", cols.total + 1, y + 4.5);
      pdf.text("Split Amt", cols.split + 1, y + 4.5);
      y += 6;

      // Rows
      items.forEach((item, i) => {
        const rowH = 7;
        checkPage(rowH + 2);

        if (i % 2 === 1) {
          pdf.setFillColor(250, 250, 250).rect(margin, y, usableW, rowH, "F");
        }

        pdf.setFontSize(8).setFont(undefined, "normal").setTextColor(40);
        pdf.text(formatDateUK(item.date), cols.date + 1, y + 5);

        const descText = pdf.splitTextToSize(item.description || "", cols.receipt - cols.desc - 4);
        pdf.text(descText[0], cols.desc + 1, y + 5); // single line in table

        // Receipt — prefer Google Drive public URL, fall back to base44 storage
        const receiptUrl = item.type === "mileage"
          ? (item.route_image_url || null)
          : (item.receipt_files?.[0]?.public_receipt_url || item.primary_receipt_file_url || item.receipt_url || item.receipt_files?.[0]?.file_url || item.receipt_file || null);
        const receiptLabel = item.type === "mileage"
          ? (item.route_image_code || item.receipt_code || "Map")
          : (item.receipt_code || "");

        if (receiptUrl && receiptLabel) {
          pdf.setTextColor(200, 16, 46).setFont(undefined, "normal");
          pdf.text(receiptLabel, cols.receipt + 1, y + 5);
          const linkW = pdf.getTextWidth(receiptLabel);
          pdf.link(cols.receipt + 1, y + 1, linkW, 5, { url: receiptUrl });
        } else if (receiptLabel) {
          pdf.setTextColor(150).setFont(undefined, "normal");
          pdf.text(receiptLabel, cols.receipt + 1, y + 5);
        }

        pdf.setTextColor(40).setFont(undefined, "normal");
        pdf.text(formatCurrency(item.paid_amount), pageW - margin - (usableW - (cols.split - margin)) - 2, y + 5, { align: "right" });
        pdf.text(formatCurrency(item.clientAmount), pageW - margin - 2, y + 5, { align: "right" });

        pdf.setDrawColor(230).line(margin, y + rowH, pageW - margin, y + rowH);
        y += rowH;
      });

      // Month subtotal bar
      checkPage(8);
      pdf.setFillColor(200, 16, 46).rect(margin, y, usableW, 7, "F");
      pdf.setFontSize(8.5).setFont(undefined, "bold").setTextColor(255);
      pdf.text(`${month.toUpperCase()} TOTAL`, cols.receipt - 2, y + 5, { align: "right" });
      pdf.text(formatCurrency(items.reduce((s, e) => s + (e.paid_amount || 0), 0)), pageW - margin - (usableW - (cols.split - margin)) - 2, y + 5, { align: "right" });
      pdf.text(formatCurrency(items.reduce((s, e) => s + (e.clientAmount || 0), 0)), pageW - margin - 2, y + 5, { align: "right" });
      y += 10;
    }

    // ── Grand total ──────────────────────────────────────────────────────
    if (reportData.length > 0) {
      checkPage(10);
      pdf.setFillColor(200, 16, 46).rect(margin, y, usableW, 8, "F");
      pdf.setFontSize(10).setFont(undefined, "bold").setTextColor(255);
      pdf.text("GRAND TOTAL", margin + 2, y + 5.5);
      pdf.text(formatCurrency(grandTotal), pageW - margin - 2, y + 5.5, { align: "right" });
      y += 12;
    }

    // ── Footer ───────────────────────────────────────────────────────────
    checkPage(24);
    pdf.setDrawColor(200).line(margin, y, pageW - margin, y);
    y += 6;
    pdf.setFontSize(8).setFont(undefined, "italic").setTextColor(120);
    pdf.text("All amounts shown are Zero Rated for VAT purposes. No VAT is applicable on these expenses.", margin, y);
    y += 6;
    pdf.setFont(undefined, "normal");
    pdf.text("Warm regards,", margin, y); y += 5;
    pdf.setFont(undefined, "bold").setTextColor(60);
    pdf.text(COMPANY_INFO.director, margin, y); y += 4;
    pdf.setFont(undefined, "normal").setTextColor(120);
    pdf.text(`Director, ${COMPANY_INFO.name}`, margin, y); y += 4;
    pdf.text(COMPANY_INFO.directorEmail, margin, y); y += 10;
    pdf.setFontSize(7.5).setTextColor(160);
    pdf.text(`${COMPANY_INFO.name} | Registered in England & Wales No. ${COMPANY_INFO.regNumber} | VAT No. ${COMPANY_INFO.vatNumber}`, pageW / 2, y, { align: "center" });

    pdf.save(`WDT-Expense-Report-${clientCode}-${dateFrom}-to-${dateTo}.pdf`);
    setGenerating(false);
  };

  const handleDownloadSoMaldivesExcel = async () => {
    setGenerating(true);
    try {
      await downloadSoMaldivesExcel({ reportData, dateRange, dateFrom, dateTo });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Client Report</h1>

      {/* Controls */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label className="text-sm font-medium">Client</Label>
            <Select value={clientCode} onValueChange={setClientCode}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {CLIENT_CODES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium">From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={handleGenerate} disabled={!clientCode || !dateFrom || !dateTo} className="gap-1.5">
            <Eye className="h-4 w-4" /> Generate
          </Button>
        </div>
      </div>

      {/* Preview */}
      {showPreview && (
        <>
          <div className="flex justify-end gap-3 mb-4">
            {clientCode === "SO" && (
              <Button
                variant="outline"
                onClick={handleDownloadSoMaldivesExcel}
                disabled={generating || reportData.length === 0}
                className="gap-1.5"
              >
                <FileDown className="h-4 w-4" />
                Download SO/Maldives Excel
              </Button>
            )}
            <Button onClick={handleDownload} disabled={generating} className="gap-1.5">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Download PDF
            </Button>
          </div>

          <div ref={reportRef} className="bg-white text-black p-8 max-w-4xl mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <img
                  src="https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/5a122ba74_wdt-logo-v1-logo-full-colour-rgb.jpg"
                  alt="We Define Travel"
                  className="h-16 w-auto object-contain mb-3"
                  crossOrigin="anonymous"
                />
                <div className="text-xs text-gray-500">
                  {COMPANY_INFO.address.split(", ").map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                  <div>{COMPANY_INFO.email}</div>
                  <div>{COMPANY_INFO.website}</div>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-bold text-[#2D2D2D] tracking-tight">EXPENSE BREAKDOWN SUMMARY</h2>
                <p className="text-sm text-gray-600 mt-1">Prepared for {clientName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-300 mb-6" />

            {/* TO */}
            <p className="font-bold text-[#C8102E] mb-3">TO: {clientName}</p>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Please find below a full itemised breakdown of all expenses charged to {clientName} by {COMPANY_INFO.name} for the period {dateRange}. Expenses are grouped by month and include the date incurred, a full description, receipt reference code, and the amount paid. All amounts are in GBP (£).
            </p>

            {/* Expense table */}
            {Object.entries(grouped).map(([month, items]) => (
              <div key={month} className="mb-4">
                {/* Month header */}
                <div className="flex justify-between items-center px-3 py-2 bg-[#2D2D2D] text-white text-sm font-semibold rounded-t">
                  <span>{month.toUpperCase()}</span>
                  <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
                </div>
                {/* Column headers */}
                <div className="grid grid-cols-[90px_1fr_100px_100px_80px] px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50">
                  <span>Date</span>
                  <span>Description</span>
                  <span>Receipt</span>
                  <span className="text-right">Total Amount</span>
                  <span className="text-right">Split Amount</span>
                </div>
                {/* Rows */}
                {items.map((item, i) => (
                  <div key={item.id} className={`grid grid-cols-[90px_1fr_100px_100px_80px] px-3 py-2 text-sm border-b border-gray-100 ${i % 2 === 1 ? "bg-[#F5F5F5]" : ""}`}>
                    <span>{formatDateUK(item.date)}</span>
                    <span className="pr-2">
                      {item.description}
                      {item.currency && item.currency !== "GBP" && item.original_amount && (
                        <span className="block text-xs text-gray-400">{formatForeignCurrency(item.original_amount, item.currency)}{item.exchange_rate ? ` @ ${item.exchange_rate.toFixed(4)}` : ""}</span>
                      )}
                    </span>
                    <span>
                      {item.type === "mileage" && item.route_image_url ? (
                        <a href={item.route_image_url} target="_blank" rel="noopener noreferrer" className="text-[#C8102E] hover:underline font-mono text-xs" title="View route map">{item.route_image_code || "Map"}</a>
                      ) : (() => {
                        const url = item.receipt_files?.[0]?.public_receipt_url || item.primary_receipt_file_url || item.receipt_url || item.receipt_files?.[0]?.file_url || item.receipt_file;
                        return url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#C8102E] hover:underline font-mono text-xs">{item.receipt_code}</a>
                        ) : (
                          <span className="text-gray-400 font-mono text-xs">{item.receipt_code}</span>
                        );
                      })()}
                    </span>
                    <span className="text-right font-medium">{formatCurrency(item.paid_amount)}</span>
                    <span className="text-right font-medium">{formatCurrency(item.clientAmount)}</span>
                  </div>
                ))}
                {/* Month subtotal */}
                <div className="grid grid-cols-[90px_1fr_100px_100px_80px] px-3 py-2 bg-[#C8102E] text-white text-sm font-bold rounded-b">
                 <span className="col-span-3 text-right pr-3">{month.toUpperCase()} TOTAL</span>
                 <span className="text-right">{formatCurrency(items.reduce((s, e) => s + (e.paid_amount || 0), 0))}</span>
                 <span className="text-right">{formatCurrency(items.reduce((s, e) => s + (e.clientAmount || 0), 0))}</span>
                </div>
              </div>
            ))}

            {/* Grand total */}
            {reportData.length > 0 && (
              <div className="flex justify-between px-3 py-3 bg-[#C8102E] text-white font-bold rounded mt-2">
                <span>GRAND TOTAL</span>
                <span className="text-lg">{formatCurrency(grandTotal)}</span>
              </div>
            )}

            {reportData.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">No expenses found for this client in the selected date range</div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-sm text-gray-500">
              <p className="italic mb-3">All amounts shown are Zero Rated for VAT purposes. No VAT is applicable on these expenses.</p>
              <hr className="border-gray-200 mb-3" />
              <p>Warm regards,</p>
              <p className="font-semibold text-gray-700 mt-1">{COMPANY_INFO.director}</p>
              <p>Director, {COMPANY_INFO.name}</p>
              <p>{COMPANY_INFO.directorEmail}</p>
            </div>

            <div className="mt-6 pt-3 border-t border-gray-200 text-xs text-gray-400 text-center">
              {COMPANY_INFO.name} | Registered in England & Wales No. {COMPANY_INFO.regNumber} | VAT No. {COMPANY_INFO.vatNumber}
            </div>
          </div>
        </>
      )}
    </div>
  );
}