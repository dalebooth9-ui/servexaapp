export interface SignatureBoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  page_index?: number;
}

export interface ScanImageSource {
  file: File;
  preview: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InkComponent {
  pixelCount: number;
  rect: Rect;
  fillRatio: number;
  centerX: number;
  centerY: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load scan image"));
    img.src = src;
  });

const loadSourceImage = async (source: ScanImageSource) => {
  if (source.file.type === "application/pdf" && !source.preview) {
    throw new Error("PDF scans do not support signature cropping in-browser");
  }

  const fallbackUrl = !source.preview ? URL.createObjectURL(source.file) : null;
  const src = source.preview || fallbackUrl || "";
  try {
    return await loadImage(src);
  } finally {
    if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
  }
};

const normalizeBoundingBox = (bbox: SignatureBoundingBox): SignatureBoundingBox => {
  const coords = [bbox.x_min, bbox.y_min, bbox.x_max, bbox.y_max].map((value) => Number(value));
  if (coords.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid signature bounding box");
  }

  const scale = Math.max(...coords.map((value) => Math.abs(value))) <= 1.5 ? 100 : 1;

  return {
    x_min: clamp(Math.min(bbox.x_min, bbox.x_max) * scale, 0, 100),
    x_max: clamp(Math.max(bbox.x_min, bbox.x_max) * scale, 0, 100),
    y_min: clamp(Math.min(bbox.y_min, bbox.y_max) * scale, 0, 100),
    y_max: clamp(Math.max(bbox.y_min, bbox.y_max) * scale, 0, 100),
    page_index: bbox.page_index ?? 0,
  };
};

const rectFromPercentBox = (bbox: SignatureBoundingBox, imageWidth: number, imageHeight: number): Rect => {
  const x = Math.floor((bbox.x_min / 100) * imageWidth);
  const y = Math.floor((bbox.y_min / 100) * imageHeight);
  const right = Math.ceil((bbox.x_max / 100) * imageWidth);
  const bottom = Math.ceil((bbox.y_max / 100) * imageHeight);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
};

const padRect = (rect: Rect, maxWidth: number, maxHeight: number, padX: number, padY: number): Rect => {
  const x = clamp(rect.x - padX, 0, maxWidth - 1);
  const y = clamp(rect.y - padY, 0, maxHeight - 1);
  const right = clamp(rect.x + rect.width + padX, x + 1, maxWidth);
  const bottom = clamp(rect.y + rect.height + padY, y + 1, maxHeight);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
};

const intersects = (a: Rect, b: Rect) =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;

const unionRect = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);

  return { x, y, width: right - x, height: bottom - y };
};

const isInkPixel = (r: number, g: number, b: number, alpha: number) => {
  if (alpha < 32) return false;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

  // Widened thresholds to capture lighter/thinner pen strokes and pencil signatures
  return luminance < 220 || (luminance < 240 && saturation > 0.08 && maxChannel < 245);
};

const isCanvasMostlyBlank = (canvas: HTMLCanvasElement, minimumInkRatio = 0.003) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let inkPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (isInkPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      inkPixels += 1;
    }
  }

  return inkPixels / Math.max(data.length / 4, 1) < minimumInkRatio;
};

