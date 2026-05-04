import { useMemo } from "react";
import { CheckCircle2, Clock, FileX, CreditCard, Tag, RefreshCw, Copy } from "lucide-react";

function findDuplicateCount(expenses) {
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
  const seen = new Set();
  let count = 0;
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if (
        a.description === b.description &&
        a.paid_amount === b.paid_amount &&
        Math.abs(new Date(a.date) - new Date(b.date)) <= FORTY_EIGHT_HOURS
      ) {
        seen.add(a.id);
        seen.add(b.id);
        count++;
      }
    }
  }
  return count;
}

const CHECK_CONFIG = [
  {
    key: "drafts",
    icon: Clock,
    label: "Draft expenses",
    helper: "Needs review before export",
    color: "#FFB547",
    bg: "rgba(255,181,71,0.12)",
    borderColor: "rgba(255,181,71,0.25)",
  },
  {
    key: "missingReceipts",
    icon: FileX,
    label: "Missing receipts",
    helper: "No receipt file attached",
    color: "#FF5C7A",
    bg: "rgba(255,92,122,0.12)",
    borderColor: "rgba(255,92,122,0.25)",
  },
  {
    key: "pendingReimb",
    icon: CreditCard,
    label: "Pending reimbursements",
    helper: "Owed to staff, not yet paid",
    color: "#7F5BFF",
    bg: "rgba(127,91,255,0.12)",
    borderColor: "rgba(127,91,255,0.25)",
  },
  {
    key: "uncategorised",
    icon: Tag,
    label: "Uncategorised expenses",
    helper: "No category assigned",
    color: "#A1A1B5",
    bg: "rgba(161,161,181,0.1)",
    borderColor: "rgba(161,161,181,0.2)",
  },
  {
    key: "syncFailed",
    icon: RefreshCw,
    label: "Drive sync failures",
    helper: "Receipt not synced to Drive",
    color: "#FF5C7A",
    bg: "rgba(255,92,122,0.12)",
    borderColor: "rgba(255,92,122,0.25)",
  },
  {
    key: "duplicates",
    icon: Copy,
    label: "Possible duplicates",
    helper: "Same amount & description within 48h",
    color: "#FFB547",
    bg: "rgba(255,181,71,0.12)",
    borderColor: "rgba(255,181,71,0.25)",
  },
];

export default function MonthEndReadiness({ expenses }) {
  const counts = useMemo(() => ({
    drafts: expenses.filter(e => e.status === "draft").length,
    missingReceipts: expenses.filter(e => e.status !== "draft" && !e.receipt_file && !e.receipt_url).length,
    pendingReimb: expenses.filter(e => e.reimbursement_required && !e.reimbursement_paid).length,
    uncategorised: expenses.filter(e => e.status !== "draft" && !e.category).length,
    syncFailed: expenses.filter(e => e.drive_sync_failed).length,
    duplicates: findDuplicateCount(expenses),
  }), [expenses]);

  const isReady = Object.values(counts).every(c => c === 0);

  return (
    <div
      className="rounded-[20px] p-5"
      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}
    >
      {/* Header + readiness badge */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-semibold text-base" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          Month-End Readiness
        </h3>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={
            isReady
              ? { backgroundColor: "rgba(61,220,151,0.12)", color: "#3DDC97", border: "1px solid rgba(61,220,151,0.25)" }
              : { backgroundColor: "rgba(255,181,71,0.12)", color: "#FFB547", border: "1px solid rgba(255,181,71,0.25)" }
          }
        >
          {isReady
            ? <><CheckCircle2 className="h-3.5 w-3.5" /> Ready to export</>
            : <><Clock className="h-3.5 w-3.5" /> Needs review</>
          }
        </span>
      </div>

      {/* Check rows */}
      <div className="space-y-2">
        {CHECK_CONFIG.map(({ key, icon: Icon, label, helper, color, bg, borderColor }) => {
          const count = counts[key];
          const ok = count === 0;
          return (
            <div
              key={key}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[12px]"
              style={{
                backgroundColor: ok ? "var(--bg-surface-2)" : bg,
                border: `1px solid ${ok ? "var(--border-soft)" : borderColor}`,
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: ok ? "rgba(61,220,151,0.12)" : bg }}
              >
                {ok
                  ? <CheckCircle2 className="h-4 w-4" style={{ color: "#3DDC97" }} strokeWidth={1.75} />
                  : <Icon className="h-4 w-4" style={{ color }} strokeWidth={1.75} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium" style={{ color: ok ? "var(--text-secondary)" : "var(--text-primary)" }}>
                  {label}
                </span>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{helper}</p>
              </div>
              <span
                className="text-sm font-semibold tabular-nums flex-shrink-0"
                style={{ color: ok ? "#3DDC97" : color }}
              >
                {ok ? "Clear" : count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}