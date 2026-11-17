import type { DocumentFilterType, ScanAdjustments, CropBox, PerspectiveQuad } from '../types/document';

export const DEFAULT_SCAN_ADJUSTMENTS: ScanAdjustments = {
  darkness: 10,     // ความเข้มตัวอักษร (-50 ถึง +50)
  sharpness: 35,    // ความคมชัด (0 ถึง 100)
  shadowClean: 85,  // ลบเงากระดาษ (0 ถึง 100)
  contrast: 10,     // คอนทราสต์ (-50 ถึง +50)
  brightness: 0,    // ความสว่าง (-50 ถึง +50)
};

/**
 * Build Summed-Area Table (Integral Image) in O(W*H) for O(1) local window average
 */
function buildIntegralImage(lum: Float32Array, width: number, height: number): Float64Array {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    const srcRowOffset = (y - 1) * width;
    const prevIntRowOffset = (y - 1) * stride;
    const curIntRowOffset = y * stride;

    for (let x = 1; x <= width; x++) {
      rowSum += lum[srcRowOffset + (x - 1)];
      integral[curIntRowOffset + x] = integral[prevIntRowOffset + x] + rowSum;
    }
  }
  return integral;
}

/**
 * O(1) lookup for mean luminance in (2*radius+1) x (2*radius+1) window around (x, y)
 */
function getLocalMean(
  integral: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
): number {
  const x0 = Math.max(0, x - radius);
  const y0 = Math.max(0, y - radius);
  const x1 = Math.min(width, x + radius + 1);
  const y1 = Math.min(height, y + radius + 1);

  const stride = width + 1;
  const sum =
    integral[y1 * stride + x1] -
    integral[y0 * stride + x1] -
    integral[y1 * stride + x0] +
    integral[y0 * stride + x0];

  const area = (x1 - x0) * (y1 - y0);
  return sum / area;
}

/**
 * Clamp value to [0, 255]
 */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Global-Standard Document Scanner Filter Pipeline
 * Implements:
 * - Multi-Scale Illumination Normalization (removes uneven shadows across paper while keeping solid logos/stamps intact)
 * - Bradley-Roth / Sauvola Soft Adaptive B&W Thresholding
 * - Adobe Scan / CamScanner style Magic Color Pro
 * - 3x3 Unsharp Mask Convolution for crisp Thai/English typography
 */
