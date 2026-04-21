import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import ReimbursementBadge from "../components/ReimbursementBadge";
import CategoryBadge from "../components/CategoryBadge";
import PersonAvatar from "../components/PersonAvatar";
import ExpenseSpendChart from "../components/ExpenseSpendChart";
import { CLIENT_CODES, PAID_BY_CODES, formatCurrency, formatForeignCurrency, formatDateUK, getClientName } from "@/lib/constants";
import { PERSON_AVATARS } from "@/lib/personAvatars";

// Staff members who have personal reimbursement codes
const STAFF_OPTIONS = [
  { code: "DJ", label: "Dee" },
  { code: "CB", label: "Céline" },
  { code: "ST", label: "Sophie" },
];

export default function MyExpenses() {
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === "admin";

  // Admin can toggle to view any staff member's expenses
  const [viewingCode, setViewingCode] = useState(null);

  // Resolve which paid_by code to filter by
  const targetCode = isAdmin && viewingCode ? viewingCode : user?.paid_by_code || null;
  const targetPerson = targetCode ? PERSON_AVATARS[targetCode] : null;

  // Fetch all expenses for the target person (by submitted_by for own user, or paid_by for admin view)
  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ["myExpenses", user?.email, targetCode],
    queryFn: async () => {
      if (isAdmin && viewingCode) {
        // Admin viewing another staff member — filter by paid_by code
        return base44.entities.Expense.filter({ paid_by: viewingCode }, "-date", 500);
      }
      // Regular user — filter by their own submitted_by email
      return base44.entities.Expense.filter({ submitted_by: user.email }, "-date", 500);
    },
    enabled: !!user,
  });

  const [filterMonth, setFilterMonth] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [selected, setSelected] = useState(null);

  const drafts = allExpenses.filter(e => e.status === "draft");
  const confirmed = allExpenses.filter(e => e.status !== "draft");

  const months = useMemo(() => [...new Set(confirmed.map(e => e.month))].filter(Boolean), [confirmed]);

  const filtered = confirmed.filter(e => {
    if (filterMonth !== "all" && e.month !== filterMonth) return false;
    if (filterClient !== "all" && !e.client_allocations?.some(a => a.client_code === filterClient)) return false;
    return true;
  });

  const totalSpend = useMemo(() => confirmed.reduce((s, e) => s + (e.paid_amount || 0), 0), [confirmed]);
  const pendingReimb = useMemo(() => confirmed.filter(e => e.reimbursement_required && !e.reimbursement_paid).reduce((s, e) => s + (e.paid_amount || 0), 0), [confirmed]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7F5BFF" }} />
      </div>
    );
  }

  // For display: show the person whose expenses we're viewing
  const displayName = targetPerson?.name || user?.full_name || "Me";
  const displayImage = targetPerson?.image || null;
  const displayInitial = displayName.charAt(0);

  return (
    <div className="space-y-6">

      {/* Profile header card */}
      <div
        className="rounded-[20px] p-6 hero-glow card-elevation relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7F5BFF 0%, #6F3BFF 50%, #3A1DFF 100%)",
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {displayImage ? (
              <img
                src={displayImage}
                alt={displayName}
                className="w-16 h-16 rounded-full object-cover border-2 border-white/30 flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                {displayInitial}
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>
                {isAdmin && viewingCode ? "Viewing expenses for" : "My Expenses"}
              </p>
              <h1 className="text-2xl font-semibold text-white" style={{ letterSpacing: "-0.02em" }}>
                {displayName}
              </h1>
            </div>
          </div>

          {/* Admin staff toggle */}
          {isAdmin && (
            <div className="flex-shrink-0">
              <Select
                value={viewingCode || "__me"}
                onValueChange={v => {
                  setViewingCode(v === "__me" ? null : v);
                  setFilterMonth("all");
                  setFilterClient("all");
                }}
              >
                <SelectTrigger
                  className="w-40 h-9 text-sm border-white/20 bg-white/10 text-white"
                  style={{ borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__me">My expenses</SelectItem>
                  {STAFF_OPTIONS.map(s => (
                    <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>Total Submitted</p>
            <p className="text-xl font-semibold tabular-nums text-white">{formatCurrency(totalSpend)}</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{confirmed.length} expenses</p>
          </div>
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>Pending Reimbursement</p>
            <p className="text-xl font-semibold tabular-nums text-white">{formatCurrency(pendingReimb)}</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              {confirmed.filter(e => e.reimbursement_required && !e.reimbursement_paid).length} items outstanding
            </p>
          </div>
        </div>
      </div>

      {/* Spend over time chart */}
      <div
        className="rounded-[20px] p-5 card-elevation"
        style={{ backgroundColor: "#14141B", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h3 className="font-semibold text-[18px] mb-4" style={{ color: "#FFFFFF", letterSpacing: "-0.01em" }}>
          Spend Over Time
        </h3>
        <ExpenseSpendChart expenses={confirmed} />
      </div>

      {/* Draft / Pending section */}
      {drafts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold" style={{ color: "#FFB547" }}>Pending — Action Required</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,181,71,0.15)", color: "#FFB547" }}>
              {drafts.length}
            </span>
          </div>
          <div className="space-y-2">
            {drafts.map(exp => (
              <button
                key={exp.id}
                onClick={() => navigate(`/submit-expense?draft_id=${exp.id}`)}
                className="w-full text-left rounded-[14px] px-4 py-3 flex items-center justify-between gap-4 transition-all duration-200 active:scale-[0.99]"
                style={{ backgroundColor: "rgba(255,181,71,0.08)", border: "1px solid rgba(255,181,71,0.2)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ backgroundColor: "rgba(255,181,71,0.2)", color: "#FFB547" }}>
                    Action Required
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{exp.description}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#6C6C80" }}>{formatDateUK(exp.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{formatCurrency(exp.paid_amount)}</span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "#6C6C80" }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {CLIENT_CODES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Expense list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: "#6C6C80" }}>
          <p className="text-lg font-medium text-white">No expenses found</p>
          <p className="text-sm mt-1">Submit your first expense to see it here</p>
        </div>
      ) : (
        <div
          className="rounded-[20px] overflow-hidden card-elevation"
          style={{ backgroundColor: "#14141B", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="hidden md:grid grid-cols-[100px_1fr_1fr_110px_130px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "#6C6C80", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span>Date</span>
            <span>Client(s)</span>
            <span>Description</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Reimbursement</span>
          </div>
          {filtered.map((exp, idx) => (
            <div
              key={exp.id}
              onClick={() => setSelected(exp)}
              className="grid grid-cols-1 md:grid-cols-[100px_1fr_1fr_110px_130px] gap-1 md:gap-4 px-5 py-4 cursor-pointer transition-colors"
              style={{
                borderBottom: idx < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <span className="text-sm font-medium" style={{ color: "#FFFFFF" }}>{formatDateUK(exp.date)}</span>
              <span className="text-sm" style={{ color: "#6C6C80" }}>
                {exp.client_allocations?.map(a => a.client_code).join(", ")}
              </span>
              <span className="text-sm truncate" style={{ color: "#A1A1B5" }}>{exp.description}</span>
              <div className="text-right">
                <span className="text-sm font-semibold tabular-nums" style={{ color: "#FFFFFF" }}>{formatCurrency(exp.paid_amount)}</span>
                {exp.currency && exp.currency !== "GBP" && exp.original_amount && (
                  <div className="text-xs" style={{ color: "#6C6C80" }}>{formatForeignCurrency(exp.original_amount, exp.currency)}</div>
                )}
              </div>
              <div className="text-center">
                <ReimbursementBadge required={exp.reimbursement_required} paid={exp.reimbursement_paid} />
              </div>
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
                <div>
                  <span className="text-muted-foreground">Paid Amount:</span><br />
                  {formatCurrency(selected.paid_amount)}
                  {selected.currency && selected.currency !== "GBP" && selected.original_amount && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatForeignCurrency(selected.original_amount, selected.currency)}
                      {selected.exchange_rate && ` @ ${selected.exchange_rate.toFixed(4)}`}
                    </div>
                  )}
                </div>
                <div><span className="text-muted-foreground">Paid By:</span><br /><PersonAvatar code={selected.paid_by} size="sm" showName={true} /></div>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Description:</span>
                <p className="mt-1">{selected.description}</p>
              </div>
              {selected.category && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Category:</span>
                  <div className="mt-2"><CategoryBadge category={selected.category} showLabel={true} /></div>
                </div>
              )}
              <div className="text-sm">
                <span className="text-muted-foreground">Client(s):</span>
                <div className="mt-2 space-y-1">
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