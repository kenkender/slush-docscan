import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import type { TextAnnotation, PlacedSignature } from '../types/document';

// Initialize PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

/**
 * Get PDF Page Count using pdfjs (always slices buffer so caller's ArrayBuffer is never detached by worker transfer)
 */
export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
  const copy = data.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: copy });
  const pdfDoc = await loadingTask.promise;
  return pdfDoc.numPages;
}

/**
 * Render a single PDF page to an HTML5 canvas at crisp resolution
 */
export async function renderPdfPageToCanvas(
  data: ArrayBuffer,
  pageNumber: number,
  scale = 1.5
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; textItems: Array<{ str: string; x: number; y: number; width: number; height: number }> }> {
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d')!;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;

  // Extract text layer items for interactive click-to-edit
  let textItems: Array<{ str: string; x: number; y: number; width: number; height: number }> = [];
  try {
    const textContent = await page.getTextContent();
    textItems = textContent.items.map((item: any) => {
      // transform: [scaleX, skewY, skewX, scaleY, tx, ty]
      const tx = item.transform[4] * scale;
      // In PDF coordinate, Y is from bottom; viewport inverts it
      const ty = (viewport.height) - (item.transform[5] * scale);
      return {
        str: item.str,
        x: tx,
        y: ty - (item.height * scale),
        width: item.width * scale,
        height: (item.height || 14) * scale,
      };
    });
  } catch (err) {
    console.warn('Could not extract text items:', err);
  }

  return {
    canvas,
    width: viewport.width,
    height: viewport.height,
    textItems,
  };
}

/**
 * Convert PDF pages to an array of high-res image data URLs
 */
export async function convertPdfToImages(
  data: ArrayBuffer,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  scale = 2.0
): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const results: string[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    
    // Fill white background for JPEGs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    results.push(canvas.toDataURL(format, 0.95));
  }

  return results;
}

/**
 * Create a clean PDF from a list of scanned image Data URLs
 */