export function processDocumentFilter(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  filterType: DocumentFilterType,
  rotation = 0,
  adjustments: ScanAdjustments = DEFAULT_SCAN_ADJUSTMENTS
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';

  const isRotated = rotation % 180 !== 0;
  const width = isRotated ? imageElement.height : imageElement.width;
  const height = isRotated ? imageElement.width : imageElement.height;

  canvas.width = width;
  canvas.height = height;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(
    imageElement,
    -imageElement.width / 2,
    -imageElement.height / 2,
    imageElement.width,
    imageElement.height
  );
  ctx.restore();

  const isDefaultOriginal =
    filterType === 'original' &&
    adjustments.darkness === 0 &&
    adjustments.sharpness === 0 &&
    adjustments.contrast === 0 &&
    adjustments.brightness === 0;

  if (isDefaultOriginal) {
    return canvas.toDataURL('image/jpeg', 0.94);
  }

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const numPixels = width * height;

  // 1. Extract Luminance channel
  const lum = new Float32Array(numPixels);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 2. Build Integral Image for Adaptive Illumination & Shadow Removal
  const integral = buildIntegralImage(lum, width, height);
  const minDim = Math.min(width, height);
  // Dual-scale window radii: small for text stroke contrast, large for solid crests/logos & broad shadows
  const rSmall = Math.max(10, Math.round(minDim / 36));
  const rLarge = Math.max(28, Math.round(minDim / 9));

  // Slider parameters normalized
  const darknessOffset = adjustments.darkness; // -50 to +50
  const shadowStrength = (adjustments.shadowClean ?? 85) / 100; // 0.0 to 1.0
  const brightnessOffset = adjustments.brightness * 1.8; // -90 to +90
  const contrastFactor = Math.pow((adjustments.contrast + 100) / 100, 2); // ~0.25 to 2.25

  // Gamma for darkening ink strokes
  const inkGamma = Math.max(0.35, 1.0 + darknessOffset / 65);

  // 3. Apply Selected Document Mode
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const p = rowOffset + x;
      const idx = p * 4;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = lum[p];

      if (filterType === 'original') {
        // Apply manual brightness / contrast / darkness only
        let nr = (r - 128) * contrastFactor + 128 + brightnessOffset - darknessOffset * 0.6;
        let ng = (g - 128) * contrastFactor + 128 + brightnessOffset - darknessOffset * 0.6;
        let nb = (b - 128) * contrastFactor + 128 + brightnessOffset - darknessOffset * 0.6;
        data[idx] = clamp255(nr);
        data[idx + 1] = clamp255(ng);
        data[idx + 2] = clamp255(nb);
        continue;
      }

      // Compute multi-scale local background illumination
      const meanSmall = getLocalMean(integral, width, height, x, y, rSmall);
      const meanLarge = getLocalMean(integral, width, height, x, y, rLarge);
      // Upper envelope prevents hollowing out large solid black stamps/crests while tracking paper shadow
      const localPaperBg = Math.max(meanSmall, meanLarge * 0.96, 38);
      // Blend between local paper illumination and flat 245 reference based on shadowClean slider
      const effectiveBg = localPaperBg * shadowStrength + 242 * (1 - shadowStrength);

      if (filterType === 'bw-adaptive') {
        // Industry-standard Adaptive B&W (Bradley-Roth / ScanTailor Soft Threshold)
        // Normalizes luminance against local paper background so shadows vanish completely!
        const normLum = Math.min(255, (l / effectiveBg) * 255) + brightnessOffset * 0.4;

        // Relative darkness from normalized paper (255 = pure paper, < 255 = ink)
        // Threshold shifts with darkness slider (-50 to +50)
        const threshold = 212 + darknessOffset * 0.65;
        const transitionWidth = Math.max(6, 18 - contrastFactor * 5);

        let bwVal: number;
        if (normLum >= threshold + transitionWidth) {
          bwVal = 255; // Pure white paper
        } else if (normLum <= threshold - transitionWidth) {
          bwVal = 0;   // Pure crisp black ink
        } else {
          // Smooth anti-aliased character edge for readable small Thai/English fonts
          const t = (normLum - (threshold - transitionWidth)) / (2 * transitionWidth);
          bwVal = Math.round(t * t * (3 - 2 * t) * 255);
        }

        data[idx] = bwVal;
        data[idx + 1] = bwVal;
        data[idx + 2] = bwVal;
      } else if (filterType === 'bw-sharp') {
        // High-Contrast Binary B&W (Bold stamps & ultra-crisp text)
        const normLum = Math.min(255, (l / effectiveBg) * 255) + brightnessOffset * 0.4;
        const threshold = 206 + darknessOffset * 0.75;
        const bwVal = normLum > threshold ? 255 : 0;

        data[idx] = bwVal;
        data[idx + 1] = bwVal;
        data[idx + 2] = bwVal;
      } else if (filterType === 'grayscale-pro') {
        // Illumination-normalized Grayscale (Shadow-free smooth gray tones)
        let normGray = Math.min(255, (l / effectiveBg) * 255);
        // Clip paper background noise above whitePoint to pure 255
        const whitePoint = 232 - shadowStrength * 14;
        if (normGray >= whitePoint) {
          normGray = 255;
        } else {
          const ratio = normGray / whitePoint;
          normGray = Math.pow(ratio, inkGamma) * 255;
        }
        normGray = (normGray - 128) * contrastFactor + 128 + brightnessOffset;
        const finalGray = clamp255(normGray);

        data[idx] = finalGray;
        data[idx + 1] = finalGray;
        data[idx + 2] = finalGray;
      } else if (filterType === 'magic-color') {
        // Magic Color Pro (CamScanner / Adobe Scan style):
        // 1. Divide RGB by local paper background illumination to eliminate shadows
        let nr = Math.min(255, (r / effectiveBg) * 255);
        let ng = Math.min(255, (g / effectiveBg) * 255);
        let nb = Math.min(255, (b / effectiveBg) * 255);

        const normLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
        const whitePoint = 228 - shadowStrength * 16;

        if (normLum >= whitePoint) {
          // Smoothly push paper background to pure #FFFFFF
          const blend = Math.min(1, (normLum - whitePoint) / (255 - whitePoint + 1));
          nr = nr + (255 - nr) * Math.pow(blend, 0.5);
          ng = ng + (255 - ng) * Math.pow(blend, 0.5);
          nb = nb + (255 - nb) * Math.pow(blend, 0.5);
        } else {
          // Darken ink/text with gamma curve & boost color saturation for stamps/logos
          const ratio = Math.max(0, normLum / whitePoint);
          const darkenedLum = Math.pow(ratio, inkGamma * 1.15) * 255;
          const scale = normLum > 1 ? darkenedLum / normLum : 0;

          nr *= scale;
          ng *= scale;
          nb *= scale;

          // Boost saturation so blue/red stamps and logos look vibrant
          const newLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          const satBoost = 1.3;
          nr = newLum + (nr - newLum) * satBoost;
          ng = newLum + (ng - newLum) * satBoost;
          nb = newLum + (nb - newLum) * satBoost;
        }

        nr = (nr - 128) * contrastFactor + 128 + brightnessOffset;
        ng = (ng - 128) * contrastFactor + 128 + brightnessOffset;
        nb = (nb - 128) * contrastFactor + 128 + brightnessOffset;

        data[idx] = clamp255(nr);
        data[idx + 1] = clamp255(ng);
        data[idx + 2] = clamp255(nb);
      } else if (filterType === 'lighten-color') {
        // Lighten / Eco Color: gentle shadow removal + natural color preservation
        const softBg = localPaperBg * (shadowStrength * 0.65) + 245 * (1 - shadowStrength * 0.65);
        let nr = Math.min(255, (r / softBg) * 252);
        let ng = Math.min(255, (g / softBg) * 252);
        let nb = Math.min(255, (b / softBg) * 252);

        nr = Math.pow(nr / 255, inkGamma * 0.95) * 255;
        ng = Math.pow(ng / 255, inkGamma * 0.95) * 255;
        nb = Math.pow(nb / 255, inkGamma * 0.95) * 255;

        nr = (nr - 128) * contrastFactor + 128 + brightnessOffset;
        ng = (ng - 128) * contrastFactor + 128 + brightnessOffset;
        nb = (nb - 128) * contrastFactor + 128 + brightnessOffset;

        data[idx] = clamp255(nr);
        data[idx + 1] = clamp255(ng);
        data[idx + 2] = clamp255(nb);
      }
    }
  }

  // 4. Apply 3x3 Unsharp Mask Convolution for Text Sharpness (if sharpness > 0)
  const sharpnessAmount = (adjustments.sharpness ?? 0) / 100;
  if (sharpnessAmount > 0.02) {
    const srcCopy = new Uint8ClampedArray(data);
    const strength = sharpnessAmount * 1.1;
    const rowStride = width * 4;

    for (let y = 1; y < height - 1; y++) {
      const yOffset = y * rowStride;
      for (let x = 1; x < width - 1; x++) {
        const idx = yOffset + x * 4;

        for (let c = 0; c < 3; c++) {
          const center = srcCopy[idx + c];
          const top = srcCopy[idx - rowStride + c];
          const bottom = srcCopy[idx + rowStride + c];
          const left = srcCopy[idx - 4 + c];
          const right = srcCopy[idx + 4 + c];

          // Laplacian high-pass edge detail
          const edge = 4 * center - top - bottom - left - right;
          data[idx + c] = clamp255(center + edge * strength * 0.35);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.94);
}

/**
 * Remove white/light background from scanned signatures, turning it into transparent PNG
 * Allows signature to be stamped over text or lines seamlessly!
 */
export function removeWhiteBackground(
  imageSource: string | HTMLImageElement,
  threshold = 210
): Promise<string> {
  return new Promise((resolve) => {
    const img = typeof imageSource === 'string' ? new Image() : imageSource;

    const process = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve('');

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luminance > threshold) {
          d[i + 3] = 0; // Transparent
        } else {
          const darknessFactor = 1 - luminance / threshold;
          d[i + 3] = Math.min(255, Math.floor(darknessFactor * 255 * 1.4));
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    if (typeof imageSource === 'string') {
      img.onload = process;
      img.src = imageSource;
    } else {
      process();
    }
  });
}

/**
 * Crop image based on percentage bounding box { x, y, width, height } (0 to 100)
 */
export function cropImageDataUrl(
  imageSource: string | HTMLImageElement,
  cropBox: CropBox
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = typeof imageSource === 'string' ? new Image() : imageSource;

    const process = () => {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;

      const pxX = Math.max(0, Math.round((cropBox.x / 100) * srcW));
      const pxY = Math.max(0, Math.round((cropBox.y / 100) * srcH));
      const pxW = Math.max(20, Math.min(srcW - pxX, Math.round((cropBox.width / 100) * srcW)));
      const pxH = Math.max(20, Math.min(srcH - pxY, Math.round((cropBox.height / 100) * srcH)));

      const canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve({ dataUrl: '', width: 0, height: 0 });

      ctx.drawImage(img, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.96),
        width: pxW,
        height: pxH,
      });
    };

    if (typeof imageSource === 'string') {
      img.onload = process;
      img.src = imageSource;
    } else {
      process();
    }
  });
}

