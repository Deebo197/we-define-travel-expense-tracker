import { useRef, useState } from "react";
import { Upload, Camera, Image } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACCEPTED_TYPES = "image/jpeg,image/jpg,image/png,image/webp,image/heic,application/pdf";
const ACCEPTED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf"];

export default function InboxDropZone({ onFiles, disabled }) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => isAccepted(f));
    if (files.length) onFiles(files);
  };

  const isAccepted = (file) => {
    if (!file) return false;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    return ACCEPTED_EXT.includes(ext) || ACCEPTED_TYPES.split(",").includes(file.type);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []).filter(isAccepted);
    if (files.length) onFiles(files);
    e.target.value = "";
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className="rounded-[20px] p-8 flex flex-col items-center gap-4 text-center transition-all duration-200 cursor-pointer"
      style={{
        border: `2px dashed ${dragging ? "#7F5BFF" : "rgba(127,91,255,0.35)"}`,
        backgroundColor: dragging ? "rgba(127,91,255,0.08)" : "var(--bg-surface-2)",
      }}
      onClick={() => !disabled && fileInputRef.current?.click()}
    >
      <div
        className="w-16 h-16 rounded-[20px] flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, rgba(127,91,255,0.2), rgba(127,91,255,0.08))" }}
      >
        <Upload className="h-8 w-8" style={{ color: "#7F5BFF" }} strokeWidth={1.5} />
      </div>
      <div>
        <p className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
          {dragging ? "Drop receipts here" : "Drag & drop receipts"}
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
          PDF, JPG, PNG, WebP, HEIC · Multiple files supported
        </p>
      </div>

      <div className="flex gap-3 mt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          disabled={disabled}
        >
          <Image className="h-4 w-4" />
          Browse Files
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
          disabled={disabled}
        >
          <Camera className="h-4 w-4" />
          Take Photo
        </Button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}