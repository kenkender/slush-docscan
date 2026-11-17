import React, { useState, useRef } from 'react';
import {
  RefreshCw,
  FileText,
  Image as ImageIcon,
  FileCode,
  Download,
  Upload,
  X,
  Archive,
  Layers
} from 'lucide-react';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import { convertPdfToImages, createPdfFromImages } from '../utils/pdfHelper';
import type { ToolType } from '../types/document';

interface ConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: { buffer?: ArrayBuffer; dataUrl?: string; name: string } | null;
  onSendToTool: (tool: ToolType, fileData: { buffer?: ArrayBuffer; dataUrl?: string; name: string }) => void;
  onProjectComplete?: (message: string) => void;
}

export const ConverterModal: React.FC<ConverterModalProps> = ({
  isOpen,
  onClose,
  initialFile,
  onProjectComplete,
}) => {
  const [conversionType, setConversionType] = useState<
    'pdf-to-img' | 'img-to-pdf' | 'docx-to-pdf' | 'pdf-to-txt'
  >('pdf-to-img');

  const [isConverting, setIsConverting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  
  // Results
  const [convertedImages, setConvertedImages] = useState<string[]>([]);
  const [extractedText, setExtractedText] = useState<string>('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Convert PDF to Images
  const handlePdfToImages = async (pdfBuffer: ArrayBuffer) => {
    setIsConverting(true);
    setProgressMsg('กำลังเรนเดอร์หน้า PDF เป็นรูปภาพความละเอียดสูง...');
    try {
      const imgs = await convertPdfToImages(pdfBuffer, 'image/png', 2.0);
      setConvertedImages(imgs);
      setProgressMsg(`แปลงเรียบร้อยแล้วทั้งหมด ${imgs.length} หน้า`);
    } catch (err) {
      console.error(err);
      setProgressMsg('เกิดข้อผิดพลาดในการแปลง PDF');
    } finally {
      setIsConverting(false);
    }
  };

  // Convert Images to Single PDF
  const handleImagesToPdf = async () => {
    if (uploadedImages.length === 0) return;
    setIsConverting(true);
    setProgressMsg('กำลังสร้างเอกสาร PDF...');
    try {
      const pdfBytes = await createPdfFromImages(uploadedImages, 'A4');
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `รวมรูปภาพ_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setProgressMsg('สร้างและดาวน์โหลดเอกสาร PDF สำเร็จ!');
      setUploadedImages([]);
      if (onProjectComplete) {
        onProjectComplete('🔄 แปลงรูปภาพเป็น PDF และบันทึกเรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
      }
    } catch (err) {
      console.error(err);
      setProgressMsg('เกิดข้อผิดพลาดในการสร้าง PDF');
    } finally {
      setIsConverting(false);
    }
  };

  // Convert Word (.docx) to HTML / Text
  const handleDocxFile = async (arrayBuffer: ArrayBuffer) => {
    setIsConverting(true);
    setProgressMsg('กำลังอ่านข้อมูลจากไฟล์ Word (.docx)...');
    try {
      const rawText = await mammoth.extractRawText({ arrayBuffer });
      setExtractedText(rawText.value);
      setProgressMsg('แปลงไฟล์ Word สำเร็จแล้ว');
    } catch (err) {
      console.error(err);
      setProgressMsg('เกิดข้อผิดพลาดในการอ่านไฟล์ Word');
    } finally {
      setIsConverting(false);
    }
  };

  // Convert PDF to Text (.txt)
  const handlePdfToText = async (pdfBuffer: ArrayBuffer) => {
    setIsConverting(true);
    setProgressMsg('กำลังสกัดตัวอักษรจาก PDF...');
    try {
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer.slice(0) });
      const pdfDoc = await loadingTask.promise;
      let fullText = '';

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `--- หน้าที่ ${i} ---\n` + pageText + '\n\n';
      }

      setExtractedText(fullText);
      setProgressMsg('สกัดข้อความทั้งหมดจาก PDF เรียบร้อย');
    } catch (err) {
      console.error(err);
      setProgressMsg('เกิดข้อผิดพลาดในการสกัดข้อความ');
    } finally {
      setIsConverting(false);
    }
  };

  // Download all converted images as a single ZIP file
  const handleDownloadZip = async () => {
    if (convertedImages.length === 0) return;
    const zip = new JSZip();
    convertedImages.forEach((imgUrl, idx) => {
      const base64Data = imgUrl.split(',')[1];
      zip.file(`หน้า_${idx + 1}.png`, base64Data, { base64: true });
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `รูปภาพเอกสาร_ZIP_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setConvertedImages([]);
    if (onProjectComplete) {
      onProjectComplete('📦 ดาวน์โหลดไฟล์รูปภาพ ZIP เรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
    }
  };

  // Handle file uploads inside converter
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const isPdf = file.name.endsWith('.pdf');
      const isDocx = file.name.endsWith('.docx');
      const isImg = file.type.startsWith('image/');

      const reader = new FileReader();
      if (isPdf) {
        reader.onload = (ev) => {
          const buffer = ev.target?.result as ArrayBuffer;
          if (conversionType === 'pdf-to-img') handlePdfToImages(buffer);
          else if (conversionType === 'pdf-to-txt') handlePdfToText(buffer);
        };
        reader.readAsArrayBuffer(file);
      } else if (isDocx) {
        reader.onload = (ev) => {
          handleDocxFile(ev.target?.result as ArrayBuffer);
        };
        reader.readAsArrayBuffer(file);
      } else if (isImg) {
        Array.from(e.target.files).forEach((f) => {
          const r = new FileReader();
          r.onload = (ev) => {
            setUploadedImages((prev) => [...prev, ev.target?.result as string]);
          };
          r.readAsDataURL(f);
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5 overflow-hidden no-print">
      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black flex items-center justify-between bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#fb4903] border border-black flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-xl text-black">
                  ระบบแปลงไฟล์เอกสารรอบทิศทาง
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-[#ffd731] border border-black rounded-full">
                  All Formats
                </span>
              </div>
              <p className="text-xs text-gray-600">
                แปลงไฟล์ PDF ⇄ รูปภาพ (PNG/JPG) ⇄ Word (.docx) ⇄ ข้อความ (.txt) รวดเร็วและแม่นยำ
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

        {/* Conversion Type Selectors */}
        <div className="p-3 bg-[#f4f3ec] border-b border-black flex flex-wrap items-center justify-center gap-2 shrink-0">
          {[
            { id: 'pdf-to-img', label: 'PDF ➔ รูปภาพ (PNG / JPG)', icon: <ImageIcon className="w-3.5 h-3.5" /> },
            { id: 'img-to-pdf', label: 'รูปภาพหลายรูป ➔ PDF รวมเล่ม', icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'docx-to-pdf', label: 'Word (.docx) ➔ เอกสาร / PDF', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'pdf-to-txt', label: 'PDF ➔ สกัดข้อความ (.txt)', icon: <FileCode className="w-3.5 h-3.5" /> },
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => {
                setConversionType(type.id as any);
                setConvertedImages([]);
                setExtractedText('');
              }}
              className={`slush-pill text-xs py-2 px-3.5 border ${
                conversionType === type.id
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-black border-black hover:bg-gray-100'
              }`}
            >
              {type.icon}
              <span>{type.label}</span>
            </button>
          ))}
        </div>

        {/* Converter Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#f8f9fa] flex flex-col items-center">
          {/* File Upload Box */}
          <div className="w-full max-w-2xl bg-white border border-black rounded-[28px] p-6 text-center mb-6">
            <input
              ref={fileInputRef}
              type="file"
              multiple={conversionType === 'img-to-pdf'}
              accept={
                conversionType === 'docx-to-pdf'
                  ? '.docx'
                  : conversionType === 'img-to-pdf'
                  ? 'image/*'
                  : '.pdf'
              }
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#dceeff] border border-black flex items-center justify-center">
              <Upload className="w-6 h-6 text-black" />
            </div>

            <h4 className="font-display font-bold text-lg text-black mb-1">
              {conversionType === 'img-to-pdf'
                ? 'เลือกรูปภาพที่ต้องการนำมารวมเป็นเล่ม PDF'
                : conversionType === 'docx-to-pdf'
                ? 'เลือกไฟล์ Word (.docx)'
                : 'เลือกไฟล์ PDF ที่ต้องการแปลง'}
            </h4>
            <p className="text-xs text-gray-500 mb-4">
              {conversionType === 'img-to-pdf'
                ? 'สามารถเลือกพร้อมกันได้หลายรูป (JPG, PNG, WEBP)'
                : 'ประมวลผลทันทีในเบราว์เซอร์ของคุณ ไม่จำกัดขนาดไฟล์'}
            </p>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="slush-pill bg-black text-white text-xs py-2.5 px-6 border border-black hover:bg-gray-800"
            >
              เลือกไฟล์จากเครื่อง
            </button>

            {/* If initialFile was already provided */}
            {initialFile?.buffer && conversionType === 'pdf-to-img' && convertedImages.length === 0 && (
              <button
                onClick={() => handlePdfToImages(initialFile.buffer!)}
                className="mt-3 block mx-auto text-xs font-bold text-[#4da2ff] hover:underline"
              >
                ใช้ไฟล์ปัจจุบัน: {initialFile.name} (คลิกเพื่อเริ่มแปลง)
              </button>
            )}
          </div>

          {/* Progress / Status */}
          {isConverting && (
            <div className="flex items-center gap-3 p-4 bg-white border border-black rounded-2xl mb-6">
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-black">{progressMsg}</span>
            </div>
          )}

          {/* Results Display */}
          {/* 1. PDF TO IMAGES */}
          {convertedImages.length > 0 && (
            <div className="w-full max-w-4xl bg-white border border-black rounded-[28px] p-6">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                <span className="font-display font-bold text-base text-black">
                  ผลลัพธ์การแปลง: ทั้งหมด {convertedImages.length} หน้า
                </span>
                <button
                  onClick={handleDownloadZip}
                  className="slush-pill bg-[#55db9c] text-black text-xs py-2 px-4 border border-black flex items-center gap-2 font-extrabold"
                >
                  <Archive className="w-4 h-4" />
                  <span>ดาวน์โหลดทุกหน้ารวมเป็น ZIP</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[360px] overflow-y-auto p-1">
                {convertedImages.map((imgUrl, idx) => (
                  <div
                    key={idx}
                    className="border border-black rounded-xl p-2 bg-gray-50 flex flex-col justify-between"
                  >
                    <img
                      src={imgUrl}
                      alt={`Page ${idx + 1}`}
                      className="max-h-36 mx-auto object-contain rounded mb-2 shadow-xs"
                    />
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200">
                      <span className="font-bold">หน้า #{idx + 1}</span>
                      <a
                        href={imgUrl}
                        download={`หน้า_${idx + 1}.png`}
                        className="text-[#4da2ff] font-bold hover:underline"
                      >
                        ดาวน์โหลด
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. IMAGES TO PDF */}
          {conversionType === 'img-to-pdf' && uploadedImages.length > 0 && (
            <div className="w-full max-w-3xl bg-white border border-black rounded-[28px] p-6 text-center">
              <span className="font-display font-bold text-base text-black block mb-3">
                รูปภาพที่เลือกไว้ ({uploadedImages.length} รูป):
              </span>
              <div className="grid grid-cols-4 gap-3 max-h-48 overflow-y-auto mb-4 p-1">
                {uploadedImages.map((uImg, idx) => (
                  <img
                    key={idx}
                    src={uImg}
                    alt={`Upload ${idx}`}
                    className="h-20 w-full object-cover rounded-lg border border-black"
                  />
                ))}
              </div>

              <button
                onClick={handleImagesToPdf}
                className="slush-pill bg-[#55db9c] text-black text-xs py-2.5 px-6 border border-black font-extrabold"
              >
                รวมรูปภาพเป็นเอกสาร PDF ทันที
              </button>
            </div>
          )}

          {/* 3. EXTRACTED TEXT (PDF to TXT or DOCX to text) */}
          {extractedText && (
            <div className="w-full max-w-3xl bg-white border border-black rounded-[28px] p-6">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                <span className="font-display font-bold text-base text-black">
                  ข้อความที่สกัดได้:
                </span>
                <button
                  onClick={() => {
                    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ข้อความสกัด_${Date.now()}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setExtractedText('');
                    if (onProjectComplete) {
                      onProjectComplete('📄 ดาวน์โหลดไฟล์ข้อความ .TXT เรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
                    }
                  }}
                  className="slush-pill bg-black text-white text-xs py-1.5 px-4 border border-black"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลด .TXT</span>
                </button>
              </div>

              <textarea
                readOnly
                value={extractedText}
                className="w-full h-64 p-3 bg-gray-50 border border-black rounded-xl font-mono text-xs text-black leading-relaxed"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