function loadHtmlImage(imageSource: string | HTMLImageElement): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof imageSource !== 'string') {
      resolve(imageSource);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = imageSource;
  });
}

/**
 * Solve 8x8 linear system for planar inverse homography (dst -> src) using Gaussian elimination.
 * Returns [h0..h7] with h8 = 1, or null if matrix is singular.
 */
function solveHomographyMatrix(
  dstPts: Array<[number, number]>,
  srcPts: Array<[number, number]>
): Float64Array | null {
  const n = 8;
  const aug: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < 4; i++) {
    const [dx, dy] = dstPts[i];
    const [sx, sy] = srcPts[i];

    const r1 = 2 * i;
    aug[r1][0] = dx;
    aug[r1][1] = dy;
    aug[r1][2] = 1;
    aug[r1][6] = -dx * sx;
    aug[r1][7] = -dy * sx;
    aug[r1][8] = sx;

    const r2 = 2 * i + 1;
    aug[r2][3] = dx;
    aug[r2][4] = dy;
    aug[r2][5] = 1;
    aug[r2][6] = -dx * sy;
    aug[r2][7] = -dy * sy;
    aug[r2][8] = sy;
  }

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = row;
      }
    }
    if (maxVal < 1e-9) return null;

    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }

    const pivot = aug[col][col];
    for (let j = col; j <= n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = aug[i][n];
  }
  return h;
}

