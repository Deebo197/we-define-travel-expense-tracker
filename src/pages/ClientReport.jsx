import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileDown, Eye } from "lucide-react";
import { CLIENT_CODES, getClientName, formatCurrency, formatDateUK, COMPANY_INFO } from "@/lib/constants";

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
          paid_amount: alloc?.amount || m.total_cost,
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
    const { default: html2canvas } = await import("html2canvas");

    const element = reportRef.current;
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`WDT-Expense-Report-${clientCode}-${dateFrom}-to-${dateTo}.pdf`);
    setGenerating(false);
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
          <div className="flex justify-end mb-4">
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
                    <span className="pr-2">{item.description}</span>
                    <span>
                      {item.type === "mileage" && item.route_image_url ? (
                        <a href={item.route_image_url} target="_blank" rel="noopener noreferrer" className="text-[#C8102E] hover:underline font-mono text-xs" title="View route map">{item.route_image_code || "Map"}</a>
                      ) : item.receipt_file ? (
                        <a href={item.receipt_file} target="_blank" rel="noopener noreferrer" className="text-[#C8102E] hover:underline font-mono text-xs">{item.receipt_code}</a>
                      ) : (
                        <span className="text-gray-400 font-mono text-xs">{item.receipt_code}</span>
                      )}
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