"use client";

/** Browser-side image helpers: resizing/compression to meet MT eVisa size rules. */

export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function dataUrlSize(dataUrl: string): number {
  const b64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((b64.length * 3) / 4);
}

function encode(canvas: HTMLCanvasElement, maxBytes: number, minQuality = 0.4): string {
  let q = 0.92;
  let out = canvas.toDataURL("image/jpeg", q);
  while (dataUrlSize(out) > maxBytes && q > minQuality) {
    q -= 0.08;
    out = canvas.toDataURL("image/jpeg", q);
  }
  return out;
}

/** Passport copy: max 1600px wide and ≤ 1 MB (MT: PNG/GIF/JPEG, max 1 MB). */
export async function preparePassportImage(src: string): Promise<{ dataUrl: string; img: HTMLImageElement }> {
  const img = await loadImage(src);
  const scale = Math.min(1, 1600 / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  let dataUrl = encode(canvas, 950 * 1024);
  if (dataUrlSize(dataUrl) > 1024 * 1024) {
    canvas.width = Math.round(canvas.width * 0.7);
    canvas.height = Math.round(canvas.height * 0.7);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = encode(canvas, 950 * 1024, 0.3);
  }
  return { dataUrl, img };
}

/** Personal photo: centred square crop, 200×200 px, JPEG between 5 and 100 KB. */
export async function preparePersonPhoto(src: string): Promise<string> {
  const img = await loadImage(src);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = Math.max(0, (img.naturalHeight - side) / 2 - side * 0.05);
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 200, 200);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, 200, 200);
  let out = encode(canvas, 95 * 1024);
  if (dataUrlSize(out) < 5 * 1024) out = canvas.toDataURL("image/jpeg", 1);
  return out;
}

/** Otsu's method: picks the grey level that best separates text from background. */
function otsu(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Crops the lower part of the passport data page (where the MRZ is), upscales it and
 * converts it to greyscale — optionally binarised with an adaptive (Otsu) threshold,
 * which copes with uneven lighting in phone photos.
 */
export function mrzCanvas(img: CanvasImageSource & { width: number; height: number }, portion = 0.32, binarize = true): HTMLCanvasElement {
  const w = img.width;
  const h = img.height;
  const cropH = Math.round(h * portion);
  const scale = Math.min(3, Math.max(1, 2000 / w));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(cropH * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, h - cropH, w, cropH, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = px[i + 1] = px[i + 2] = g;
    hist[g]++;
  }
  if (binarize) {
    const t = otsu(hist, px.length / 4);
    for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = px[i] > t ? 255 : 0;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/**
 * Estimates the skew of the passport text (phone photos are rarely straight). For each
 * candidate angle it counts sharp brightness changes (character strokes) per row in the lower
 * part of the image; text rows are most distinct when perfectly horizontal, so the angle with
 * the highest variance between rows wins. Flat backgrounds and uniform noise barely register.
 */
export function estimateSkew(img: CanvasImageSource & { width: number; height: number }): number {
  const w = 700;
  const h = Math.round((img.height * w) / img.width);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  let bestAngle = 0;
  let bestScore = -1;
  for (let deg = -8; deg <= 8; deg += 0.5) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    const y0 = Math.round(h * 0.4);
    const { data } = ctx.getImageData(0, y0, w, h - y0);
    const rows: number[] = [];
    for (let y = 0; y < h - y0; y++) {
      let edges = 0;
      let prev = -1;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const g = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
        if (prev >= 0 && Math.abs(g - prev) > 40) edges++;
        prev = g;
      }
      rows.push(edges);
    }
    const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
    const score = rows.reduce((a, b) => a + (b - mean) ** 2, 0);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }
  return bestAngle;
}

/** Rotates an image by an arbitrary angle (degrees) on a white background. */
export function rotatedBy(img: CanvasImageSource & { width: number; height: number }, deg: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return c;
}

/** Returns the image rotated by 90° steps (for passports photographed sideways or upside down). */
export function rotated(img: CanvasImageSource & { width: number; height: number }, quarterTurns: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const odd = quarterTurns % 2 === 1;
  c.width = odd ? img.height : img.width;
  c.height = odd ? img.width : img.height;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return c;
}