/**
 * 4-Corner Perspective Warp / Keystone Flattening (CamScanner / Adobe Scan / Photocopier straightening).
 * Maps arbitrary quadrilateral corners onto an orthogonal target rectangle via exact planar homography + bilinear filtering.
 */
export async function warpPerspectiveDataUrl(
  imageSource: string | HTMLImageElement,
  quad: PerspectiveQuad,
  aspectPreset: 'auto' | 'a4-portrait' | 'a4-landscape' = 'auto'
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadHtmlImage(imageSource);
  if (!img) return { dataUrl: '', width: 0, height: 0 };

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW < 10 || srcH < 10) return { dataUrl: '', width: 0, height: 0 };

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return { dataUrl: '', width: 0, height: 0 };
  srcCtx.drawImage(img, 0, 0, srcW, srcH);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

  const tl: [number, number] = [(quad.tl.x / 100) * (srcW - 1), (quad.tl.y / 100) * (srcH - 1)];
  const tr: [number, number] = [(quad.tr.x / 100) * (srcW - 1), (quad.tr.y / 100) * (srcH - 1)];
  const br: [number, number] = [(quad.br.x / 100) * (srcW - 1), (quad.br.y / 100) * (srcH - 1)];
  const bl: [number, number] = [(quad.bl.x / 100) * (srcW - 1), (quad.bl.y / 100) * (srcH - 1)];

  const topWidth = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const bottomWidth = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const leftHeight = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const rightHeight = Math.hypot(br[0] - tr[0], br[1] - tr[1]);

  let dstW = Math.max(200, Math.round(Math.max(topWidth, bottomWidth)));
  let dstH = Math.max(200, Math.round(Math.max(leftHeight, rightHeight)));

  if (aspectPreset === 'a4-portrait') {
    const base = Math.max(dstW, Math.round(dstH / 1.4142));
    dstW = base;
    dstH = Math.round(base * 1.4142);
  } else if (aspectPreset === 'a4-landscape') {
    const base = Math.max(dstH, Math.round(dstW / 1.4142));
    dstH = base;
    dstW = Math.round(base * 1.4142);
  }

  // Cap upper dimension so giant smartphone photos stay fast and memory-safe
  const maxAllowedSide = 2200;
  if (Math.max(dstW, dstH) > maxAllowedSide) {
    const scaleDown = maxAllowedSide / Math.max(dstW, dstH);
    dstW = Math.round(dstW * scaleDown);
    dstH = Math.round(dstH * scaleDown);
  }

  const h = solveHomographyMatrix(
    [
      [0, 0],
      [dstW - 1, 0],
      [dstW - 1, dstH - 1],
      [0, dstH - 1],
    ],
    [tl, tr, br, bl]
  );

  if (!h) {
    // Degenerate quad fallback: return source
    return { dataUrl: srcCanvas.toDataURL('image/jpeg', 0.96), width: srcW, height: srcH };
  }

  const h0 = h[0], h1 = h[1], h2 = h[2];
  const h3 = h[3], h4 = h[4], h5 = h[5];
  const h6 = h[6], h7 = h[7];

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW;
  dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
  if (!dstCtx) return { dataUrl: '', width: 0, height: 0 };

  const dstImage = dstCtx.createImageData(dstW, dstH);
  const dst = dstImage.data;
  const maxX = srcW - 1;
  const maxY = srcH - 1;

  for (let y = 0; y < dstH; y++) {
    const h1y_h2 = h1 * y + h2;
    const h4y_h5 = h4 * y + h5;
    const h7y_1 = h7 * y + 1;
    const rowOutOffset = y * dstW * 4;

    for (let x = 0; x < dstW; x++) {
      const denom = h6 * x + h7y_1;
      const sxRaw = (h0 * x + h1y_h2) / denom;
      const syRaw = (h3 * x + h4y_h5) / denom;

      const sx = sxRaw < 0 ? 0 : sxRaw > maxX ? maxX : sxRaw;
      const sy = syRaw < 0 ? 0 : syRaw > maxY ? maxY : syRaw;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 < maxX ? x0 + 1 : maxX;
      const y1 = y0 < maxY ? y0 + 1 : maxY;

      const fx = sx - x0;
      const fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      const outIdx = rowOutOffset + x * 4;
      dst[outIdx] =
        srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dst[outIdx + 1] =
        srcData[i00 + 1] * w00 +
        srcData[i10 + 1] * w10 +
        srcData[i01 + 1] * w01 +
        srcData[i11 + 1] * w11;
      dst[outIdx + 2] =
        srcData[i00 + 2] * w00 +
        srcData[i10 + 2] * w10 +
        srcData[i01 + 2] * w01 +
        srcData[i11 + 2] * w11;
      dst[outIdx + 3] = 255;
    }
  }

  dstCtx.putImageData(dstImage, 0, 0);
  return {
    dataUrl: dstCanvas.toDataURL('image/jpeg', 0.96),
    width: dstW,
    height: dstH,
  };
}

