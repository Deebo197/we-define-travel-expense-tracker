import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import CategorySelectItem from "@/components/CategorySelectItem";
import ClientSplitInput from "@/components/ClientSplitInput";
import MultiFileAttachment from "@/components/MultiFileAttachment";
import { PAID_BY_CODES, getCategoriesForClient, isReimbursementRequired } from "@/lib/constants";
import { toast } from "sonner";

function DuplicateToWD1DialogInner({ expense, open, onClose }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState(() => ({
    date: expense?.date || "",
    description: expense?.description || "",
    paid_amount: expense?.paid_amount || 0,
    actual_cost: expense?.actual_cost || 0,
    category: expense?.category || "",
    paid_by: "WD1",
    client_allocations: expense?.client_allocations || [],
    vat: expense?.vat || false,
    currency: expense?.currency || "GBP",
    original_amount: expense?.original_amount || null,
    exchange_rate: expense?.exchange_rate || null,
    submitted_by: expense?.submitted_by || "",
    submitted_by_name: expense?.submitted_by_name || "",
    month: expense?.month || "",
    year: expense?.year || null,
    receipt_files: expense?.receipt_files?.length > 0
      ? expense.receipt_files
      : expense?.primary_receipt_file_url
        ? [{ file_url: expense.primary_receipt_file_url, public_receipt_url: expense.primary_receipt_file_url, role: "primary", original_filename: "Existing receipt" }]
        : [],
    primary_receipt_file_url: expense?.primary_receipt_file_url || "",
    receipt_file: expense?.receipt_file || "",
    receipt_url: expense?.receipt_url || "",
  }));

  const handleFilesChange = (files) => {
    const primary = files.find(f => f.role === "primary");
    setForm(f => ({
      ...f,
      receipt_files: files,
      primary_receipt_file_url: primary?.file_url || "",
      receipt_file: primary?.file_url || "",
      receipt_url: primary?.file_url || "",
    }));
  };

  const primaryClient = form.client_allocations?.[0]?.client_code;
  const categories = primaryClient ? getCategoriesForClient(primaryClient) : [];

  const createDuplicate = useMutation({
    mutationFn: async (data) => {
      const { id: _id, created_date, updated_date, created_by_id, drive_sync_failed, ...rest } = expense;
      await base44.entities.Expense.create({
        ...rest,
        ...data,
        paid_by: "WD1",
        is_admin_only_duplicate: true,
        drive_sync_failed: false,
        reimbursement_required: isReimbursementRequired("WD1"),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      toast.success("Duplicated to WD1 (admin only)");
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to duplicate expense"),
  });

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicate to WD1</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2 mb-2">
          This will create an admin-only copy with <strong>Paid By: WD1</strong>. Review and adjust details before confirming.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Paid By</Label>
              <Input value="WD1" disabled className="mt-1 opacity-60 cursor-not-allowed" />
            </div>
          </div>

          <div>
            <Label className="text-sm">Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Paid Amount £</Label>
              <Input type="number" step="0.01" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: parseFloat(e.target.value) || 0 }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Actual Cost £</Label>
              <Input type="number" step="0.01" value={form.actual_cost} onChange={e => setForm(f => ({ ...f, actual_cost: parseFloat(e.target.value) || 0 }))} className="mt-1" />
            </div>
          </div>

          {expense.currency && expense.currency !== "GBP" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Original Amount ({expense.currency})</Label>
                <Input type="number" step="0.01" value={form.original_amount || ""} onChange={e => setForm(f => ({ ...f, original_amount: parseFloat(e.target.value) || null }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Exchange Rate</Label>
                <Input type="number" step="0.0001" value={form.exchange_rate || ""} onChange={e => setForm(f => ({ ...f, exchange_rate: parseFloat(e.target.value) || null }))} className="mt-1" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">VAT Applicable:</span>
            <span className={form.vat ? "text-green-500 font-medium" : "text-muted-foreground"}>{form.vat ? "Yes" : "No"}</span>
            <button type="button" onClick={() => setForm(f => ({ ...f, vat: !f.vat }))} className="text-xs underline text-primary ml-1">toggle</button>
          </div>

          <div>
            <Label className="text-sm">Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <CategorySelectItem key={c} category={c} />)}
              </SelectContent>
            </Select>
          </div>

          {/* Receipt Files — editable */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Receipt Files</Label>
            <MultiFileAttachment
              files={form.receipt_files}
              onChange={handleFilesChange}
            />
          </div>

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
          <Button onClick={() => createDuplicate.mutate(form)} disabled={createDuplicate.isPending}>
            {createDuplicate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Confirm Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DuplicateToWD1Dialog({ expense, open, onClose }) {
  if (!expense) return null;
  return <DuplicateToWD1DialogInner key={expense.id} expense={expense} open={open} onClose={onClose} />;
}