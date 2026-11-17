import { createWorker } from 'tesseract.js';
import type { OcrResult } from '../types/document';

export type OcrProgressCallback = (status: string, progress: number) => void;

/**
 * Clean common Tesseract Thai/English OCR artifacts:
 * - Removes orphan Thai combining vowels/tone marks that have no base consonant
 * - Collapses duplicate stacked Thai vowels/tone marks
 * - Repairs split Sara Am (ํ + า -> ำ)
 * - Strips border-line symbol noise
 */
export function cleanThaiOcrText(raw: string): string {
  if (!raw) return '';

  const cleanedLines = raw
    .split(/\r?\n/)
    .map((line) => {
      let s = line.trim();
      if (!s) return '';

      // 1. Repair split Sara Am (นิคหิต + สระอา)
      s = s.replace(/\u0E4D\s*\u0E32/g, '\u0E33');
      s = s.replace(/([\u0E01-\u0E2E])\s+\u0E33/g, '$1\u0E33');

      // 2. Remove orphan Thai combining marks not preceded by a Thai consonant or vowel base
      s = s.replace(/(^|[^\u0E01-\u0E2E\u0E31\u0E34-\u0E39\u0E47])[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+/g, '$1');

      // 3. Deduplicate repeated identical Thai combining marks (e.g. ่่ -> ่, ีี -> ี)
      s = s.replace(/([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])\1+/g, '$1');

      // 4. Remove stray border/watermark symbols often hallucinated from document frames
      s = s.replace(/^[|~^`\\§©®«»_=\-*•·]+|[|~^`\\§©®«»_=\-*•·]+$/g, '').trim();

      // 5. Collapse excessive spaces
      s = s.replace(/\s{2,}/g, ' ').trim();

      // Ignore lines that are purely 1-2 non-alphanumeric/non-Thai noise characters
      if (s.length <= 2 && !/[\u0E01-\u0E2EA-Za-z0-9]/.test(s)) {
        return '';
      }

      return s;
    })
    .filter((line) => line.length > 0);

  return cleanedLines.join('\n');
}

/**
 * Pre-process image for maximum Tesseract LSTM accuracy:
 * - Upscales low-resolution images so Thai upper/lower vowels have crisp pixel height
 * - Suppresses faint background patterns/watermarks to pure white while preserving smooth stroke edges
 */
async function preprocessImageForOcr(
  source: string | HTMLCanvasElement,
  enhanceBackground = true
): Promise<{ canvas: HTMLCanvasElement; origWidth: number; origHeight: number }> {
  let srcCanvas: HTMLCanvasElement;

  if (typeof source === 'string') {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = source;
    });
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.naturalWidth || img.width || 800;
    srcCanvas.height = img.naturalHeight || img.height || 1000;
    const sCtx = srcCanvas.getContext('2d')!;
    sCtx.drawImage(img, 0, 0);
  } else {
    srcCanvas = source;
  }

  const origWidth = srcCanvas.width;
  const origHeight = srcCanvas.height;

  // Upscale small images so Thai vowels & tone marks are >= 30px tall
  const targetMinWidth = 1500;
  const scale = origWidth < targetMinWidth ? Math.min(2.2, targetMinWidth / Math.max(1, origWidth)) : 1.0;
  const w = Math.round(origWidth * scale);
  const h = Math.round(origHeight * scale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, w, h);

  if (!enhanceBackground) {
    return { canvas: outCanvas, origWidth, origHeight };
  }

  // Adaptive background whitening: suppresses ID card / passbook background patterns while keeping anti-aliased ink
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const lum = new Float32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  }

  // Build integral image for fast local background estimation
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    const srcOff = (y - 1) * w;
    const prevOff = (y - 1) * stride;
    const curOff = y * stride;
    for (let x = 1; x <= w; x++) {
      rowSum += lum[srcOff + (x - 1)];
      integral[curOff + x] = integral[prevOff + x] + rowSum;
    }
  }

  const radius = Math.max(16, Math.round(Math.min(w, h) * 0.025));

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1 * stride + x1] -
        integral[y0 * stride + x1] -
        integral[y1 * stride + x0] +
        integral[y0 * stride + x0];
      const localBg = sum / area;

      const idx = y * w + x;
      const pixelLum = lum[idx];
      // Ratio against local paper illumination
      const ratio = pixelLum / Math.max(40, localBg);

      let outVal: number;
      if (ratio > 0.86) {
        // Faint background pattern or paper -> pure white
        outVal = 255;
      } else if (ratio < 0.52) {
        // Core ink stroke -> deep black
        outVal = 0;
      } else {
        // Smooth anti-aliased edge transition for LSTM recognizer
        outVal = Math.round(((ratio - 0.52) / (0.86 - 0.52)) * 255);
      }

      const p = idx * 4;
      d[p] = outVal;
      d[p + 1] = outVal;
      d[p + 2] = outVal;
      d[p + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return { canvas: outCanvas, origWidth, origHeight };
}