/**
 * Automatically detect the 4 corners of a bright sheet of paper against a desk/table background.
 * Returns normalized 0..100 coordinates { tl, tr, br, bl }.
 */
export async function detectDocumentCorners(
  imageSource: string | HTMLImageElement
): Promise<PerspectiveQuad> {
  const fallbackQuad: PerspectiveQuad = {
    tl: { x: 5, y: 5 },
    tr: { x: 95, y: 5 },
    br: { x: 95, y: 95 },
    bl: { x: 5, y: 95 },
  };

  const img = await loadHtmlImage(imageSource);
  if (!img) return fallbackQuad;

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW < 20 || srcH < 20) return fallbackQuad;

  const maxSide = 200;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(40, Math.round(srcW * scale));
  const h = Math.max(40, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallbackQuad;

  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const borderScores: number[] = [];
  const centerScores: number[] = [];
  const scoreMap = new Float32Array(w * h);

  const bxMargin = Math.max(2, Math.floor(w * 0.04));
  const byMargin = Math.max(2, Math.floor(h * 0.04));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = d[idx], g = d[idx + 1], b = d[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      // Paper tends to be bright AND low chroma
      const score = lum - sat * 0.35;
      scoreMap[y * w + x] = score;

      if (x < bxMargin || x >= w - bxMargin || y < byMargin || y >= h - byMargin) {
        borderScores.push(score);
      } else if (x >= w * 0.3 && x <= w * 0.7 && y >= h * 0.3 && y <= h * 0.7) {
        centerScores.push(score);
      }
    }
  }

  borderScores.sort((a, b) => a - b);
  centerScores.sort((a, b) => a - b);
  const borderMed = borderScores[Math.floor(borderScores.length * 0.5)] ?? 128;
  const centerMed = centerScores[Math.floor(centerScores.length * 0.65)] ?? 220;

  // If image has no distinct darker border (already tightly cropped), use clean 4% margin inset
  if (centerMed - borderMed < 16) {
    return fallbackQuad;
  }

  const thresh = borderMed + (centerMed - borderMed) * 0.48;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mask[i] = scoreMap[i] >= thresh ? 1 : 0;
  }

  // Morphological smoothing (erode then keep pixels surrounded by majority paper) to reject isolated desk glare
  const cleaned = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += mask[(y + ky) * w + (x + kx)];
        }
      }
      cleaned[y * w + x] = sum >= 6 ? 1 : 0;
    }
  }

  // Extremal projections for convex paper corners
  let minSum = Infinity, maxSum = -Infinity;
  let minDiff = Infinity, maxDiff = -Infinity;
  let tlPt = { x: 5, y: 5 };
  let trPt = { x: 95, y: 5 };
  let brPt = { x: 95, y: 95 };
  let blPt = { x: 5, y: 95 };
  let count = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!cleaned[y * w + x]) continue;
      count++;
      const s = x + y;
      const diff = x - y;
      if (s < minSum) {
        minSum = s;
        tlPt = { x: (x / w) * 100, y: (y / h) * 100 };
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        trPt = { x: (x / w) * 100, y: (y / h) * 100 };
      }
      if (s > maxSum) {
        maxSum = s;
        brPt = { x: (x / w) * 100, y: (y / h) * 100 };
      }
      if (diff < minDiff) {
        minDiff = diff;
        blPt = { x: (x / w) * 100, y: (y / h) * 100 };
      }
    }
  }

  // Validate Shoelace quad area covers meaningful region (20%..98%)
  const area =
    0.5 *
    Math.abs(
      tlPt.x * trPt.y - trPt.x * tlPt.y +
      trPt.x * brPt.y - brPt.x * trPt.y +
      brPt.x * blPt.y - blPt.x * brPt.y +
      blPt.x * tlPt.y - tlPt.x * blPt.y
    );

  if (count < w * h * 0.15 || area < 2000 || area > 9800) {
    return fallbackQuad;
  }

  const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  return {
    tl: { x: clampPct(tlPt.x), y: clampPct(tlPt.y) },
    tr: { x: clampPct(trPt.x), y: clampPct(trPt.y) },
    br: { x: clampPct(brPt.x), y: clampPct(brPt.y) },
    bl: { x: clampPct(blPt.x), y: clampPct(blPt.y) },
  };
}

