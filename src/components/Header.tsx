import React from 'react';
import { Camera, FileText, Search, PenTool, RefreshCw, Printer, PlusCircle, Sparkles, Smartphone } from 'lucide-react';
import type { ToolType } from '../types/document';

interface HeaderProps {
  activeTool: ToolType | null;
  onSelectTool: (tool: ToolType) => void;
  onOpenFileInput: () => void;
  onLoadDemo: () => void;
  onOpenMobileQr: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTool,
  onSelectTool,
  onOpenFileInput,
  onLoadDemo,
  onOpenMobileQr,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-black no-print">
      {/* Top Scrolling Marquee Banner */}
      <div className="bg-black text-white text-[12px] font-bold tracking-wider py-1.5 overflow-hidden whitespace-nowrap select-none border-b border-black">
        <div className="animate-marquee flex items-center gap-8">
          <span>⚡ SLUSH DOCSCAN — ระบบสแกนเอกสารสารพัดประโยชน์ ⚡</span>
          <span>•</span>
          <span>📷 สแกนเอกสารด้วยกล้องปรับสีขาวดำ</span>
          <span>•</span>
          <span>✏️ แก้ไขข้อความใน PDF ได้โดยตรง</span>
          <span>•</span>
          <span>👁️ OCR ภาษาไทย & อังกฤษ คัดลอกได้ทันที</span>
          <span>•</span>
          <span>✍️ ทำลายเซ็น ปั๊มสำเนาถูกต้อง วางบนเอกสาร</span>
          <span>•</span>
          <span>🔄 แปลงไฟล์ PDF ⇄ รูปภาพ ⇄ Word ⇄ ข้อความ</span>
          <span>•</span>
          <span>🖨️ สั่งพิมพ์เอกสารทันที ปรับขอบ A4 สวยงาม</span>
          <span>•</span>
          <span>⚡ SLUSH DOCSCAN — ALL-IN-ONE DOCUMENT STUDIO ⚡</span>
          <span>•</span>
          <span>📷 สแกนเอกสารด้วยกล้องปรับสีขาวดำ</span>
          <span>•</span>
          <span>✏️ แก้ไขข้อความใน PDF ได้โดยตรง</span>
          <span>•</span>
          <span>👁️ OCR ภาษาไทย & อังกฤษ คัดลอกได้ทันที</span>
          <span>•</span>
          <span>✍️ ทำลายเซ็น ปั๊มสำเนาถูกต้อง วางบนเอกสาร</span>
          <span>•</span>
          <span>🔄 แปลงไฟล์ PDF ⇄ รูปภาพ ⇄ Word ⇄ ข้อความ</span>
          <span>•</span>
          <span>🖨️ สั่งพิมพ์เอกสารทันที ปรับขอบ A4 สวยงาม</span>
        </div>
      </div>

      {/* Main Navbar Bar */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#4da2ff] border border-black flex items-center justify-center font-black text-xl text-white select-none">
            S
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-tight text-black">
                SLUSH <span className="text-[#4da2ff]">DOCSCAN</span>
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase bg-[#ffd731] border border-black rounded-full">
                All-in-One
              </span>
            </div>
            <span className="text-[11px] font-medium text-gray-600 hidden md:block">
              ระบบสแกนเอกสาร & สตูดิโอจัดการ PDF ครบวงจร
            </span>
          </div>
        </div>

        {/* Center Quick Pill Navigation */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-[#e9e9e9] p-1 rounded-full border border-black">
          <button
            onClick={() => onSelectTool('scanner')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 border ${
              activeTool === 'scanner'
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-transparent hover:border-black'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            สแกนกล้อง
          </button>

          <button
            onClick={() => onSelectTool('pdf-editor')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 border ${
              activeTool === 'pdf-editor'
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-transparent hover:border-black'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            แก้ไข PDF
          </button>

          <button
            onClick={() => onSelectTool('ocr')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 border ${
              activeTool === 'ocr'
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-transparent hover:border-black'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            AI OCR
          </button>

          <button
            onClick={() => onSelectTool('signature')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 border ${
              activeTool === 'signature'
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-transparent hover:border-black'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            เซ็นเอกสาร
          </button>

          <button
            onClick={() => onSelectTool('converter')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 border ${
              activeTool === 'converter'
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-transparent hover:border-black'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            แปลงไฟล์
          </button>

          <button
            onClick={() => onSelectTool('print')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 border ${
              activeTool === 'print'
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-transparent hover:border-black'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            สั่งพิมพ์
          </button>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMobileQr}
            className="slush-pill bg-[#e9ccff] text-black text-xs py-2 px-3 hover:bg-[#5c4ade] hover:text-white flex items-center gap-1.5"
            title="เปิดใช้งานบนมือถือผ่าน Wi-Fi"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">เปิดบนมือถือ</span>
            <span className="sm:hidden">มือถือ</span>
          </button>

          <button
            onClick={onLoadDemo}
            className="slush-pill bg-white text-black text-xs py-2 px-3.5 hover:bg-[#ffd731] flex items-center gap-1.5"
            title="โหลดไฟล์ตัวอย่างเพื่อทดสอบระบบได้ทันที"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#fb4903]" />
            <span className="hidden sm:inline">โหลดตัวอย่าง</span>
            <span className="sm:hidden">ตัวอย่าง</span>
          </button>

          <button
            onClick={onOpenFileInput}
            className="slush-pill slush-btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>เลือกไฟล์เอกสาร</span>
          </button>
        </div>
      </div>
    </header>
  );
};
