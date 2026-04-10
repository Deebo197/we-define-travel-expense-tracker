import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ExternalLink, CheckCircle2, Trash2, Pencil } from "lucide-react";
import ReimbursementBadge from "../components/ReimbursementBadge";
import CategoryBadge from "../components/CategoryBadge";
import { CLIENT_CODES, PAID_BY_CODES, formatCurrency, formatDateUK, getClientName, getPaidByLabel, getCategoriesForClient } from "@/lib/constants";

export default function AllExpenses() {
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["allExpenses"],
    queryFn: () => base44.entities.Expense.list("-date", 500),
  });

  const [descAliases] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wdt_desc_aliases") || "{}"); } catch { return {}; }
  });

  const getDisplayDescription = (desc) => descAliases[desc] || desc;

  const [filters, setFilters] = useState({ client: "all", month: "all", paidBy: "all", reimbReq: "all", reimbPaid: "all" });
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editExpense, setEditExpense] = useState(null); // expense being edited
  const [editForm, setEditForm] = useState({});

  const markPaid = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Expense.update(id, { reimbursement_paid: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      setChecked([]);
    },
  });

  const deleteExpenses = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Expense.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      setSelectedIds([]);
    },
  });

  const saveEdit = useMutation({
    mutationFn: async ({ id, data }) => {
      await base44.entities.Expense.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      setEditExpense(null);
    },
  });

  const toggleSelectId = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const openEdit = (exp) => {
    setEditExpense(exp);
    setEditForm({
      date: exp.date,
      description: exp.description,
      paid_amount: exp.paid_amount,
      actual_cost: exp.actual_cost,
      category: exp.category || "",
      paid_by: exp.paid_by,
    });
  };

  const months = [...new Set(expenses.map(e => e.month))].filter(Boolean);

  const filtered = expenses.filter(e => {
    if (filters.client !== "all" && !e.client_allocations?.some(a => a.client_code === filters.client)) return false;
    if (filters.month !== "all" && e.month !== filters.month) return false;
    if (filters.paidBy !== "all" && e.paid_by !== filters.paidBy) return false;
    if (filters.reimbReq !== "all" && String(e.reimbursement_required) !== filters.reimbReq) return false;
    if (filters.reimbPaid !== "all" && String(e.reimbursement_paid) !== filters.reimbPaid) return false;
    return true;
  });

  const toggleCheck = (id) => {
    setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">All Expenses</h1>
        <div className="flex gap-2">
        {selectedIds.length > 0 && (
          <>
            {selectedIds.length === 1 && (
              <Button size="sm" variant="outline" onClick={() => openEdit(expenses.find(e => e.id === selectedIds[0]))}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selectedIds.length} expense(s)?`)) deleteExpenses.mutate(selectedIds); }} disabled={deleteExpenses.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete {selectedIds.length}
            </Button>
          </>
        )}
        {checked.length > 0 && (
          <Button size="sm" onClick={() => markPaid.mutate(checked)} disabled={markPaid.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Mark {checked.length} as Paid
          </Button>
        )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Select value={filters.client} onValueChange={v => setFilters(f => ({ ...f, client: v }))}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {CLIENT_CODES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.month} onValueChange={v => setFilters(f => ({ ...f, month: v }))}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.paidBy} onValueChange={v => setFilters(f => ({ ...f, paidBy: v }))}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Paid By" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.code}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.reimbReq} onValueChange={v => setFilters(f => ({ ...f, reimbReq: v }))}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Reimb. Req" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Reimb: All</SelectItem>
            <SelectItem value="true">Required</SelectItem>
            <SelectItem value="false">Not Required</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.reimbPaid} onValueChange={v => setFilters(f => ({ ...f, reimbPaid: v }))}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Reimb. Paid" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Paid: All</SelectItem>
            <SelectItem value="true">Paid</SelectItem>
            <SelectItem value="false">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="p-3 w-10"><Checkbox checked={selectedIds.length === filtered.length && filtered.length > 0} onCheckedChange={v => setSelectedIds(v ? filtered.map(e => e.id) : [])} /></th>
            <th className="p-3 w-10"></th>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Submitted By</th>
              <th className="p-3 text-left">Client(s)</th>
              <th className="p-3 text-left">Description</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Paid By</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-center">VAT</th>
              <th className="p-3 text-center">Reimb.</th>
              <th className="p-3 text-left">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(exp => (
            <tr key={exp.id} className={`border-t border-border hover:bg-muted/20 transition-colors ${selectedIds.includes(exp.id) ? "bg-primary/5" : ""}`}>
              <td className="p-3">
                <Checkbox checked={selectedIds.includes(exp.id)} onCheckedChange={() => toggleSelectId(exp.id)} />
              </td>
              <td className="p-3">
                  {exp.reimbursement_required && !exp.reimbursement_paid && (
                    <Checkbox
                      checked={checked.includes(exp.id)}
                      onCheckedChange={() => toggleCheck(exp.id)}
                    />
                  )}
                </td>
                <td className="p-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(exp)}>{formatDateUK(exp.date)}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>{exp.submitted_by_name || exp.submitted_by}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>{exp.client_allocations?.map(a => a.client_code).join(", ")}</td>
                <td className="p-3 max-w-xs truncate cursor-pointer" onClick={() => setSelected(exp)}>{getDisplayDescription(exp.description)}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>{exp.category && <CategoryBadge category={exp.category} showLabel={false} />}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>{exp.paid_by}</td>
                <td className="p-3 text-right font-semibold whitespace-nowrap">{formatCurrency(exp.paid_amount)}</td>
                <td className="p-3 text-center">{exp.vat ? "Y" : "N"}</td>
                <td className="p-3 text-center">
                  <ReimbursementBadge required={exp.reimbursement_required} paid={exp.reimbursement_paid} />
                </td>
                <td className="p-3">
                  {exp.receipt_file ? (
                    <a href={exp.receipt_file} target="_blank" rel="noopener noreferrer" className="text-primary font-mono text-xs hover:underline flex items-center gap-1">
                      {exp.receipt_code} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">{exp.receipt_code}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">No expenses found</div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expense Detail</DialogTitle>
          </DialogHeader>
          {selected && (
          <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
           <div><span className="text-muted-foreground">Date:</span><br />{formatDateUK(selected.date)}</div>
           <div><span className="text-muted-foreground">Receipt Code:</span><br /><span className="font-mono text-primary">{selected.receipt_code}</span></div>
           <div><span className="text-muted-foreground">Paid Amount:</span><br />{formatCurrency(selected.paid_amount)}</div>
           <div><span className="text-muted-foreground">Actual Cost:</span><br />{formatCurrency(selected.actual_cost)}</div>
           <div><span className="text-muted-foreground">Paid By:</span><br />{getPaidByLabel(selected.paid_by)}</div>
           <div><span className="text-muted-foreground">Submitted By:</span><br />{selected.submitted_by_name}</div>
          </div>
          <div><span className="text-muted-foreground">Description:</span><p className="mt-1">{selected.description}</p></div>
          {selected.category && <div><span className="text-muted-foreground">Category:</span><div className="mt-2"><CategoryBadge category={selected.category} showLabel={true} /></div></div>}
              <div>
                <span className="text-muted-foreground">Client(s):</span>
                <div className="mt-1 space-y-1">
                  {selected.client_allocations?.map((a, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{a.client_code} — {getClientName(a.client_code)}</span>
                      <span>{a.percentage}% ({formatCurrency(a.amount)})</span>
                    </div>
                  ))}
                </div>
              </div>
              {selected.receipt_file && (
                <div>
                  <span className="text-muted-foreground">Receipt:</span>
                  <img src={selected.receipt_file} alt="Receipt" className="mt-2 rounded-lg border max-h-60 object-contain w-full" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editExpense} onOpenChange={() => setEditExpense(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          {editExpense && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Date</Label>
                <Input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Description</Label>
                <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Paid Amount £</Label>
                  <Input type="number" step="0.01" value={editForm.paid_amount} onChange={e => setEditForm(f => ({ ...f, paid_amount: parseFloat(e.target.value) }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Actual Cost £</Label>
                  <Input type="number" step="0.01" value={editForm.actual_cost} onChange={e => setEditForm(f => ({ ...f, actual_cost: parseFloat(e.target.value) }))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Paid By</Label>
                <Select value={editForm.paid_by} onValueChange={v => setEditForm(f => ({ ...f, paid_by: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Category</Label>
                <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {getCategoriesForClient(editExpense.client_allocations?.[0]?.client_code).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditExpense(null)}>Cancel</Button>
            <Button onClick={() => saveEdit.mutate({ id: editExpense.id, data: editForm })} disabled={saveEdit.isPending}>
              {saveEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}