/**
 * Automatically estimate text-line rotational skew angle (degrees in [-15, +15])
 * using horizontal projection profile variance (gold-standard document deskew heuristic).
 * Returned angle can be passed directly into Canvas ctx.rotate(angle * Math.PI / 180).
 */
export async function detectSkewAngle(
  imageSource: string | HTMLImageElement
): Promise<number> {
  const img = await loadHtmlImage(imageSource);
  if (!img) return 0;

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW < 30 || srcH < 30) return 0;

  const maxSide = 360;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(60, Math.round(srcW * scale));
  const h = Math.max(60, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  // Extract strong local stroke ink points in central 84% area (ignore scanner outer borders)
  const inkPts: Array<{ dx: number; dy: number }> = [];
  const xStart = Math.floor(w * 0.08);
  const xEnd = Math.ceil(w * 0.92);
  const yStart = Math.floor(h * 0.08);
  const yEnd = Math.ceil(h * 0.92);
  const cx = w / 2;
  const cy = h / 2;

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  }

  for (let y = yStart + 2; y < yEnd - 2; y += 2) {
    for (let x = xStart + 2; x < xEnd - 2; x += 2) {
      const idx = y * w + x;
      const localAvg = (lum[idx - 2] + lum[idx + 2] + lum[idx - 2 * w] + lum[idx + 2 * w]) * 0.25;
      if (localAvg - lum[idx] > 18) {
        inkPts.push({ dx: x - cx, dy: y - cy });
      }
    }
  }

  if (inkPts.length < 30) return 0;

  const diag = Math.ceil(Math.hypot(w, h));
  const offset = Math.floor(diag / 2);
  const bins = new Int32Array(diag + 2);

  const scoreAngle = (deg: number): number => {
    const rad = (deg * Math.PI) / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    bins.fill(0);

    for (let i = 0; i < inkPts.length; i++) {
      const pt = inkPts[i];
      const yProj = Math.round(pt.dx * sinA + pt.dy * cosA + offset);
      if (yProj >= 0 && yProj < bins.length) {
        bins[yProj]++;
      }
    }

    let energy = 0;
    for (let b = 0; b < bins.length; b++) {
      const c = bins[b];
      if (c > 0) energy += c * c;
    }
    return energy;
  };

  // Coarse search -15..+15 step 1.0 deg
  let bestDeg = 0;
  let bestScore = -1;
  for (let deg = -15; deg <= 15; deg += 1) {
    const s = scoreAngle(deg);
    if (s > bestScore) {
      bestScore = s;
      bestDeg = deg;
    }
  }

  // Fine search +-1.25 deg step 0.25 deg
  const coarseBest = bestDeg;
  for (let deg = coarseBest - 1.25; deg <= coarseBest + 1.25; deg += 0.25) {
    const s = scoreAngle(deg);
    if (s > bestScore) {
      bestScore = s;
      bestDeg = deg;
    }
  }

  // Round to nearest 0.5 deg step matching the UI slider
  return Math.max(-25, Math.min(25, Math.round(bestDeg * 2) / 2));
}

