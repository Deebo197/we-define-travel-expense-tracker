import { useState, useMemo } from "react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import AnimatedPage from "@/components/AnimatedPage";
import { StaggerList, StaggerItem } from "@/components/StaggerList";
import { SkeletonCard, SkeletonRow } from "@/components/SkeletonCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronRight, PlusCircle, FileX, RefreshCw, Inbox, Car, Pencil } from "lucide-react";
import EditExpenseDialog from "@/components/EditExpenseDialog";
import CategoryBadge from "../components/CategoryBadge";
import PersonAvatar from "../components/PersonAvatar";
import ExpenseSpendChart from "../components/ExpenseSpendChart";
import ExpenseStatusBadge, { getExpenseStatus } from "../components/ExpenseStatusBadge";
import { CLIENT_CODES, PAID_BY_CODES, formatCurrency, formatForeignCurrency, formatDateUK, getClientName } from "@/lib/constants";
import { PERSON_AVATARS } from "@/lib/personAvatars";

// All paid_by codes that belong to each staff member (personal + company Amex)
const STAFF_ALL_CODES = {
  DJ: ["DJ", "WDA"],
  CB: ["CB", "WCA"],
  ST: ["ST", "WSA"],
};

const STAFF_OPTIONS = [
  { code: "DJ", label: "Dee" },
  { code: "CB", label: "Céline" },
  { code: "ST", label: "Sophie" },
];

const QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "reimbursement_pending", label: "Pending Reimbursement" },
  { key: "reimbursed", label: "Paid Back" },
  { key: "missing_receipt", label: "Missing Receipt" },
  { key: "submitted", label: "Submitted" },
];

function getThisMonthTotal(expenses) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return expenses
    .filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getFullYear() === y && d.getMonth() === m;
    })
    .reduce((s, e) => s + (e.paid_amount || 0), 0);
}