/**
 * Perform OCR on an Image (DataURL, Canvas, or File) using Thai + English language models
 * with automatic pre-processing and Thai vowel post-cleaning.
 */
export async function performOcr(
  imageSource: string | HTMLCanvasElement,
  lang: 'tha+eng' | 'eng' | 'tha' = 'tha+eng',
  onProgress?: OcrProgressCallback,
  enhanceBackground = true
): Promise<OcrResult> {
  onProgress?.('กำลังปรับความคมชัดและตัดลวดลายพื้นหลัง...', 0.12);
  const { canvas: preparedCanvas, origWidth, origHeight } = await preprocessImageForOcr(
    imageSource,
    enhanceBackground
  );

  onProgress?.('กำลังโหลดโมเดล AI OCR (Thai + English)...', 0.25);

  const worker = await createWorker(lang, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress?.(
          `กำลังวิเคราะห์ตัวอักษรและสระ (${Math.round((m.progress || 0) * 100)}%)...`,
          0.3 + (m.progress || 0) * 0.65
        );
      }
    },
  });

  const ret = await worker.recognize(preparedCanvas);
  await worker.terminate();

  const dataAny = ret.data as any;
  const rawLines: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }> = (dataAny.lines || [])
    .map((l: any) => ({
      text: cleanThaiOcrText(l.text || ''),
      confidence: Math.round(l.confidence ?? ret.data.confidence ?? 0),
      bbox: {
        x0: l.bbox?.x0 || 0,
        y0: l.bbox?.y0 || 0,
        x1: l.bbox?.x1 || 0,
        y1: l.bbox?.y1 || 0,
      },
    }))
    .filter((l: { text: string }) => l.text.length > 0);

  const cleanedFullText =
    rawLines.length > 0
      ? rawLines.map((l) => l.text).join('\n')
      : cleanThaiOcrText(ret.data.text || '');

  const wordsCount = cleanedFullText.trim() ? cleanedFullText.trim().split(/\s+/).length : 0;
  const charactersCount = cleanedFullText.length;
  const overallConfidence = Math.round(ret.data.confidence || 0);
  const unclearLinesCount = rawLines.filter((l) => l.confidence < 72).length;
  const isLowRes = origWidth < 900 || origHeight < 600;
  const isLowQualityWarning =
    overallConfidence < 78 || unclearLinesCount > 0 || isLowRes || charactersCount === 0;

  let qualityAdvisory =
    'ความชัดเจนของเอกสารอยู่ในเกณฑ์ดี สามารถตรวจสอบและแก้ไขข้อความเพิ่มเติมในกล่องด้านขวาได้ทันที';
  if (charactersCount === 0) {
    qualityAdvisory =
      'ไม่พบข้อความที่ชัดเจนในภาพ — แนะนำให้ใช้ไฟล์ PDF ต้นฉบับ (.pdf) หรือภาพถ่ายความละเอียดสูง (.PNG / .JPG กว้าง 1,500 px ขึ้นไป) ที่ถ่ายมุมตรงและไม่มีเงามืดบังตัวอักษร';
  } else if (isLowQualityWarning) {
    qualityAdvisory =
      `ตรวจพบข้อความบางส่วนอาจไม่ชัดเจน (${unclearLinesCount} บรรทัดที่ความแม่นยำต่ำกว่าเกณฑ์) เนื่องจากลวดลายพื้นหลังหรือความคมชัดของภาพ — แนะนำให้ใช้ไฟล์ .PDF ต้นฉบับดิจิทัล, ภาพ .PNG/.JPG ความละเอียด 300 DPI (กว้าง 1,500 px ขึ้นไป) หรือตัดขอบ (Crop) เฉพาะส่วนข้อความและปรับโหมด "B&W ขาวดำไร้เงา" ก่อนส่งมาอ่าน OCR`;
  }

  return {
    text: cleanedFullText,
    confidence: overallConfidence,
    lines: rawLines,
    wordsCount,
    charactersCount,
    unclearLinesCount,
    isLowQualityWarning,
    qualityAdvisory,
    sourceMethod: 'tesseract-ai',
  };
}
