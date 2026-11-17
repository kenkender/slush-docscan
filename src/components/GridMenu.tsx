import React, { useState } from 'react';
import {
  Camera,
  FileEdit,
  Search,
  PenTool,
  RefreshCw,
  Layers,
  Minimize2,
  Stamp,
  Printer,
  ArrowRight,
  Filter,
  CheckCircle2
} from 'lucide-react';
import type { ToolType } from '../types/document';

interface GridMenuProps {
  onSelectTool: (tool: ToolType) => void;
}

interface MenuItem {
  id: ToolType;
  title: string;
  titleEn: string;
  category: 'scan' | 'edit' | 'ocr' | 'convert' | 'organize';
  badge: string;
  badgeBg: string;
  badgeText: string;
  cardBg: string;
  accentColor: string;
  icon: React.ReactNode;
  description: string;
  features: string[];
  actionLabel: string;
}

export const GridMenu: React.FC<GridMenuProps> = ({ onSelectTool }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const menuItems: MenuItem[] = [
    {
      id: 'scanner',
      title: 'สแกนเอกสารด้วยกล้อง',
      titleEn: 'Smart Camera Scanner',
      category: 'scan',
      badge: 'คมชัดระดับ HD',
      badgeBg: '#55db9c',
      badgeText: '#000000',
      cardBg: '#ffffff',
      accentColor: '#55db9c',
      icon: <Camera className="w-6 h-6 text-black" />,
      description: 'ถ่ายรูปเอกสารผ่านเว็บแคมหรือมือถือ ปรับตัดขอบ จัดมุมอัตโนมัติ พร้อมฟิลเตอร์ขาวดำระดับมืออาชีพ',
      features: ['สแกนหลายหน้ารวมเล่ม', 'ฟิลเตอร์ B&W High-Contrast', 'ปรับสีคลีนกระดาษ Magic Color'],
      actionLabel: 'เริ่มสแกนเอกสาร',
    },
    {
      id: 'pdf-editor',
      title: 'แก้ไขข้อความใน PDF',
      titleEn: 'PDF Text Editor & Redactor',
      category: 'edit',
      badge: 'ฟังก์ชันเด่น',
      badgeBg: '#4da2ff',
      badgeText: '#ffffff',
      cardBg: '#ffffff',
      accentColor: '#4da2ff',
      icon: <FileEdit className="w-6 h-6 text-black" />,
      description: 'แก้ไขคำผิด ลบข้อความเดิมด้วยการแทนที่สีพื้นหลัง พิมพ์ข้อความใหม่ ปรับขนาดฟอนต์ ไฮไลต์ ปิดทับข้อความลับ',
      features: ['Whiteout & แทนที่คำเดิม', 'เพิ่มข้อความฟอนต์มาตรฐาน', 'ไฮไลต์ & ดินสอขีดเขียน'],
      actionLabel: 'เปิดเครื่องมือแก้ไข',
    },
    {
      id: 'ocr',
      title: 'AI OCR อ่านข้อความ & คัดลอก',
      titleEn: 'Thai & English OCR Scanner',
      category: 'ocr',
      badge: 'อ่านเอกสารสแกน',
      badgeBg: '#ffd731',
      badgeText: '#000000',
      cardBg: '#ffffff',
      accentColor: '#ffd731',
      icon: <Search className="w-6 h-6 text-black" />,
      description: 'สกัดตัวอักษรภาษาไทยและอังกฤษจากเอกสารกระดาษหรือ PDF ถอดข้อความออกมาให้คัดลอกและค้นหาคำได้ทันที',
      features: ['รองรับภาษาไทย + English', '1-Click คัดลอกลงคลิปบอร์ด', 'บันทึกเป็น TXT หรือ Word'],
      actionLabel: 'สกัดข้อความ OCR',
    },
    {
      id: 'signature',
      title: 'สตูดิโอลายเซ็น & ตรายาง',
      titleEn: 'Signature & Stamp Studio',
      category: 'edit',
      badge: 'วาด • พิมพ์ • อัปโหลด',
      badgeBg: '#5c4ade',
      badgeText: '#ffffff',
      cardBg: '#ffffff',
      accentColor: '#5c4ade',
      icon: <PenTool className="w-6 h-6 text-black" />,
      description: 'สร้างลายเซ็นสวยงาม วาดด้วยมือ พิมพ์เป็นฟอนต์ หรืออัปโหลดรูปตัดพื้นหลังขาวออกอัตโนมัติ ลากวางบนเอกสารได้ทุกหน้า',
      features: ['ตัดพื้นหลังขาวเป็นหมึกใส', 'ตรายาง "สำเนาถูกต้อง / อนุมัติ"', 'ลาก ย่อขยาย หมุนลายเซ็น'],
      actionLabel: 'เซ็นชื่อลงเอกสาร',
    },
    {
      id: 'converter',
      title: 'แปลงไฟล์รอบทิศทาง',
      titleEn: 'Universal File Converter',
      category: 'convert',
      badge: 'ทุกนามสกุล',
      badgeBg: '#fb4903',
      badgeText: '#ffffff',
      cardBg: '#ffffff',
      accentColor: '#fb4903',
      icon: <RefreshCw className="w-6 h-6 text-black" />,
      description: 'แปลงเอกสารสลับไปมาได้อย่างสมบูรณ์แบบ ทั้ง PDF ➔ รูปภาพ, รูปภาพหลายใบ ➔ PDF, Word (.docx) ➔ PDF และ PDF ➔ TXT',
      features: ['PDF ➔ PNG/JPG ZIP', 'รูปถ่าย ➔ เอกสาร PDF รวมเล่ม', 'Word (.docx) ➔ PDF'],
      actionLabel: 'แปลงไฟล์ทันที',
    },
    {
      id: 'merge-split',
      title: 'รวมไฟล์ & แยกหน้า PDF',
      titleEn: 'Merge & Split PDF Pages',
      category: 'organize',
      badge: 'จัดระเบียบหน้า',
      badgeBg: '#e9ccff',
      badgeText: '#000000',
      cardBg: '#ffffff',
      accentColor: '#e9ccff',
      icon: <Layers className="w-6 h-6 text-black" />,
      description: 'รวมไฟล์ PDF หลายเล่มเข้าด้วยกันเป็นไฟล์เดียว หรือดึงเฉพาะหน้าที่ต้องการ เช่น หน้า 1-3 และหน้า 5 พร้อมหมุนหน้ากระดาษ',
      features: ['รวมหลาย PDF ใน 1 คลิก', 'ดึงเฉพาะหน้าที่ต้องการ', 'จัดเรียงลำดับหน้าใหม่'],
      actionLabel: 'รวมหรือแยกหน้า',
    },
    {
      id: 'compress',
      title: 'บีบอัดลดขนาดเอกสาร',
      titleEn: 'Compress & Optimize PDF',
      category: 'organize',
      badge: 'ส่งอีเมลง่าย',
      badgeBg: '#cccccc',
      badgeText: '#000000',
      cardBg: '#ffffff',
      accentColor: '#cccccc',
      icon: <Minimize2 className="w-6 h-6 text-black" />,
      description: 'ลดขนาดไฟล์ PDF และรูปภาพให้เล็กลง ส่งทางอีเมลหรืออัปโหลดระบบราชการได้ง่ายโดยไม่สูญเสียความคมชัด',
      features: ['ปรับระดับความละเอียดได้ 3 ระดับ', 'ลดขนาดได้สูงสุด 70%', 'พรีวิวขนาดไฟล์ก่อนดาวน์โหลด'],
      actionLabel: 'บีบอัดไฟล์',
    },
    {
      id: 'watermark',
      title: 'ใส่ลายน้ำ & ข้อความกำกับ',
      titleEn: 'Watermark & Protect',
      category: 'organize',
      badge: 'ความปลอดภัย',
      badgeBg: '#55db9c',
      badgeText: '#000000',
      cardBg: '#ffffff',
      accentColor: '#55db9c',
      icon: <Stamp className="w-6 h-6 text-black" />,
      description: 'ปั๊มข้อความกำกับ "สำเนาถูกต้อง", "ใช้สำหรับ...เท่านั้น", "CONFIDENTIAL" ทำมุม 45 องศาลงบนทุกหน้ากระดาษ',
      features: ['ลายน้ำภาษาไทยและอังกฤษ', 'ปรับความโปร่งใสและสี', 'ปั๊มพร้อมกันทุกหน้า'],
      actionLabel: 'ใส่ลายน้ำ',
    },
    {
      id: 'print',
      title: 'ศูนย์สั่งพิมพ์ด่วน (Direct Print)',
      titleEn: 'Direct Print Center',
      category: 'organize',
      badge: 'สั่งพิมพ์ 1-Click',
      badgeBg: '#4da2ff',
      badgeText: '#ffffff',
      cardBg: '#ffffff',
      accentColor: '#4da2ff',
      icon: <Printer className="w-6 h-6 text-black" />,
      description: 'สั่งพิมพ์ออกเครื่องพิมพ์ได้ทันทีโดยไม่ต้องเปิดโปรแกรมอื่น ตั้งค่าขอบ A4 แนวตั้ง แนวนอน สเกลพอดีหน้ากระดาษ',
      features: ['พรีวิวการพิมพ์แบบ High-Res', 'สเกล Fit to Page อัตโนมัติ', 'รองรับเครื่องพิมพ์ทุกรุ่น'],
      actionLabel: 'สั่งพิมพ์ทันที',
    },
  ];

  const categories = [
    { id: 'all', label: 'ทั้งหมด (All Tools)', count: menuItems.length },
    { id: 'scan', label: 'สแกน & กล้อง', count: 1 },
    { id: 'edit', label: 'แก้ไข & เซ็นชื่อ', count: 2 },
    { id: 'ocr', label: 'AI OCR ข้อความ', count: 1 },
    { id: 'convert', label: 'แปลงไฟล์', count: 1 },
    { id: 'organize', label: 'จัดระเบียบ & พิมพ์', count: 4 },
  ];

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <section className="py-14 px-4 sm:px-6 max-w-[1440px] mx-auto no-print">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-black">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full bg-[#fb4903] border border-black inline-block"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-black">
              GRID MENU • เครื่องมือทั้งหมด
            </span>
          </div>
          <h2 className="font-display font-black text-3xl sm:text-5xl tracking-tight text-black">
            เลือกเมนูการทำงานที่ต้องการ
          </h2>
          <p className="text-sm sm:text-base text-gray-700 mt-1">
            คลิกเลือกเมนูที่ต้องการเพื่อเริ่มจัดการเอกสารได้ทันที
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="ค้นหาเครื่องมือ เช่น OCR, เซ็น, แก้ไข..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-black rounded-full text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-black"
          />
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-xs font-bold text-gray-500 mr-1 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" /> หมวดหมู่:
        </span>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`slush-pill text-xs py-1.5 px-3.5 border transition ${
              selectedCategory === cat.id
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-black hover:bg-[#e9e9e9]'
            }`}
          >
            <span>{cat.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full border border-black ${
                selectedCategory === cat.id ? 'bg-[#ffd731] text-black' : 'bg-gray-100 text-black'
              }`}
            >
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Grid of 9 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectTool(item.id)}
            className="slush-card slush-card-hover p-6 sm:p-7 flex flex-col justify-between cursor-pointer group relative overflow-hidden"
          >
            {/* Top Accent Strip */}
            <div
              className="absolute top-0 left-0 right-0 h-2 border-b border-black"
              style={{ backgroundColor: item.accentColor }}
            />

            <div>
              {/* Card Header & Badge */}
              <div className="flex items-start justify-between gap-3 mb-4 mt-1">
                <div
                  className="w-12 h-12 rounded-2xl border border-black flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ backgroundColor: item.accentColor }}
                >
                  {item.icon}
                </div>

                <span
                  className="slush-sticker text-[11px]"
                  style={{
                    backgroundColor: item.badgeBg,
                    color: item.badgeText,
                  }}
                >
                  {item.badge}
                </span>
              </div>

              {/* Title & English Title */}
              <h3 className="font-display font-black text-2xl text-black mb-1 group-hover:text-[#4da2ff] transition-colors">
                {item.title}
              </h3>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                {item.titleEn}
              </p>

              {/* Description */}
              <p className="text-xs sm:text-sm text-gray-700 leading-relaxed mb-5">
                {item.description}
              </p>

              {/* Feature bullet tags */}
              <div className="space-y-1.5 mb-6">
                {item.features.map((feat, fIdx) => (
                  <div key={fIdx} className="flex items-center gap-2 text-xs font-semibold text-gray-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#55db9c] shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Button */}
            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-black group-hover:underline">
                {item.actionLabel}
              </span>
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center group-hover:translate-x-1 transition-transform">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
