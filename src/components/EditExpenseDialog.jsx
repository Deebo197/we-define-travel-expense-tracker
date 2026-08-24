import { useState, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import CategorySelectItem from "@/components/CategorySelectItem";
import ClientSplitInput from "@/components/ClientSplitInput";
import MultiFileAttachment from "@/components/MultiFileAttachment";
import { PAID_BY_CODES, getCategoriesForClient, isReimbursementRequired } from "@/lib/constants";
import { toast } from "sonner";

const CURRENCIES = ["GBP", "USD", "EUR", "AED", "MYR", "THB", "SGD", "AUD", "JPY", "CHF", "CAD", "NZD"];

function EditExpenseDialogInner({ expense, open, onClose, queryKeys = [] }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState(() => ({
    date: expense?.date || "",
    invoice_date: expense?.invoice_date || "",
    description: expense?.description || "",
    comments: expense?.comments || "",
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

  const primaryClient = form.client_allocations?.[0]?.client_code;
  const categories = primaryClient ? getCategoriesForClient(primaryClient) : [];

  const handleFilesChange = (files) => {
    const primary = files.find(f => f.role === "primary");
    setForm(f => ({
      ...f,
      receipt_files: files,
      primary_receipt_file_url: primary?.file_url || f.primary_receipt_file_url,
      receipt_file: primary?.file_url || f.receipt_file,
      receipt_url: primary?.file_url || f.receipt_url,
    }));
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
      <DialogContent className="max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">

          {/* Date + Invoice Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Date (Paid)</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Invoice Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="date" value={form.invoice_date || ""} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value || null }))} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Override which invoice period this appears in</p>
            </div>
          </div>

          {/* Paid By */}
          <div>
            <Label className="text-sm">Paid By</Label>
            <Select value={form.paid_by} onValueChange={v => setForm(f => ({ ...f, paid_by: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>)}
              </SelectContent>
            </Select>
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

          {/* Comments / Notes */}
          <div>
            <Label className="text-sm">Comments / Notes <span className="text-muted-foreground font-normal">(for accountant / reporting)</span></Label>
            <Textarea
              value={form.comments}
              onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
              placeholder="Explain how/why this was charged, client-specific notes, allocation rationale, etc."
              className="mt-1 min-h-[90px]"
            />
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
          <div>
            <Label className="text-sm font-medium mb-2 block">Receipt Files</Label>
            <MultiFileAttachment
              files={form.receipt_files.length > 0
                ? form.receipt_files
                : form.primary_receipt_file_url
                  ? [{ file_url: form.primary_receipt_file_url, public_receipt_url: form.primary_receipt_file_url, role: "primary", original_filename: "Existing receipt" }]
                  : []}
              onChange={handleFilesChange}
            />
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