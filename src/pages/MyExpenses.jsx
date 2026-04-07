import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import ReimbursementBadge from "../components/ReimbursementBadge";
import { CLIENT_CODES, formatCurrency, formatDateUK, getClientName } from "@/lib/constants";

export default function MyExpenses() {
  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["myExpenses", user?.email],
    queryFn: () => base44.entities.Expense.filter({ submitted_by: user.email }, "-date"),
    enabled: !!user?.email,
  });

  const [filterMonth, setFilterMonth] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [selected, setSelected] = useState(null);

  const months = [...new Set(expenses.map(e => e.month))].filter(Boolean);

  const filtered = expenses.filter(e => {
    if (filterMonth !== "all" && e.month !== filterMonth) return false;
    if (filterClient !== "all" && !e.client_allocations?.some(a => a.client_code === filterClient)) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Expenses</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {CLIENT_CODES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No expenses found</p>
          <p className="text-sm mt-1">Submit your first expense to see it here</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[100px_1fr_1fr_100px_120px] gap-4 px-4 py-3 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Date</span>
            <span>Client(s)</span>
            <span>Description</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Reimbursement</span>
          </div>
          {filtered.map(exp => (
            <div
              key={exp.id}
              onClick={() => setSelected(exp)}
              className="grid grid-cols-1 md:grid-cols-[100px_1fr_1fr_100px_120px] gap-1 md:gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
            >
              <span className="text-sm font-medium">{formatDateUK(exp.date)}</span>
              <span className="text-sm text-muted-foreground">
                {exp.client_allocations?.map(a => a.client_code).join(", ")}
              </span>
              <span className="text-sm truncate">{exp.description}</span>
              <span className="text-sm font-semibold text-right">{formatCurrency(exp.paid_amount)}</span>
              <span className="text-center">
                <ReimbursementBadge required={exp.reimbursement_required} paid={exp.reimbursement_paid} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expense Detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Date:</span><br />{formatDateUK(selected.date)}</div>
                <div><span className="text-muted-foreground">Receipt Code:</span><br /><span className="font-mono text-primary font-medium">{selected.receipt_code}</span></div>
                <div><span className="text-muted-foreground">Paid Amount:</span><br />{formatCurrency(selected.paid_amount)}</div>
                <div><span className="text-muted-foreground">Paid By:</span><br />{selected.paid_by}</div>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Description:</span>
                <p className="mt-1">{selected.description}</p>
              </div>
              <div className="text-sm">
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
                  <span className="text-sm text-muted-foreground">Receipt:</span>
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