export async function createPdfFromImages(
  imageDataUrls: string[],
  pageSize: 'A4' | 'fit' = 'A4'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // A4 standard points: 595.28 x 841.89
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  for (const dataUrl of imageDataUrls) {
    let embeddedImg;
    const isPng = dataUrl.startsWith('data:image/png');
    if (isPng) {
      embeddedImg = await pdfDoc.embedPng(dataUrl);
    } else {
      embeddedImg = await pdfDoc.embedJpg(dataUrl);
    }

    let pageWidth = A4_WIDTH;
    let pageHeight = A4_HEIGHT;

    if (pageSize === 'fit') {
      pageWidth = embeddedImg.width;
      pageHeight = embeddedImg.height;
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Scale image to fit within page while maintaining aspect ratio
    const imgAspect = embeddedImg.width / embeddedImg.height;
    const pageAspect = pageWidth / pageHeight;

    let drawWidth = pageWidth;
    let drawHeight = pageHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (pageSize === 'A4') {
      const margin = 20; // 20pt margin
      const availW = pageWidth - margin * 2;
      const availH = pageHeight - margin * 2;

      if (imgAspect > pageAspect) {
        drawWidth = availW;
        drawHeight = availW / imgAspect;
      } else {
        drawHeight = availH;
        drawWidth = availH * imgAspect;
      }
      offsetX = (pageWidth - drawWidth) / 2;
      offsetY = (pageHeight - drawHeight) / 2;
    }

    page.drawImage(embeddedImg, {
      x: offsetX,
      y: offsetY,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return await pdfDoc.save();
}

/**
 * Export PDF with Text Whiteout, Text Replacements, Annotations, and Signatures baked in!
 */
export async function exportPdfWithEdits(
  pdfBuffer: ArrayBuffer,
  annotationsByPage: Record<number, TextAnnotation[]>,
  signatures: PlacedSignature[],
  canvasWidth: number,
  canvasHeight: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageNumber = pageIdx + 1;
    const page = pages[pageIdx];
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Scale factors between canvas coordinates and PDF points
    const scaleX = pdfWidth / canvasWidth;
    const scaleY = pdfHeight / canvasHeight;

    // 1. Apply Text Annotations & Whiteouts
    const annotations = annotationsByPage[pageNumber] || [];
    for (const ann of annotations) {
      const annX = ann.x * scaleX;
      // In PDF, Y=0 is bottom
      const annY = pdfHeight - (ann.y * scaleY) - ((ann.height || 20) * scaleY);
      const annW = (ann.width || 120) * scaleX;
      const annH = (ann.height || 24) * scaleY;

      // Draw background / whiteout block (replaces or erases original text!)
      if (ann.backgroundColor) {
        const hex = ann.backgroundColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255 || 1;
        const g = parseInt(hex.substring(2, 4), 16) / 255 || 1;
        const b = parseInt(hex.substring(4, 6), 16) / 255 || 1;

        page.drawRectangle({
          x: annX,
          y: annY,
          width: annW,
          height: annH,
          color: rgb(r, g, b),
        });
      }

      // Draw replacement or new text (supports both ASCII vector text and Thai/Unicode high-DPI canvas text!)
      if (ann.text && ann.text.trim()) {
        const fontSize = (ann.fontSize || 14) * scaleY;
        const hasNonAscii = /[^\x00-\x7F]/.test(ann.text);

        if (!hasNonAscii) {
          const font = ann.isBold ? fontHelveticaBold : fontHelvetica;
          let r = 0, g = 0, b = 0;
          if (ann.color && ann.color.startsWith('#')) {
            const hex = ann.color.replace('#', '');
            r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
            g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
            b = parseInt(hex.substring(4, 6), 16) / 255 || 0;
          }
          try {
            page.drawText(ann.text, {
              x: annX + 2,
              y: annY + 4,
              size: fontSize,
              font: font,
              color: rgb(r, g, b),
            });
          } catch (e) {
            console.warn('Text encoding fallback:', e);
          }
        } else {
          // Render Thai / Unicode text via 3x supersampled transparent PNG canvas
          const pngInfo = renderUnicodeTextToPng(ann.text, {
            fontSizePx: (ann.fontSize || 14) * 3,
            color: ann.color || '#000000',
            isBold: ann.isBold,
            isItalic: ann.isItalic,
          });
          if (pngInfo.dataUrl) {
            const textImg = await pdfDoc.embedPng(pngInfo.dataUrl);
            const drawW = (pngInfo.width / 3) * scaleX;
            const drawH = (pngInfo.height / 3) * scaleY;
            page.drawImage(textImg, {
              x: annX + 2,
              y: annY + Math.max(0, (annH - drawH) / 2),
              width: drawW,
              height: drawH,
            });
          }
        }
      }
    }

    // 2. Apply Signatures for this page
    const pageSignatures = signatures.filter((s) => s.pageNumber === pageNumber);
    for (const sig of pageSignatures) {
      try {
        const isPng = sig.signatureDataUrl.includes('image/png');
        const sigImage = isPng
          ? await pdfDoc.embedPng(sig.signatureDataUrl)
          : await pdfDoc.embedJpg(sig.signatureDataUrl);

        const sigX = sig.x * scaleX;
        const sigW = sig.width * scaleX;
        const sigH = sig.height * scaleY;
        const sigY = pdfHeight - (sig.y * scaleY) - sigH;

        page.drawImage(sigImage, {
          x: sigX,
          y: sigY,
          width: sigW,
          height: sigH,
          rotate: degrees(sig.rotation || 0),
        });
      } catch (err) {
        console.error('Failed to stamp signature onto PDF:', err);
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Helper to render Thai / Unicode text onto a crisp transparent PNG for PDF embedding
 */
function renderUnicodeTextToPng(
  text: string,
  opts: { fontSizePx: number; color: string; isBold?: boolean; isItalic?: boolean; opacity?: number }
): { dataUrl: string; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', width: 0, height: 0 };

  const weight = opts.isBold ? 'bold' : 'normal';
  const style = opts.isItalic ? 'italic' : 'normal';
  const fontSpec = `${style} ${weight} ${Math.round(opts.fontSizePx)}px 'Sarabun', 'Kanit', sans-serif`;
  ctx.font = fontSpec;

  const metrics = ctx.measureText(text);
  const textW = Math.max(20, Math.ceil(metrics.width + opts.fontSizePx * 0.4));
  const textH = Math.max(20, Math.ceil(opts.fontSizePx * 1.45));

  canvas.width = textW;
  canvas.height = textH;

  ctx.font = fontSpec;
  ctx.fillStyle = opts.color;
  ctx.globalAlpha = opts.opacity ?? 1.0;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, opts.fontSizePx * 0.15, textH / 2);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: textW,
    height: textH,
  };
}

/**
 * Merge multiple PDF ArrayBuffers into a single unified PDF
 */
export async function mergePdfs(pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const doc = await PDFDocument.load(buffer);
    const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
}

/**
 * Split PDF: Extract specific page numbers (1-based)
 */
export async function splitPdf(
  pdfBuffer: ArrayBuffer,
  selectedPageNumbers: number[]
): Promise<Uint8Array> {
  const sourceDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();

  // Convert 1-based page numbers to 0-based indices
  const indicesToCopy = selectedPageNumbers
    .map((p) => p - 1)
    .filter((idx) => idx >= 0 && idx < sourceDoc.getPageCount());

  const copiedPages = await newDoc.copyPages(sourceDoc, indicesToCopy);
  copiedPages.forEach((page) => newDoc.addPage(page));

  return await newDoc.save();
}

/**
 * Add Watermark to all pages in a PDF (supports both Thai like "สำเนาถูกต้อง" and English "CONFIDENTIAL")
 */
export async function addWatermarkToPdf(
  pdfBuffer: ArrayBuffer,
  watermarkText: string,
  options: { opacity?: number; colorHex?: string; size?: number } = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const opacity = options.opacity ?? 0.25;
  const size = options.size ?? 48;

  const pngInfo = renderUnicodeTextToPng(watermarkText, {
    fontSizePx: size * 3,
    color: options.colorHex || '#b31919',
    isBold: true,
    opacity,
  });

  if (pngInfo.dataUrl) {
    const watermarkImg = await pdfDoc.embedPng(pngInfo.dataUrl);
    const drawW = pngInfo.width / 3;
    const drawH = pngInfo.height / 3;

    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawImage(watermarkImg, {
        x: Math.max(40, (width - drawW) / 2.2),
        y: Math.max(80, height / 2.4),
        width: drawW,
        height: drawH,
        rotate: degrees(35),
      });
    }
  }

  return await pdfDoc.save();
}

/**
 * Extract native embedded text from a PDF page (if digital PDF) for 100%-accurate text extraction
 */
export async function extractPdfNativeText(
  data: ArrayBuffer,
  pageNumber: number
): Promise<{ text: string; lines: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const textContent = await page.getTextContent();

    const items = (textContent.items as any[])
      .filter((it) => it.str && it.str.trim().length > 0)
      .map((item) => {
        const x = item.transform[4] * 1.5;
        const y = viewport.height - item.transform[5] * 1.5;
        const w = (item.width || 20) * 1.5;
        const h = (item.height || 14) * 1.5;
        return { str: item.str.trim(), x, y, w, h };
      });

    if (items.length === 0) return { text: '', lines: [] };

    // Group items by approximate Y coordinate into visual lines
    items.sort((a, b) => (Math.abs(a.y - b.y) < 8 ? a.x - b.x : a.y - b.y));
    const groupedLines: Array<{ y: number; parts: typeof items }> = [];
    for (const it of items) {
      const last = groupedLines[groupedLines.length - 1];
      if (last && Math.abs(last.y - it.y) < 10) {
        last.parts.push(it);
      } else {
        groupedLines.push({ y: it.y, parts: [it] });
      }
    }

    const lines = groupedLines.map((g) => {
      g.parts.sort((a, b) => a.x - b.x);
      const lineStr = g.parts.map((p) => p.str).join(' ');
      const x0 = Math.min(...g.parts.map((p) => p.x));
      const y0 = Math.min(...g.parts.map((p) => p.y - p.h));
      const x1 = Math.max(...g.parts.map((p) => p.x + p.w));
      const y1 = Math.max(...g.parts.map((p) => p.y));
      return { text: lineStr, bbox: { x0, y0, x1, y1 } };
    });

    return {
      text: lines.map((l) => l.text).join('\n'),
      lines,
    };
  } catch (e) {
    console.warn('Native PDF text extraction fallback:', e);
    return { text: '', lines: [] };
  }
}

/**
 * Compress a PDF buffer by re-encoding pages at controlled scale and JPEG quality
 */
export async function compressPdfBuffer(
  data: ArrayBuffer,
  scale = 1.35,
  jpegQuality = 0.72,
  onProgress?: (page: number, total: number) => void
): Promise<{ bytes: Uint8Array; pageCount: number; previewUrl: string }> {
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
  const srcPdf = await loadingTask.promise;
  const total = srcPdf.numPages;
  const outDoc = await PDFDocument.create();
  let firstPreview = '';

  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total);
    const page = await srcPdf.getPage(i);
    const origViewport = page.getViewport({ scale: 1.0 });
    const renderViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(100, Math.round(renderViewport.width));
    canvas.height = Math.max(100, Math.round(renderViewport.height));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
    const jpgDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    if (i === 1) firstPreview = jpgDataUrl;

    const jpgImage = await outDoc.embedJpg(jpgDataUrl);
    const outPage = outDoc.addPage([origViewport.width, origViewport.height]);
    outPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });
  }

  const bytes = await outDoc.save({ useObjectStreams: true });
  return { bytes, pageCount: total, previewUrl: firstPreview };
}