export default function MyExpenses() {
  const navigate = useNavigate();
  const heroRef = React.useRef(null);

  const handleHeroMouseMove = (e) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  };

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === "admin";
  const [viewingCode, setViewingCode] = useState(null);

  // Determine the primary code for display (personal code like DJ, CB, ST)
  const targetCode = isAdmin && viewingCode ? viewingCode : user?.paid_by_code || null;
  const targetPerson = targetCode ? PERSON_AVATARS[targetCode] : null;

  // All codes (personal + Amex) for the person being viewed
  const allCodesForTarget = useMemo(() => {
    if (targetCode && STAFF_ALL_CODES[targetCode]) return STAFF_ALL_CODES[targetCode];
    // Fallback for users without a mapped code: use email-based submitted_by
    return null;
  }, [targetCode]);

  const { data: myInboxItems = [] } = useQuery({
    queryKey: ["myInboxItems", user?.email],
    queryFn: () => base44.entities.ReceiptInboxItem.filter({ owner_email: user.email }, "-created_date", 50),
    enabled: !!user,
  });

  const inboxNeedsReview = myInboxItems.filter(i => i.status === "needs_review").length;
  const inboxFailed = myInboxItems.filter(i => i.status === "failed").length;

  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ["myExpenses", user?.email, targetCode],
    queryFn: async () => {
      const codes = isAdmin && viewingCode
        ? STAFF_ALL_CODES[viewingCode] || [viewingCode]
        : allCodesForTarget;

      if (codes) {
        // Fetch by all paid_by codes for this person, deduplicate
        const results = await Promise.all(
          codes.map(c => base44.entities.Expense.filter({ paid_by: c }, "-date", 500))
        );
        const seen = new Set();
        return results.flat().filter(e => seen.has(e.id) ? false : seen.add(e.id));
      }
      // Fallback: submitted_by email
      return base44.entities.Expense.filter({ submitted_by: user.email }, "-date", 500);
    },
    enabled: !!user,
  });

  const { data: myMileage = [] } = useQuery({
    queryKey: ["myMileage", user?.email, targetCode],
    queryFn: async () => {
      const codes = isAdmin && viewingCode
        ? STAFF_ALL_CODES[viewingCode] || [viewingCode]
        : allCodesForTarget;

      if (codes) {
        const results = await Promise.all(
          codes.map(c => base44.entities.MileageJourney.filter({ staff_member: c }, "-date", 500))
        );
        const seen = new Set();
        return results.flat().filter(j => seen.has(j.id) ? false : seen.add(j.id));
      }
      return [];
    },
    enabled: !!user,
  });

  const [filterMonth, setFilterMonth] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [quickFilter, setQuickFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);

  // Combine mileage journeys as expense-like rows
  const mileageAsExpenses = myMileage.map(j => ({
    ...j,
    _isMileage: true,
    paid_amount: j.total_cost,
    description: j.purpose,
    status: "confirmed",
    receipt_file: j.receipt_file || null,
    receipt_url: j.receipt_url || null,
  }));

  const drafts = allExpenses.filter(e => e.status === "draft");
  const confirmed = [...allExpenses.filter(e => e.status !== "draft"), ...mileageAsExpenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const months = useMemo(() => [...new Set(confirmed.map(e => e.month))].filter(Boolean), [confirmed]);

  // Derived stats
  const thisMonthTotal = useMemo(() => getThisMonthTotal(confirmed), [confirmed]);
  // Reimbursable = paid personally (ST, DJ, CB codes) — money owed back to the person
  const pendingReimbAmt = useMemo(() =>
    confirmed.filter(e => e.reimbursement_required && !e.reimbursement_paid).reduce((s, e) => s + (e.paid_amount || 0), 0),
    [confirmed]);
  const reimbursedAmt = useMemo(() =>
    confirmed.filter(e => e.reimbursement_required && e.reimbursement_paid).reduce((s, e) => s + (e.paid_amount || 0), 0),
    [confirmed]);
  // Company Amex spend = not reimbursable (company card)
  const companyAmexAmt = useMemo(() =>
    confirmed.filter(e => !e.reimbursement_required).reduce((s, e) => s + (e.paid_amount || 0), 0),
    [confirmed]);
  const missingReceiptCount = useMemo(() =>
    confirmed.filter(e => !e._isMileage && !e.receipt_file && !e.receipt_url && !e.primary_receipt_file_url && !e.receipt_files?.[0]?.file_url).length,
    [confirmed]);
  const totalSpend = useMemo(() => confirmed.reduce((s, e) => s + (e.paid_amount || 0), 0), [confirmed]);

  const showActionList =
    pendingReimbAmt > 0 || drafts.length > 0 || missingReceiptCount > 0;

  const filtered = confirmed.filter(e => {
    if (filterMonth !== "all" && e.month !== filterMonth) return false;
    if (filterClient !== "all" && !e.client_allocations?.some(a => a.client_code === filterClient)) return false;
    if (quickFilter !== "all" && getExpenseStatus(e) !== quickFilter) return false;
    return true;
  });

  if (isLoading || !user) {
    return (
      <div className="space-y-6">
        <div className="rounded-[20px] h-44" style={{ background: "linear-gradient(90deg, rgba(127,91,255,0.2) 0%, rgba(127,91,255,0.35) 50%, rgba(127,91,255,0.2) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s linear infinite" }} />
        <SkeletonCard />
        <div className="rounded-[20px] overflow-hidden card-elevation" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}>
          <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
      </div>
    );
  }

  const displayName = targetPerson?.name || user?.full_name || "Me";
  const displayImage = targetPerson?.image || null;
  const displayInitial = displayName.charAt(0);

  return (
    <AnimatedPage>
    <div className="space-y-6">

      {/* Profile header card */}
      <motion.div
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[20px] p-6 card-elevation relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #7F5BFF 0%, #6F3BFF 50%, #3A1DFF 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[20px] opacity-60"
          style={{ background: "radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.15) 0%, transparent 60%)" }}
        />
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {displayImage ? (
              <img src={displayImage} alt={displayName} className="w-16 h-16 rounded-full object-cover border-2 border-white/30 flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
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

          {isAdmin && (
            <div className="flex-shrink-0">
              <Select
                value={viewingCode || "__me"}
                onValueChange={v => {
                  setViewingCode(v === "__me" ? null : v);
                  setFilterMonth("all");
                  setFilterClient("all");
                  setQuickFilter("all");
                }}
              >
                <SelectTrigger className="w-40 h-9 text-sm" style={{ borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)", color: "white" }}>
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

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>This Month</p>
            <p className="text-lg font-semibold tabular-nums text-white">{formatCurrency(thisMonthTotal)}</p>
          </div>
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: pendingReimbAmt > 0 ? "rgba(255,92,122,0.25)" : "rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>Owed to You</p>
            <p className="text-lg font-semibold tabular-nums text-white">{formatCurrency(pendingReimbAmt)}</p>
          </div>
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>Drafts</p>
            <p className="text-lg font-semibold tabular-nums text-white">{drafts.length}</p>
          </div>
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>Missing Receipts</p>
            <p className="text-lg font-semibold tabular-nums text-white">{missingReceiptCount}</p>
          </div>
        </div>
      </motion.div>

      {/* Receipt Inbox nudge */}
      {(inboxNeedsReview > 0 || inboxFailed > 0) && (
        <Link to="/receipt-inbox">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-[20px] px-5 py-4 flex items-center gap-3 cursor-pointer"
            style={{ backgroundColor: "rgba(127,91,255,0.08)", border: "1px solid rgba(127,91,255,0.2)" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(127,91,255,0.15)" }}
            >
              <Inbox className="h-4 w-4" style={{ color: "#7F5BFF" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Receipt Inbox</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                {[
                  inboxNeedsReview > 0 && `${inboxNeedsReview} receipt${inboxNeedsReview > 1 ? "s" : ""} ready to review`,
                  inboxFailed > 0 && `${inboxFailed} failed — needs manual entry`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "#7F5BFF" }} />
          </motion.div>
        </Link>
      )}

      {/* Action list */}
      {showActionList && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[20px] p-5"
          style={{ backgroundColor: "rgba(255,181,71,0.07)", border: "1px solid rgba(255,181,71,0.2)" }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5" style={{ color: "#FFB547" }} />
                <h2 className="text-base font-semibold" style={{ color: "#FFB547" }}>Your Action List</h2>
              </div>
              <ul className="space-y-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                {pendingReimbAmt > 0 && (
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    {formatCurrency(pendingReimbAmt)} reimbursement outstanding
                  </li>
                )}
                {drafts.length > 0 && (
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    {drafts.length} draft {drafts.length === 1 ? "expense" : "expenses"} need{drafts.length === 1 ? "s" : ""} review
                  </li>
                )}
                {missingReceiptCount > 0 && (
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    {missingReceiptCount} {missingReceiptCount === 1 ? "expense is" : "expenses are"} missing a receipt
                  </li>
                )}
              </ul>
            </div>
            <Link to="/submit-expense">
              <Button size="sm" className="flex-shrink-0">
                <PlusCircle className="h-4 w-4" />
                Submit Expense
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Reimbursement breakdown */}
      <div className="rounded-[20px] p-5 card-elevation" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}>
        <h3 className="font-semibold text-[16px] mb-4" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          Reimbursement Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(255,92,122,0.07)", border: "1px solid rgba(255,92,122,0.15)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "#FF5C7A" }}>Owed to You (Pending)</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: "#FF5C7A" }}>{formatCurrency(pendingReimbAmt)}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Paid personally — awaiting reimbursement</p>
          </div>
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(61,220,151,0.07)", border: "1px solid rgba(61,220,151,0.15)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "#3DDC97" }}>Already Reimbursed</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: "#3DDC97" }}>{formatCurrency(reimbursedAmt)}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Personal spend paid back to you</p>
          </div>
          <div className="rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(127,91,255,0.07)", border: "1px solid rgba(127,91,255,0.15)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "#7F5BFF" }}>Company Card Spend</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: "#7F5BFF" }}>{formatCurrency(companyAmexAmt)}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Paid via company Amex — no reimbursement needed</p>
          </div>
        </div>
      </div>

      {/* Spend over time chart */}
      <div className="rounded-[20px] p-5 card-elevation" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}>
        <h3 className="font-semibold text-[18px] mb-4" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          Spend Over Time
        </h3>
        <ExpenseSpendChart expenses={confirmed} />
      </div>

      {/* Drafts to review */}
      {drafts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold" style={{ color: "#FFB547" }}>Drafts To Review</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,181,71,0.15)", color: "#FFB547" }}>
              {drafts.length}
            </span>
          </div>
          <StaggerList className="space-y-2">
            {drafts.map(exp => (
              <StaggerItem key={exp.id}>
                <button
                  onClick={() => navigate(`/submit-expense?draft_id=${exp.id}`)}
                  className="w-full text-left rounded-[14px] px-4 py-3 flex items-center justify-between gap-4 transition-all duration-200 active:scale-[0.99]"
                  style={{ backgroundColor: "rgba(255,181,71,0.08)", border: "1px solid rgba(255,181,71,0.2)" }}
                >
                  <div className="flex items-center gap-3">
                    <ExpenseStatusBadge expense={exp} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{exp.description}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{formatDateUK(exp.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(exp.paid_amount)}</span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--text-tertiary)" }} />
                  </div>
                </button>
              </StaggerItem>
            ))}
          </StaggerList>
        </div>
      )}

      {/* Filters row */}
      <div className="space-y-3">
        {/* Quick filter chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-150"
              style={{
                backgroundColor: quickFilter === f.key ? "#7F5BFF" : "var(--bg-surface-2)",
                color: quickFilter === f.key ? "white" : "var(--text-secondary)",
                border: quickFilter === f.key ? "1px solid transparent" : "1px solid var(--border-soft)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Month / client selects */}
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
      </div>

      {/* Expense list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--text-tertiary)" }}>
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No expenses found</p>
          <p className="text-sm mt-1">Try changing the filters above</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-[20px] overflow-hidden card-elevation" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}>
            <div className="grid grid-cols-[100px_1fr_1fr_90px_90px_160px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-soft)" }}>
              <span>Date</span>
              <span>Client(s)</span>
              <span>Description</span>
              <span className="text-right">Amount</span>
              <span className="text-center">Paid By</span>
              <span className="text-center">Status</span>
            </div>
            {filtered.map((exp, idx) => (
              <motion.div
                key={exp.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setSelected(exp)}
                className="grid grid-cols-[100px_1fr_1fr_90px_90px_160px] gap-4 px-5 py-4 cursor-pointer transition-colors"
                style={{ borderBottom: idx < filtered.length - 1 ? "1px solid var(--border-soft)" : "none" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-surface-2)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{formatDateUK(exp.date)}</span>
                <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {exp.client_allocations?.map(a => a.client_code).join(", ")}
                </span>
                <span className="text-sm truncate flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  {exp._isMileage && <Car className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#7F5BFF" }} />}
                  {exp.description}
                </span>
                <div className="text-right">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatCurrency(exp.paid_amount)}</span>
                  {exp.currency && exp.currency !== "GBP" && exp.original_amount && (
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{formatForeignCurrency(exp.original_amount, exp.currency)}</div>
                  )}
                </div>
                <div className="flex justify-center items-start pt-0.5">
                  <PersonAvatar code={exp.paid_by || exp.staff_member} size="sm" showName={false} />
                </div>
                <div className="flex justify-center items-start pt-0.5">
                  <ExpenseStatusBadge expense={exp} />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((exp, idx) => (
              <motion.div
                key={exp.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setSelected(exp)}
                className="rounded-[16px] px-4 py-3.5 cursor-pointer active:scale-[0.99] transition-all"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>{formatDateUK(exp.date)}</span>
                    <ExpenseStatusBadge expense={exp} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatCurrency(exp.paid_amount)}</span>
                    {exp.currency && exp.currency !== "GBP" && exp.original_amount && (
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{formatForeignCurrency(exp.original_amount, exp.currency)}</div>
                    )}
                  </div>
                </div>
                <p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                  {exp._isMileage && <Car className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#7F5BFF" }} />}
                  {exp.description}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                  {exp.client_allocations?.map(a => a.client_code).join(", ")}
                </p>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expense Detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {/* Status badge + edit button */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <ExpenseStatusBadge expense={selected} size="md" />
                {!selected._isMileage && (
                  <Button size="sm" variant="outline" onClick={() => { setEditingExpense(selected); setSelected(null); }}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                )}
              </div>

              {/* Missing receipt warning — not applicable for mileage */}
              {!selected._isMileage && !selected.receipt_file && !selected.receipt_url && !selected.primary_receipt_file_url && !selected.receipt_files?.[0]?.file_url && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
                  style={{ backgroundColor: "rgba(255,92,122,0.1)", color: "#FF5C7A", border: "1px solid rgba(255,92,122,0.2)" }}>
                  <FileX className="h-4 w-4 flex-shrink-0" />
                  No receipt attached to this expense.
                </div>
              )}

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

      {editingExpense && (
        <EditExpenseDialog
          expense={editingExpense}
          open={!!editingExpense}
          onClose={() => setEditingExpense(null)}
          queryKeys={[["myExpenses", user?.email, targetCode]]}
        />
      )}
    </div>
    </AnimatedPage>
  );
}