import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, CreditCard, Receipt } from "lucide-react";
import { motion } from "framer-motion";
import AnimatedPage from "@/components/AnimatedPage";
import { StaggerList, StaggerItem } from "@/components/StaggerList";
import { SkeletonCard, SkeletonRow } from "@/components/SkeletonCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, formatDateUK, getClientName, getPaidByLabel, CLIENT_CODES } from "@/lib/constants";
import ReimbursementBadge from "../components/ReimbursementBadge";
import PersonAvatar from "../components/PersonAvatar";

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

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub }) {
  return (
    <div
      className="rounded-[20px] p-5 card-elevation"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-soft)",
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{sub}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-[14px] px-3 py-2 text-sm"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-primary)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>{getClientName(label)}</p>
        <p className="font-semibold tabular-nums">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [period, setPeriod] = useState("this_month");
  const heroRef = useRef(null);
  const handleHeroMouseMove = (e) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  };

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

  const clientSpend = useMemo(() => {
    const map = {};
    periodExpenses.forEach(e => {
      e.client_allocations?.forEach(a => {
        map[a.client_code] = (map[a.client_code] || 0) + (a.amount || 0);
      });
    });
    return CLIENT_CODES.map(c => ({ code: c.code, name: c.name, amount: map[c.code] || 0 })).filter(c => c.amount > 0);
  }, [periodExpenses]);

  const pendingReimb = expenses.filter(e => e.reimbursement_required && !e.reimbursement_paid);
  const reimbByPerson = useMemo(() => {
    const map = {};
    pendingReimb.forEach(e => {
      const key = e.paid_by || 'Unknown';
      const name = getPaidByLabel(e.paid_by) || key;
      if (!map[key]) map[key] = { code: key, name, count: 0, total: 0 };
      map[key].count++;
      map[key].total += e.paid_amount || 0;
    });
    return Object.values(map);
  }, [pendingReimb]);

  const recentExpenses = useMemo(() => expenses.slice(0, 10), [expenses]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="shimmer-line w-32 h-8 rounded-xl" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s linear infinite" }} />
        </div>
        <div className="rounded-[20px] h-36 shimmer-line" style={{ background: "linear-gradient(90deg, rgba(127,91,255,0.15) 0%, rgba(127,91,255,0.3) 50%, rgba(127,91,255,0.15) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s linear infinite" }} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
      </div>
    );
  }

  const periodLabel = period === "this_month" ? "This Month" : period === "last_month" ? "Last Month" : "This Year";

  return (
    <AnimatedPage>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="text-[28px] font-semibold"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          Dashboard
        </h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36 h-9 text-sm" style={{ height: "36px" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Hero balance card */}
      <motion.div
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[20px] p-6 card-elevation relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7F5BFF 0%, #6F3BFF 50%, #3A1DFF 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[20px] opacity-60" style={{ background: "radial-gradient(circle at var(--mx, 30%) var(--my, 50%), rgba(255,255,255,0.18) 0%, transparent 55%)" }} />
        <p className="text-sm font-medium mb-2" style={{ color: "rgba(255,255,255,0.8)" }}>
          Total spend — {periodLabel}
        </p>
        <p
          className="tabular-nums font-semibold"
          style={{ fontSize: "48px", letterSpacing: "-0.03em", lineHeight: 1.05, color: "#FFFFFF" }}
        >
          {formatCurrency(totalSpend)}
        </p>
        <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.65)" }}>
          {periodExpenses.length} expenses across {clientSpend.length} clients
        </p>
      </motion.div>

      {/* Stat cards */}
      <StaggerList className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StaggerItem>
          <StatCard icon={TrendingUp} iconBg="rgba(127,91,255,0.15)" iconColor="#7F5BFF" label="Total Spend" value={formatCurrency(totalSpend)} sub={`${periodLabel} — ${periodExpenses.length} expenses`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CreditCard} iconBg="rgba(255,92,122,0.15)" iconColor="#FF5C7A" label="Pending Reimbursements" value={formatCurrency(pendingReimb.reduce((s, e) => s + (e.paid_amount || 0), 0))} sub={`${pendingReimb.length} items outstanding`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Receipt} iconBg="rgba(61,220,151,0.15)" iconColor="#3DDC97" label="Expenses This Period" value={periodExpenses.length.toString()} sub={`${clientSpend.length} clients`} />
        </StaggerItem>
      </StaggerList>

      {/* Charts and reimbursements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client spend chart */}
        <div
          className="rounded-[20px] p-5 card-elevation"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}
        >
          <h3 className="font-semibold mb-4 text-[20px]" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Spend by Client
          </h3>
          {clientSpend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={clientSpend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 12, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "var(--text-tertiary)" }} tickFormatter={v => `£${v}`} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(127,91,255,0.06)" }} />
                <Bar dataKey="amount" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7F5BFF" />
                    <stop offset="100%" stopColor="#3A1DFF" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-10 text-sm" style={{ color: "var(--text-tertiary)" }}>No expenses in this period</p>
          )}
        </div>

        {/* Pending reimbursements */}
        <div
          className="rounded-[20px] p-5 card-elevation"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}
        >
          <h3 className="font-semibold mb-4 text-[20px]" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Reimbursements Owed
          </h3>
          {reimbByPerson.length > 0 ? (
            <div className="space-y-3">
              {reimbByPerson.map(p => (
                <div
                  key={p.name}
                  className="flex items-center justify-between p-3 rounded-[14px] transition-colors"
                  style={{ backgroundColor: "var(--bg-surface-2)" }}
                >
                  <div className="flex items-center gap-3">
                    <PersonAvatar code={p.code} size="sm" />
                    <div>
                      <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{p.count} items pending</div>
                    </div>
                  </div>
                  <span className="text-lg font-semibold tabular-nums" style={{ color: "#7F5BFF" }}>
                    {formatCurrency(p.total)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(61,220,151,0.1)" }}>
                <Receipt className="h-5 w-5" style={{ color: "#3DDC97" }} strokeWidth={1.75} />
              </div>
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>All reimbursements settled</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent expenses */}
      <div
        className="rounded-[20px] overflow-hidden card-elevation"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <h3 className="font-semibold text-[20px]" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Recent Expenses
          </h3>
        </div>
        <StaggerList>
          {recentExpenses.map((exp, idx) => (
            <StaggerItem key={exp.id}>
              <div
                className="flex items-center justify-between px-5 py-4 transition-colors cursor-default"
                style={{
                  borderBottom: idx < recentExpenses.length - 1 ? "1px solid var(--border-soft)" : "none",
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-surface-2)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{formatDateUK(exp.date)}</span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>by</span>
                    <PersonAvatar code={exp.paid_by} size="xs" showName={true} />
                  </div>
                  <p className="text-sm truncate" style={{ color: "var(--text-tertiary)" }}>{exp.description}</p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {formatCurrency(exp.paid_amount)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {exp.client_allocations?.map(a => a.client_code).join(", ")}
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
          {recentExpenses.length === 0 && (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No expenses yet</div>
          )}
        </StaggerList>
      </div>
    </div>
    </AnimatedPage>
  );
}