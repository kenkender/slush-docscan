import React, { useState, useRef, useEffect } from 'react';
import {
  FileEdit,
  Type,
  Highlighter,
  Square,
  Eraser,
  Download,
  Printer,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Trash2,
  Move,
  Bold,
  Italic,
  PenTool,
  Upload,
  Sparkles,
} from 'lucide-react';
import type { TextAnnotation, ToolType } from '../types/document';
import {
  renderPdfPageToCanvas,
  getPdfPageCount,
  exportPdfWithEdits,
  createPdfFromImages,
} from '../utils/pdfHelper';
import { generateSampleInvoicePdf } from '../utils/demoFiles';

interface PdfEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBuffer: ArrayBuffer | null;
  documentName: string;
  onSendToTool: (tool: ToolType, fileData: { buffer?: ArrayBuffer; dataUrl?: string; name: string }) => void;
  onProjectComplete?: (message: string) => void;
}

export const PdfEditorModal: React.FC<PdfEditorModalProps> = ({
  isOpen,
  onClose,
  pdfBuffer,
  documentName,
  onSendToTool,
  onProjectComplete,
}) => {
  const [localBuffer, setLocalBuffer] = useState<ArrayBuffer | null>(pdfBuffer);
  const [localName, setLocalName] = useState<string>(documentName || 'เอกสาร.pdf');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1.35);
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'whiteout' | 'highlight' | 'redact'>('select');

  const [annotations, setAnnotations] = useState<Record<number, TextAnnotation[]>>({});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  const [fontColor, setFontColor] = useState('#000000');
  const [fontSize, setFontSize] = useState(15);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);

  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 780, height: 1100 });
  const [detectedTextItems, setDetectedTextItems] = useState<
    Array<{ str: string; x: number; y: number; width: number; height: number }>
  >([]);

  // Drag / Resize state for annotations
  const [dragAnnState, setDragAnnState] = useState<{
    mode: 'move' | 'resize';
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalBuffer(pdfBuffer);
    if (documentName) setLocalName(documentName);
    setCurrentPage(1);
  }, [pdfBuffer, documentName]);

  // Load and render PDF page onto persistent canvasRef
  useEffect(() => {
    if (!isOpen || !localBuffer) return;

    let isMounted = true;
    setIsLoadingPage(true);

    const loadPage = async () => {
      try {
        const total = await getPdfPageCount(localBuffer);
        if (isMounted) setPageCount(total);

        const { canvas, width, height, textItems } = await renderPdfPageToCanvas(
          localBuffer,
          currentPage,
          scale
        );

        if (!isMounted) return;

        setCanvasDimensions({ width, height });
        setDetectedTextItems(textItems);

        if (canvasRef.current) {
          canvasRef.current.width = width;
          canvasRef.current.height = height;
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(canvas, 0, 0);
          }
        }
      } catch (err) {
        console.error('Error rendering PDF page in editor:', err);
      } finally {
        if (isMounted) setIsLoadingPage(false);
      }
    };

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [isOpen, localBuffer, currentPage, scale]);

  // Pointer drag/resize for annotations
  useEffect(() => {
    if (!dragAnnState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragAnnState.startClientX;
      const dy = e.clientY - dragAnnState.startClientY;

      setAnnotations((prev) => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).map((a) => {
          if (a.id !== dragAnnState.id) return a;
          if (dragAnnState.mode === 'move') {
            return {
              ...a,
              x: Math.max(0, Math.min(canvasDimensions.width - 30, dragAnnState.startX + dx)),
              y: Math.max(0, Math.min(canvasDimensions.height - 16, dragAnnState.startY + dy)),
            };
          } else {
            return {
              ...a,
              width: Math.max(40, dragAnnState.startW + dx),
              height: Math.max(18, dragAnnState.startH + dy),
            };
          }
        }),
      }));
    };

    const handlePointerUp = () => {
      setDragAnnState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragAnnState, currentPage, canvasDimensions]);

  if (!isOpen) return null;

  const currentAnnotations = annotations[currentPage] || [];
  const selectedAnnotation = currentAnnotations.find((a) => a.id === selectedAnnotationId) || null;

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setAnnotations({});
    setSelectedAnnotationId(null);
    setCurrentPage(1);

    if (file.name.toLowerCase().endsWith('.pdf')) {
      const buf = await file.arrayBuffer();
      setLocalBuffer(buf);
      setLocalName(file.name);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) {
          const pdfBytes = await createPdfFromImages([dataUrl], 'A4');
          setLocalBuffer(pdfBytes.buffer as ArrayBuffer);
          setLocalName(file.name.replace(/\.[^.]+$/, '') + '.pdf');
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleLoadSamplePdf = async () => {
    const sample = await generateSampleInvoicePdf();
    setAnnotations({});
    setSelectedAnnotationId(null);
    setCurrentPage(1);
    setLocalBuffer(sample.buffer);
    setLocalName(sample.name);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (activeTool === 'text') {
      const newAnn: TextAnnotation = {
        id: Math.random().toString(36).substring(7),
        x: clickX,
        y: clickY,
        text: 'พิมพ์ข้อความที่นี่',
        fontSize,
        fontFamily: 'Sarabun',
        color: fontColor,
        isBold,
        isItalic,
        backgroundColor: '#ffffff',
        width: 190,
        height: 30,
      };

      setAnnotations((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newAnn],
      }));
      setSelectedAnnotationId(newAnn.id);
      setActiveTool('select');
    } else if (activeTool === 'whiteout') {
      const newAnn: TextAnnotation = {
        id: Math.random().toString(36).substring(7),
        x: clickX - 50,
        y: clickY - 12,
        text: '',
        fontSize,
        fontFamily: 'Sarabun',
        color: '#000000',
        backgroundColor: '#ffffff',
        width: 150,
        height: 26,
      };
      setAnnotations((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newAnn],
      }));
      setSelectedAnnotationId(newAnn.id);
      setActiveTool('select');
    } else if (activeTool === 'highlight') {
      const newAnn: TextAnnotation = {
        id: Math.random().toString(36).substring(7),
        x: clickX - 60,
        y: clickY - 10,
        text: '',
        fontSize,
        fontFamily: 'Sarabun',
        color: '#000000',
        backgroundColor: 'rgba(255, 215, 49, 0.45)',
        width: 160,
        height: 24,
      };
      setAnnotations((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newAnn],
      }));
      setSelectedAnnotationId(newAnn.id);
      setActiveTool('select');
    } else if (activeTool === 'redact') {
      const newAnn: TextAnnotation = {
        id: Math.random().toString(36).substring(7),
        x: clickX - 60,
        y: clickY - 10,
        text: '',
        fontSize,
        fontFamily: 'Sarabun',
        color: '#ffffff',
        backgroundColor: '#000000',
        width: 160,
        height: 24,
      };
      setAnnotations((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newAnn],
      }));
      setSelectedAnnotationId(newAnn.id);
      setActiveTool('select');
    } else {
      setSelectedAnnotationId(null);
    }
  };

  const handleReplaceDetectedText = (
    item: { str: string; x: number; y: number; width: number; height: number },
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const newAnn: TextAnnotation = {
      id: Math.random().toString(36).substring(7),
      x: item.x - 2,
      y: item.y - 2,
      text: item.str,
      fontSize: Math.max(12, Math.round(item.height * 0.85)),
      fontFamily: 'Sarabun',
      color: fontColor,
      isBold,
      isItalic,
      backgroundColor: '#ffffff',
      width: Math.max(90, item.width + 14),
      height: Math.max(22, item.height + 6),
    };

    setAnnotations((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), newAnn],
    }));
    setSelectedAnnotationId(newAnn.id);
    setActiveTool('select');
  };

  const updateAnnotation = (id: string, updates: Partial<TextAnnotation>) => {
    setAnnotations((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] || []).map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] || []).filter((a) => a.id !== id),
    }));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  };

  const handleExportPdf = async () => {
    if (!localBuffer) return;
    try {
      const editedBytes = await exportPdfWithEdits(
        localBuffer,
        annotations,
        [],
        canvasDimensions.width,
        canvasDimensions.height
      );

      const blob = new Blob([new Uint8Array(editedBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `แก้ไข_${localName || 'document.pdf'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setAnnotations({});
      if (onProjectComplete) {
        onProjectComplete('✅ บันทึกไฟล์ PDF ที่แก้ไขเรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Error exporting edited PDF:', err);
      alert('ไม่สามารถส่งออก PDF ได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleSendToSign = async () => {
    if (!localBuffer) return;
    const editedBytes = await exportPdfWithEdits(
      localBuffer,
      annotations,
      [],
      canvasDimensions.width,
      canvasDimensions.height
    );
    onSendToTool('signature', {
      buffer: editedBytes.buffer as ArrayBuffer,
      name: `แก้ไข_${localName}`,
    });
  };

  const handleSendToPrint = async () => {
    if (!localBuffer) return;
    const editedBytes = await exportPdfWithEdits(
      localBuffer,
      annotations,
      [],
      canvasDimensions.width,
      canvasDimensions.height
    );
    onSendToTool('print', {
      buffer: editedBytes.buffer as ArrayBuffer,
      name: `พิมพ์_${localName}`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden no-print">
      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden">
        {/* Top Editor Header */}
        <div className="p-3 sm:p-4 border-b border-black flex flex-wrap items-center justify-between gap-2 bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4da2ff] border border-black flex items-center justify-center">
              <FileEdit className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-lg sm:text-xl text-black">
                  แก้ไขข้อความในเอกสาร PDF
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold bg-[#55db9c] border border-black rounded-full">
                  Whiteout & Replace (รองรับภาษาไทย + อังกฤษ)
                </span>
              </div>
              <p className="text-xs text-gray-600 truncate max-w-md">
                {localBuffer
                  ? `${localName} • คลิกคำเดิมในเอกสารเพื่อแก้ไข หรือกดเพิ่มข้อความใหม่`
                  : 'อัปโหลดไฟล์ PDF หรือรูปภาพเอกสารเพื่อเริ่มแก้ไขข้อความ'}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            onChange={handleUploadFile}
            className="hidden"
          />

          <div className="flex items-center gap-2 flex-wrap">
            {localBuffer && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="slush-pill bg-white text-black text-xs py-1.5 px-3 border border-black flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>เปลี่ยนไฟล์</span>
                </button>

                <button
                  onClick={handleSendToSign}
                  className="slush-pill bg-[#5c4ade] text-white text-xs py-1.5 px-3 border border-black hidden sm:flex items-center gap-1.5"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>ส่งไปเซ็นชื่อ</span>
                </button>

                <button
                  onClick={handleSendToPrint}
                  className="slush-pill bg-white text-xs py-1.5 px-3 border border-black hidden sm:flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>สั่งพิมพ์</span>
                </button>

                <button
                  onClick={handleExportPdf}
                  className="slush-pill bg-black text-white text-xs py-1.5 px-4 border border-black flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-[#55db9c]" />
                  <span>บันทึก PDF</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white border border-black hover:bg-black hover:text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!localBuffer ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-[#f4f3ec]/50">
            <div className="bg-white border-2 border-dashed border-black/40 rounded-[28px] p-8 max-w-xl w-full text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-[#4da2ff] border border-black flex items-center justify-center mx-auto">
                <FileEdit className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="font-display font-black text-xl sm:text-2xl text-black">
                  เลือกไฟล์ PDF เพื่อเริ่มแก้ไขข้อความ
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  คลิกคำเดิมใน PDF เพื่อลบและพิมพ์คำใหม่ทับได้ทันที รองรับฟอนต์ภาษาไทยและอังกฤษ
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
                  onClick={handleLoadSamplePdf}
                  className="slush-pill bg-[#ffd731] hover:bg-[#ffe066] text-black text-xs sm:text-sm py-3 px-5 border border-black font-extrabold flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>ทดลองใช้เอกสาร PDF ตัวอย่าง</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar Bar */}
            <div className="p-2 sm:p-2.5 bg-[#f4f3ec] border-b border-black flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Tool Modes */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setActiveTool('select')}
                  className={`slush-pill text-xs py-1.5 px-3 border ${
                    activeTool === 'select'
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black'
                  }`}
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>เลือก/ย้าย</span>
                </button>

                <button
                  onClick={() => setActiveTool('text')}
                  className={`slush-pill text-xs py-1.5 px-3 border ${
                    activeTool === 'text'
                      ? 'bg-[#4da2ff] text-white border-black'
                      : 'bg-white text-black border-black'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>เพิ่ม/พิมพ์ข้อความ</span>
                </button>

                <button
                  onClick={() => setActiveTool('whiteout')}
                  className={`slush-pill text-xs py-1.5 px-3 border ${
                    activeTool === 'whiteout'
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>ลบข้อความ (Whiteout)</span>
                </button>

                <button
                  onClick={() => setActiveTool('highlight')}
                  className={`slush-pill text-xs py-1.5 px-3 border ${
                    activeTool === 'highlight'
                      ? 'bg-[#ffd731] text-black border-black'
                      : 'bg-white text-black border-black'
                  }`}
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  <span>ไฮไลต์</span>
                </button>

                <button
                  onClick={() => setActiveTool('redact')}
                  className={`slush-pill text-xs py-1.5 px-3 border ${
                    activeTool === 'redact'
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>ปิดข้อความลับ (Redact)</span>
                </button>
              </div>

              {/* Text Style Controls (updates either selected annotation or defaults for next annotation) */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-black text-xs">
                  <span className="text-gray-500 font-bold">ขนาด:</span>
                  <input
                    type="number"
                    min="9"
                    max="72"
                    value={selectedAnnotation ? selectedAnnotation.fontSize : fontSize}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setFontSize(val);
                      if (selectedAnnotation) updateAnnotation(selectedAnnotation.id, { fontSize: val });
                    }}
                    className="w-12 text-center font-bold focus:outline-none"
                  />
                  <span>pt</span>
                </div>

                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-black text-xs">
                  <span className="text-gray-500 font-bold">สี:</span>
                  <input
                    type="color"
                    value={selectedAnnotation ? selectedAnnotation.color : fontColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFontColor(val);
                      if (selectedAnnotation) updateAnnotation(selectedAnnotation.id, { color: val });
                    }}
                    className="w-6 h-6 border-0 p-0 rounded cursor-pointer bg-transparent"
                  />
                </div>

                <button
                  onClick={() => {
                    const next = !(selectedAnnotation ? selectedAnnotation.isBold : isBold);
                    setIsBold(next);
                    if (selectedAnnotation) updateAnnotation(selectedAnnotation.id, { isBold: next });
                  }}
                  className={`p-1.5 rounded-full border border-black ${
                    (selectedAnnotation ? selectedAnnotation.isBold : isBold)
                      ? 'bg-black text-white'
                      : 'bg-white text-black'
                  }`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const next = !(selectedAnnotation ? selectedAnnotation.isItalic : isItalic);
                    setIsItalic(next);
                    if (selectedAnnotation) updateAnnotation(selectedAnnotation.id, { isItalic: next });
                  }}
                  className={`p-1.5 rounded-full border border-black ${
                    (selectedAnnotation ? selectedAnnotation.isItalic : isItalic)
                      ? 'bg-black text-white'
                      : 'bg-white text-black'
                  }`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Page Navigator & Zoom */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-black text-xs font-bold">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="disabled:opacity-30 p-0.5 hover:bg-gray-100 rounded"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>
                    หน้า {currentPage} / {pageCount}
                  </span>
                  <button
                    disabled={currentPage >= pageCount}
                    onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                    className="disabled:opacity-30 p-0.5 hover:bg-gray-100 rounded"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-white px-1.5 py-1 rounded-full border border-black">
                  <button
                    onClick={() => setScale((s) => Math.max(0.8, s - 0.2))}
                    className="p-0.5 hover:bg-gray-100 rounded"
                    title="ย่อ"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold px-1">{Math.round(scale * 100)}%</span>
                  <button
                    onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
                    className="p-0.5 hover:bg-gray-100 rounded"
                    title="ขยาย"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Editor Main Canvas Area (canvasRef stays mounted so drawing never misses!) */}
            <div className="flex-1 overflow-auto bg-[#555555]/20 p-4 flex items-start justify-center relative">
              {isLoadingPage && (
                <div className="absolute inset-0 z-30 bg-white/75 flex flex-col items-center justify-center gap-2 text-black font-bold">
                  <div className="w-8 h-8 border-3 border-black border-t-transparent rounded-full animate-spin"></div>
                  <span>กำลังเรนเดอร์หน้าเอกสาร...</span>
                </div>
              )}

              <div
                ref={containerRef}
                onClick={handleCanvasClick}
                className="relative bg-white border border-black cursor-crosshair select-none my-auto"
                style={{
                  width: canvasDimensions.width,
                  height: canvasDimensions.height,
                }}
              >
                <canvas ref={canvasRef} className="block pointer-events-none" />

                {/* Detected text clickable overlays */}
                {detectedTextItems.map((item, tIdx) => (
                  <div
                    key={`text-${tIdx}`}
                    onClick={(e) => handleReplaceDetectedText(item, e)}
                    title={`คลิกเพื่อแก้ไขคำว่า: "${item.str}"`}
                    className="absolute opacity-0 hover:opacity-100 bg-[#4da2ff]/30 border border-[#4da2ff] cursor-pointer transition-opacity rounded-xs flex items-center justify-center text-[10px] text-blue-900 font-bold z-10"
                    style={{
                      left: item.x,
                      top: item.y,
                      width: Math.max(20, item.width),
                      height: Math.max(16, item.height),
                    }}
                  />
                ))}

                {/* Placed Annotations & Whiteouts on this page */}
                {currentAnnotations.map((ann) => {
                  const isSelected = selectedAnnotationId === ann.id;
                  return (
                    <div
                      key={ann.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnnotationId(ann.id);
                      }}
                      className={`absolute z-20 group ${
                        isSelected ? 'ring-2 ring-[#4da2ff] outline outline-1 outline-dashed outline-black' : ''
                      }`}
                      style={{
                        left: ann.x,
                        top: ann.y,
                        width: ann.width ? `${ann.width}px` : 'auto',
                        height: ann.height ? `${ann.height}px` : 'auto',
                        backgroundColor: ann.backgroundColor || 'transparent',
                      }}
                    >
                      {/* Drag Handle Bar + Delete Button when selected */}
                      {isSelected && (
                        <>
                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setDragAnnState({
                                mode: 'move',
                                id: ann.id,
                                startClientX: e.clientX,
                                startClientY: e.clientY,
                                startX: ann.x,
                                startY: ann.y,
                                startW: ann.width || 160,
                                startH: ann.height || 26,
                              });
                            }}
                            className="absolute -top-5 left-0 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded cursor-move flex items-center gap-1 select-none"
                            title="ลากแถบนี้เพื่อย้ายตำแหน่ง"
                          >
                            <Move className="w-2.5 h-2.5 text-[#55db9c]" />
                            <span>ลากย้าย</span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAnnotation(ann.id);
                            }}
                            className="absolute -top-3 -right-3 w-5 h-5 bg-[#fb4903] text-white rounded-full flex items-center justify-center border border-black z-30"
                            title="ลบกล่องนี้"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>

                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setDragAnnState({
                                mode: 'resize',
                                id: ann.id,
                                startClientX: e.clientX,
                                startClientY: e.clientY,
                                startX: ann.x,
                                startY: ann.y,
                                startW: ann.width || 160,
                                startH: ann.height || 26,
                              });
                            }}
                            className="absolute -bottom-2 -right-2 w-3.5 h-3.5 bg-[#55db9c] border border-black rounded-xs cursor-nwse-resize z-30"
                            title="ลากเพื่อปรับขนาดกล่อง"
                          />
                        </>
                      )}

                      <input
                        type="text"
                        value={ann.text}
                        onChange={(e) => updateAnnotation(ann.id, { text: e.target.value })}
                        className="w-full h-full bg-transparent border-none focus:outline-none px-1.5 py-0.5 leading-none"
                        style={{
                          fontSize: `${ann.fontSize}px`,
                          color: ann.color,
                          fontWeight: ann.isBold ? 'bold' : 'normal',
                          fontStyle: ann.isItalic ? 'italic' : 'normal',
                        }}
                        placeholder={ann.backgroundColor === '#ffffff' ? 'พิมพ์ข้อความใหม่...' : ''}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Help Tip */}
            <div className="p-2.5 bg-white border-t border-black text-center text-xs font-semibold text-gray-700 flex flex-wrap items-center justify-center gap-4 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#4da2ff]"></span>
                <span>ชี้บนข้อความเดิมในเอกสารแล้วคลิกเพื่อลบและพิมพ์ทับทันที</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#55db9c]"></span>
                <span>กด 'เพิ่ม/พิมพ์ข้อความ' แล้วคลิกจุดที่ต้องการวาง ลากป้าย 'ลากย้าย' เพื่อขยับตำแหน่งได้อิสระ</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
