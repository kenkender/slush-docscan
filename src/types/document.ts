export type ToolType = 
  | 'scanner'       // Camera & Paper Scanner
  | 'pdf-editor'    // PDF Text Edit & Annotate
  | 'ocr'           // Thai & English OCR to text & copy
  | 'signature'     // Create & Place Signatures
  | 'converter'     // Universal File Converter
  | 'merge-split'   // Merge & Split PDF
  | 'compress'      // Compress & Optimize
  | 'watermark'     // Watermark & Protect
  | 'print';        // Direct Print Center

export type DocumentFilterType =
  | 'original'       // สีต้นฉบับ
  | 'magic-color'    // Magic Color Pro (สีคลีนไร้เงา)
  | 'lighten-color'  // สว่างคลีน (Eco Color)
  | 'bw-adaptive'    // ขาวดำไร้เงา (Adaptive B&W)
  | 'bw-sharp'       // ขาวดำหมึกเข้ม (High-Contrast B&W)
  | 'grayscale-pro'; // โทนเทาไร้เงา (Clean Grayscale)

export interface ScanAdjustments {
  darkness: number;     // ความเข้มหมึก/ตัวอักษร (-50 ถึง +50)
  sharpness: number;    // ความคมชัด (0 ถึง 100)
  shadowClean: number;  // ลบเงากระดาษ (0 ถึง 100)
  contrast: number;     // คอนทราสต์ (-50 ถึง +50)
  brightness: number;   // ความสว่าง (-50 ถึง +50)
}

export interface CropBox {
  x: number;      // 0 to 100 (% of width)
  y: number;      // 0 to 100 (% of height)
  width: number;  // 0 to 100
  height: number; // 0 to 100
}

export interface PerspectiveQuad {
  tl: { x: number; y: number }; // Top-left corner (0..100%)
  tr: { x: number; y: number }; // Top-right corner (0..100%)
  br: { x: number; y: number }; // Bottom-right corner (0..100%)
  bl: { x: number; y: number }; // Bottom-left corner (0..100%)
}

export interface DocumentFile {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  arrayBuffer?: ArrayBuffer;
  pageCount: number;
  createdAt: Date;
}

export interface ScannedPage {
  id: string;
  rawMasterUrl?: string;   // ภาพต้นฉบับแท้ก่อนครอป/ดัดมุม
  originalDataUrl: string; // ภาพหลังตัดขอบ/ดัดตรงสำหรับเข้าฟิลเตอร์
  dataUrl: string;         // ภาพผลลัพธ์หลังผ่านฟิลเตอร์และการปรับแต่ง
  rotation: number;
  fineRotation?: number;   // องศาปรับเอียงละเอียด (-25 ถึง +25)
  filter: DocumentFilterType;
  adjustments: ScanAdjustments;
  cropBox?: CropBox;
  perspectiveQuad?: PerspectiveQuad;
  width: number;
  height: number;
  ocrText?: string;
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  isBold?: boolean;
  isItalic?: boolean;
  backgroundColor?: string;
  isWhiteout?: boolean;
  width?: number;
  height?: number;
}

export interface PlacedSignature {
  id: string;
  signatureDataUrl: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface SavedSignature {
  id: string;
  title: string;
  dataUrl: string;
  type: 'drawn' | 'typed' | 'uploaded' | 'stamp';
  createdAt: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  lines: Array<{
    text: string;
    confidence?: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
  wordsCount: number;
  charactersCount: number;
  unclearLinesCount?: number;
  isLowQualityWarning?: boolean;
  qualityAdvisory?: string;
  sourceMethod?: 'pdf-native' | 'tesseract-ai';
}
