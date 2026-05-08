/**
 * InboxFileViewer — Shows all files attached to an inbox item or expense.
 * Allows changing Primary, viewing, and re-running OCR.
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Star, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

function FileCard({ file, index, isPrimary, onMakePrimary, isOCRRunning }) {
  const isPdf = file.mime_type === "application/pdf" || file.original_filename?.toLowerCase().endsWith(".pdf");

  return (
    <div
      className="rounded-[12px] overflow-hidden flex flex-col"
      style={{
        border: isPrimary ? "2px solid rgba(127,91,255,0.5)" : "1px solid var(--border-soft)",
        backgroundColor: "var(--bg-surface-2)",
      }}
    >
      {/* Preview */}
      <div className="h-28 flex items-center justify-center overflow-hidden" style={{ backgroundColor: "var(--bg-elevated)" }}>
        {isPdf ? (
          <div className="text-center">
            <FileText className="h-8 w-8 mx-auto mb-1" style={{ color: "#FF5C7A" }} strokeWidth={1.5} />
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>PDF</p>
          </div>
        ) : (file.file_url || file.public_receipt_url) ? (
          <img
            src={file.file_url || file.public_receipt_url}
            alt="receipt"
            className="w-full h-full object-cover"
          />
        ) : (
          <FileText className="h-8 w-8" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
        )}
      </div>

      {/* Info + actions */}
      <div className="p-2 space-y-1.5">
        {isPrimary && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: "rgba(127,91,255,0.15)", color: "#7F5BFF" }}>
            <Star className="h-2.5 w-2.5" fill="currentColor" /> Primary
          </span>
        )}
        <p className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
          {file.original_filename || `File ${index + 1}`}
        </p>
        <div className="flex gap-1">
          {(file.file_url || file.public_receipt_url) && (
            <button
              type="button"
              onClick={() => window.open(file.public_receipt_url || file.file_url, "_blank")}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded-[8px] text-[10px] font-medium transition-colors"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
            >
              <Eye className="h-3 w-3" /> View
            </button>
          )}
          {!isPrimary && (
            <button
              type="button"
              onClick={() => onMakePrimary(index)}
              disabled={isOCRRunning}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded-[8px] text-[10px] font-medium transition-colors"
              style={{ backgroundColor: "rgba(127,91,255,0.1)", color: "#7F5BFF" }}
              title="Make primary & re-run OCR"
            >
              {isOCRRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
              Primary
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InboxFileViewer({ item, onFilesChanged, onOCRComplete }) {
  const [ocrRunning, setOCRRunning] = useState(false);

  // Build files list from item — prefer receipt_files, fall back to single file
  const getFiles = () => {
    if (item.receipt_files?.length > 0) return item.receipt_files;
    if (item.file_url) {
      return [{
        file_url: item.file_url,
        public_receipt_url: item.public_receipt_url,
        drive_file_id: item.drive_file_id,
        original_filename: item.original_filename,
        mime_type: item.mime_type,
        role: "primary",
        sort_order: 0,
        ocr_used: true,
      }];
    }
    return [];
  };

  const files = getFiles();
  if (files.length <= 1) return null; // Only show this panel when multi-file

  const handleMakePrimary = async (index) => {
    const newFiles = files.map((f, i) => ({
      ...f,
      role: i === index ? "primary" : "supporting",
    }));

    // Update in DB
    await base44.entities.ReceiptInboxItem.update(item.id, {
      receipt_files: newFiles,
      primary_receipt_file_url: newFiles[index].file_url,
    });
    onFilesChanged(newFiles);

    // Re-run OCR from new primary
    const newPrimary = newFiles[index];
    const ocrUrl = newPrimary.file_url || newPrimary.public_receipt_url;
    if (ocrUrl && onOCRComplete) {
      setOCRRunning(true);
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract from this receipt: date (YYYY-MM-DD), merchant/vendor description, and total amount. Return JSON.`,
          file_urls: [ocrUrl],
          response_json_schema: {
            type: "object",
            properties: {
              date: { type: "string" },
              supplier: { type: "string" },
              description: { type: "string" },
              amount: { type: "number" },
              vat: { type: "boolean" },
              currency: { type: "string" },
            },
          },
        });
        onOCRComplete(result);
        toast.success("OCR updated from new primary file");
      } catch (err) {
        toast.error("OCR failed: " + err.message);
      } finally {
        setOCRRunning(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        Attached Files ({files.length})
      </p>
      <div className="grid grid-cols-2 gap-2">
        {files.map((file, i) => (
          <FileCard
            key={i}
            file={file}
            index={i}
            isPrimary={file.role === "primary"}
            onMakePrimary={handleMakePrimary}
            isOCRRunning={ocrRunning}
          />
        ))}
      </div>
    </div>
  );
}