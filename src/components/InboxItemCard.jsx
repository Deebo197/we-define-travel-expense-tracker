import { Clock, CheckCircle2, AlertCircle, Loader2, FileText, Image, Eye } from "lucide-react";
import { formatCurrency, formatDateUK } from "@/lib/constants";

const STATUS_CONFIG = {
  inbox:        { label: "Queued",       icon: Clock,         color: "#A1A1B5", bg: "rgba(161,161,181,0.1)" },
  processing:   { label: "Processing",   icon: Loader2,       color: "#7F5BFF", bg: "rgba(127,91,255,0.1)", spin: true },
  needs_review: { label: "Needs Review", icon: AlertCircle,   color: "#FFB547", bg: "rgba(255,181,71,0.12)" },
  confirmed:    { label: "Confirmed",    icon: CheckCircle2,  color: "#3DDC97", bg: "rgba(61,220,151,0.12)" },
  failed:       { label: "Failed",       icon: AlertCircle,   color: "#FF5C7A", bg: "rgba(255,92,122,0.12)" },
};

export default function InboxItemCard({ item, onClick }) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.inbox;
  const Icon = cfg.icon;
  const isPdf = item.mime_type === "application/pdf" || item.original_filename?.toLowerCase().endsWith(".pdf");

  return (
    <div
      onClick={() => (item.status === "needs_review" || item.status === "failed") && onClick(item)}
      className="rounded-[16px] p-4 transition-all duration-200 flex gap-3"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-soft)",
        cursor: (item.status === "needs_review" || item.status === "failed") ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        if (item.status === "needs_review" || item.status === "failed") {
          e.currentTarget.style.backgroundColor = "var(--bg-surface-2)";
        }
      }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-surface)"; }}
    >
      {/* Thumbnail / icon */}
      <div
        className="w-16 h-16 rounded-[10px] flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: "var(--bg-surface-2)" }}
      >
        {isPdf ? (
          <FileText className="h-7 w-7" style={{ color: "#FF5C7A" }} strokeWidth={1.5} />
        ) : item.file_url ? (
          <img src={item.file_url} alt="receipt" className="w-full h-full object-cover" />
        ) : (
          <Image className="h-7 w-7" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-xs font-mono font-semibold" style={{ color: "#7F5BFF" }}>
            {item.receipt_code}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: cfg.bg, color: cfg.color }}
          >
            <Icon className={`h-2.5 w-2.5 ${cfg.spin ? "animate-spin" : ""}`} />
            {cfg.label}
          </span>
        </div>

        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {item.extracted_supplier || item.extracted_description || item.original_filename || "Receipt"}
        </p>

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {item.extracted_date && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {formatDateUK(item.extracted_date)}
            </span>
          )}
          {item.extracted_amount > 0 && (
            <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatCurrency(item.extracted_amount)}
            </span>
          )}
          {item.ocr_error && item.status === "failed" && (
            <span className="text-xs" style={{ color: "#FF5C7A" }}>OCR failed — click to enter manually</span>
          )}
        </div>
      </div>

      {/* Review arrow */}
      {(item.status === "needs_review" || item.status === "failed") && (
        <div className="flex items-center self-center flex-shrink-0 ml-1">
          <Eye className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
        </div>
      )}
    </div>
  );
}