import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import ReimbursementBadge from "../components/ReimbursementBadge";
import { CLIENT_CODES, PAID_BY_CODES, formatCurrency, formatDateUK, getClientName, getPaidByLabel } from "@/lib/constants";

export default function AllExpenses() {
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["allExpenses"],
    queryFn: () => base44.entities.Expense.list("-date", 500),
  });

  const [filters, setFilters] = useState({ client: "all", month: "all", paidBy: "all", reimbReq: "all", reimbPaid: "all" });
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);

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
        {checked.length > 0 && (
          <Button size="sm" onClick={() => markPaid.mutate(checked)} disabled={markPaid.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Mark {checked.length} as Paid
          </Button>
        )}
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
              <th className="p-3 w-10"></th>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Submitted By</th>
              <th className="p-3 text-left">Client(s)</th>
              <th className="p-3 text-left">Description</th>
              <th className="p-3 text-left">Paid By</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-center">VAT</th>
              <th className="p-3 text-center">Reimb.</th>
              <th className="p-3 text-left">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(exp => (
              <tr key={exp.id} className="border-t border-border hover:bg-muted/20 transition-colors">
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
                <td className="p-3 max-w-xs truncate cursor-pointer" onClick={() => setSelected(exp)}>{exp.description}</td>
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
    </div>
  );
}