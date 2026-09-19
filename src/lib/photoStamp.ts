/** Permanently burn compliance evidence into a photo before upload. */
export async function stampPhoto(
  file: File | Blob,
  jobRef?: string,
  gps?: { lat: number; lng: number } | null,
): Promise<Blob> {
  const image = await decodePhoto(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Photo stamping is not supported on this device.");

    // JPEG has no transparency, so use a white base for PNG/WebP images.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    const now = new Date();
    const dateLine = `${now.toLocaleDateString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
    })} ${now.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    })}`;
    const lines = [dateLine];
    if (jobRef?.trim()) lines.push(jobRef.trim());
    if (gps) lines.push(`${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`);

    const fontSize = Math.max(14, Math.min(40, Math.round(image.height * 0.02)));
    const padding = Math.round(fontSize * 0.6);
    const lineHeight = Math.round(fontSize * 1.4);
    ctx.font = `bold ${fontSize}px "SF Mono", "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";

    const maxTextWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const bgWidth = Math.min(canvas.width, maxTextWidth + padding * 2);
    const bgHeight = lines.length * lineHeight + padding;
    const bgX = Math.max(0, canvas.width - bgWidth - padding);
    const bgY = Math.max(0, canvas.height - bgHeight - padding);
    const radius = Math.min(Math.round(fontSize * 0.3), bgWidth / 2, bgHeight / 2);

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.moveTo(bgX + radius, bgY);
    ctx.lineTo(bgX + bgWidth - radius, bgY);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
    ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
    ctx.lineTo(bgX + radius, bgY + bgHeight);
    ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
    ctx.lineTo(bgX, bgY + radius);
    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    lines.forEach((line, index) => {
      const y = bgY + padding + (index + 1) * lineHeight - Math.round(lineHeight * 0.15);
      ctx.fillText(line, canvas.width - padding * 2, y);
    });

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Could not create the stamped photo.")),
        "image/jpeg",
        0.92,
      );
    });
  } finally {
    image.close?.();
  }
}

type DecodedPhoto = CanvasImageSource & { width: number; height: number; close?: () => void };

async function decodePhoto(file: File | Blob): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  return await new Promise<DecodedPhoto>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image as DecodedPhoto);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this photo."));
    };
    image.src = url;
  });
}

/** Get GPS silently; denial, unavailability, or timeout never blocks a photo. */
export function getGpsPosition(timeoutMs = 5000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

export function jpegFileName(name: string): string {
  return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, ".jpg") : `${name}.jpg`;
}