import React, { useState, useEffect, useRef } from 'react';
import { Stamp, Download, X, Upload, Sparkles, FileText } from 'lucide-react';
import { addWatermarkToPdf, createPdfFromImages } from '../utils/pdfHelper';
import { generateSampleInvoicePdf } from '../utils/demoFiles';

interface WatermarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBuffer: ArrayBuffer | null;
  documentName: string;
  onProjectComplete?: (message: string) => void;
}

export const WatermarkModal: React.FC<WatermarkModalProps> = ({
  isOpen,
  onClose,
  pdfBuffer,
  documentName,
  onProjectComplete,
}) => {
  const [localBuffer, setLocalBuffer] = useState<ArrayBuffer | null>(pdfBuffer);
  const [localName, setLocalName] = useState<string>(documentName || 'เอกสาร.pdf');
  const [watermarkText, setWatermarkText] = useState('สำเนาถูกต้อง');
  const [opacity, setOpacity] = useState(0.25);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalBuffer(pdfBuffer);
    if (documentName) setLocalName(documentName);
  }, [pdfBuffer, documentName]);

  if (!isOpen) return null;

  const presets = ['สำเนาถูกต้อง', 'CONFIDENTIAL', 'DRAFT', 'ลับเฉพาะ', 'ห้ามคัดลอก'];

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const buf = await file.arrayBuffer();
        setLocalBuffer(buf);
        setLocalName(file.name);
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) || '');
          reader.readAsDataURL(file);
        });
        const pdfBytes = await createPdfFromImages([dataUrl], 'A4');
        setLocalBuffer(pdfBytes.buffer.slice(0) as ArrayBuffer);
        setLocalName(file.name.replace(/\.[^.]+$/, '.pdf'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadSample = async () => {
    const sample = await generateSampleInvoicePdf();
    setLocalBuffer(sample.buffer);
    setLocalName(sample.name);
  };

  const handleApplyWatermark = async () => {
    if (!localBuffer) return;
    setIsProcessing(true);
    try {
      const watermarked = await addWatermarkToPdf(localBuffer, watermarkText, { opacity });
      const blob = new Blob([new Uint8Array(watermarked)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `มีลายน้ำ_${localName || 'document.pdf'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (onProjectComplete) {
        onProjectComplete('💧 ใส่ลายน้ำและบันทึกไฟล์ PDF เรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการใส่ลายน้ำ');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden no-print">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        onChange={handleUploadFile}
        className="hidden"
      />

      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black flex items-center justify-between bg-[#dceeff]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#55db9c] border border-black flex items-center justify-center">
              <Stamp className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="font-display font-black text-xl text-black">
                ใส่ลายน้ำ & ข้อความกำกับเอกสาร
              </h2>
              <p className="text-xs text-gray-600">
                ประทับข้อความป้องกันการนำไปใช้ซ้ำลงบนทุกหน้ากระดาษ (รองรับภาษาไทย 100%)
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

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {/* File selector bar */}
          <div className="p-3 bg-[#f4f3ec] border border-black rounded-2xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-[#5c4ade] shrink-0" />
              <span className="text-xs font-extrabold text-black truncate">
                {localBuffer ? localName : 'ยังไม่ได้เลือกไฟล์เอกสาร'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded-full bg-white border border-black text-[11px] font-bold hover:bg-gray-100 flex items-center gap-1"
              >
                <Upload className="w-3 h-3" />
                <span>เลือกไฟล์</span>
              </button>
              {!localBuffer && (
                <button
                  onClick={handleLoadSample}
                  className="px-2.5 py-1 rounded-full bg-[#ffd731] border border-black text-[11px] font-bold hover:brightness-95 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>ไฟล์ตัวอย่าง</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              ข้อความลายน้ำ:
            </label>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-black rounded-xl text-sm font-bold focus:outline-none"
            />
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setWatermarkText(p)}
                className={`text-xs px-2.5 py-1 rounded-full border border-black font-semibold transition ${
                  watermarkText === p ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Opacity slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span>ความโปร่งใส (Opacity):</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.6"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <button
            disabled={isProcessing || !localBuffer}
            onClick={handleApplyWatermark}
            className="w-full slush-pill bg-black text-white text-xs py-3 px-6 border border-black font-extrabold flex items-center justify-center gap-2 mt-4 disabled:opacity-40"
          >
            {isProcessing ? (
              <span>กำลังประมวลผล...</span>
            ) : (
              <>
                <Download className="w-4 h-4 text-[#55db9c]" />
                <span>บันทึกและดาวน์โหลด PDF ที่ใส่ลายน้ำ</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
