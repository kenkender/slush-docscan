import React, { useRef, useState } from 'react';
import { UploadCloud, Camera, FileText, Search, PenTool, Sparkles, ShieldCheck } from 'lucide-react';
import { StickerRocket, StickerOcr, StickerSignature, StickerSeal, StickerPrint, Slush3DRibbon } from './SlushStickers';
import type { ToolType } from '../types/document';

interface HeroDropzoneProps {
  onFileLoaded: (file: File) => void;
  onSelectTool: (tool: ToolType) => void;
  onLoadDemo: () => void;
}

export const HeroDropzone: React.FC<HeroDropzoneProps> = ({
  onFileLoaded,
  onSelectTool,
  onLoadDemo,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileLoaded(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileLoaded(e.target.files[0]);
    }
  };

  return (
    <section className="relative overflow-hidden bg-[#dceeff] pt-12 pb-16 px-4 sm:px-6 border-b border-black no-print">
      {/* 3D Blue Ribbon background decorative motif */}
      <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 opacity-35 pointer-events-none">
        <Slush3DRibbon />
      </div>

      <div className="relative max-w-[1240px] mx-auto text-center">
        {/* Floating Playful Stickers */}
        <div className="hidden sm:block absolute -top-4 left-6 z-10">
          <StickerRocket rotate="-rotate-12" />
        </div>
        <div className="hidden sm:block absolute top-2 right-12 z-10">
          <StickerOcr rotate="rotate-12" />
        </div>
        <div className="hidden md:block absolute bottom-8 left-12 z-10">
          <StickerSignature rotate="-rotate-6" />
        </div>
        <div className="hidden md:block absolute bottom-4 right-16 z-10">
          <StickerPrint rotate="rotate-6" />
        </div>
        <div className="hidden lg:block absolute top-1/3 right-4 z-10">
          <StickerSeal rotate="-rotate-12" />
        </div>

        {/* Sculptural Display Headline */}
        <div className="mb-4">
          <span className="inline-block px-4 py-1 bg-white border border-black rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            ✨ Next-Gen Document Scanner & PDF Engine
          </span>
          <h1 className="font-display font-black text-4xl sm:text-6xl md:text-7xl lg:text-8xl tracking-tight text-black leading-[0.95] sm:leading-[0.88] uppercase mb-4">
            SCAN • EDIT • OCR <br />
            <span className="text-[#4da2ff]">SIGN & PRINT</span>
          </h1>
          <p className="text-base sm:text-xl font-medium text-black max-w-2xl mx-auto leading-relaxed">
            ระบบสแกนเอกสารสารพัดประโยชน์ ครบเครื่องทุกเรื่องเอกสาร: สแกนกล้องปรับคมชัด, แก้ไขข้อความใน PDF, อ่าน OCR ไทย-อังกฤษคัดลอกได้ทันที, วาดและปั๊มลายเซ็น, แปลงไฟล์ทุกฟอร์แมต และสั่งพิมพ์ได้ทันที
          </p>
        </div>

        {/* Drag & Drop Card */}
        <div className="mt-8 max-w-3xl mx-auto">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer transition-all duration-200 p-8 sm:p-10 rounded-[32px] border-2 border-black bg-white text-center relative group ${
              isDragging
                ? 'bg-[#e9ccff] scale-[1.02] border-dashed border-black'
                : 'hover:-translate-y-1'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt"
              className="hidden"
            />

            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#dceeff] border border-black flex items-center justify-center group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8 text-black" />
            </div>

            <h3 className="font-display font-bold text-2xl text-black mb-1">
              ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเปิดไฟล์
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              รองรับไฟล์หลากหลาย: <span className="font-bold text-black">PDF, JPG, PNG, WEBP, DOCX, TXT</span> (ปลอดภัย ประมวลผลในเครื่อง 100%)
            </p>

            {/* Quick Action Pills inside dropzone */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onSelectTool('scanner')}
                className="slush-pill bg-white hover:bg-[#55db9c] text-xs py-2 px-3.5"
              >
                <Camera className="w-3.5 h-3.5" />
                กล้องสแกนเอกสาร
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="slush-pill bg-white hover:bg-[#4da2ff] hover:text-white text-xs py-2 px-3.5"
              >
                <FileText className="w-3.5 h-3.5" />
                เปิดเอกสาร PDF
              </button>

              <button
                onClick={() => onSelectTool('ocr')}
                className="slush-pill bg-white hover:bg-[#ffd731] text-xs py-2 px-3.5"
              >
                <Search className="w-3.5 h-3.5" />
                อ่าน OCR จากภาพ
              </button>

              <button
                onClick={() => onSelectTool('signature')}
                className="slush-pill bg-white hover:bg-[#5c4ade] hover:text-white text-xs py-2 px-3.5"
              >
                <PenTool className="w-3.5 h-3.5" />
                ปั๊มลายเซ็น
              </button>

              <button
                onClick={onLoadDemo}
                className="slush-pill bg-[#ffd731] hover:bg-[#fb4903] hover:text-white text-xs py-2 px-3.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                โหลดตัวอย่างทดสอบ
              </button>
            </div>
          </div>

          {/* Privacy badge */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-gray-700">
            <ShieldCheck className="w-4 h-4 text-[#55db9c]" />
            <span>ปลอดภัยสูงสุด: เอกสารของคุณถูกประมวลผลบนเครื่องของคุณ ไม่มีการอัปโหลดออกสู่เซิร์ฟเวอร์ภายนอก</span>
          </div>
        </div>
      </div>
    </section>
  );
};
