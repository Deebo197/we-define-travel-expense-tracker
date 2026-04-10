import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Crop, Check } from "lucide-react";

function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0,
        pixelCrop.width, pixelCrop.height
      );
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    };
  });
}

export default function ImageCropper({ imageSrc, onCropDone, onSkip }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
    const file = new File([blob], "receipt_cropped.jpg", { type: "image/jpeg" });
    onCropDone(file);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-center">Crop your receipt</p>
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
        <Button type="button" className="flex-1 gap-1.5" onClick={handleConfirm}>
          <Check className="h-4 w-4" /> Use cropped image
        </Button>
      </div>
    </div>
  );
}