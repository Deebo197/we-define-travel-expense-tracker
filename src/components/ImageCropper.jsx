import { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Check, SlidersHorizontal, Loader2 } from "lucide-react";

// Auto-detect receipt bounds by sampling background colour from corners
function detectReceiptBounds(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      const px = (x, y) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };

      // Sample the four corners to estimate background colour
      const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
      const bgR = corners.reduce((s, c) => s + c[0], 0) / 4;
      const bgG = corners.reduce((s, c) => s + c[1], 0) / 4;
      const bgB = corners.reduce((s, c) => s + c[2], 0) / 4;

      const THRESHOLD = 40; // colour distance from background to count as "foreground"
      const isFg = (x, y) => {
        const [r, g, b] = px(x, y);
        return Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) > THRESHOLD;
      };

      // Scan from each edge inward
      let top = 0, bottom = h - 1, left = 0, right = w - 1;

      outer: for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) if (isFg(x, y)) { top = y; break outer; }
      }
      outer: for (let y = h - 1; y >= 0; y--) {
        for (let x = 0; x < w; x++) if (isFg(x, y)) { bottom = y; break outer; }
      }
      outer: for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) if (isFg(x, y)) { left = x; break outer; }
      }
      outer: for (let x = w - 1; x >= 0; x--) {
        for (let y = 0; y < h; y++) if (isFg(x, y)) { right = x; break outer; }
      }

      // Add a small padding
      const pad = Math.round(Math.min(w, h) * 0.01);
      top    = Math.max(0, top - pad);
      bottom = Math.min(h - 1, bottom + pad);
      left   = Math.max(0, left - pad);
      right  = Math.min(w - 1, right + pad);

      // Return bounds in original image pixel space
      resolve({
        x: Math.round(left / scale),
        y: Math.round(top / scale),
        width: Math.round((right - left) / scale),
        height: Math.round((bottom - top) / scale),
      });
    };
    img.src = imageSrc;
  });
}

function cropImageToBlob(imageSrc, bounds) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      canvas.getContext("2d").drawImage(
        img,
        bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, bounds.width, bounds.height
      );
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    };
    img.src = imageSrc;
  });
}

function getCroppedImg(imageSrc, pixelCrop) {
  return cropImageToBlob(imageSrc, pixelCrop);
}

export default function ImageCropper({ imageSrc, onCropDone, onSkip }) {
  const [mode, setMode] = useState("detecting"); // detecting | auto | manual
  const [autoBounds, setAutoBounds] = useState(null);
  const [autoPreview, setAutoPreview] = useState(null);

  // Manual crop state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    detectReceiptBounds(imageSrc).then(async (bounds) => {
      setAutoBounds(bounds);
      // Generate a preview of the auto-cropped area
      const blob = await cropImageToBlob(imageSrc, bounds);
      setAutoPreview(URL.createObjectURL(blob));
      setMode("auto");
    });
  }, [imageSrc]);

  const handleConfirmAuto = async () => {
    const blob = await cropImageToBlob(imageSrc, autoBounds);
    const file = new File([blob], "receipt_cropped.jpg", { type: "image/jpeg" });
    onCropDone(file);
  };

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirmManual = async () => {
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
    const file = new File([blob], "receipt_cropped.jpg", { type: "image/jpeg" });
    onCropDone(file);
  };

  if (mode === "detecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Detecting receipt edges…</p>
      </div>
    );
  }

  if (mode === "auto") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-center">Receipt auto-detected</p>
        <div className="rounded-xl border border-border overflow-hidden bg-muted/30 flex items-center justify-center" style={{ maxHeight: 360 }}>
          <img src={autoPreview} alt="Auto-cropped receipt" className="max-h-80 w-auto object-contain" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={() => setMode("manual")}>
            <SlidersHorizontal className="h-4 w-4" /> Adjust manually
          </Button>
          <Button type="button" className="flex-1 gap-1.5" onClick={handleConfirmAuto}>
            <Check className="h-4 w-4" /> Looks good
          </Button>
        </div>
        <button type="button" className="w-full text-xs text-muted-foreground hover:underline" onClick={onSkip}>
          Skip crop
        </button>
      </div>
    );
  }

  // Manual mode
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-center">Adjust crop manually</p>
      <div className="relative w-full" style={{ height: 320 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <input
        type="range"
        min={1}
        max={3}
        step={0.1}
        value={zoom}
        onChange={(e) => setZoom(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onSkip}>
          Skip crop
        </Button>
        <Button type="button" className="flex-1 gap-1.5" onClick={handleConfirmManual}>
          <Check className="h-4 w-4" /> Use cropped image
        </Button>
      </div>
    </div>
  );
}