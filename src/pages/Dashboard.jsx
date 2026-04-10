import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, CreditCard, Receipt } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, formatDateUK, getClientName, getPaidByLabel, CLIENT_CODES } from "@/lib/constants";
import ReimbursementBadge from "../components/ReimbursementBadge";

function getMonthRange(filter) {
  const now = new Date();
  if (filter === "this_month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
  }
  if (filter === "last_month") {
    return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) };
  }
  return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) };
}

export default function Dashboard() {
  const [period, setPeriod] = useState("this_month");

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["allExpenses"],
    queryFn: () => base44.entities.Expense.list("-date", 500),
  });

  const range = getMonthRange(period);
  const periodExpenses = useMemo(() => 
    expenses.filter(e => {
      const d = new Date(e.date);
      return d >= range.start && d <= range.end;
    }),
    [expenses, period]
  );

  const totalSpend = periodExpenses.reduce((s, e) => s + (e.paid_amount || 0), 0);

  // Spend per client
  const clientSpend = useMemo(() => {
    const map = {};
    periodExpenses.forEach(e => {
      e.client_allocations?.forEach(a => {
        map[a.client_code] = (map[a.client_code] || 0) + (a.amount || 0);
      });
    });
    return CLIENT_CODES.map(c => ({ code: c.code, name: c.name, amount: map[c.code] || 0 })).filter(c => c.amount > 0);
  }, [periodExpenses]);

  // Pending reimbursements
  const pendingReimb = expenses.filter(e => e.reimbursement_required && !e.reimbursement_paid);
  const reimbByPerson = useMemo(() => {
    const map = {};
    pendingReimb.forEach(e => {
      const key = e.paid_by || 'Unknown';
      const name = getPaidByLabel(e.paid_by) || key;
      if (!map[key]) map[key] = { name, count: 0, total: 0 };
      map[key].count++;
      map[key].total += e.paid_amount || 0;
    });
    return Object.values(map);
  }, [pendingReimb]);

  const recentExpenses = expenses.slice(0, 10);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const periodLabel = period === "this_month" ? "This Month" : period === "last_month" ? "Last Month" : "This Year";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Total Spend</span>
          </div>
          <p className="text-3xl font-bold">{formatCurrency(totalSpend)}</p>
          <p className="text-xs text-muted-foreground mt-1">{periodLabel} — {periodExpenses.length} expenses</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-red-500" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Pending Reimbursements</span>
          </div>
          <p className="text-3xl font-bold">{formatCurrency(pendingReimb.reduce((s, e) => s + (e.paid_amount || 0), 0))}</p>
          <p className="text-xs text-muted-foreground mt-1">{pendingReimb.length} items outstanding</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Receipt className="h-5 w-5 text-blue-500" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Expenses This Period</span>
          </div>
          <p className="text-3xl font-bold">{periodExpenses.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{clientSpend.length} clients</p>
        </div>
      </div>

      {/* Charts and info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client spend chart */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-4">Spend by Client — {periodLabel}</h3>
          {clientSpend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={clientSpend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `£${v}`} />
                <Tooltip formatter={v => formatCurrency(v)} labelFormatter={l => getClientName(l)} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-10 text-sm">No expenses in this period</p>
          )}
        </div>

        {/* Pending reimbursements */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-4">Reimbursements Owed</h3>
          {reimbByPerson.length > 0 ? (
            <div className="space-y-3">
              {reimbByPerson.map(p => (
                <div key={p.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.count} items pending</div>
                  </div>
                  <span className="text-lg font-bold text-primary">{formatCurrency(p.total)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-10 text-sm">All reimbursements settled</p>
          )}
        </div>
      </div>

      {/* Recent expenses */}
      <div className="bg-card rounded-xl border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold">Recent Expenses</h3>
        </div>
        <div className="divide-y divide-border">
          {recentExpenses.map(exp => (
            <div key={exp.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatDateUK(exp.date)}</span>
                  <span className="text-xs text-muted-foreground">by {exp.submitted_by_name}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{exp.description}</p>
              </div>
              <div className="text-right ml-4">
                <div className="text-sm font-semibold">{formatCurrency(exp.paid_amount)}</div>
                <div className="text-xs text-muted-foreground">{exp.client_allocations?.map(a => a.client_code).join(", ")}</div>
              </div>
            </div>
          ))}
          {recentExpenses.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">No expenses yet</div>
          )}
        </div>
      </div>
    </div>
  );
}