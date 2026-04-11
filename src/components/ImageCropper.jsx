import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2, RefreshCw } from "lucide-react";

// ─── Perspective warp ────────────────────────────────────────────────────────
// Maps a quad (src corners TL,TR,BR,BL) onto a rectangle using inverse projection.
function perspectiveWarp(srcDataUrl, corners) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const [tl, tr, br, bl] = corners; // {x, y} in image pixels

      // Output size = average of opposite side lengths
      const w = Math.round((Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2);
      const h = Math.round((Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2);

      const dst = document.createElement("canvas");
      dst.width = w; dst.height = h;
      const ctx = dst.getContext("2d");

      // Source image on a canvas for pixel access
      const src = document.createElement("canvas");
      src.width = img.width; src.height = img.height;
      src.getContext("2d").drawImage(img, 0, 0);
      const srcPx = src.getContext("2d").getImageData(0, 0, img.width, img.height);
      const dstPx = ctx.createImageData(w, h);

      // Inverse bilinear sampling: for each dst pixel, find src position
      for (let dy = 0; dy < h; dy++) {
        const ty = dy / h;
        for (let dx = 0; dx < w; dx++) {
          const tx = dx / w;

          // Bilinear interpolation of source quad
          const sx = (1 - ty) * ((1 - tx) * tl.x + tx * tr.x) + ty * ((1 - tx) * bl.x + tx * br.x);
          const sy = (1 - ty) * ((1 - tx) * tl.y + tx * tr.y) + ty * ((1 - tx) * bl.y + tx * br.y);

          const ix = Math.round(sx), iy = Math.round(sy);
          if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) continue;

          const si = (iy * img.width + ix) * 4;
          const di = (dy * w + dx) * 4;
          dstPx.data[di]     = srcPx.data[si];
          dstPx.data[di + 1] = srcPx.data[si + 1];
          dstPx.data[di + 2] = srcPx.data[si + 2];
          dstPx.data[di + 3] = srcPx.data[si + 3];
        }
      }
      ctx.putImageData(dstPx, 0, 0);
      dst.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    };
    img.src = srcDataUrl;
  });
}

// ─── Edge detection via Sobel ────────────────────────────────────────────────
function detectCorners(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      // Grayscale
      const gray = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        gray[i] = Math.round(0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]);
      }

      // Gaussian blur 3x3 to reduce noise
      const blurred = new Uint8Array(w * h);
      const kernel = [1,2,1,2,4,2,1,2,1];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let sum = 0;
          let k = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              sum += gray[(y+ky)*w+(x+kx)] * kernel[k++];
            }
          }
          blurred[y*w+x] = sum / 16;
        }
      }

      // Sobel edge magnitude
      const edges = new Float32Array(w * h);
      let maxEdge = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const gx =
            -blurred[(y-1)*w+(x-1)] + blurred[(y-1)*w+(x+1)]
            -2*blurred[y*w+(x-1)]   + 2*blurred[y*w+(x+1)]
            -blurred[(y+1)*w+(x-1)] + blurred[(y+1)*w+(x+1)];
          const gy =
            -blurred[(y-1)*w+(x-1)] - 2*blurred[(y-1)*w+x] - blurred[(y-1)*w+(x+1)]
            +blurred[(y+1)*w+(x-1)] + 2*blurred[(y+1)*w+x] + blurred[(y+1)*w+(x+1)];
          const mag = Math.sqrt(gx*gx + gy*gy);
          edges[y*w+x] = mag;
          if (mag > maxEdge) maxEdge = mag;
        }
      }

      // ---- Luminance-based receipt corner detection ----
      // Find all bright+edge pixels, then pick the 4 rotated-rectangle corners
      // using diagonal extremes: min/max of (x+y) and (x-y).
      // This correctly handles tilted/skewed receipts of any shape.

      const lums = Array.from(gray).sort((a, b) => a - b);
      const medianLum = lums[Math.floor(lums.length * 0.5)];
      const lumThreshold = Math.min(medianLum + 30, 210);
      const edgeThreshold = maxEdge * 0.18;

      // Border margin to ignore camera vignetting / edge noise
      const mx = Math.round(w * 0.04), my = Math.round(h * 0.04);

      // Collect candidate pixels: bright AND strong edge, away from image border
      let tlBest = null, trBest = null, brBest = null, blBest = null;
      let tlScore = Infinity, trScore = -Infinity, brScore = -Infinity, blScore = Infinity;

      for (let y = my; y < h - my; y++) {
        for (let x = mx; x < w - mx; x++) {
          if (edges[y*w+x] < edgeThreshold) continue;
          if (gray[y*w+x] < lumThreshold) continue;
          // TL corner: minimise x+y
          if (x + y < tlScore) { tlScore = x + y; tlBest = {x, y}; }
          // BR corner: maximise x+y
          if (x + y > brScore) { brScore = x + y; brBest = {x, y}; }
          // TR corner: maximise x-y
          if (x - y > trScore) { trScore = x - y; trBest = {x, y}; }
          // BL corner: minimise x-y
          if (x - y < blScore) { blScore = x - y; blBest = {x, y}; }
        }
      }

      // Fallback: if no candidates found, use 15% insets
      const fallback = [
        tlBest || { x: Math.round(w*0.15), y: Math.round(h*0.15) },
        trBest || { x: Math.round(w*0.85), y: Math.round(h*0.15) },
        brBest || { x: Math.round(w*0.85), y: Math.round(h*0.85) },
        blBest || { x: Math.round(w*0.15), y: Math.round(h*0.85) },
      ];

      const s = 1 / scale;
      resolve(fallback.map(p => ({ x: Math.round(p.x * s), y: Math.round(p.y * s) })));
    };
    img.src = imageSrc;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
