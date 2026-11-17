import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Copy,
  Check,
  Download,
  Printer,
  X,
  Volume2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Upload,
  Sparkles,
  AlertTriangle,
  Info,
  RefreshCw,
} from 'lucide-react';
import type { OcrResult, ToolType } from '../types/document';
import { performOcr, cleanThaiOcrText } from '../utils/ocrHelper';
import { renderPdfPageToCanvas, getPdfPageCount, extractPdfNativeText } from '../utils/pdfHelper';
import { generateSampleScannedImage } from '../utils/demoFiles';

interface OcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSource?: { buffer?: ArrayBuffer; dataUrl?: string; name: string } | null;
  onSendToTool?: (tool: ToolType, fileData: { buffer?: ArrayBuffer; dataUrl?: string; name: string }) => void;
  onProjectComplete?: (message: string) => void;
}

export const OcrModal: React.FC<OcrModalProps> = ({
  isOpen,
  onClose,
  initialSource,
  onProjectComplete,
}) => {
  const [localSource, setLocalSource] = useState<{
    buffer?: ArrayBuffer;
    dataUrl?: string;
    name: string;
  } | null>(initialSource || null);

  const [lang, setLang] = useState<'tha+eng' | 'eng' | 'tha'>('tha+eng');
  const [enhanceBg, setEnhanceBg] = useState<boolean>(true);
  const [forceImageOcr, setForceImageOcr] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [editableText, setEditableText] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number>(1);
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSource(initialSource || null);
    setPdfPage(1);
    setForceImageOcr(false);
  }, [initialSource]);

  useEffect(() => {
    if (!isOpen || !localSource) return;

    let isCancelled = false;

    const prepareAndRun = async () => {
      setIsProcessing(true);
      setProgressPercent(0.1);
      setProgressStatus('กำลังเตรียมเอกสาร...');

      let targetImage: string | HTMLCanvasElement = '';

      if (localSource.buffer) {
        try {
          const total = await getPdfPageCount(localSource.buffer);
          if (!isCancelled) setPdfTotalPages(total);

          const { canvas } = await renderPdfPageToCanvas(localSource.buffer, pdfPage, 2.2);
          targetImage = canvas;
          if (!isCancelled) setPreviewImage(canvas.toDataURL('image/jpeg', 0.92));

          // 1. Try 100%-accurate native digital PDF text extraction first unless user forced image OCR
          if (!forceImageOcr) {
            setProgressStatus('กำลังตรวจสอบโครงสร้างข้อความดิจิทัลใน PDF...');
            const nativeRes = await extractPdfNativeText(localSource.buffer, pdfPage);
            if (!isCancelled && nativeRes.text.trim().length > 12) {
              const cleaned = cleanThaiOcrText(nativeRes.text);
              const wordsCount = cleaned ? cleaned.split(/\s+/).length : 0;
              setOcrResult({
                text: cleaned,
                confidence: 99,
                lines: nativeRes.lines.map((l) => ({ ...l, confidence: 99 })),
                wordsCount,
                charactersCount: cleaned.length,
                unclearLinesCount: 0,
                isLowQualityWarning: false,
                qualityAdvisory:
                  'ดึงข้อความจากโครงสร้างไฟล์ PDF ดิจิทัลโดยตรง (ความแม่นยำสูงสุด 99%)',
                sourceMethod: 'pdf-native',
              });
              setEditableText(cleaned);
              setIsProcessing(false);
              return;
            }
          }
        } catch (err) {
          console.error('Error rendering PDF for OCR:', err);
        }
      } else if (localSource.dataUrl) {
        targetImage = localSource.dataUrl;
        setPreviewImage(localSource.dataUrl);
      }

      if (targetImage && !isCancelled) {
        try {
          const res = await performOcr(
            targetImage,
            lang,
            (status, progress) => {
              if (!isCancelled) {
                setProgressStatus(status);
                setProgressPercent(progress);
              }
            },
            enhanceBg
          );
          if (!isCancelled) {
            setOcrResult(res);
            setEditableText(res.text);
          }
        } catch (err) {
          console.error('OCR Error:', err);
          if (!isCancelled) setProgressStatus('เกิดข้อผิดพลาดในการประมวลผล OCR');
        } finally {
          if (!isCancelled) setIsProcessing(false);
        }
      } else {
        if (!isCancelled) setIsProcessing(false);
      }
    };

    prepareAndRun();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, localSource, lang, pdfPage, enhanceBg, forceImageOcr]);

  if (!isOpen) return null;

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setPdfPage(1);
    setForceImageOcr(false);

    if (file.name.toLowerCase().endsWith('.pdf')) {
      const buffer = await file.arrayBuffer();
      setLocalSource({ buffer, name: file.name });
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) {
          setLocalSource({ dataUrl, name: file.name });
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleLoadSampleReceipt = () => {
    const sampleUrl = generateSampleScannedImage();
    setLocalSource({ dataUrl: sampleUrl, name: 'ตัวอย่างใบเสร็จสแกน.jpg' });
  };

  const handleCopyText = async () => {
    if (!editableText) return;
    await navigator.clipboard.writeText(editableText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleDownloadTxt = () => {
    if (!editableText) return;
    const blob = new Blob([editableText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OCR_ข้อความ_${localSource?.name || 'document'}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (onProjectComplete) {
      onProjectComplete('📝 บันทึกไฟล์ข้อความ .TXT เรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
    }
  };

  const handleDownloadWord = () => {
    if (!editableText) return;
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>OCR Document</title></head>
      <body style="font-family: 'Sarabun', Arial, sans-serif; line-height: 1.6;">
        <h2>ข้อความที่สกัดจากเอกสาร: ${localSource?.name || 'สแกน'}</h2>
        <hr/>
        <p style="white-space: pre-wrap;">${editableText.replace(/\n/g, '<br/>')}</p>
      </body></html>
    `;
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OCR_ข้อความ_${localSource?.name || 'document'}.doc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (onProjectComplete) {
      onProjectComplete('📄 ส่งออกไฟล์ Word (.doc) เรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
    }
  };

  const handleSpeakText = () => {
    if (!editableText) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(editableText);
      utterance.lang = lang === 'eng' ? 'en-US' : 'th-TH';
      window.speechSynthesis.speak(utterance);
    }
  };

  const unclearLines = (ocrResult?.lines || []).filter((l) => (l.confidence ?? 100) < 72);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden no-print">
      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-black flex flex-wrap items-center justify-between gap-2 bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#ffd731] border border-black flex items-center justify-center">
              <Search className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-black text-lg sm:text-xl text-black">
                  AI OCR สกัดข้อความอัจฉริยะ & วิเคราะห์ความชัดเจน
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-[#55db9c] border border-black rounded-full">
                  Hybrid PDF Layer + Adaptive LSTM
                </span>
              </div>
              <p className="text-xs text-gray-600">
                ดึงข้อความตรงจาก PDF หรือสแกนด้วย AI พร้อมกรองสระซ้อนและแจ้งเตือนจุดที่ภาพไม่ชัดเจน
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={handleUploadFile}
              className="hidden"
            />
            {localSource && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="slush-pill bg-white text-black text-xs py-1.5 px-3 border border-black flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>เปลี่ยนไฟล์</span>
              </button>
            )}

            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-black text-xs font-bold">
              <button
                onClick={() => setLang('tha+eng')}
                className={`px-2.5 py-1 rounded-full ${
                  lang === 'tha+eng' ? 'bg-black text-white' : 'hover:bg-gray-100'
                }`}
              >
                ไทย + Eng
              </button>
              <button
                onClick={() => setLang('tha')}
                className={`px-2.5 py-1 rounded-full ${
                  lang === 'tha' ? 'bg-black text-white' : 'hover:bg-gray-100'
                }`}
              >
                ไทยล้วน
              </button>
              <button
                onClick={() => setLang('eng')}
                className={`px-2.5 py-1 rounded-full ${
                  lang === 'eng' ? 'bg-black text-white' : 'hover:bg-gray-100'
                }`}
              >
                English
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white border border-black hover:bg-black hover:text-white flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {!localSource ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-[#f4f3ec]/50">
            <div className="bg-white border-2 border-dashed border-black/40 rounded-[28px] p-8 max-w-xl w-full text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-[#ffd731] border border-black flex items-center justify-center mx-auto">
                <Search className="w-8 h-8 text-black" />
              </div>
              <div>
                <h3 className="font-display font-black text-xl sm:text-2xl text-black">
                  เลือกไฟล์เอกสารเพื่ออ่านข้อความด้วย AI OCR
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  รองรับทั้งไฟล์ PDF ดิจิทัล, PDF สแกน และรูปถ่ายเอกสาร (.JPG, .PNG, .WEBP)
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="slush-pill bg-[#55db9c] hover:bg-black hover:text-white text-black text-sm py-3 px-6 border border-black font-extrabold flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>เลือกไฟล์ PDF หรือรูปภาพจากเครื่อง</span>
                </button>
                <button
                  onClick={handleLoadSampleReceipt}
                  className="slush-pill bg-[#ffd731] hover:bg-[#ffe066] text-black text-xs sm:text-sm py-3 px-5 border border-black font-extrabold flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>ทดลองอ่านจากใบเสร็จตัวอย่าง</span>
                </button>
              </div>

              <div className="bg-[#dceeff]/60 border border-black rounded-2xl p-3.5 text-left text-xs space-y-1">
                <div className="font-extrabold text-black flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#4da2ff] shrink-0" />
                  <span>คำแนะนำชนิดไฟล์เพื่อให้ AI อ่านแม่นยำสูงสุด:</span>
                </div>
                <ul className="list-disc list-inside text-gray-700 space-y-0.5 text-[11px]">
                  <li>
                    <strong>ไฟล์ .PDF ต้นฉบับดิจิทัล:</strong> แม่นยำสูงสุด 100% (ดึงตัวอักษรโดยตรงไม่มีสระเพี้ยน)
                  </li>
                  <li>
                    <strong>ไฟล์ภาพ .PNG หรือ .JPG (ความละเอียด 300 DPI / กว้าง 1,500 px ขึ้นไป):</strong> ตัวหนังสือคมชัด ไม่เบลอ
                  </li>
                  <li>
                    <strong>เอกสารที่มีลวดลายพื้นหลัง (เช่น บัตรประชาชน/สมุดบัญชี):</strong> แนะนำให้ตัดขอบ (Crop) เฉพาะส่วนข้อความก่อนอ่าน
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 bg-[#f4f3ec]/40">
            {/* Left Column: Original Scanned Image Preview & Quality Advisor */}
            <div className="lg:col-span-5 bg-white border border-black rounded-[24px] p-4 flex flex-col justify-between min-h-0 overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2 shrink-0">
                <span className="font-display font-bold text-xs sm:text-sm text-black flex items-center gap-1.5 truncate">
                  <FileText className="w-4 h-4 text-[#4da2ff] shrink-0" />
                  <span className="truncate">{localSource.name}</span>
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setEnhanceBg((v) => !v)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border border-black ${
                      enhanceBg ? 'bg-[#55db9c] text-black' : 'bg-white text-gray-600'
                    }`}
                    title="ปรับภาพขาว-ดำและตัดลวดลายพื้นหลังอัตโนมัติก่อนส่งให้ AI อ่าน"
                  >
                    {enhanceBg ? '✓ ลบลายพื้นหลัง AI' : 'ภาพดิบ'}
                  </button>

                  {pdfTotalPages > 1 && (
                    <div className="flex items-center gap-1 text-xs font-bold">
                      <button
                        disabled={pdfPage <= 1}
                        onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                        className="p-1 border border-black rounded-full disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px]">
                        {pdfPage}/{pdfTotalPages}
                      </span>
                      <button
                        disabled={pdfPage >= pdfTotalPages}
                        onClick={() => setPdfPage((p) => Math.min(pdfTotalPages, p + 1))}
                        className="p-1 border border-black rounded-full disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-[160px] max-h-[310px] overflow-auto bg-gray-50 rounded-xl border border-gray-200 p-2 flex items-center justify-center">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Scanned original"
                    className="max-h-[285px] object-contain rounded"
                  />
                ) : (
                  <div className="text-xs text-gray-400">กำลังโหลดภาพเอกสาร...</div>
                )}
              </div>

              {/* Quality & File Type Advisory Box */}
              {ocrResult && (
                <div className="mt-2.5 space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-xs text-gray-700 bg-[#f4f3ec] px-3 py-1.5 rounded-xl border border-black">
                    <span>
                      ความแม่นยำ:{' '}
                      <strong
                        className={
                          ocrResult.confidence >= 80 ? 'text-green-700' : 'text-[#fb4903]'
                        }
                      >
                        {ocrResult.confidence}%
                      </strong>
                    </span>
                    <span>
                      จำนวนคำ: <strong className="text-black">{ocrResult.wordsCount}</strong>
                    </span>
                    <span>
                      ตัวอักษร: <strong className="text-black">{ocrResult.charactersCount}</strong>
                    </span>
                  </div>

                  {ocrResult.isLowQualityWarning ? (
                    <div className="p-2.5 bg-[#ffd731]/35 border border-black rounded-xl text-[11px] space-y-1">
                      <div className="font-extrabold text-[#fb4903] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>ข้อความบางจุดอาจไม่ชัดเจน — กรุณาตรวจสอบก่อนนำไปใช้</span>
                      </div>
                      <p className="text-gray-800 leading-snug">{ocrResult.qualityAdvisory}</p>
                    </div>
                  ) : (
                    <div className="p-2 bg-[#55db9c]/25 border border-black rounded-xl text-[11px] flex items-center justify-between gap-2">
                      <span className="font-bold text-black truncate">
                        ✓ {ocrResult.qualityAdvisory}
                      </span>
                      {ocrResult.sourceMethod === 'pdf-native' && (
                        <button
                          onClick={() => setForceImageOcr(true)}
                          className="px-2 py-0.5 bg-white border border-black rounded-full text-[10px] font-bold shrink-0 hover:bg-black hover:text-white flex items-center gap-1"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>สแกนจากภาพแทน</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Extracted Text Editor, Unclear Lines Inspector & Export */}
            <div className="lg:col-span-7 bg-white border border-black rounded-[24px] p-4 flex flex-col justify-between min-h-0 overflow-hidden">
              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-gray-100 mb-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyText}
                    disabled={!editableText}
                    className={`slush-pill text-xs py-2 px-4 border disabled:opacity-40 ${
                      isCopied
                        ? 'bg-[#55db9c] text-black border-black font-extrabold'
                        : 'bg-black text-white border-black'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4 text-black" />
                        <span>คัดลอกสำเร็จแล้ว!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-[#ffd731]" />
                        <span>คัดลอกข้อความทั้งหมด (Copy All)</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSpeakText}
                    disabled={!editableText}
                    className="slush-pill bg-white text-xs py-2 px-3 border border-black hover:bg-gray-100 disabled:opacity-40"
                    title="ฟังเสียงอ่านข้อความ"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>ฟังเสียง</span>
                  </button>
                </div>

                {/* Search in extracted text */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหาคำในข้อความ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 pr-3 py-1.5 bg-[#f4f3ec] border border-black rounded-full text-xs font-semibold focus:outline-none w-44"
                  />
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                </div>
              </div>

              {/* Unclear Lines Highlight Strip (when some lines have low confidence) */}
              {!isProcessing && unclearLines.length > 0 && (
                <div className="mb-2 p-2 bg-[#f4f3ec] border border-black rounded-xl shrink-0">
                  <div className="text-[10px] font-extrabold text-[#fb4903] mb-1">
                    🔍 บรรทัดที่ภาพต้นฉบับอาจไม่คมชัด ({unclearLines.length} จุด — แนะนำตรวจสอบตัวสะกดในช่องแก้ไขด้านล่าง):
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto">
                    {unclearLines.slice(0, 8).map((ul, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-white border border-black rounded-full text-[10px] font-semibold text-black truncate max-w-[240px]"
                        title={`ความชัดเจน ${ul.confidence}%`}
                      >
                        "{ul.text}" ({ul.confidence}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Text Area */}
              <div className="flex-1 min-h-[220px] relative overflow-hidden flex flex-col">
                {isProcessing ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 rounded-2xl border border-gray-200">
                    <div className="w-12 h-12 border-4 border-black border-t-[#ffd731] rounded-full animate-spin mb-4" />
                    <span className="font-display font-bold text-base text-black mb-1 text-center">
                      {progressStatus || 'กำลังวิเคราะห์ตัวอักษร OCR...'}
                    </span>
                    <div className="w-64 bg-gray-200 h-2.5 rounded-full overflow-hidden border border-black mt-2">
                      <div
                        className="bg-[#55db9c] h-full transition-all duration-300"
                        style={{ width: `${Math.round(progressPercent * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 mt-2">
                      ระบบกำลังตัดลวดลายพื้นหลังและกรองสระซ้อนภาษาไทยอัตโนมัติ
                    </span>
                  </div>
                ) : (
                  <textarea
                    value={editableText}
                    onChange={(e) => setEditableText(e.target.value)}
                    placeholder="ข้อความที่สกัดจาก OCR จะปรากฏที่นี่ คุณสามารถแก้ไข พิมพ์เพิ่มเติม หรือคัดลอกได้ทันที..."
                    className="flex-1 w-full p-3.5 bg-[#f8f9fa] border border-black rounded-2xl font-sans text-sm leading-relaxed text-black focus:outline-none focus:ring-2 focus:ring-black resize-none"
                  />
                )}
              </div>

              {/* Bottom Export Bar */}
              <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] font-semibold text-gray-500">
                  💡 แก้ไขข้อความในกล่องได้โดยตรงก่อนคัดลอกหรือบันทึกไฟล์
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={!editableText}
                    onClick={handleDownloadTxt}
                    className="slush-pill bg-white text-xs py-1.5 px-3 border border-black hover:bg-gray-100 disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>บันทึก .TXT</span>
                  </button>

                  <button
                    disabled={!editableText}
                    onClick={handleDownloadWord}
                    className="slush-pill bg-white text-xs py-1.5 px-3 border border-black hover:bg-gray-100 disabled:opacity-40"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>ส่งออก Word (.doc)</span>
                  </button>

                  <button
                    disabled={!editableText}
                    onClick={() => {
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html><head><title>พิมพ์ข้อความ OCR</title>
                          <style>body{font-family:'Sarabun',sans-serif;padding:30px;line-height:1.6;white-space:pre-wrap;}</style>
                          </head><body><h2>ข้อความจากเอกสารสแกน</h2><hr/><p>${editableText.replace(/</g, '&lt;')}</p></body></html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }
                    }}
                    className="slush-pill bg-black text-white text-xs py-1.5 px-3 border border-black hover:bg-gray-800 disabled:opacity-40"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>พิมพ์ข้อความ</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
