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

/** Crops the lower part of the passport data page (where the MRZ is) and enhances it for OCR. */
export function mrzCanvas(img: HTMLImageElement, portion = 0.32): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cropH = Math.round(h * portion);
  const scale = Math.max(1, 1800 / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(cropH * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, h - cropH, w, cropH, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = g > 140 ? 255 : g < 90 ? 0 : (g - 90) * 5.1;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}
