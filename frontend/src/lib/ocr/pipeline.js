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

// Each pool worker is its own WASM instance (own copy of the language
// model), so this trades memory for parallelism. 4 is a reasonable cap for
// a batch-of-receipts UI; hardwareConcurrency and the actual file count
// both bound it lower when there's less to gain from more workers.
const MAX_WORKERS = 4;

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

function poolSize(fileCount) {
  const hardwareCap = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(MAX_WORKERS, hardwareCap, fileCount));
}

let workerPoolPromise = null;
let workerPoolSize = 0;

// Grows the pool to the requested size (never shrinks an already-running
// pool — a bigger batch just gets more workers than a smaller one did).
function getWorkerPool(size) {
  if (workerPoolPromise && workerPoolSize >= size) return workerPoolPromise;

  const previous = workerPoolPromise;
  const additional = size - workerPoolSize;
  workerPoolSize = size;
  workerPoolPromise = (async () => {
    const existing = previous ? await previous : [];
    const created = await Promise.all(Array.from({ length: additional }, () => createWorker('eng')));
    return [...existing, ...created];
  })();
  return workerPoolPromise;
}

/** Releases all pooled Tesseract workers (and their WASM memory). Safe to
 * call even if a pool was never created. */
export async function terminateOcrWorker() {
  if (!workerPoolPromise) return;
  const pool = await workerPoolPromise;
  workerPoolPromise = null;
  workerPoolSize = 0;
  await Promise.all(pool.map((worker) => worker.terminate()));
}

async function runOcr(worker, file) {
  const canvas = await fileToPreprocessedCanvas(file);
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

/** Runs the full client-side OCR pipeline on one File and returns the same
 * field shape the old server-side /api/extract/ endpoint returned. Throws
 * on genuinely unreadable images. */
export async function extractTransactionFields(file) {
  const [worker] = await getWorkerPool(1);
  return runOcr(worker, file);
}

/** Runs OCR across a batch of files using a small worker pool, so several
 * receipts recognize concurrently instead of one at a time. Results are
 * *not* returned in file order — `onFileDone(index, result, error)` fires
 * as each one finishes, so the caller can show them as they arrive; a
 * single unreadable image (passed back as `error`) doesn't stop the rest
 * of the batch. */
export async function extractTransactionFieldsBatch(files, onFileDone) {
  const pool = await getWorkerPool(poolSize(files.length));
  const queue = files.map((file, index) => ({ file, index }));

  async function drain(worker) {
    while (queue.length) {
      const { file, index } = queue.shift();
      try {
        const result = await runOcr(worker, file);
        onFileDone(index, result, null);
      } catch (err) {
        onFileDone(index, null, err);
      }
    }
  }

  // Only as many workers as there are files actually run.
  await Promise.all(pool.slice(0, files.length).map((worker) => drain(worker)));
}
