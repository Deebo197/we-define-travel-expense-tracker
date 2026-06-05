import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink, FileText, CheckCircle2, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { PAID_BY_CODES, getCategoriesForClient, formatCurrency } from "@/lib/constants";
import ClientSplitInput from "@/components/ClientSplitInput";
import PersonAvatar from "@/components/PersonAvatar";
import CategorySelectItem from "@/components/CategorySelectItem";
import InboxFileViewer from "@/components/InboxFileViewer";

export default function InboxReviewDialog({ item, open, onClose, onConfirmed }) {
  const [form, setForm] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => { setLocalItem(item); }, [item]);

  useEffect(() => {
    if (item) {
      const amt = item.extracted_amount || 0;
      setForm({
        date: item.extracted_date || new Date().toISOString().split("T")[0],
        description: item.extracted_description || item.extracted_supplier || "",
        paid_amount: amt,
        actual_cost: amt,
        vat: item.extracted_vat || false,
        paid_by: item.paid_by || "",
        category: item.category || "",
        client_allocations: item.client_allocations?.length
          ? item.client_allocations
          : [{ client_code: "", client_name: "", percentage: 100, amount: amt }],
        currency: item.extracted_currency || "GBP",
      });
    }
  }, [item]);

  const updateField = (field, value) => {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === "paid_amount") {
        const a = parseFloat(value) || 0;
        updated.client_allocations = f.client_allocations.map(al => ({
          ...al,
          amount: Math.round(a * (al.percentage || 0) / 100 * 100) / 100,
        }));
        updated.actual_cost = value;
      }
      return updated;
    });
  };

  const primaryClient = form.client_allocations?.[0]?.client_code;
  const categories = primaryClient ? getCategoriesForClient(primaryClient) : [];
  const totalPct = (form.client_allocations || []).reduce((s, a) => s + (a.percentage || 0), 0);
  const canConfirm =
    form.date && form.description && form.paid_amount && form.paid_by &&
    form.client_allocations?.length > 0 &&
    form.client_allocations.every(a => a.client_code) &&
    Math.abs(totalPct - 100) < 0.01;

  const handleConfirm = async () => {
    if (!canConfirm || !item || confirming) return;
    setConfirming(true);
    try {
      const res = await base44.functions.invoke("confirmInboxReceipt", {
        inbox_item_id: item.id,
        date: form.date,
        description: form.description,
        paid_amount: parseFloat(form.paid_amount),
        actual_cost: parseFloat(form.actual_cost) || parseFloat(form.paid_amount),
        vat: form.vat,
        paid_by: form.paid_by,
        category: form.category,
        client_allocations: form.client_allocations,
        currency: form.currency,
      });
      if (res.data?.already_confirmed) {
        toast.info(`${item.receipt_code} was already confirmed`);
      } else {
        toast.success(`${item.receipt_code} confirmed as an expense`);
      }
      onConfirmed();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || "Failed to confirm expense";
      // 409 = another request is already confirming — treat as success in flight
      if (err?.response?.status === 409) {
        toast.info("Already being confirmed — please refresh in a moment");
        onClose();
      } else {
        toast.error(msg);
        setConfirming(false);
      }
    }
  };

  const handleOCRFromFile = (data) => {
    setForm(f => ({
      ...f,
      date: data.date || f.date,
      description: data.description || data.supplier || f.description,
      paid_amount: data.amount || f.paid_amount,
      actual_cost: data.amount || f.actual_cost,
      vat: data.vat ?? f.vat,
      currency: data.currency || f.currency,
      client_allocations: f.client_allocations.map(a => ({
        ...a,
        amount: Math.round(((data.amount || f.paid_amount || 0) * (a.percentage || 0) / 100) * 100) / 100,
      })),
    }));
  };

  if (!item) return null;
  const displayItem = localItem || item;
  const hasMultipleFiles = displayItem.receipt_files?.length > 1;
  const primaryUrl = displayItem.primary_receipt_file_url || displayItem.public_receipt_url || displayItem.file_url;
  const isPdf = displayItem.mime_type === "application/pdf" || displayItem.original_filename?.toLowerCase().endsWith(".pdf");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-primary">{item.receipt_code}</span>
            <span className="text-muted-foreground font-normal text-sm">— Review Receipt</span>
          </DialogTitle>
        </DialogHeader>

        {(item.status === "processing" || item.status === "inbox" || item.status === "confirming") && (
          <div className="flex items-center gap-2 text-sm rounded-[10px] px-3 py-2.5 mb-1"
            style={{ backgroundColor: "rgba(127,91,255,0.1)", color: "#7F5BFF", border: "1px solid rgba(127,91,255,0.2)" }}>
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            Still processing — OCR is reading the receipt. Details will fill in automatically.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          {/* Left: receipt preview */}
          <div className="space-y-3">
            {/* Multi-file viewer or single preview */}
            {hasMultipleFiles ? (
              <InboxFileViewer
                item={displayItem}
                onFilesChanged={(newFiles) => setLocalItem(i => ({ ...i, receipt_files: newFiles }))}
                onOCRComplete={handleOCRFromFile}
              />
            ) : (
              <div
                className="rounded-[14px] overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-surface-2)", minHeight: 200, border: "1px solid var(--border-soft)" }}
              >
                {isPdf ? (
                  <div className="text-center p-6">
                    <FileText className="h-12 w-12 mx-auto mb-2" style={{ color: "#FF5C7A" }} strokeWidth={1.5} />
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{displayItem.original_filename}</p>
                  </div>
                ) : displayItem.file_url ? (
                  <img src={displayItem.file_url} alt="Receipt" className="max-h-64 object-contain w-full" />
                ) : null}
              </div>
            )}

            {primaryUrl && (
              <a
                href={primaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-medium transition-colors"
                style={{ color: "#7F5BFF" }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View {hasMultipleFiles ? "primary" : "full"} receipt
              </a>
            )}

            {/* OCR info */}
            <div className="rounded-[10px] p-3 text-xs space-y-1" style={{ backgroundColor: "var(--bg-surface-2)" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-tertiary)" }}>Files</span>
                <span style={{ color: "var(--text-secondary)" }}>{displayItem.receipt_files?.length || 1} attached</span>
              </div>
              {displayItem.ocr_confidence && (
                <div className="flex justify-between">
                  <span style={{ color: "var(--text-tertiary)" }}>OCR confidence</span>
                  <span style={{ color: displayItem.ocr_confidence > 70 ? "#3DDC97" : "#FFB547" }}>{displayItem.ocr_confidence}%</span>
                </div>
              )}
              {displayItem.drive_folder_path && (
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--text-tertiary)" }}>Drive location</span>
                  <span className="text-right" style={{ color: "var(--text-secondary)" }}>{displayItem.drive_folder_path}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: form */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={form.date || ""} onChange={e => updateField("date", e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label className="text-xs font-medium">Description *</Label>
              <Input
                value={form.description || ""}
                onChange={e => updateField("description", e.target.value)}
                placeholder="What was this for?"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-medium">Amount £ *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.paid_amount || ""}
                  onChange={e => updateField("paid_amount", e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Actual Cost £</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.actual_cost || ""}
                  onChange={e => updateField("actual_cost", e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.vat || false} onCheckedChange={v => updateField("vat", v)} />
              <Label className="text-sm">VAT applicable</Label>
            </div>

            <div>
              <Label className="text-xs font-medium">Paid By *</Label>
              <Select value={form.paid_by || ""} onValueChange={v => updateField("paid_by", v)}>
                <SelectTrigger className="mt-1 h-10">
                  {form.paid_by ? (
                    <div className="flex items-center gap-2">
                      <PersonAvatar code={form.paid_by} size="xs" />
                      <span>{PAID_BY_CODES.find(p => p.code === form.paid_by)?.label}</span>
                    </div>
                  ) : <SelectValue placeholder="Select who paid" />}
                </SelectTrigger>
                <SelectContent>
                  {PAID_BY_CODES.map(p => (
                    <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium mb-2 block">Client Allocation *</Label>
              <ClientSplitInput
                allocations={form.client_allocations || []}
                onChange={allocs => {
                  const newPrimary = allocs[0]?.client_code;
                  const oldPrimary = form.client_allocations?.[0]?.client_code;
                  setForm(f => ({
                    ...f,
                    client_allocations: allocs,
                    category: newPrimary !== oldPrimary ? "" : f.category,
                  }));
                }}
                paidAmount={parseFloat(form.paid_amount) || 0}
              />
            </div>

            {primaryClient && (
              <div>
                <Label className="text-xs font-medium">Category</Label>
                <Select value={form.category || ""} onValueChange={v => updateField("category", v)}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <CategorySelectItem key={c} category={c} />)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || confirming}
              className="w-full"
            >
              {confirming
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Confirming…</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Expense</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}