import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/constants";

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-[14px] px-4 py-3 text-sm"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        <p className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{label}</p>
        <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatCurrency(payload[0].value)}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
          {payload[0].payload.count} expense{payload[0].payload.count !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }
  return null;
};

export default function ExpenseSpendChart({ expenses }) {
  const chartData = useMemo(() => {
    // Group expenses by month, sorted chronologically
    const map = {};
    expenses.forEach(e => {
      if (!e.month) return;
      if (!map[e.month]) map[e.month] = { month: e.month, total: 0, count: 0, sortKey: e.date || "" };
      map[e.month].total += e.paid_amount || 0;
      map[e.month].count++;
      // Keep earliest date for sorting
      if (e.date && e.date < map[e.month].sortKey) map[e.month].sortKey = e.date;
    });

    return Object.values(map)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(d => ({ month: d.month, total: Math.round(d.total * 100) / 100, count: d.count }));
  }, [expenses]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: "var(--text-tertiary)" }}>
        <p className="text-sm">No expense data to display yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7F5BFF" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#7F5BFF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          tickFormatter={v => `£${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(127,91,255,0.3)", strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#7F5BFF"
          strokeWidth={2.5}
          fill="url(#expenseGradient)"
          dot={{ fill: "#7F5BFF", r: 4, strokeWidth: 0 }}
          activeDot={{ fill: "#FFFFFF", r: 5, stroke: "#7F5BFF", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}