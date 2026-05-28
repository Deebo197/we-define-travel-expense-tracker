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
import { PAID_BY_CODES, getCategoriesForClient, isReimbursementRequired } from "@/lib/constants";
import { toast } from "sonner";

export default function EditExpenseDialog({ expense, open, onClose, queryKeys = [] }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState(() => ({
    date: expense?.date || "",
    description: expense?.description || "",
    paid_amount: expense?.paid_amount || 0,
    actual_cost: expense?.actual_cost || 0,
    category: expense?.category || "",
    paid_by: expense?.paid_by || "",
    client_allocations: expense?.client_allocations || [],
  }));

  const primaryClient = form.client_allocations?.[0]?.client_code;
  const categories = primaryClient ? getCategoriesForClient(primaryClient) : [];

  const saveEdit = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Expense.update(expense.id, {
        ...data,
        reimbursement_required: isReimbursementRequired(data.paid_by),
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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

          <div>
            <Label className="text-sm">Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <CategorySelectItem key={c} category={c} />)}
              </SelectContent>
            </Select>
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
          <Button onClick={() => saveEdit.mutate(form)} disabled={saveEdit.isPending}>
            {saveEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}