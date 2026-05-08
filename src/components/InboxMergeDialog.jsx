/**
 * InboxMergeDialog — Merge multiple inbox items into one combined receipt.
 * The user picks which file is Primary; others become Supporting.
 * Only the winning receipt_code is kept; merged items are archived.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Star, FileText, CheckCircle2 } from "lucide-react";

function FilePicker({ items, primaryId, onSetPrimary }) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isPrimary = item.id === primaryId;
        const isPdf = item.mime_type === "application/pdf" || item.original_filename?.toLowerCase().endsWith(".pdf");
        return (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-[12px] p-3 transition-all cursor-pointer"
            style={{
              backgroundColor: isPrimary ? "rgba(127,91,255,0.08)" : "var(--bg-surface-2)",
              border: isPrimary ? "1px solid rgba(127,91,255,0.35)" : "1px solid var(--border-soft)",
            }}
            onClick={() => onSetPrimary(item.id)}
          >
            <div
              className="w-12 h-12 rounded-[8px] flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: "var(--bg-elevated)" }}
            >
              {isPdf ? (
                <FileText className="h-6 w-6" style={{ color: "#FF5C7A" }} strokeWidth={1.5} />
              ) : item.file_url ? (
                <img src={item.file_url} alt="receipt" className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono font-semibold" style={{ color: "#7F5BFF" }}>{item.receipt_code}</p>
              <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {item.extracted_supplier || item.original_filename || "Receipt"}
              </p>
              {item.extracted_amount > 0 && (
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>£{Number(item.extracted_amount).toFixed(2)}</p>
              )}
            </div>
            <div className="flex-shrink-0">
              {isPrimary ? (
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ backgroundColor: "rgba(127,91,255,0.15)", color: "#7F5BFF" }}>
                  <Star className="h-3 w-3" fill="currentColor" /> Primary
                </span>
              ) : (
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Supporting</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const READY_STATUSES = ["needs_review", "confirmed", "failed"];

export default function InboxMergeDialog({ items, open, onClose, onMerged }) {
  const [primaryId, setPrimaryId] = useState(items?.[0]?.id || null);
  const [merging, setMerging] = useState(false);

  if (!items || items.length < 2) return null;

  // Items that are still processing/unready cannot be merged
  const unreadyItems = items.filter(i => !READY_STATUSES.includes(i.status));
  const canMerge = unreadyItems.length === 0;

  const primaryItem = items.find(i => i.id === primaryId) || items[0];
  const supportingItems = items.filter(i => i.id !== primaryId);

  const handleMerge = async () => {
    if (!canMerge) return;
    setMerging(true);
    try {
      // Build receipt_files: primary first, then supporting
      const receiptFiles = [
        {
          file_url: primaryItem.file_url,
          public_receipt_url: primaryItem.public_receipt_url || "",
          drive_file_id: primaryItem.drive_file_id || "",
          original_filename: primaryItem.original_filename || "",
          mime_type: primaryItem.mime_type || "",
          role: "primary",
          sort_order: 0,
          ocr_used: true,
        },
        ...supportingItems.map((item, i) => ({
          file_url: item.file_url,
          public_receipt_url: item.public_receipt_url || "",
          drive_file_id: item.drive_file_id || "",
          original_filename: item.original_filename || "",
          mime_type: item.mime_type || "",
          role: "supporting",
          sort_order: i + 1,
          ocr_used: false,
        })),
      ];

      // Update primary item to hold all files
      await base44.entities.ReceiptInboxItem.update(primaryItem.id, {
        receipt_files: receiptFiles,
        primary_receipt_file_url: primaryItem.file_url,
        merged_from_ids: items.map(i => i.id),
        // Keep needs_review status so user confirms through the review dialog
        status: "needs_review",
      });

      // Archive merged (supporting) items
      await Promise.all(
        supportingItems.map(item =>
          base44.entities.ReceiptInboxItem.update(item.id, { status: "merged" })
        )
      );

      // Re-run processInboxReceipt on the merged item so any files missing
      // drive_file_id get uploaded to Drive under the Inbox folder
      const anyMissingDrive = receiptFiles.some(f => !f.drive_file_id);
      if (anyMissingDrive) {
        base44.functions.invoke("processInboxReceipt", { inbox_item_id: primaryItem.id })
          .catch(err => console.error("Re-process after merge failed:", err));
      }

      toast.success(`Merged ${items.length} receipts into ${primaryItem.receipt_code}`);
      onMerged(primaryItem.id);
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to merge receipts");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Receipts into One</DialogTitle>
        </DialogHeader>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Select which file should be the <strong>Primary</strong> receipt. The primary file's receipt code ({primaryItem.receipt_code}) will be kept. Other items will be archived.
        </p>

        {/* Warn about unready items */}
        {!canMerge && (
          <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-[10px] text-sm"
            style={{ backgroundColor: "rgba(255,181,71,0.1)", border: "1px solid rgba(255,181,71,0.25)", color: "#FFB547" }}>
            <Loader2 className="h-4 w-4 mt-0.5 flex-shrink-0 animate-spin" />
            <span>
              {unreadyItems.length === 1
                ? "1 receipt is still processing. Please wait for it to finish before merging."
                : `${unreadyItems.length} receipts are still processing. Please wait for them to finish before merging.`}
            </span>
          </div>
        )}

        <FilePicker items={items} primaryId={primaryId} onSetPrimary={setPrimaryId} />
        <div className="flex gap-3 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleMerge} disabled={merging || !canMerge} className="flex-1">
            {merging
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Merging…</>
              : <><CheckCircle2 className="h-4 w-4 mr-2" /> Merge {items.length} receipts</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}