import { useState, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Paperclip, Upload, X, ExternalLink } from "lucide-react";
import CategorySelectItem from "@/components/CategorySelectItem";
import ClientSplitInput from "@/components/ClientSplitInput";
import { PAID_BY_CODES, getCategoriesForClient, isReimbursementRequired } from "@/lib/constants";
import { toast } from "sonner";

const CURRENCIES = ["GBP", "USD", "EUR", "AED", "MYR", "THB", "SGD", "AUD", "JPY", "CHF", "CAD", "NZD"];

function EditExpenseDialogInner({ expense, open, onClose, queryKeys = [] }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState(() => ({
    date: expense?.date || "",
    description: expense?.description || "",
    paid_amount: expense?.paid_amount ?? 0,
    actual_cost: expense?.actual_cost ?? 0,
    category: expense?.category || "",
    paid_by: expense?.paid_by || "",
    client_allocations: expense?.client_allocations || [],
    vat: expense?.vat || false,
    currency: expense?.currency || "GBP",
    original_amount: expense?.original_amount || "",
    exchange_rate: expense?.exchange_rate || "",
    reimbursement_required: expense?.reimbursement_required || false,
    reimbursement_paid: expense?.reimbursement_paid || false,
    receipt_code: expense?.receipt_code || "",
    receipt_url: expense?.receipt_url || "",
    receipt_files: expense?.receipt_files || [],
    primary_receipt_file_url: expense?.primary_receipt_file_url || "",
    submitted_by: expense?.submitted_by || "",
    submitted_by_name: expense?.submitted_by_name || "",
    month: expense?.month || "",
    year: expense?.year || null,
  }));

  const [uploadingFile, setUploadingFile] = useState(false);

  const primaryClient = form.client_allocations?.[0]?.client_code;
  const categories = primaryClient ? getCategoriesForClient(primaryClient) : [];

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const isPrimary = form.receipt_files.length === 0 && !form.primary_receipt_file_url;
    const newFile = {
      file_url,
      public_receipt_url: file_url,
      original_filename: file.name,
      mime_type: file.type,
      role: isPrimary ? "primary" : "supporting",
      sort_order: form.receipt_files.length,
    };
    setForm(f => ({
      ...f,
      receipt_files: [...f.receipt_files, newFile],
      primary_receipt_file_url: isPrimary ? file_url : f.primary_receipt_file_url,
    }));
    setUploadingFile(false);
    e.target.value = "";
  };

  const removeReceiptFile = (index) => {
    setForm(f => {
      const updated = f.receipt_files.filter((_, i) => i !== index);
      const newPrimary = updated.find(rf => rf.role === "primary")?.file_url || updated[0]?.file_url || "";
      return { ...f, receipt_files: updated, primary_receipt_file_url: newPrimary };
    });
  };

  const saveEdit = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Expense.update(expense.id, {
        ...data,
        reimbursement_required: isReimbursementRequired(data.paid_by),
        original_amount: data.original_amount ? parseFloat(data.original_amount) : null,
        exchange_rate: data.exchange_rate ? parseFloat(data.exchange_rate) : null,
      });
    },
    onSuccess: () => {
      queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      toast.success("Expense updated");
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to save changes"),
  });

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">

          {/* Date + Paid By */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Paid By</Label>
              <Select value={form.paid_by} onValueChange={v => setForm(f => ({ ...f, paid_by: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Submitted By */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Submitted By (email)</Label>
              <Input value={form.submitted_by} onChange={e => setForm(f => ({ ...f, submitted_by: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Submitted By (name)</Label>
              <Input value={form.submitted_by_name} onChange={e => setForm(f => ({ ...f, submitted_by_name: e.target.value }))} className="mt-1" />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm">Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Paid Amount (GBP)</Label>
              <Input type="number" step="0.01" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: parseFloat(e.target.value) || 0 }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Actual Cost (GBP)</Label>
              <Input type="number" step="0.01" value={form.actual_cost} onChange={e => setForm(f => ({ ...f, actual_cost: parseFloat(e.target.value) || 0 }))} className="mt-1" />
            </div>
          </div>

          {/* Currency + Foreign Amount + Exchange Rate */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-sm">Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Original Amount ({form.currency})</Label>
              <Input type="number" step="0.01" value={form.original_amount} onChange={e => setForm(f => ({ ...f, original_amount: e.target.value }))} placeholder="If non-GBP" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Exchange Rate</Label>
              <Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm(f => ({ ...f, exchange_rate: e.target.value }))} placeholder="To GBP" className="mt-1" />
            </div>
          </div>

          {/* VAT + Reimbursement */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-sm mb-2 block">VAT Applicable</Label>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => setForm(f => ({ ...f, vat: true }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.vat ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>Yes</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, vat: false }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!form.vat ? "bg-muted text-foreground border-border" : "border-border text-muted-foreground"}`}>No</button>
              </div>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Reimb. Required</Label>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => setForm(f => ({ ...f, reimbursement_required: true }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.reimbursement_required ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>Yes</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, reimbursement_required: false }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!form.reimbursement_required ? "bg-muted text-foreground border-border" : "border-border text-muted-foreground"}`}>No</button>
              </div>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Reimb. Paid</Label>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => setForm(f => ({ ...f, reimbursement_paid: true }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.reimbursement_paid ? "bg-green-600 text-white border-green-600" : "border-border text-muted-foreground"}`}>Yes</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, reimbursement_paid: false }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!form.reimbursement_paid ? "bg-muted text-foreground border-border" : "border-border text-muted-foreground"}`}>No</button>
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className="text-sm">Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <CategorySelectItem key={c} category={c} />)}
              </SelectContent>
            </Select>
          </div>

          {/* Receipt Code + URL */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Receipt Code</Label>
              <Input value={form.receipt_code} onChange={e => setForm(f => ({ ...f, receipt_code: e.target.value }))} className="mt-1 font-mono" placeholder="e.g. 250603-001" />
            </div>
            <div>
              <Label className="text-sm">Receipt URL</Label>
              <Input value={form.receipt_url} onChange={e => setForm(f => ({ ...f, receipt_url: e.target.value }))} className="mt-1" placeholder="https://..." />
            </div>
          </div>

          {/* Receipt Files */}
          <div className="border border-border rounded-xl p-3 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Paperclip className="h-4 w-4" />
                Receipt Files
              </div>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
                <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
                  {uploadingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  Add Receipt
                </Button>
              </div>
            </div>

            {form.receipt_files.length === 0 && !form.primary_receipt_file_url && (
              <p className="text-xs text-muted-foreground">No receipt files attached.</p>
            )}

            <div className="flex flex-wrap gap-2">
              {(form.receipt_files.length > 0
                ? form.receipt_files
                : form.primary_receipt_file_url
                  ? [{ file_url: form.primary_receipt_file_url, public_receipt_url: form.primary_receipt_file_url, role: "primary" }]
                  : []
              ).map((rf, i) => {
                const url = rf.public_receipt_url || rf.file_url;
                const isPdf = rf.mime_type === "application/pdf" || url?.toLowerCase().endsWith(".pdf");
                return (
                  <div key={i} className="relative group">
                    {isPdf ? (
                      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary underline bg-muted px-2 py-2 rounded-lg max-w-[140px] truncate">
                        <Paperclip className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{rf.original_filename || `Receipt ${i + 1}`}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Receipt ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                      </a>
                    )}
                    {form.receipt_files.length > 0 && (
                      <button
                        type="button"
                        onClick={() => removeReceiptFile(i)}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {rf.role === "primary" && (
                      <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] bg-black/60 text-white rounded-b-lg">Primary</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Client Allocation */}
          <div className="border-t border-border pt-4">
            <Label className="text-sm font-semibold mb-3 block">Client Allocation</Label>
            <ClientSplitInput
              allocations={form.client_allocations}
              onChange={a => {
                const newPrimary = a[0]?.client_code;
                const oldPrimary = form.client_allocations[0]?.client_code;
                setForm(f => ({ ...f, client_allocations: a, category: newPrimary !== oldPrimary ? "" : f.category }));
              }}
              paidAmount={parseFloat(form.paid_amount) || 0}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveEdit.mutate(form)} disabled={saveEdit.isPending}>
            {saveEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EditExpenseDialog(props) {
  if (!props.expense) return null;
  return <EditExpenseDialogInner key={props.expense.id} {...props} />;
}