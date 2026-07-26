// Ties canvas preprocessing -> Tesseract.js -> parsing together, entirely
// in the browser. The image is decoded into a <canvas> and handed to
// Tesseract.js directly from there; it is never uploaded anywhere — this
// is a stronger version of the backend's old "never persisted" guarantee,
// since the raw bytes now never leave the device at all.
import { createWorker } from 'tesseract.js';
import { guessCategory } from './categorize';
import { parseReceiptText } from './parser';

// Phone-camera photos routinely come in at 3000-4000px+ on the long side;
// Tesseract needs nowhere near that for a receipt, and downscaling first
// cuts recognition time substantially. Mirrors the same constant the
// backend's (now-unused for this flow) OCR pipeline used.
const MAX_DIMENSION = 1800;

async function fileToPreprocessedCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Grayscale — a cheap contrast normalization that helps Tesseract on
  // photos with colored backgrounds/lighting, without needing a full
  // OpenCV-equivalent denoise/deskew/threshold pass in the browser.
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng');
  }
  return workerPromise;
}

/** Releases the Tesseract worker (and its WASM memory). Safe to call even
 * if a worker was never created. */
export async function terminateOcrWorker() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}

/** Runs the full client-side OCR pipeline on one File and returns the same
 * field shape the old server-side /api/extract/ endpoint returned. Throws
 * on genuinely unreadable images, mirroring the backend's per-image error
 * isolation (callers catch this per-file so one bad image doesn't sink a
 * whole batch). */
export async function extractTransactionFields(file) {
  const canvas = await fileToPreprocessedCanvas(file);
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(canvas);

  const { merchant, date, amount, currency, line_items: lineItems } = parseReceiptText(text);
  return {
    date,
    amount,
    currency,
    category: guessCategory(merchant),
    line_items: lineItems,
    raw_ocr_text: text,
  };
}