/**
 * Rotate document cleanly by fine tilt angle (degrees) with white paper backdrop
 * so all document content stays completely inside the frame without black triangles.
 */
export async function deskewImageDataUrl(
  imageSource: string | HTMLImageElement,
  angleDeg: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadHtmlImage(imageSource);
  if (!img) return { dataUrl: '', width: 0, height: 0 };

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const rad = (angleDeg * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(rad));
  const absSin = Math.abs(Math.sin(rad));
  const dstW = Math.round(srcW * absCos + srcH * absSin);
  const dstH = Math.round(srcW * absSin + srcH * absCos);

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { dataUrl: '', width: 0, height: 0 };

  // Fill background with crisp paper white so rotated edges blend naturally into scanned sheets
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dstW, dstH);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(dstW / 2, dstH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.96),
    width: dstW,
    height: dstH,
  };
}

/**
 * Automatically trim empty white scanner borders around a card/document (e.g., ID card on A4 sheet)
 * while ignoring stray single-pixel dust specks and leaving clean breathing padding.
 */
export async function trimWhiteBordersDataUrl(
  imageSource: string | HTMLImageElement
): Promise<{ dataUrl: string; width: number; height: number; trimmed: boolean }> {
  const img = await loadHtmlImage(imageSource);
  if (!img) return { dataUrl: '', width: 0, height: 0, trimmed: false };

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w < 20 || h < 20) return { dataUrl: typeof imageSource === 'string' ? imageSource : '', width: w, height: h, trimmed: false };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { dataUrl: '', width: w, height: h, trimmed: false };

  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const rowInkCount = new Int32Array(h);
  const colInkCount = new Int32Array(w);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = d[idx], g = d[idx + 1], b = d[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < 238 || sat > 18) {
        rowInkCount[y]++;
        colInkCount[x]++;
      }
    }
  }

  const minRowInk = Math.max(2, Math.floor(w * 0.004));
  const minColInk = Math.max(2, Math.floor(h * 0.004));

  let top = 0;
  while (top < h && rowInkCount[top] < minRowInk) top++;
  let bottom = h - 1;
  while (bottom > top && rowInkCount[bottom] < minRowInk) bottom--;
  let left = 0;
  while (left < w && colInkCount[left] < minColInk) left++;
  let right = w - 1;
  while (right > left && colInkCount[right] < minColInk) right--;

  const padX = Math.max(8, Math.round(w * 0.012));
  const padY = Math.max(8, Math.round(h * 0.012));
  left = Math.max(0, left - padX);
  top = Math.max(0, top - padY);
  right = Math.min(w - 1, right + padX);
  bottom = Math.min(h - 1, bottom + padY);

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;

  // Skip trimming if bounds cover essentially entire sheet or region is invalid
  if (cropW < 30 || cropH < 30 || (cropW > w * 0.94 && cropH > h * 0.94)) {
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.96), width: w, height: h, trimmed: false };
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return { dataUrl: '', width: w, height: h, trimmed: false };

  outCtx.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);
  return {
    dataUrl: outCanvas.toDataURL('image/jpeg', 0.96),
    width: cropW,
    height: cropH,
    trimmed: true,
  };
}

/**
 * Clean 90-degree step image rotation helper for interactive layout placement.
 */
