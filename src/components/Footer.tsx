import React from 'react';
import { ShieldCheck, Cpu, Zap } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-black py-12 px-4 sm:px-6 relative overflow-hidden footer-section no-print">
      <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#4da2ff] border border-black flex items-center justify-center font-black text-white">
              S
            </div>
            <span className="font-display font-black text-2xl tracking-tight text-black">
              SLUSH <span className="text-[#4da2ff]">DOCSCAN</span>
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#ffd731] border border-black rounded-full uppercase">
              STUDIO 2026
            </span>
          </div>
          <p className="text-xs text-gray-600 max-w-sm">
            ระบบสแกนเอกสารสารพัดประโยชน์ • สแกนกล้อง • แก้ไขข้อความใน PDF • OCR ภาษาไทยและอังกฤษ • เซ็นเอกสาร • แปลงไฟล์ทุกชนิด • สั่งพิมพ์ทันที
          </p>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#dceeff] border border-black text-xs font-bold">
            <ShieldCheck className="w-4 h-4 text-[#55db9c]" />
            <span>ความปลอดภัยระดับ Client-side 100%</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e9ccff] border border-black text-xs font-bold">
            <Cpu className="w-4 h-4 text-[#5c4ade]" />
            <span>AI Tesseract Thai & Eng Engine</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f4f3ec] border border-black text-xs font-bold">
            <Zap className="w-4 h-4 text-[#fb4903]" />
            <span>ความเร็วระดับ WebAssembly</span>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center md:text-right text-xs text-gray-500 font-semibold">
          <div>SLUSH Design System • Inflatable Sticker Universe</div>
          <div className="text-[11px] text-gray-400 mt-1">
            รองรับ PDF, รูปภาพ JPG/PNG/WEBP, Word .docx, สแกนกล้องสด
          </div>
        </div>
      </div>
    </footer>
  );
};
