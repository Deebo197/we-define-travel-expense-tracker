import { AlertTriangle, Clock, CheckCircle2, RefreshCw, FileX, Send } from "lucide-react";

/**
 * Derives the most relevant status for an expense record.
 * Priority: draft > sync_failed > missing_receipt > reimbursement_pending > reimbursed > submitted
 */
export function getExpenseStatus(expense) {
  if (expense.status === "draft") return "draft";
  if (expense.drive_sync_failed) return "sync_failed";
  if (!expense.receipt_file && !expense.receipt_url) return "missing_receipt";
  if (expense.reimbursement_required && !expense.reimbursement_paid) return "reimbursement_pending";
  if (expense.reimbursement_required && expense.reimbursement_paid) return "reimbursed";
  return "submitted";
}

const STATUS_CONFIG = {
  draft: {
    label: "Needs Review",
    icon: Clock,
    color: "#FFB547",
    bg: "rgba(255,181,71,0.15)",
  },
  sync_failed: {
    label: "Sync Failed",
    icon: RefreshCw,
    color: "#FF5C7A",
    bg: "rgba(255,92,122,0.15)",
  },
  missing_receipt: {
    label: "Missing Receipt",
    icon: FileX,
    color: "#FF5C7A",
    bg: "rgba(255,92,122,0.15)",
  },
  reimbursement_pending: {
    label: "Reimbursement Pending",
    icon: AlertTriangle,
    color: "#FFB547",
    bg: "rgba(255,181,71,0.15)",
  },
  reimbursed: {
    label: "Reimbursed",
    icon: CheckCircle2,
    color: "#3DDC97",
    bg: "rgba(61,220,151,0.15)",
  },
  submitted: {
    label: "Submitted",
    icon: Send,
    color: "#A1A1B5",
    bg: "rgba(161,161,181,0.12)",
  },
};

export default function ExpenseStatusBadge({ expense, size = "sm" }) {
  const status = getExpenseStatus(expense);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const isSmall = size === "sm";

  return (
    <span
      className="inline-flex items-center gap-1 font-semibold rounded-full whitespace-nowrap"
      style={{
        color: config.color,
        backgroundColor: config.bg,
        fontSize: isSmall ? "11px" : "12px",
        padding: isSmall ? "2px 8px" : "3px 10px",
      }}
    >
      <Icon className="flex-shrink-0" style={{ width: isSmall ? 10 : 12, height: isSmall ? 10 : 12 }} />
      {config.label}
    </span>
  );
}