const findSignatureBounds = (canvas: HTMLCanvasElement, anchorRect: Rect): Rect | null => {
  const maxDimension = 360;
  const scale = Math.min(1, maxDimension / Math.max(canvas.width, canvas.height));
  const sampleCanvas = createCanvas(canvas.width * scale, canvas.height * scale);
  const sampleCtx = sampleCanvas.getContext("2d");
  if (!sampleCtx) return null;

  sampleCtx.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const imageData = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const inkMask = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    inkMask[index] = isInkPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]) ? 1 : 0;
  }

  const visited = new Uint8Array(pixelCount);
  const minPixels = Math.max(18, Math.round(pixelCount * 0.00018));
  const components: InkComponent[] = [];

  for (let start = 0; start < pixelCount; start += 1) {
    if (!inkMask[start] || visited[start]) continue;

    const queue = [start];
    visited[start] = 1;

    let queueIndex = 0;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (queueIndex < queue.length) {
      const current = queue[queueIndex++];
      const x = current % width;
      const y = Math.floor(current / width);

      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbours = [current - 1, current + 1, current - width, current + width];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= pixelCount || visited[neighbour] || !inkMask[neighbour]) continue;

        const neighbourX = neighbour % width;
        const neighbourY = Math.floor(neighbour / width);
        if (Math.abs(neighbourX - x) + Math.abs(neighbourY - y) !== 1) continue;

        visited[neighbour] = 1;
        queue.push(neighbour);
      }
    }

    const rect = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
    const fillRatio = count / Math.max(rect.width * rect.height, 1);

    if (count >= minPixels && rect.width >= 6 && rect.height >= 3) {
      components.push({
        pixelCount: count,
        rect,
        fillRatio,
        centerX: rect.x + rect.width / 2,
        centerY: rect.y + rect.height / 2,
      });
    }
  }

  const candidateComponents = components.filter((component) => {
    const aspectRatio = component.rect.width / Math.max(component.rect.height, 1);
    return (
      component.fillRatio <= 0.58 &&
      component.rect.width <= width * 0.92 &&
      component.rect.height <= height * 0.76 &&
      aspectRatio >= 0.85
    );
  });

  const pool = candidateComponents.length ? candidateComponents : components;
  if (pool.length === 0) return null;

  const anchorCenterX = anchorRect.x * scale + (anchorRect.width * scale) / 2;
  const anchorCenterY = anchorRect.y * scale + (anchorRect.height * scale) / 2;

  const best = pool
    .map((component) => {
      const aspectRatio = component.rect.width / Math.max(component.rect.height, 1);
      const distanceX = Math.abs(component.centerX - anchorCenterX) / Math.max(width, 1);
      const distanceY = Math.abs(component.centerY - anchorCenterY) / Math.max(height, 1);
      const touchesEdge =
        component.rect.x <= 1 ||
        component.rect.y <= 1 ||
        component.rect.x + component.rect.width >= width - 1 ||
        component.rect.y + component.rect.height >= height - 1;
      const areaScore = Math.min(component.pixelCount, 4200) * 0.03;
      const aspectBonus = Math.min(aspectRatio, 7) * 2.4;
      const fillScore = 6 - Math.abs(component.fillRatio - 0.18) * 22;
      const lowerBias = (component.centerY / Math.max(height, 1)) * 6;
      const distancePenalty = distanceX * 18 + distanceY * 24;
      const edgePenalty = touchesEdge ? 12 : 0;

      return {
        component,
        score: areaScore + aspectBonus + fillScore + lowerBias - distancePenalty - edgePenalty,
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.component;

  if (!best) return null;

  let merged = best.rect;
  const mergePadX = Math.max(best.rect.height * 2.4, 12);
  const mergePadY = Math.max(best.rect.height * 1.2, 8);

  let expanded = true;
  while (expanded) {
    expanded = false;
    const mergeWindow = padRect(merged, width, height, mergePadX, mergePadY);

    for (const component of pool) {
      if (intersects(mergeWindow, component.rect) && !intersects(merged, component.rect)) {
        merged = unionRect(merged, component.rect);
        expanded = true;
      }
    }
  }

  const refined = {
    x: merged.x / scale,
    y: merged.y / scale,
    width: merged.width / scale,
    height: merged.height / scale,
  };

  return padRect(
    refined,
    canvas.width,
    canvas.height,
    Math.max(refined.width * 0.14, 12),
    Math.max(refined.height * 0.24, 10),
  );
};

export async function cropSignatureFromScanSource(source: ScanImageSource, bbox: SignatureBoundingBox) {
  try {
    const image = await loadSourceImage(source);
    const normalizedBbox = normalizeBoundingBox(bbox);
    const initialRect = rectFromPercentBox(normalizedBbox, image.naturalWidth, image.naturalHeight);
    const searchRect = padRect(
      initialRect,
      image.naturalWidth,
      image.naturalHeight,
      Math.max(initialRect.width * 0.3, 20),
      Math.max(initialRect.height * 0.3, 15),
    );

    const searchCanvas = createCanvas(searchRect.width, searchRect.height);
    const searchCtx = searchCanvas.getContext("2d");
    if (!searchCtx) return null;

    searchCtx.drawImage(
      image,
      searchRect.x,
      searchRect.y,
      searchRect.width,
      searchRect.height,
      0,
      0,
      searchRect.width,
      searchRect.height,
    );

    const anchorRect = {
      x: initialRect.x - searchRect.x,
      y: initialRect.y - searchRect.y,
      width: initialRect.width,
      height: initialRect.height,
    };

    const refinedBounds = findSignatureBounds(searchCanvas, anchorRect) ?? padRect(anchorRect, searchCanvas.width, searchCanvas.height, 12, 10);
    const finalCanvas = createCanvas(refinedBounds.width, refinedBounds.height);
    const finalCtx = finalCanvas.getContext("2d");
    if (!finalCtx) return null;

    finalCtx.drawImage(
      searchCanvas,
      refinedBounds.x,
      refinedBounds.y,
      refinedBounds.width,
      refinedBounds.height,
      0,
      0,
      refinedBounds.width,
      refinedBounds.height,
    );

    if (isCanvasMostlyBlank(finalCanvas)) return null;

    const blob = await new Promise<Blob | null>((resolve) => finalCanvas.toBlob((value) => resolve(value), "image/png"));
    if (!blob) return null;

    const imagePreview = await loadImage(finalCanvas.toDataURL("image/png"));
    return { blob, image: imagePreview };
  } catch {
    return null;
  }
}