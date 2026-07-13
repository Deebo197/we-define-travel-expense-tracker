import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Loader2, FileText, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ImageCropper from "./ImageCropper";

export default function ReceiptCapture({ onFileUploaded, onOCRComplete, receiptUrl }) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState(receiptUrl || null);
  const [cropSrc, setCropSrc] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Prevent the browser from opening files dropped anywhere on the page
  useEffect(() => {
    const preventDefault = (e) => e.preventDefault();
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  const processFile = async (file) => {
    if (!file) return;
    setUploading(true);

    // Show preview
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setPreview("pdf");
    }

    // Upload file
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onFileUploaded(file_url);
    setUploading(false);

    // OCR
    setProcessing(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Extract the following information from this receipt image. Look for the date (in YYYY-MM-DD format), the merchant/vendor name or description of what was purchased, and the total amount paid in GBP (£). If you can't find a field, leave it as an empty string — do NOT guess or make up a date. Return JSON.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          description: { type: "string", description: "Merchant name or description" },
          amount: { type: "number", description: "Total amount in GBP" },
        },
      },
    });
    onOCRComplete(result);
    setProcessing(false);
  };

  const handleFile = (file) => {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setCropSrc(e.target.result);
      reader.readAsDataURL(file);
    } else {
      processFile(file);
    }
  };

  const handleCropDone = (croppedFile) => {
    setCropSrc(null);
    processFile(croppedFile);
  };

  const handleSkipCrop = () => {
    // Re-read original file from cropSrc data URL
    fetch(cropSrc)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
        setCropSrc(null);
        processFile(file);
      });
  };

  const clearReceipt = () => {
    setPreview(null);
    setCropSrc(null);
    onFileUploaded("");
  };

  return (
    <div className="space-y-3">
      {cropSrc ? (
        <ImageCropper imageSrc={cropSrc} onCropDone={handleCropDone} onSkip={handleSkipCrop} />
      ) : !preview ? (
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center bg-muted/30 transition-colors ${dragging ? "border-primary bg-primary/10" : "border-border"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Capture or upload receipt</p>
              <p className="text-xs text-muted-foreground mt-0.5">Drag &amp; drop, take a photo, or upload an image/PDF</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                className="gap-1.5"
              >
                <Camera className="h-4 w-4" /> Camera
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" /> Upload
              </Button>
            </div>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <div className="relative rounded-xl border border-border overflow-hidden bg-muted/30">
          {(uploading || processing) && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {uploading ? "Uploading..." : "Reading receipt..."}
              </div>
            </div>
          )}
          {preview === "pdf" ? (
            <div className="p-8 flex flex-col items-center gap-2">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">PDF uploaded</span>
            </div>
          ) : (
            <img src={preview} alt="Receipt" className="w-full max-h-48 object-contain" />
          )}
          <button
            type="button"
            onClick={clearReceipt}
            className="absolute top-2 right-2 p-1 bg-background/80 rounded-full hover:bg-background shadow-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}