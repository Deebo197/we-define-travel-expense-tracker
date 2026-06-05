import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedPage from "@/components/AnimatedPage";
import InboxDropZone from "@/components/InboxDropZone";
import InboxItemCard from "@/components/InboxItemCard";
import InboxReviewDialog from "@/components/InboxReviewDialog";
import InboxMergeDialog from "@/components/InboxMergeDialog";
import { Button } from "@/components/ui/button";
import { Inbox, CheckCircle2, AlertTriangle, Clock, Loader2, Layers, X } from "lucide-react";
import { toast } from "sonner";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs Review" },
  { key: "processing", label: "Processing" },
  { key: "confirmed", label: "Confirmed" },
  { key: "failed", label: "Failed" },
];

export default function ReceiptInbox() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]); // { file, status, progress }
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewItem, setReviewItem] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMerge, setShowMerge] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });
  const isAdmin = user?.role === "admin";

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["receiptInboxItems", user?.email, isAdmin],
    queryFn: () => {
      if (isAdmin) return base44.entities.ReceiptInboxItem.list("-created_date", 200);
      return base44.entities.ReceiptInboxItem.filter({ owner_email: user.email }, "-created_date", 200);
    },
    enabled: !!user,
    refetchInterval: 8000, // Poll every 8s to catch processing → needs_review transitions
  });

  const needsReviewCount = items.filter(i => i.status === "needs_review").length;
  const processingCount = items.filter(i => i.status === "processing" || i.status === "inbox").length;
  const confirmedCount = items.filter(i => i.status === "confirmed").length;
  const failedCount = items.filter(i => i.status === "failed").length;

  const filteredItems = statusFilter === "all"
    ? items
    : items.filter(i => {
        if (statusFilter === "processing") return i.status === "processing" || i.status === "inbox";
        return i.status === statusFilter;
      });

  const handleFiles = useCallback(async (files) => {
    if (!user) return;
    setUploading(true);

    // Initialize queue display
    const queueEntries = files.map(f => ({ name: f.name, status: "uploading" }));
    setUploadQueue(queueEntries);

    // Process files sequentially to avoid race conditions in receipt code generation
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadQueue(q => q.map((e, idx) => idx === i ? { ...e, status: "uploading" } : e));

      try {
        // 1. Upload file
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // 2. Generate unique receipt code (server-side)
        const codeRes = await base44.functions.invoke("generateReceiptCode", {
          date: new Date().toISOString().split("T")[0],
        });
        const receipt_code = codeRes.data.receipt_code;

        // 3. Create ReceiptInboxItem immediately
        const inboxItem = await base44.entities.ReceiptInboxItem.create({
          receipt_code,
          owner_email: user.email,
          owner_name: user.full_name || "",
          status: "inbox",
          source: "bulk_upload",
          file_url,
          original_filename: file.name,
          mime_type: file.type || "",
        });

        setUploadQueue(q => q.map((e, idx) => idx === i ? { ...e, status: "processing", code: receipt_code } : e));

        // 4. Trigger OCR + Drive upload async (fire and forget)
        base44.functions.invoke("processInboxReceipt", { inbox_item_id: inboxItem.id })
          .then(() => setUploadQueue(q => q.map((e, idx) => idx === i ? { ...e, status: "done" } : e)))
          .catch(err => {
            console.error("OCR trigger failed:", err);
            setUploadQueue(q => q.map((e, idx) => idx === i ? { ...e, status: "error" } : e));
          });

      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        toast.error(`Failed to upload ${file.name}`);
        setUploadQueue(q => q.map((e, idx) => idx === i ? { ...e, status: "error" } : e));
      }
    }

    // Refresh list after all uploads
    await queryClient.invalidateQueries({ queryKey: ["receiptInboxItems"] });
    setUploading(false);

    // Clear queue after a delay
    setTimeout(() => setUploadQueue([]), 4000);
  }, [user, queryClient]);

  const handleConfirmed = () => {
    queryClient.invalidateQueries({ queryKey: ["receiptInboxItems"] });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const selectedItems = items.filter(i => selectedIds.has(i.id));
  const canMerge = selectedItems.length >= 2 && selectedItems.every(i => i.status !== "confirmed" && i.status !== "merged");

  return (
    <AnimatedPage>
      <div className="space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-[28px] font-semibold"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
            >
              Receipt Inbox
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              Upload receipts in bulk, then review and convert to expenses
            </p>
          </div>

          {/* Stat pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {needsReviewCount > 0 && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "rgba(255,181,71,0.12)", color: "#FFB547", border: "1px solid rgba(255,181,71,0.25)" }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {needsReviewCount} to review
              </span>
            )}
            {processingCount > 0 && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "rgba(127,91,255,0.12)", color: "#7F5BFF", border: "1px solid rgba(127,91,255,0.25)" }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {processingCount} processing
              </span>
            )}
            {failedCount > 0 && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "rgba(255,92,122,0.12)", color: "#FF5C7A", border: "1px solid rgba(255,92,122,0.25)" }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {failedCount} failed
              </span>
            )}
            {confirmedCount > 0 && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "rgba(61,220,151,0.1)", color: "#3DDC97", border: "1px solid rgba(61,220,151,0.2)" }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {confirmedCount} confirmed
              </span>
            )}
          </div>
        </div>

        {/* Drop zone */}
        <InboxDropZone onFiles={handleFiles} disabled={uploading} />

        {/* Upload queue progress */}
        <AnimatePresence>
          {uploadQueue.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-[16px] p-4 space-y-2"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-soft)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                Uploading {uploadQueue.length} file{uploadQueue.length !== 1 ? "s" : ""}…
              </p>
              {uploadQueue.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  {entry.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" style={{ color: "#7F5BFF" }} />}
                  {entry.status === "processing" && <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" style={{ color: "#FFB547" }} />}
                  {entry.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#3DDC97" }} />}
                  {entry.status === "error" && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#FF5C7A" }} />}
                  <span className="text-sm truncate flex-1" style={{ color: "var(--text-secondary)" }}>{entry.name}</span>
                  {entry.code && <span className="text-xs font-mono flex-shrink-0" style={{ color: "#7F5BFF" }}>{entry.code}</span>}
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                    {entry.status === "uploading" ? "Uploading…"
                      : entry.status === "processing" ? "Reading…"
                      : entry.status === "error" ? "Failed"
                      : "Done"}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Merge / selection toolbar */}
        {selectMode ? (
          <div className="flex items-center gap-3 flex-wrap rounded-[14px] p-3"
            style={{ backgroundColor: "rgba(127,91,255,0.08)", border: "1px solid rgba(127,91,255,0.2)" }}>
            <span className="text-sm font-semibold flex-1" style={{ color: "#7F5BFF" }}>
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              onClick={() => setShowMerge(true)}
              disabled={!canMerge}
              className="gap-1.5"
            >
              <Layers className="h-4 w-4" />
              Merge into one receipt
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelectMode} className="gap-1.5">
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setSelectMode(true)} className="gap-1.5">
              <Layers className="h-4 w-4" /> Select to merge
            </Button>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-150"
                style={{
                  backgroundColor: statusFilter === f.key ? "#7F5BFF" : "var(--bg-surface-2)",
                  color: statusFilter === f.key ? "white" : "var(--text-secondary)",
                  border: statusFilter === f.key ? "1px solid transparent" : "1px solid var(--border-soft)",
                }}
              >
                {f.label}
                {f.key === "needs_review" && needsReviewCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                    {needsReviewCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Items grid */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-[16px] h-20 animate-pulse" style={{ backgroundColor: "var(--bg-surface)" }} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <div
              className="w-14 h-14 rounded-[18px] flex items-center justify-center"
              style={{ backgroundColor: "rgba(127,91,255,0.08)", border: "1px solid rgba(127,91,255,0.15)" }}
            >
              <Inbox className="h-7 w-7" style={{ color: "#7F5BFF" }} strokeWidth={1.5} />
            </div>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {statusFilter === "all" ? "No receipts yet" : `No ${statusFilter.replace("_", " ")} receipts`}
            </p>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              {statusFilter === "all" ? "Drag and drop receipts above to get started" : "Try a different filter"}
            </p>
          </div>
        ) : (
          <motion.div
            className="grid gap-3 sm:grid-cols-2"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.05 } }, hidden: {} }}
          >
            {filteredItems.map(item => (
              <motion.div
                key={item.id}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.28 } } }}
              >
                <InboxItemCard
                  item={item}
                  onClick={setReviewItem}
                  selectable={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Review dialog */}
        <InboxReviewDialog
          item={reviewItem}
          open={!!reviewItem}
          onClose={() => setReviewItem(null)}
          onConfirmed={handleConfirmed}
        />

        {/* Merge dialog */}
        {showMerge && selectedItems.length >= 2 && (
          <InboxMergeDialog
            items={selectedItems}
            open={showMerge}
            onClose={() => setShowMerge(false)}
            onMerged={(primaryId) => {
              queryClient.invalidateQueries({ queryKey: ["receiptInboxItems"] });
              exitSelectMode();
            }}
          />
        )}
      </div>
    </AnimatedPage>
  );
}