import React, { useState, useEffect, useRef } from 'react';
import {
  Minimize2,
  Upload,
  Download,
  Sparkles,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Sliders,
  ArrowRight,
  X
} from 'lucide-react';
import { compressPdfBuffer, createPdfFromImages } from '../utils/pdfHelper';
import { generateSampleScannedImage } from '../utils/demoFiles';

interface CompressModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: {
    buffer?: ArrayBuffer;
    dataUrl?: string;
    name: string;
    type?: string;
  } | null;
  onProjectComplete?: (message: string) => void;
}

type CompressionPreset = 'extreme' | 'balanced' | 'high';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export const CompressModal: React.FC<CompressModalProps> = ({
  isOpen,
  onClose,
  initialFile,
  onProjectComplete,
}) => {
  const [sourceType, setSourceType] = useState<'pdf' | 'image' | null>(null);
  const [sourceName, setSourceName] = useState<string>('');
  const [originalBytes, setOriginalBytes] = useState<number>(0);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  // Compression settings
  const [preset, setPreset] = useState<CompressionPreset>('balanced');
  const [qualityPct, setQualityPct] = useState<number>(68);
  const [resolutionScale, setResolutionScale] = useState<number>(1.25);

  // Output state
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedBytes, setCompressedBytes] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initialFile if provided
  useEffect(() => {
    if (!isOpen) return;
    if (initialFile?.buffer) {
      setSourceType('pdf');
      setSourceName(initialFile.name || 'เอกสาร.pdf');
      setOriginalBytes(initialFile.buffer.byteLength);
      setPdfBuffer(initialFile.buffer);
      setImageDataUrl(null);
      setCompressedBlob(null);
    } else if (initialFile?.dataUrl) {
      setSourceType('image');
      setSourceName(initialFile.name || 'image.jpg');
      const approxBytes = Math.round((initialFile.dataUrl.length * 3) / 4);
      setOriginalBytes(approxBytes);
      setImageDataUrl(initialFile.dataUrl);
      setPdfBuffer(null);
      setCompressedBlob(null);
    }
  }, [isOpen, initialFile]);

  const handleSelectPreset = (p: CompressionPreset) => {
    setPreset(p);
    if (p === 'extreme') {
      setQualityPct(42);
      setResolutionScale(1.0);
    } else if (p === 'balanced') {
      setQualityPct(68);
      setResolutionScale(1.25);
    } else {
      setQualityPct(85);
      setResolutionScale(1.55);
    }
  };

  // Run compression whenever source or settings change
  useEffect(() => {
    if (!isOpen) return;
    if (!pdfBuffer && !imageDataUrl) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsCompressing(true);
      try {
        if (sourceType === 'pdf' && pdfBuffer) {
          const result = await compressPdfBuffer(
            pdfBuffer,
            resolutionScale,
            qualityPct / 100
          );
          if (cancelled) return;
          const blob = new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' });
          setCompressedBlob(blob);
          setCompressedBytes(blob.size);
          setPageCount(result.pageCount);
          setPreviewUrl(result.previewUrl);
        } else if (sourceType === 'image' && imageDataUrl) {
          const img = new Image();
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej();
            img.src = imageDataUrl;
          });
          if (cancelled) return;

          const scaleFactor = Math.min(1, resolutionScale / 1.5);
          const targetW = Math.max(200, Math.round(img.naturalWidth * scaleFactor));
          const targetH = Math.max(200, Math.round(img.naturalHeight * scaleFactor));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const outDataUrl = canvas.toDataURL('image/jpeg', qualityPct / 100);
            const res = await fetch(outDataUrl);
            const blob = await res.blob();
            if (!cancelled) {
              setCompressedBlob(blob);
              setCompressedBytes(blob.size);
              setPreviewUrl(outDataUrl);
              setPageCount(1);
            }
          }
        }
      } catch (err) {
        console.error('Compression error:', err);
      } finally {
        if (!cancelled) setIsCompressing(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, sourceType, pdfBuffer, imageDataUrl, qualityPct, resolutionScale]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const buf = await file.arrayBuffer();
        setSourceType('pdf');
        setSourceName(file.name);
        setOriginalBytes(file.size);
        setPdfBuffer(buf);
        setImageDataUrl(null);
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) || '');
          reader.readAsDataURL(file);
        });
        setSourceType('image');
        setSourceName(file.name);
        setOriginalBytes(file.size);
        setImageDataUrl(dataUrl);
        setPdfBuffer(null);
      }
    } catch (err) {
      console.error('Error loading file for compression:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadSample = async () => {
    // Generate a realistic high-res scanned PDF (~160 KB) so compression demonstrates real size savings
    const scannedPng = generateSampleScannedImage();
    const canvas = document.createElement('canvas');
    const img = new Image();
    await new Promise<void>((res) => {
      img.onload = () => res();
      img.src = scannedPng;
    });
    canvas.width = img.width * 1.6;
    canvas.height = img.height * 1.6;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const highResPng = canvas.toDataURL('image/png');
    const pdfBytes = await createPdfFromImages([highResPng], 'A4');
    const buf = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength
    ) as ArrayBuffer;

    setSourceType('pdf');
    setSourceName('เอกสารสแกนความละเอียดสูง_SampleScan.pdf');
    setOriginalBytes(buf.byteLength);
    setPdfBuffer(buf);
    setImageDataUrl(null);
  };

  const handleDownloadCompressed = () => {
    if (!compressedBlob) return;
    const url = URL.createObjectURL(compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    const ext = sourceType === 'pdf' ? '.pdf' : '.jpg';
    const baseName = sourceName.replace(/\.[^.]+$/, '') || 'document';
    a.download = `บีบอัดแล้ว_${baseName}${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (onProjectComplete) {
      onProjectComplete('🗜️ บีบอัดและดาวน์โหลดไฟล์เรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
    } else {
      onClose();
    }
  };

  const savedRatio =
    originalBytes > 0 && compressedBytes > 0 && compressedBytes < originalBytes
      ? Math.round(((originalBytes - compressedBytes) / originalBytes) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5 overflow-hidden no-print">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black flex items-center justify-between bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#ffd731] border border-black flex items-center justify-center">
              <Minimize2 className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-xl text-black">
                  บีบอัดและลดขนาดไฟล์ PDF & รูปภาพ
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-[#55db9c] border border-black rounded-full">
                  Smart File Compressor
                </span>
              </div>
              <p className="text-xs text-gray-600">
                ลดขนาดไฟล์เอกสารสำหรับส่งอีเมลหรืออัปโหลดเข้าระบบราชการ พร้อมเปรียบเทียบขนาดไฟล์ก่อน-หลังทันที
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-black hover:bg-black hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#f4f3ec]/50">
          {!sourceType ? (
            /* Empty state uploader */
            <div className="max-w-xl mx-auto my-6 bg-white border-2 border-black rounded-[28px] p-8 text-center shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-[#ffd731] border border-black flex items-center justify-center mx-auto mb-4">
                <Minimize2 className="w-8 h-8 text-black" />
              </div>
              <h3 className="font-display font-black text-xl text-black mb-2">
                เลือกไฟล์ PDF หรือรูปภาพที่ต้องการลดขนาด
              </h3>
              <p className="text-xs text-gray-600 mb-6 leading-relaxed">
                ระบบจะบีบอัดโครงสร้างไฟล์และปรับความละเอียดภาพอัตโนมัติ ช่วยลดขนาดไฟล์ลงได้สูงสุดถึง 80% โดยตัวหนังสือยังอ่านได้ชัดเจน
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto slush-pill bg-black text-white text-xs py-3 px-6 border border-black font-extrabold flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 text-[#55db9c]" />
                  <span>เลือกไฟล์ PDF / รูปภาพ</span>
                </button>
                <button
                  onClick={handleLoadSample}
                  className="w-full sm:w-auto slush-pill bg-[#ffd731] text-black text-xs py-3 px-5 border border-black font-extrabold flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>ทดลองด้วยไฟล์ตัวอย่าง</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Settings & Size Comparison */}
              <div className="lg:col-span-7 space-y-4">
                {/* File info card */}
                <div className="bg-white border border-black rounded-[24px] p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#dceeff] border border-black flex items-center justify-center shrink-0">
                      {sourceType === 'pdf' ? (
                        <FileText className="w-5 h-5 text-black" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-black" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="font-display font-black text-sm text-black block truncate">
                        {sourceName}
                      </span>
                      <span className="text-xs text-gray-500 font-bold">
                        {sourceType === 'pdf' ? `เอกสาร PDF (${pageCount} หน้า)` : 'ไฟล์รูปภาพ'} • ขนาดเดิม {formatBytes(originalBytes)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="slush-pill bg-white text-xs py-1.5 px-3.5 border border-black font-bold hover:bg-gray-100 shrink-0"
                  >
                    เปลี่ยนไฟล์
                  </button>
                </div>

                {/* Preset Compression Modes */}
                <div className="bg-white border border-black rounded-[24px] p-5 space-y-4">
                  <span className="font-display font-black text-sm text-black flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#5c4ade]" />
                    <span>เลือกระดับการบีบอัดไฟล์:</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      {
                        id: 'extreme' as CompressionPreset,
                        title: 'บีบอัดสูงสุด',
                        desc: 'ขนาดเล็กสุด เหมาะส่งอีเมล',
                        badge: 'ลดขนาดสูงสุด',
                      },
                      {
                        id: 'balanced' as CompressionPreset,
                        title: 'สมดุลแนะนำ',
                        desc: 'ขนาดเล็กลง + ตัวอักษรคมชัด',
                        badge: 'แนะนำ',
                      },
                      {
                        id: 'high' as CompressionPreset,
                        title: 'คมชัดสูง',
                        desc: 'รักษาความละเอียดสูง',
                        badge: 'คุณภาพสูง',
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectPreset(item.id)}
                        className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                          preset === item.id
                            ? 'border-2 border-black bg-[#dceeff]'
                            : 'border-black bg-gray-50 hover:bg-white'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-display font-black text-xs text-black">
                              {item.title}
                            </span>
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-[#ffd731] border border-black rounded-full">
                              {item.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-600">{item.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Fine Quality Slider */}
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span>ระดับคุณภาพความคมชัด (Quality):</span>
                        <span className="px-2 py-0.5 bg-[#f4f3ec] border border-black rounded-full">
                          {qualityPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={25}
                        max={95}
                        step={5}
                        value={qualityPct}
                        onChange={(e) => setQualityPct(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Before vs After Size Comparison Card */}
                <div className="bg-white border-2 border-black rounded-[24px] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="text-[11px] font-bold text-gray-500 block">
                        ขนาดไฟล์ต้นฉบับ
                      </span>
                      <span className="font-display font-black text-xl text-gray-700">
                        {formatBytes(originalBytes)}
                      </span>
                    </div>

                    <ArrowRight className="w-5 h-5 text-black" />

                    <div>
                      <span className="text-[11px] font-bold text-gray-500 block">
                        ขนาดหลังบีบอัด
                      </span>
                      <span className="font-display font-black text-2xl text-[#0f8a5f]">
                        {isCompressing ? 'กำลังคำนวณ...' : formatBytes(compressedBytes)}
                      </span>
                    </div>

                    {savedRatio > 0 && (
                      <div className="px-3 py-1.5 rounded-full bg-[#55db9c] border border-black text-xs font-extrabold text-black flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>ลดลง {savedRatio}%</span>
                      </div>
                    )}
                  </div>

                  <button
                    disabled={isCompressing || !compressedBlob}
                    onClick={handleDownloadCompressed}
                    className="w-full mt-4 slush-pill bg-black text-white text-xs py-3.5 px-6 border border-black font-extrabold flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <Download className="w-4 h-4 text-[#55db9c]" />
                    <span>
                      บันทึกและดาวน์โหลดไฟล์ที่บีบอัดแล้ว ({formatBytes(compressedBytes)})
                    </span>
                  </button>
                </div>
              </div>

              {/* Right: Live Visual Quality Preview */}
              <div className="lg:col-span-5 bg-white border border-black rounded-[24px] p-4 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-black text-xs text-black">
                    ตัวอย่างความคมชัดหลังบีบอัด:
                  </span>
                  <span className="text-[11px] font-bold text-gray-500">
                    คุณภาพ {qualityPct}%
                  </span>
                </div>

                <div className="flex-1 min-h-[280px] bg-gray-100 border border-black rounded-2xl p-3 flex items-center justify-center overflow-hidden relative">
                  {isCompressing && (
                    <div className="absolute inset-0 bg-white/75 flex flex-col items-center justify-center z-10">
                      <div className="w-7 h-7 border-3 border-black border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="text-xs font-extrabold text-black">กำลังบีบอัดไฟล์...</span>
                    </div>
                  )}
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Compressed preview"
                      className="max-h-[340px] max-w-full object-contain bg-white border border-black/20 rounded shadow-sm"
                    />
                  ) : (
                    <span className="text-xs text-gray-400 font-bold">กำลังเตรียมตัวอย่าง...</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