const CORNER_LABELS = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];
const CORNER_COLORS = ["#3b82f6","#3b82f6","#3b82f6","#3b82f6"];

export default function ImageCropper({ imageSrc, onCropDone, onSkip }) {
  const [status, setStatus] = useState("detecting"); // detecting | ready | confirming
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 }); // natural image size
  const [displaySize, setDisplaySize] = useState({ w: 1, h: 1 }); // rendered size
  const [corners, setCorners] = useState(null); // 4 points in IMAGE pixels
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null); // { index, startX, startY, origCorner }

  // Load image natural size, detect edges
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.width, h: img.height });
      detectCorners(imageSrc).then((pts) => {
        setCorners(pts);
        setStatus("ready");
      });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Track rendered image display size after layout
  const updateDisplaySize = useCallback(() => {
    if (imgRef.current) {
      setDisplaySize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
    }
  }, []);

  // Scale helpers: image pixels ↔ display pixels
  const toDisplay = (pt) => ({
    x: (pt.x / imgSize.w) * displaySize.w,
    y: (pt.y / imgSize.h) * displaySize.h,
  });
  const toImage = (pt) => ({
    x: Math.round((pt.x / displaySize.w) * imgSize.w),
    y: Math.round((pt.y / displaySize.h) * imgSize.h),
  });

  // Drag handling
  const startDrag = (e, index) => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = { index, clientX, clientY, orig: { ...corners[index] } };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const { index, clientX: ox, clientY: oy, orig } = dragRef.current;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - ox, dy = clientY - oy;
      const scaleX = imgSize.w / displaySize.w, scaleY = imgSize.h / displaySize.h;
      setCorners(prev => {
        const next = [...prev];
        next[index] = {
          x: Math.max(0, Math.min(imgSize.w, orig.x + dx * scaleX)),
          y: Math.max(0, Math.min(imgSize.h, orig.y + dy * scaleY)),
        };
        return next;
      });
    };
    const onEnd = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [imgSize, displaySize]);

  const handleConfirm = async () => {
    setStatus("confirming");
    const blob = await perspectiveWarp(imageSrc, corners);
    const file = new File([blob], "receipt_cropped.jpg", { type: "image/jpeg" });
    onCropDone(file);
  };

  const handleReset = () => {
    setStatus("detecting");
    detectCorners(imageSrc).then((pts) => { setCorners(pts); setStatus("ready"); });
  };

  if (status === "detecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Detecting receipt edges…</p>
      </div>
    );
  }

  const dispCorners = corners ? corners.map(toDisplay) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Drag each corner to fit the receipt</p>
        <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Re-detect
        </button>
      </div>

      {/* Image + SVG overlay */}
      <div
        ref={containerRef}
        className="relative rounded-xl border border-border overflow-hidden bg-black select-none"
        style={{ touchAction: "none" }}
      >
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Receipt"
          className="w-full max-h-[60vh] object-contain block"
          onLoad={updateDisplaySize}
        />
        {status === "ready" && corners && (
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ top: 0, left: 0 }}
          >
            {/* Quad overlay */}
            <polygon
              points={dispCorners.map(p => `${p.x},${p.y}`).join(" ")}
              fill="rgba(59,130,246,0.15)"
              stroke="#3b82f6"
              strokeWidth="2"
            />
            {/* Edge lines */}
            {[0,1,2,3].map(i => {
              const a = dispCorners[i], b = dispCorners[(i+1)%4];
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 3" />;
            })}
            {/* Corner handles */}
            {dispCorners.map((pt, i) => (
              <g key={i} style={{ cursor: "grab" }}>
                <circle
                  cx={pt.x} cy={pt.y} r={18}
                  fill="transparent"
                  onMouseDown={(e) => startDrag(e, i)}
                  onTouchStart={(e) => startDrag(e, i)}
                />
                <circle
                  cx={pt.x} cy={pt.y} r={10}
                  fill="white"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  style={{ pointerEvents: "none" }}
                />
                <circle
                  cx={pt.x} cy={pt.y} r={4}
                  fill="#3b82f6"
                  style={{ pointerEvents: "none" }}
                />
              </g>
            ))}
          </svg>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Each corner can be moved independently — the receipt does not need to be rectangular.
      </p>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onSkip}>
          Skip crop
        </Button>
        <Button type="button" className="flex-1 gap-1.5" onClick={handleConfirm} disabled={status === "confirming"}>
          {status === "confirming" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Apply crop
        </Button>
      </div>
    </div>
  );
}