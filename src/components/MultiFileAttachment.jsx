/**
 * MultiFileAttachment — Upload area supporting multiple receipt files.
 * Displays chips for each uploaded file, allows marking one as Primary,
 * removing files, and triggers OCR on the primary file.
 */
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import {
  Camera, Upload, Loader2, FileText, X, Star, StarOff, Eye, RefreshCw, Plus
} from "lucide-react";
import ImageCropper from "./ImageCropper";

function FileChip({ file, index, onRemove, onMakePrimary, onView, onRerunOCR, isOCRRunning }) {
  const isPdf = file.mime_type === "application/pdf" || file.original_filename?.toLowerCase().endsWith(".pdf");
  const isPrimary = file.role === "primary";

  return (
    <div
      className="flex items-center gap-2 rounded-[12px] p-2.5 transition-all"
      style={{
        backgroundColor: isPrimary ? "rgba(127,91,255,0.08)" : "var(--bg-surface-2)",
        border: isPrimary ? "1px solid rgba(127,91,255,0.3)" : "1px solid var(--border-soft)",
      }}
    >
      {/* Thumbnail */}
      <div
        className="w-10 h-10 rounded-[8px] flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: "var(--bg-elevated)" }}
      >
        {isPdf ? (
          <FileText className="h-5 w-5" style={{ color: "#FF5C7A" }} strokeWidth={1.5} />
        ) : file.file_url ? (
          <img src={file.file_url} alt="receipt" className="w-full h-full object-cover" />
        ) : null}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {file.original_filename || `File ${index + 1}`}
        </p>
        <p className="text-[10px] font-semibold" style={{ color: isPrimary ? "#7F5BFF" : "var(--text-tertiary)" }}>
          {isPrimary ? "★ Primary" : "Supporting"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {file.file_url && (
          <button
            type="button"
            onClick={() => window.open(file.file_url, "_blank")}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            title="View file"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
        {!isPrimary && (
          <button
            type="button"
            onClick={() => onMakePrimary(index)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            title="Make primary (run OCR from this file)"
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        )}
        {isPrimary && onRerunOCR && (
          <button
            type="button"
            onClick={onRerunOCR}
            disabled={isOCRRunning}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#7F5BFF" }}
            title="Re-run OCR from this file"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isOCRRunning ? "animate-spin" : ""}`} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-tertiary)" }}
          title="Remove file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function MultiFileAttachment({ files, onChange, onOCRComplete }) {
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOCRRunning] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [pendingCropFile, setPendingCropFile] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const runOCR = async (fileUrl) => {
    if (!fileUrl) return;
    setOCRRunning(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract from this receipt: date (YYYY-MM-DD), merchant/vendor description, and total amount in GBP. Return JSON.`,
        file_urls: [fileUrl],
        response_json_schema: {
          type: "object",
          properties: {
            date: { type: "string" },
            description: { type: "string" },
            amount: { type: "number" },
          },
        },
      });
      if (onOCRComplete) onOCRComplete(result);
    } finally {
      setOCRRunning(false);
    }
  };

  const uploadAndAdd = async (file, role = "supporting") => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newFile = {
        file_url,
        original_filename: file.name,
        mime_type: file.type || "",
        role: files.length === 0 ? "primary" : role,
        sort_order: files.length,
        ocr_used: false,
      };

      // If this is the first file, auto-run OCR
      const isPrimary = files.length === 0;
      const updated = [...files, newFile];
      onChange(updated);

      if (isPrimary) {
        // run OCR on primary
        setUploading(false);
        await runOCR(file_url);
        // Mark ocr_used
        onChange(updated.map((f, i) => i === updated.length - 1 ? { ...f, ocr_used: true } : f));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (file) => {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      setPendingCropFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setCropSrc(e.target.result);
      reader.readAsDataURL(file);
    } else {
      uploadAndAdd(file);
    }
  };

  const handleCropDone = (croppedFile) => {
    setCropSrc(null);
    setPendingCropFile(null);
    uploadAndAdd(croppedFile);
  };

  const handleSkipCrop = () => {
    fetch(cropSrc)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], pendingCropFile?.name || "receipt.jpg", { type: "image/jpeg" });
        setCropSrc(null);
        setPendingCropFile(null);
        uploadAndAdd(file);
      });
  };

  const handleMakePrimary = async (index) => {
    const updated = files.map((f, i) => ({
      ...f,
      role: i === index ? "primary" : "supporting",
    }));
    onChange(updated);
    // Offer re-run OCR from new primary
    const newPrimary = updated[index];
    if (newPrimary?.file_url) {
      await runOCR(newPrimary.file_url);
      onChange(updated.map((f, i) => i === index ? { ...f, ocr_used: true } : f));
    }
  };

  const handleRemove = (index) => {
    const updated = files.filter((_, i) => i !== index);
    // If we removed the primary, promote first remaining to primary
    if (files[index]?.role === "primary" && updated.length > 0) {
      updated[0] = { ...updated[0], role: "primary" };
    }
    onChange(updated.map((f, i) => ({ ...f, sort_order: i })));
  };

  const handleRerunOCR = async () => {
    const primary = files.find(f => f.role === "primary");
    if (primary?.file_url) {
      await runOCR(primary.file_url);
    }
  };

  const primaryFile = files.find(f => f.role === "primary");

  if (cropSrc) {
    return (
      <ImageCropper
        imageSrc={cropSrc}
        onCropDone={handleCropDone}
        onSkip={handleSkipCrop}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* File chips */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <FileChip
              key={i}
              file={file}
              index={i}
              onRemove={handleRemove}
              onMakePrimary={handleMakePrimary}
              onView={() => window.open(file.file_url, "_blank")}
              onRerunOCR={file.role === "primary" ? handleRerunOCR : null}
              isOCRRunning={ocrRunning}
            />
          ))}
        </div>
      )}

      {/* Upload zone */}
      {files.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-xl p-6 text-center"
          style={{ borderColor: "var(--border-strong)", backgroundColor: "rgba(127,91,255,0.03)" }}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "rgba(127,91,255,0.1)" }}
            >
              <Camera className="h-6 w-6" style={{ color: "#7F5BFF" }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Capture or upload receipt
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                Take a photo or upload an image/PDF. First file becomes Primary.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => cameraInputRef.current?.click()} className="gap-1.5" disabled={uploading || ocrRunning}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Camera
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5" disabled={uploading || ocrRunning}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || ocrRunning}
          className="w-full flex items-center justify-center gap-2 rounded-[12px] py-2.5 text-sm font-medium transition-all"
          style={{
            backgroundColor: "var(--bg-surface-2)",
            border: "1px dashed var(--border-strong)",
            color: "var(--text-tertiary)",
          }}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#7F5BFF" }} /> : <Plus className="h-4 w-4" />}
          {uploading ? "Uploading…" : ocrRunning ? "Reading receipt…" : "Add supporting file"}
        </button>
      )}

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => handleFileInput(e.target.files?.[0])} />
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={(e) => handleFileInput(e.target.files?.[0])} />
    </div>
  );
}