export async function rotateImageDataUrl(
  imageSource: string | HTMLImageElement,
  angleDeg = 90
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadHtmlImage(imageSource);
  if (!img) return { dataUrl: '', width: 0, height: 0 };

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const normalized = ((angleDeg % 360) + 360) % 360;
  const swap = normalized === 90 || normalized === 270;
  const dstW = swap ? h : w;
  const dstH = swap ? w : h;

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', width: w, height: h };

  ctx.translate(dstW / 2, dstH / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.96),
    width: dstW,
    height: dstH,
  };
}

/**
 * Full-featured Signature & Stamp Image Processor:
 * - Adaptive/adjustable white & paper background removal to transparent PNG
 * - Ink darkness & stroke contrast boost
 * - Optional ink color replacement (e.g. convert black pen photo to official Royal Blue #0b3b95)
 * - Rotation (0/90/180/270)
 * - Automatic tight bounding-box trim of transparent margins
 */
export async function processSignatureImage(
  imageSource: string | HTMLImageElement,
  options: {
    threshold?: number;       // 120..250 (default 212)
    darknessBoost?: number;   // 0.6..3.0 (default 1.45)
    recolorHex?: string;      // 'original' or '#0b3b95' etc.
    rotation?: number;        // 0, 90, 180, 270
    autoTrim?: boolean;       // default true
  } = {}
): Promise<string> {
  const img = await loadHtmlImage(imageSource);
  if (!img) return '';

  const threshold = options.threshold ?? 212;
  const darknessBoost = options.darknessBoost ?? 1.45;
  const recolorHex = options.recolorHex ?? 'original';
  const rotation = ((options.rotation ?? 0) % 360 + 360) % 360;
  const autoTrim = options.autoTrim ?? true;

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW < 4 || srcH < 4) return '';

  const swap = rotation === 90 || rotation === 270;
  const w = swap ? srcH : srcW;
  const h = swap ? srcW : srcH;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  let targetR = 0, targetG = 0, targetB = 0;
  const shouldRecolor = recolorHex !== 'original' && recolorHex.startsWith('#') && recolorHex.length === 7;
  if (shouldRecolor) {
    targetR = parseInt(recolorHex.slice(1, 3), 16);
    targetG = parseInt(recolorHex.slice(3, 5), 16);
    targetB = parseInt(recolorHex.slice(5, 7), 16);
  }

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasInk = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = d[i + 3];
      if (a < 15) {
        d[i + 3] = 0;
        continue;
      }

      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // If already transparent PNG (drawn/typed), preserve alpha and apply recolor/darkness
      if (a < 250 && lum < 245) {
        const newAlpha = Math.min(255, Math.round(a * darknessBoost));
        d[i + 3] = newAlpha;
        if (shouldRecolor) {
          d[i] = targetR;
          d[i + 1] = targetG;
          d[i + 2] = targetB;
        }
        if (newAlpha > 25) {
          hasInk = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        continue;
      }

      if (lum > threshold) {
        d[i + 3] = 0;
      } else {
        const darknessFactor = Math.pow(1 - lum / Math.max(1, threshold), 0.85);
        const alpha = Math.min(255, Math.round(darknessFactor * 255 * darknessBoost));
        d[i + 3] = alpha;

        if (shouldRecolor) {
          d[i] = targetR;
          d[i + 1] = targetG;
          d[i + 2] = targetB;
        } else {
          // Darken original ink color so faded pen strokes become crisp
          const darken = Math.max(0.2, 1 - (darknessBoost - 1) * 0.45);
          d[i] = Math.round(r * darken);
          d[i + 1] = Math.round(g * darken);
          d[i + 2] = Math.round(b * darken);
        }

        if (alpha > 25) {
          hasInk = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  if (autoTrim && hasInk && maxX > minX && maxY > minY) {
    const pad = 10;
    const tx = Math.max(0, minX - pad);
    const ty = Math.max(0, minY - pad);
    const tw = Math.min(w - tx, maxX - minX + 1 + pad * 2);
    const th = Math.min(h - ty, maxY - minY + 1 + pad * 2);

    if (tw > 12 && th > 12) {
      const trimCanvas = document.createElement('canvas');
      trimCanvas.width = tw;
      trimCanvas.height = th;
      const trimCtx = trimCanvas.getContext('2d');
      if (trimCtx) {
        trimCtx.drawImage(canvas, tx, ty, tw, th, 0, 0, tw, th);
        return trimCanvas.toDataURL('image/png');
      }
    }
  }

  return canvas.toDataURL('image/png');
}

