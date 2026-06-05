import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileSpreadsheet, FileText, Eye } from "lucide-react";
import { formatCurrency, formatDateUK, formatMonth, getClientName, getPaidByLabel, COMPANY_INFO, PAID_BY_CODES } from "@/lib/constants";
import MonthEndReadiness from "./MonthEndReadiness";

function getMileagePaidByLabel(journey) {
  // Mileage uses staff_member email — map to name
  const email = journey.staff_member || "";
  if (journey.staff_member_name) return journey.staff_member_name;
  // fallback: derive from email
  const name = email.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

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

  const { data: allMileage = [] } = useQuery({
    queryKey: ["allMileage"],
    queryFn: () => base44.entities.MileageJourney.list("-date", 1000),
  });

  // Chronologically sorted, date-filtered expenses
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

  // Chronologically sorted, date-filtered mileage
  const filteredMileage = useMemo(() => {
    let miles = [...allMileage];
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      miles = miles.filter(m => {
        const d = new Date(m.date);
        return d >= from && d <= to;
      });
    }
    return miles.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [allMileage, dateFrom, dateTo]);

  // Group expenses by month
  const groupedByMonth = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const key = e.month || formatMonth(e.date) || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [filtered]);

  // Group mileage by month
  const mileageByMonth = useMemo(() => {
    const map = {};
    filteredMileage.forEach(m => {
      const key = m.month || formatMonth(m.date) || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [filteredMileage]);

  const overallTotal = filtered.reduce((s, e) => s + (e.paid_amount || 0), 0);
  const totalMileageCost = filteredMileage.reduce((s, m) => s + (m.total_cost || 0), 0);
  const totalMiles = filteredMileage.reduce((s, m) => s + (m.total_miles || 0), 0);
  const dateRange = dateFrom && dateTo ? `${formatDateUK(dateFrom)} — ${formatDateUK(dateTo)}` : "All dates";

  const journeyDescription = (m) => {
    const stops = (m.stops || []).map(s => s.postcode || s.label).filter(Boolean);
    return stops.length > 0 ? stops.join(" → ") : (m.purpose || "—");
  };

  const handleCSVExport = () => {
    setGeneratingCSV(true);

    // Expenses sheet
    const expHeaders = ["Type","Date","Description","Category","Paid By","Receipt Code","Total Amount (GBP)","Client Splits","VAT","Currency","Original Amount","Exchange Rate","Reimbursement Required","Reimbursement Paid","Month","Year"];
    const expRows = filtered.map(e => [
      "Expense",
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

    // Mileage rows (appended after a blank line)
    const mileHeaders = ["Type","Date","Journey (Stops)","Purpose","Paid By (Staff)","Vehicle","Miles","Rate/Mile","Cost","Client Splits","Reimbursement Required","Reimbursement Paid","Receipt Code","Month","Year"];
    const mileRows = filteredMileage.map(m => [
      "Mileage",
      formatDateUK(m.date),
      `"${journeyDescription(m)}"`,
      `"${(m.purpose || "").replace(/"/g, '""')}"`,
      `"${getMileagePaidByLabel(m)}"`,
      m.vehicle_type || "",
      m.total_miles || "",
      m.rate_per_mile || "",
      m.total_cost || "",
      `"${(m.client_allocations || []).map(a => `${a.client_code} ${a.percentage}% £${(a.amount||0).toFixed(2)}`).join("; ")}"`,
      m.reimbursement_required ? "Y" : "N",
      m.reimbursement_paid ? "Y" : "N",
      m.receipt_code || "",
      m.month || "",
      m.year || "",
    ]);

    const csv = [
      "EXPENSES",
      expHeaders.join(","),
      ...expRows.map(r => r.join(",")),
      "",
      "MILEAGE",
      mileHeaders.join(","),
      ...mileRows.map(r => r.join(",")),
    ].join("\n");

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
      const pdf = new jsPDF("l", "mm", "a4");
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

      pdf.setFontSize(8.5).setFont(undefined, "normal").setTextColor(80);
      const intro = `Full itemised expense and mileage report for ${COMPANY_INFO.name} for the period ${dateRange}. All amounts in GBP (£).`;
      const introLines = pdf.splitTextToSize(intro, usableW);
      pdf.text(introLines, margin, y);
      y += introLines.length * 5 + 6;

      // ── SECTION 1: EXPENSES ──────────────────────────────────────────────
      pdf.setFontSize(11).setFont(undefined, "bold").setTextColor(200, 16, 46);
      pdf.text("SECTION 1 — EXPENSES", margin, y);
      y += 8;

      const cols = {
        date:    margin,
        desc:    margin + 20,
        cat:     margin + 75,
        paidBy:  margin + 120,
        receipt: margin + 152,
        total:   margin + 172,
        splits:  margin + 192,
        vat:     margin + usableW - 6,
      };

      for (const [month, items] of Object.entries(groupedByMonth)) {
        checkPage(16);
        pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 7, "F");
        pdf.setFontSize(9).setFont(undefined, "bold").setTextColor(255);
        pdf.text(month.toUpperCase(), margin + 2, y + 5);
        pdf.text(`${items.length} item${items.length !== 1 ? "s" : ""}`, pageW - margin - 2, y + 5, { align: "right" });
        y += 7;

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

        items.forEach((item, i) => {
          const splits = item.client_allocations || [];
          const rowH = Math.max(7, 4 + splits.length * 4);
          checkPage(rowH + 2);
          if (i % 2 === 1) pdf.setFillColor(250, 250, 250).rect(margin, y, usableW, rowH, "F");

          pdf.setFontSize(7.5).setFont(undefined, "normal").setTextColor(40);
          pdf.text(formatDateUK(item.date), cols.date + 1, y + 5);
          pdf.text(pdf.splitTextToSize(item.description || "", cols.cat - cols.desc - 3)[0], cols.desc + 1, y + 5);
          pdf.text(pdf.splitTextToSize((item.category || "—").replace(/^(WDT - |Client Expenses - )/, ""), cols.paidBy - cols.cat - 3)[0], cols.cat + 1, y + 5);
          pdf.text(pdf.splitTextToSize(getPaidByLabel(item.paid_by) || item.paid_by || "—", cols.receipt - cols.paidBy - 3)[0], cols.paidBy + 1, y + 5);

          const receiptUrl = item.receipt_files?.[0]?.public_receipt_url || item.primary_receipt_file_url || item.receipt_url || item.receipt_files?.[0]?.file_url || item.receipt_file || null;
          if (receiptUrl && item.receipt_code) {
            pdf.setTextColor(200, 16, 46);
            pdf.text(item.receipt_code, cols.receipt + 1, y + 5);
            pdf.link(cols.receipt + 1, y + 1, pdf.getTextWidth(item.receipt_code), 5, { url: receiptUrl });
            pdf.setTextColor(40);
          } else {
            pdf.setTextColor(150);
            pdf.text(item.receipt_code || "—", cols.receipt + 1, y + 5);
            pdf.setTextColor(40);
          }

          pdf.setFont(undefined, "bold");
          pdf.text(formatCurrency(item.paid_amount), cols.total + 18, y + 5, { align: "right" });
          pdf.setFont(undefined, "normal");

          splits.forEach((a, si) => {
            pdf.setFontSize(6.5).setTextColor(80);
            pdf.text(`${a.client_code}: ${formatCurrency(a.amount)} (${a.percentage}%)`, cols.splits + 1, y + 4 + si * 4);
          });
          if (splits.length === 0) { pdf.setTextColor(150); pdf.text("—", cols.splits + 1, y + 5); }

          pdf.setFontSize(7.5);
          item.vat ? (pdf.setTextColor(0, 140, 70).setFont(undefined, "bold").text("Y", cols.vat, y + 5, { align: "right" }))
                   : (pdf.setTextColor(150).setFont(undefined, "normal").text("N", cols.vat, y + 5, { align: "right" }));
          pdf.setTextColor(40).setFont(undefined, "normal");
          pdf.setDrawColor(230).line(margin, y + rowH, pageW - margin, y + rowH);
          y += rowH;
        });

        checkPage(8);
        pdf.setFillColor(200, 16, 46).rect(margin, y, usableW, 7, "F");
        pdf.setFontSize(8).setFont(undefined, "bold").setTextColor(255);
        pdf.text(`${month.toUpperCase()} TOTAL`, cols.total - 2, y + 5, { align: "right" });
        pdf.text(formatCurrency(items.reduce((s, e) => s + (e.paid_amount || 0), 0)), cols.total + 18, y + 5, { align: "right" });
        y += 10;
      }

      checkPage(10);
      pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 8, "F");
      pdf.setFontSize(9).setFont(undefined, "bold").setTextColor(255);
      pdf.text("EXPENSES TOTAL", margin + 2, y + 5.5);
      pdf.text(formatCurrency(overallTotal), pageW - margin - 2, y + 5.5, { align: "right" });
      y += 14;

      // ── SECTION 2: MILEAGE ───────────────────────────────────────────────
      if (filteredMileage.length > 0) {
        checkPage(16);
        pdf.setFontSize(11).setFont(undefined, "bold").setTextColor(200, 16, 46);
        pdf.text("SECTION 2 — MILEAGE LOG", margin, y);
        y += 8;

        const mc = {
          date:    margin,
          journey: margin + 20,
          purpose: margin + 95,
          staff:   margin + 138,
          vehicle: margin + 170,
          miles:   margin + 196,
          rate:    margin + 212,
          cost:    margin + usableW,
        };

        for (const [month, items] of Object.entries(mileageByMonth)) {
          checkPage(16);
          pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 7, "F");
          pdf.setFontSize(9).setFont(undefined, "bold").setTextColor(255);
          pdf.text(month.toUpperCase(), margin + 2, y + 5);
          pdf.text(`${items.length} journey${items.length !== 1 ? "s" : ""}`, pageW - margin - 2, y + 5, { align: "right" });
          y += 7;

          pdf.setFillColor(245, 245, 245).rect(margin, y, usableW, 6, "F");
          pdf.setFontSize(7).setFont(undefined, "bold").setTextColor(100);
          pdf.text("Date", mc.date + 1, y + 4.5);
          pdf.text("Journey (Stops)", mc.journey + 1, y + 4.5);
          pdf.text("Purpose", mc.purpose + 1, y + 4.5);
          pdf.text("Staff", mc.staff + 1, y + 4.5);
          pdf.text("Vehicle", mc.vehicle + 1, y + 4.5);
          pdf.text("Miles", mc.miles + 1, y + 4.5);
          pdf.text("Rate", mc.rate + 1, y + 4.5);
          pdf.text("Cost", mc.cost, y + 4.5, { align: "right" });
          y += 6;

          items.forEach((m, i) => {
            checkPage(9);
            if (i % 2 === 1) pdf.setFillColor(250, 250, 250).rect(margin, y, usableW, 7, "F");

            pdf.setFontSize(7.5).setFont(undefined, "normal").setTextColor(40);
            pdf.text(formatDateUK(m.date), mc.date + 1, y + 5);
            pdf.text(pdf.splitTextToSize(journeyDescription(m), mc.purpose - mc.journey - 3)[0], mc.journey + 1, y + 5);
            pdf.text(pdf.splitTextToSize(m.purpose || "—", mc.staff - mc.purpose - 3)[0], mc.purpose + 1, y + 5);
            pdf.text(getMileagePaidByLabel(m), mc.staff + 1, y + 5);
            pdf.text(m.vehicle_type || "—", mc.vehicle + 1, y + 5);
            pdf.text(String(m.total_miles || 0), mc.miles + 1, y + 5);
            pdf.text(`£${(m.rate_per_mile || 0).toFixed(2)}`, mc.rate + 1, y + 5);
            pdf.setFont(undefined, "bold");
            pdf.text(formatCurrency(m.total_cost), mc.cost, y + 5, { align: "right" });
            pdf.setFont(undefined, "normal");
            pdf.setDrawColor(230).line(margin, y + 7, pageW - margin, y + 7);
            y += 7;
          });

          checkPage(8);
          const monthMiles = items.reduce((s, m) => s + (m.total_miles || 0), 0);
          const monthCost = items.reduce((s, m) => s + (m.total_cost || 0), 0);
          pdf.setFillColor(200, 16, 46).rect(margin, y, usableW, 7, "F");
          pdf.setFontSize(8).setFont(undefined, "bold").setTextColor(255);
          pdf.text(`${month.toUpperCase()} TOTAL`, mc.miles - 2, y + 5, { align: "right" });
          pdf.text(`${monthMiles.toFixed(1)} mi`, mc.miles + 1, y + 5);
          pdf.text(formatCurrency(monthCost), mc.cost, y + 5, { align: "right" });
          y += 10;
        }

        checkPage(10);
        pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 8, "F");
        pdf.setFontSize(9).setFont(undefined, "bold").setTextColor(255);
        pdf.text("MILEAGE TOTAL", margin + 2, y + 5.5);
        pdf.text(`${totalMiles.toFixed(1)} miles`, pageW / 2, y + 5.5, { align: "center" });
        pdf.text(formatCurrency(totalMileageCost), pageW - margin - 2, y + 5.5, { align: "right" });
        y += 14;
      }

      // ── Grand total ──────────────────────────────────────────────────────
      checkPage(10);
      pdf.setFillColor(45, 45, 45).rect(margin, y, usableW, 8, "F");
      pdf.setFontSize(10).setFont(undefined, "bold").setTextColor(255);
      pdf.text("GRAND TOTAL (Expenses + Mileage)", margin + 2, y + 5.5);
      pdf.text(formatCurrency(overallTotal + totalMileageCost), pageW - margin - 2, y + 5.5, { align: "right" });
      y += 12;

      checkPage(12);
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
          <span className="text-sm text-muted-foreground">{filtered.length} expenses · {filteredMileage.length} journeys</span>
          <Button onClick={() => setShowPreview(true)} disabled={filtered.length === 0 && filteredMileage.length === 0} className="gap-1.5">
            <Eye className="h-4 w-4" /> Preview
          </Button>
        </div>
      </div>

      {showPreview && (
        <div className="bg-white text-black rounded-xl border border-border overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border">
            <span className="font-semibold text-foreground">Preview — {filtered.length} expenses · {filteredMileage.length} mileage journeys · {dateRange}</span>
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

          <div className="p-8">
            {/* Report header */}
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
              Full itemised expense and mileage report for {COMPANY_INFO.name} for the period {dateRange}. Listed in chronological order, grouped by month.
            </p>

            {/* ── SECTION 1: EXPENSES ── */}
            <h3 className="text-base font-bold text-[#C8102E] mb-3">Section 1 — Expenses</h3>
            {Object.entries(groupedByMonth).map(([month, items]) => (
              <div key={month} className="mb-6">
                <div className="flex justify-between items-center px-3 py-2 bg-[#2D2D2D] text-white text-sm font-semibold rounded-t">
                  <span>{month.toUpperCase()}</span>
                  <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50"
                  style={{ gridTemplateColumns: "80px 1fr 140px 120px 80px 80px 130px 36px" }}>
                  <span>Date</span><span>Description</span><span>Category</span><span>Paid By</span><span>Receipt</span><span className="text-right">Total</span><span>Client Splits</span><span className="text-right">VAT</span>
                </div>
                {items.map((item, i) => {
                  const receiptUrl = item.receipt_files?.[0]?.public_receipt_url || item.primary_receipt_file_url || item.receipt_url || item.receipt_files?.[0]?.file_url || item.receipt_file;
                  return (
                    <div key={item.id} className={`grid px-3 py-2 text-xs border-b border-gray-100 items-start ${i % 2 === 1 ? "bg-[#F5F5F5]" : ""}`}
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
                      <span className={`text-right font-semibold ${item.vat ? "text-green-600" : "text-gray-400"}`}>{item.vat ? "Y" : "N"}</span>
                    </div>
                  );
                })}
                <div className="grid px-3 py-2 bg-[#C8102E] text-white text-sm font-bold rounded-b"
                  style={{ gridTemplateColumns: "80px 1fr 140px 120px 80px 80px 130px 36px" }}>
                  <span className="col-span-5 text-right pr-3">{month.toUpperCase()} TOTAL</span>
                  <span className="text-right">{formatCurrency(items.reduce((s, e) => s + (e.paid_amount || 0), 0))}</span>
                  <span /><span />
                </div>
              </div>
            ))}
            {filtered.length > 0 && (
              <div className="flex justify-between px-3 py-3 bg-[#2D2D2D] text-white font-bold rounded mb-8">
                <span>EXPENSES TOTAL</span>
                <span className="text-lg">{formatCurrency(overallTotal)}</span>
              </div>
            )}

            {/* ── SECTION 2: MILEAGE ── */}
            {filteredMileage.length > 0 && (
              <>
                <h3 className="text-base font-bold text-[#C8102E] mb-3 mt-2">Section 2 — Mileage Log</h3>
                {Object.entries(mileageByMonth).map(([month, items]) => (
                  <div key={month} className="mb-6">
                    <div className="flex justify-between items-center px-3 py-2 bg-[#2D2D2D] text-white text-sm font-semibold rounded-t">
                      <span>{month.toUpperCase()}</span>
                      <span>{items.length} journey{items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="grid px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50"
                      style={{ gridTemplateColumns: "80px 1fr 120px 100px 70px 50px 60px 80px" }}>
                      <span>Date</span><span>Journey</span><span>Purpose</span><span>Staff</span><span>Vehicle</span><span className="text-right">Miles</span><span className="text-right">Rate</span><span className="text-right">Cost</span>
                    </div>
                    {items.map((m, i) => (
                      <div key={m.id} className={`grid px-3 py-2 text-xs border-b border-gray-100 items-start ${i % 2 === 1 ? "bg-[#F5F5F5]" : ""}`}
                        style={{ gridTemplateColumns: "80px 1fr 120px 100px 70px 50px 60px 80px" }}>
                        <span className="text-gray-600">{formatDateUK(m.date)}</span>
                        <span className="font-medium pr-2">{journeyDescription(m)}</span>
                        <span className="text-gray-500 pr-2">{m.purpose || "—"}</span>
                        <span className="text-gray-600">{getMileagePaidByLabel(m)}</span>
                        <span className="text-gray-500">{m.vehicle_type || "—"}</span>
                        <span className="text-right">{m.total_miles || 0}</span>
                        <span className="text-right text-gray-500">£{(m.rate_per_mile || 0).toFixed(2)}</span>
                        <span className="text-right font-semibold">{formatCurrency(m.total_cost)}</span>
                      </div>
                    ))}
                    <div className="grid px-3 py-2 bg-[#C8102E] text-white text-sm font-bold rounded-b"
                      style={{ gridTemplateColumns: "80px 1fr 120px 100px 70px 50px 60px 80px" }}>
                      <span className="col-span-5 text-right pr-3">{month.toUpperCase()} TOTAL</span>
                      <span className="text-right">{items.reduce((s, m) => s + (m.total_miles || 0), 0).toFixed(1)} mi</span>
                      <span />
                      <span className="text-right">{formatCurrency(items.reduce((s, m) => s + (m.total_cost || 0), 0))}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-3 bg-[#2D2D2D] text-white font-bold rounded mb-8">
                  <span>MILEAGE TOTAL</span>
                  <span>{totalMiles.toFixed(1)} miles · <span className="text-lg">{formatCurrency(totalMileageCost)}</span></span>
                </div>
              </>
            )}

            {/* Grand total */}
            <div className="flex justify-between px-3 py-3 bg-[#2D2D2D] text-white font-bold rounded mt-2">
              <span>GRAND TOTAL (Expenses + Mileage)</span>
              <span className="text-lg">{formatCurrency(overallTotal + totalMileageCost)}</span>
            </div>

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