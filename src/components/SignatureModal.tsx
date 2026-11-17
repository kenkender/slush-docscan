import React, { useState, useRef, useEffect } from 'react';
import {
  PenTool,
  Type,
  Upload,
  Stamp,
  Eraser,
  Check,
  X,
  Trash2,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  Sliders,
  RotateCw,
  Crop,
  Sparkles,
  Plus,
  Move,
  Maximize2,
  Copy
} from 'lucide-react';
import type { PlacedSignature, SavedSignature, TextAnnotation, ToolType } from '../types/document';
import { processSignatureImage } from '../utils/imageFilters';
import {
  renderPdfPageToCanvas,
  getPdfPageCount,
  exportPdfWithEdits,
  createPdfFromImages
} from '../utils/pdfHelper';
import { generateSampleInvoicePdf } from '../utils/demoFiles';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBuffer: ArrayBuffer | null;
  documentName: string;
  onSendToTool: (tool: ToolType, fileData: { buffer?: ArrayBuffer; dataUrl?: string; name: string }) => void;
  onProjectComplete?: (message: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  pdfBuffer,
  documentName,
  onSendToTool,
  onProjectComplete,
}) => {
  // Local document buffer & name (allows uploading PDF/images directly inside SignatureModal)
  const [localBuffer, setLocalBuffer] = useState<ArrayBuffer | null>(pdfBuffer);
  const [localDocName, setLocalDocName] = useState<string>(documentName || 'เอกสาร.pdf');

  // Tabs: 'create' | 'place'
  const [activeTab, setActiveTab] = useState<'create' | 'place'>('create');
  const [createMode, setCreateMode] = useState<'draw' | 'type' | 'upload' | 'stamp'>('draw');

  // Drawing canvas state
  const [inkColor, setInkColor] = useState('#0b3b95'); // Official navy blue ink
  const [penWidth, setPenWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);

  // Type signature state
  const [typedName, setTypedName] = useState('สมชาย ประเสริฐ');
  const [typedFont, setTypedFont] = useState('Dancing Script');

  // Signature Editor & Adjustment Studio state (for customizing uploaded or drawn signatures)
  const [rawEditingSigUrl, setRawEditingSigUrl] = useState<string | null>(null);
  const [editedPreviewUrl, setEditedPreviewUrl] = useState<string | null>(null);
  const [bgThreshold, setBgThreshold] = useState<number>(215);
  const [inkDarkness, setInkDarkness] = useState<number>(1.5);
  const [recolorMode, setRecolorMode] = useState<string>('original');
  const [sigRotation, setSigRotation] = useState<number>(0);
  const [autoTrimSig, setAutoTrimSig] = useState<boolean>(true);

  // Session-only signatures (never persisted in localStorage after project finishes)
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [activeSignatureUrl, setActiveSignatureUrl] = useState<string | null>(null);

  // Document Placement & Editor state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [placedSignatures, setPlacedSignatures] = useState<PlacedSignature[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<string | null>(null);

  // Document Text / Signer Info Annotations (similar to PDF Editor)
  const [pageAnnotations, setPageAnnotations] = useState<Record<number, TextAnnotation[]>>({});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [signerTextInput, setSignerTextInput] = useState('(นายสมชาย ประเสริฐ)');
  const [signerFontSize, setSignerFontSize] = useState(15);

  const [canvasDimensions, setCanvasDimensions] = useState({ width: 750, height: 1050 });
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Drag / Resize state for Placed Signatures & Annotations
  const [dragState, setDragState] = useState<{
    targetType: 'sig' | 'ann';
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const docUploadRef = useRef<HTMLInputElement>(null);
  const justDraggedRef = useRef(false);

  // Sync prop buffer
  useEffect(() => {
    setLocalBuffer(pdfBuffer);
    if (documentName) setLocalDocName(documentName);
  }, [pdfBuffer, documentName]);

  // Clear any legacy cached signatures from localStorage so old files never remain
  useEffect(() => {
    try {
      localStorage.removeItem('slush_saved_signatures');
    } catch {
      // ignore
    }
  }, []);

  // Re-run signature image adjustments whenever sliders/options change
  useEffect(() => {
    if (!rawEditingSigUrl) {
      setEditedPreviewUrl(null);
      return;
    }
    let cancelled = false;
    processSignatureImage(rawEditingSigUrl, {
      threshold: bgThreshold,
      darknessBoost: inkDarkness,
      recolorHex: recolorMode,
      rotation: sigRotation,
      autoTrim: autoTrimSig,
    }).then((resultUrl) => {
      if (!cancelled && resultUrl) {
        setEditedPreviewUrl(resultUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rawEditingSigUrl, bgThreshold, inkDarkness, recolorMode, sigRotation, autoTrimSig]);

  // Render PDF page for placing signatures
  useEffect(() => {
    if (!isOpen || !localBuffer || activeTab !== 'place') return;

    let isMounted = true;
    setIsLoadingPdf(true);

    const loadPage = async () => {
      try {
        const total = await getPdfPageCount(localBuffer);
        if (isMounted) setTotalPages(total);

        const { canvas, width, height } = await renderPdfPageToCanvas(localBuffer, currentPage, 1.4);
        if (!isMounted) return;

        setCanvasDimensions({ width, height });

        if (pdfCanvasRef.current) {
          pdfCanvasRef.current.width = width;
          pdfCanvasRef.current.height = height;
          const ctx = pdfCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(canvas, 0, 0);
          }
        }
      } catch (err) {
        console.error('Error rendering PDF for signature:', err);
      } finally {
        if (isMounted) setIsLoadingPdf(false);
      }
    };

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [isOpen, localBuffer, currentPage, activeTab]);

  // Pointer drag / resize handler for placed signatures & text annotations
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        justDraggedRef.current = true;
      }

      if (dragState.targetType === 'sig') {
        setPlacedSignatures((prev) =>
          prev.map((sig) => {
            if (sig.id !== dragState.id) return sig;
            if (dragState.mode === 'move') {
              return {
                ...sig,
                x: Math.max(0, Math.min(canvasDimensions.width - 30, Math.round(dragState.origX + dx))),
                y: Math.max(0, Math.min(canvasDimensions.height - 20, Math.round(dragState.origY + dy))),
              };
            } else {
              return {
                ...sig,
                width: Math.max(50, Math.min(canvasDimensions.width - sig.x, Math.round(dragState.origW + dx))),
                height: Math.max(25, Math.min(canvasDimensions.height - sig.y, Math.round(dragState.origH + dy))),
              };
            }
          })
        );
      } else {
        setPageAnnotations((prev) => {
          const list = prev[currentPage] || [];
          const updated = list.map((ann) => {
            if (ann.id !== dragState.id) return ann;
            if (dragState.mode === 'move') {
              return {
                ...ann,
                x: Math.max(0, Math.min(canvasDimensions.width - 30, Math.round(dragState.origX + dx))),
                y: Math.max(0, Math.min(canvasDimensions.height - 20, Math.round(dragState.origY + dy))),
              };
            } else {
              return {
                ...ann,
                width: Math.max(60, Math.min(canvasDimensions.width - ann.x, Math.round(dragState.origW + dx))),
                height: Math.max(24, Math.min(canvasDimensions.height - ann.y, Math.round(dragState.origH + dy))),
              };
            }
          });
          return { ...prev, [currentPage]: updated };
        });
      }
    };

    const handlePointerUp = () => {
      setDragState(null);
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 60);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, currentPage, canvasDimensions]);

  if (!isOpen) return null;

  const saveSignatureToState = (newSig: SavedSignature) => {
    setSavedSignatures((prev) => [newSig, ...prev]);
    setActiveSignatureUrl(newSig.dataUrl);
  };

  // --- UPLOAD DOCUMENT (PDF or Image) IN TAB 2 ---
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const buf = await file.arrayBuffer();
        setLocalBuffer(buf);
        setLocalDocName(file.name);
        setCurrentPage(1);
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) || '');
          reader.readAsDataURL(file);
        });
        const pdfBytes = await createPdfFromImages([dataUrl], 'A4');
        setLocalBuffer(pdfBytes.buffer.slice(0) as ArrayBuffer);
        setLocalDocName(file.name.replace(/\.[^.]+$/, '.pdf'));
        setCurrentPage(1);
      }
    } catch (err) {
      console.error('Error loading document into SignatureModal:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadSampleDoc = async () => {
    const sample = await generateSampleInvoicePdf();
    setLocalBuffer(sample.buffer);
    setLocalDocName(sample.name);
    setCurrentPage(1);
  };

  // --- DRAWING CANVAS LOGIC ---
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearDrawing = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const openDrawnInEditor = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setRawEditingSigUrl(dataUrl);
    setRecolorMode('original');
    setSigRotation(0);
    setCreateMode('upload'); // Opens the full Signature Adjustment Studio
  };

  const saveDrawnSignature = async () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rawUrl = canvas.toDataURL('image/png');
    const trimmedUrl = await processSignatureImage(rawUrl, {
      threshold: 240,
      darknessBoost: 1.2,
      recolorHex: 'original',
      autoTrim: true,
    });
    const newSig: SavedSignature = {
      id: Math.random().toString(36).substring(7),
      title: 'ลายเซ็นวาดมือ',
      dataUrl: trimmedUrl || rawUrl,
      type: 'drawn',
      createdAt: Date.now(),
    };
    saveSignatureToState(newSig);
    setActiveTab('place');
  };

  // --- TYPED SIGNATURE GENERATION ---
  const saveTypedSignature = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = `62px '${typedFont}', 'Sarabun', cursive, sans-serif`;
    ctx.fillStyle = inkColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);

    const dataUrl = canvas.toDataURL('image/png');
    const newSig: SavedSignature = {
      id: Math.random().toString(36).substring(7),
      title: `ลายเซ็นพิมพ์ (${typedName.slice(0, 12)})`,
      dataUrl,
      type: 'typed',
      createdAt: Date.now(),
    };
    saveSignatureToState(newSig);
    setActiveTab('place');
  };

  // --- UPLOAD SIGNATURE WITH INTERACTIVE ADJUSTMENT STUDIO ---
  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawUrl = ev.target?.result as string;
        setRawEditingSigUrl(rawUrl);
        setBgThreshold(215);
        setInkDarkness(1.55);
        setRecolorMode('original');
        setSigRotation(0);
        setAutoTrimSig(true);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleConfirmEditedSignature = () => {
    const finalUrl = editedPreviewUrl || rawEditingSigUrl;
    if (!finalUrl) return;
    const newSig: SavedSignature = {
      id: Math.random().toString(36).substring(7),
      title: 'ลายเซ็นปรับแต่งแล้ว',
      dataUrl: finalUrl,
      type: 'uploaded',
      createdAt: Date.now(),
    };
    saveSignatureToState(newSig);
    setActiveTab('place');
  };

  // --- GENERATE OFFICIAL STAMPS ---
  const generateOfficialStamp = (type: 'certified' | 'approved' | 'date') => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    if (type === 'certified') {
      canvas.width = 340;
      canvas.height = 135;
      ctx.strokeStyle = '#0b3b95';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.fillStyle = '#0b3b95';
      ctx.font = 'bold 21px "Sarabun", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('สำเนาถูกต้อง', canvas.width / 2, 38);

      ctx.font = '14px "Sarabun", sans-serif';
      ctx.fillText('(ลงชื่อ).................................................', canvas.width / 2, 76);
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
      ctx.fillText(`วันที่ ${dateStr}`, canvas.width / 2, 108);
    } else if (type === 'approved') {
      canvas.width = 290;
      canvas.height = 95;
      ctx.strokeStyle = '#0f8a5f';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.fillStyle = '#0f8a5f';
      ctx.font = 'bold 24px "Sarabun", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ อนุมัติ / APPROVED ★', canvas.width / 2, 44);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('SLUSH DOCUMENT VERIFIED', canvas.width / 2, 72);
    } else {
      canvas.width = 250;
      canvas.height = 64;
      ctx.strokeStyle = '#fb4903';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

      ctx.fillStyle = '#fb4903';
      ctx.font = 'bold 18px "Sarabun", sans-serif';
      ctx.textAlign = 'center';
      const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
      ctx.fillText(today, canvas.width / 2, 39);
    }

    const dataUrl = canvas.toDataURL('image/png');
    const newSig: SavedSignature = {
      id: Math.random().toString(36).substring(7),
      title: `ตรายาง (${type === 'certified' ? 'สำเนาถูกต้อง' : type === 'approved' ? 'อนุมัติ' : 'วันที่'})`,
      dataUrl,
      type: 'stamp',
      createdAt: Date.now(),
    };
    saveSignatureToState(newSig);
    setActiveTab('place');
  };

  // --- PLACING & EDITING SIGNATURE ON DOCUMENT ---
  const placeActiveSignatureAt = (x: number, y: number) => {
    if (!activeSignatureUrl) return;
    const newPlaced: PlacedSignature = {
      id: Math.random().toString(36).substring(7),
      signatureDataUrl: activeSignatureUrl,
      pageNumber: currentPage,
      x: Math.max(10, Math.min(canvasDimensions.width - 170, Math.round(x))),
      y: Math.max(10, Math.min(canvasDimensions.height - 90, Math.round(y))),
      width: 170,
      height: 85,
      rotation: 0,
    };
    setPlacedSignatures((prev) => [...prev, newPlaced]);
    setSelectedSigId(newPlaced.id);
    setSelectedAnnotationId(null);
  };

  const handleCanvasClickToPlace = (e: React.MouseEvent<HTMLDivElement>) => {
    if (justDraggedRef.current) return;
    if (!activeSignatureUrl || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 85;
    const y = e.clientY - rect.top - 42;
    placeActiveSignatureAt(x, y);
  };

  const updateSelectedSignature = (patch: Partial<PlacedSignature>) => {
    if (!selectedSigId) return;
    setPlacedSignatures((prev) =>
      prev.map((s) => (s.id === selectedSigId ? { ...s, ...patch } : s))
    );
  };

  const duplicateSelectedSignature = () => {
    const found = placedSignatures.find((s) => s.id === selectedSigId);
    if (!found) return;
    const copy: PlacedSignature = {
      ...found,
      id: Math.random().toString(36).substring(7),
      x: Math.min(canvasDimensions.width - found.width, found.x + 24),
      y: Math.min(canvasDimensions.height - found.height, found.y + 24),
    };
    setPlacedSignatures((prev) => [...prev, copy]);
    setSelectedSigId(copy.id);
  };

  const removePlacedSignature = (id: string) => {
    setPlacedSignatures((prev) => prev.filter((s) => s.id !== id));
    if (selectedSigId === id) setSelectedSigId(null);
  };

  // --- ADD TEXT / WHITEOUT ANNOTATION ON DOCUMENT (LIKE PDF EDITOR) ---
  const handleAddSignerTextBox = (textOverride?: string, isWhiteout = false) => {
    const textVal = isWhiteout ? '' : (textOverride ?? signerTextInput);
    const newAnn: TextAnnotation = {
      id: Math.random().toString(36).substring(7),
      x: Math.round(canvasDimensions.width * 0.52),
      y: Math.round(canvasDimensions.height * 0.72),
      width: isWhiteout ? 180 : Math.max(150, textVal.length * 10),
      height: isWhiteout ? 36 : 34,
      text: textVal,
      fontSize: signerFontSize,
      fontFamily: 'Sarabun',
      color: inkColor,
      backgroundColor: isWhiteout ? '#ffffff' : 'transparent',
      isWhiteout,
    };
    setPageAnnotations((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), newAnn],
    }));
    setSelectedAnnotationId(newAnn.id);
    setSelectedSigId(null);
  };

  const updateSelectedAnnotation = (patch: Partial<TextAnnotation>) => {
    if (!selectedAnnotationId) return;
    setPageAnnotations((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] || []).map((a) =>
        a.id === selectedAnnotationId ? { ...a, ...patch } : a
      ),
    }));
  };

  const removeAnnotation = (id: string) => {
    setPageAnnotations((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] || []).filter((a) => a.id !== id),
    }));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  };

  // Export finalized signed PDF
  const handleExportSignedPdf = async () => {
    if (!localBuffer) return;
    setIsSaving(true);
    try {
      const signedBytes = await exportPdfWithEdits(
        localBuffer,
        pageAnnotations,
        placedSignatures,
        canvasDimensions.width,
        canvasDimensions.height
      );

      const blob = new Blob([new Uint8Array(signedBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `เซ็นแล้ว_${localDocName || 'document.pdf'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setPlacedSignatures([]);
      setPageAnnotations({});
      setSavedSignatures([]);
      if (onProjectComplete) {
        onProjectComplete('✍️ บันทึกเอกสารพร้อมลายเซ็นเรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Error exporting signed PDF:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกเอกสาร');
    } finally {
      setIsSaving(false);
    }
  };

  // Print signed document directly
  const handlePrintSigned = async () => {
    if (!localBuffer) return;
    setIsSaving(true);
    try {
      const signedBytes = await exportPdfWithEdits(
        localBuffer,
        pageAnnotations,
        placedSignatures,
        canvasDimensions.width,
        canvasDimensions.height
      );
      onSendToTool('print', {
        buffer: signedBytes.buffer.slice(0) as ArrayBuffer,
        name: `พิมพ์_เซ็นแล้ว_${localDocName}`,
      });
    } catch (err) {
      console.error('Error sending signed PDF to print:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const currentSignatures = placedSignatures.filter((s) => s.pageNumber === currentPage);
  const currentAnnotations = pageAnnotations[currentPage] || [];
  const selectedSig = currentSignatures.find((s) => s.id === selectedSigId) || null;
  const selectedAnn = currentAnnotations.find((a) => a.id === selectedAnnotationId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden no-print">
      <input
        ref={docUploadRef}
        type="file"
        accept=".pdf,image/*"
        onChange={handleDocumentUpload}
        className="hidden"
      />

      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-black flex flex-wrap items-center justify-between gap-2 bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[#5c4ade] border border-black flex items-center justify-center shrink-0">
              <PenTool className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-base sm:text-lg text-black truncate">
                  สตูดิโอสร้าง ปรับแต่ง & วางลายเซ็นบนเอกสาร
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-[#55db9c] border border-black rounded-full hidden sm:inline-block shrink-0">
                  Pro Signature
                </span>
              </div>
              <p className="text-[11px] text-gray-600 truncate max-w-md hidden md:block">
                ตัดพื้นหลังขาว ปรับความเข้ม/สีหมึก หมุน ย่อ-ขยาย ลากวางลายเซ็นและพิมพ์ชื่อกำกับได้อิสระ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Tab Switcher */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-black text-xs font-bold">
              <button
                onClick={() => setActiveTab('create')}
                className={`px-2.5 py-1 rounded-full transition ${
                  activeTab === 'create' ? 'bg-black text-white' : 'hover:bg-gray-100'
                }`}
              >
                1. สร้าง/ปรับแต่ง
              </button>
              <button
                onClick={() => setActiveTab('place')}
                className={`px-2.5 py-1 rounded-full transition ${
                  activeTab === 'place' ? 'bg-[#5c4ade] text-white' : 'hover:bg-gray-100'
                }`}
              >
                2. วางบนเอกสาร ({placedSignatures.length + currentAnnotations.length})
              </button>
            </div>

            {activeTab === 'place' && localBuffer && (
              <>
                <button
                  onClick={() => docUploadRef.current?.click()}
                  className="slush-pill bg-white text-xs py-1.5 px-2.5 border border-black hidden xl:flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>เปลี่ยนไฟล์</span>
                </button>

                <button
                  disabled={isSaving}
                  onClick={handlePrintSigned}
                  className="slush-pill bg-white text-xs py-1.5 px-2.5 border border-black flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>สั่งพิมพ์</span>
                </button>

                <button
                  disabled={isSaving}
                  onClick={handleExportSignedPdf}
                  className="slush-pill bg-black text-white text-xs py-1.5 px-3 border border-black flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5 text-[#55db9c]" />
                  <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึก PDF'}</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white border border-black hover:bg-black hover:text-white flex items-center justify-center transition shrink-0"
              title="ปิดหน้าต่าง"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: Create & Customize Signature Studio */}
        {activeTab === 'create' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#f4f3ec]/40 flex flex-col items-center">
            {/* Mode selection buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
              <button
                onClick={() => setCreateMode('draw')}
                className={`slush-pill text-xs py-2 px-4 border ${
                  createMode === 'draw' ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
                }`}
              >
                <PenTool className="w-4 h-4" />
                <span>วาดลายเซ็นสด</span>
              </button>

              <button
                onClick={() => setCreateMode('upload')}
                className={`slush-pill text-xs py-2 px-4 border ${
                  createMode === 'upload' ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>อัปโหลด & ปรับแต่งรูปลายเซ็น</span>
              </button>

              <button
                onClick={() => setCreateMode('type')}
                className={`slush-pill text-xs py-2 px-4 border ${
                  createMode === 'type' ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
                }`}
              >
                <Type className="w-4 h-4" />
                <span>พิมพ์ชื่อเป็นฟอนต์</span>
              </button>

              <button
                onClick={() => setCreateMode('stamp')}
                className={`slush-pill text-xs py-2 px-4 border ${
                  createMode === 'stamp' ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
                }`}
              >
                <Stamp className="w-4 h-4" />
                <span>ตรายาง & สำเนาถูกต้อง</span>
              </button>
            </div>

            {/* Mode Content Box */}
            <div className="w-full max-w-3xl bg-white border border-black rounded-[28px] p-5 sm:p-6 shadow-sm">
              {/* DRAW MODE */}
              {createMode === 'draw' && (
                <div className="flex flex-col items-center">
                  <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                    {/* Ink Color picker */}
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700">สีหมึกปากกา:</span>
                      <div className="flex items-center gap-1.5">
                        {[
                          { color: '#0b3b95', label: 'น้ำเงินราชการ' },
                          { color: '#000000', label: 'ดำสนิท' },
                          { color: '#1a56db', label: 'ฟ้าสด' },
                          { color: '#d32f2f', label: 'แดง' },
                        ].map((c) => (
                          <button
                            key={c.color}
                            onClick={() => setInkColor(c.color)}
                            className={`px-2.5 py-1 rounded-full border border-black text-[11px] font-bold flex items-center gap-1.5 transition ${
                              inkColor === c.color ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-white/50"
                              style={{ backgroundColor: c.color }}
                            />
                            <span>{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pen Width */}
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-700">ความหนาเส้น:</span>
                      {[2, 3, 5, 7].map((w) => (
                        <button
                          key={w}
                          onClick={() => setPenWidth(w)}
                          className={`px-2.5 py-0.5 rounded-full border border-black text-xs font-bold ${
                            penWidth === w ? 'bg-black text-white' : 'bg-white'
                          }`}
                        >
                          {w}px
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Canvas Pad */}
                  <div className="w-full h-56 bg-gray-50 border-2 border-dashed border-black rounded-2xl relative overflow-hidden flex items-center justify-center cursor-crosshair">
                    <canvas
                      ref={drawCanvasRef}
                      width={640}
                      height={240}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="w-full h-full"
                    />
                    <span className="absolute bottom-2 text-[11px] text-gray-400 pointer-events-none">
                      เซ็นชื่อหรือลากเส้นลายมือในกรอบนี้ (ตัดขอบโปร่งใสอัตโนมัติ)
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 w-full">
                    <button
                      onClick={clearDrawing}
                      className="slush-pill bg-white text-xs py-2 px-3.5 border border-black hover:bg-gray-100 flex items-center gap-1.5"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      <span>ล้างกระดาน</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={openDrawnInEditor}
                        className="slush-pill bg-[#ffd731] text-black text-xs py-2 px-4 border border-black font-extrabold flex items-center gap-1.5"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>ปรับแต่งความเข้ม/สีหมึก</span>
                      </button>

                      <button
                        onClick={saveDrawnSignature}
                        className="slush-pill bg-[#5c4ade] text-white text-xs py-2 px-5 border border-black font-extrabold flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>นำไปวางบนเอกสาร</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* UPLOAD & SIGNATURE ADJUSTMENT STUDIO MODE */}
              {createMode === 'upload' && (
                <div>
                  <input
                    ref={fileUploadRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />

                  {!rawEditingSigUrl ? (
                    <div className="flex flex-col items-center text-center p-8 border-2 border-dashed border-black rounded-2xl bg-gray-50">
                      <div className="w-14 h-14 rounded-2xl bg-[#dceeff] border border-black flex items-center justify-center mb-3">
                        <Upload className="w-7 h-7 text-black" />
                      </div>
                      <h4 className="font-display font-black text-lg text-black mb-1">
                        อัปโหลดรูปถ่ายลายเซ็น เพื่อตัดพื้นหลังและปรับแต่งความคมชัด
                      </h4>
                      <p className="text-xs text-gray-600 mb-5 max-w-md">
                        สามารถปรับระดับการลบพื้นหลังกระดาษ เร่งความเข้มเส้นหมึก เปลี่ยนสีหมึก (น้ำเงิน/ดำ/แดง) หมุนภาพ และตัดขอบโปร่งใสได้เหมือนการแต่งเอกสาร
                      </p>
                      <button
                        onClick={() => fileUploadRef.current?.click()}
                        className="slush-pill bg-black text-white text-xs py-3 px-6 border border-black font-extrabold flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4 text-[#55db9c]" />
                        <span>เลือกรูปภาพลายเซ็นจากเครื่อง</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                      {/* Left: Live Transparent Signature Preview */}
                      <div className="md:col-span-7 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-extrabold text-black">
                            ตัวอย่างลายเซ็นหลังปรับแต่ง (พื้นหลังโปร่งใส):
                          </span>
                          <button
                            onClick={() => fileUploadRef.current?.click()}
                            className="text-xs font-bold text-[#5c4ade] hover:underline"
                          >
                            เปลี่ยนรูปใหม่
                          </button>
                        </div>

                        <div
                          className="h-56 border-2 border-black rounded-2xl p-4 flex items-center justify-center overflow-hidden relative"
                          style={{
                            backgroundImage:
                              'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                            backgroundSize: '16px 16px',
                            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                            backgroundColor: '#ffffff',
                          }}
                        >
                          {editedPreviewUrl && (
                            <img
                              src={editedPreviewUrl}
                              alt="Edited signature preview"
                              className="max-h-44 max-w-full object-contain drop-shadow-xs"
                            />
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSigRotation((r) => (r + 90) % 360)}
                              className="px-3 py-1.5 rounded-full bg-white border border-black text-xs font-bold hover:bg-gray-100 flex items-center gap-1"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>หมุน 90°</span>
                            </button>

                            <button
                              onClick={() => setAutoTrimSig((v) => !v)}
                              className={`px-3 py-1.5 rounded-full border border-black text-xs font-bold flex items-center gap-1 ${
                                autoTrimSig ? 'bg-[#55db9c] text-black' : 'bg-white text-gray-700'
                              }`}
                            >
                              <Crop className="w-3.5 h-3.5" />
                              <span>ตัดขอบอัตโนมัติ: {autoTrimSig ? 'เปิด' : 'ปิด'}</span>
                            </button>
                          </div>

                          {editedPreviewUrl && (
                            <a
                              href={editedPreviewUrl}
                              download="signature_transparent.png"
                              className="px-3 py-1.5 rounded-full bg-white border border-black text-xs font-bold hover:bg-gray-100 flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>ดาวน์โหลด PNG</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Right: Signature Adjustment Controls */}
                      <div className="md:col-span-5 bg-[#f4f3ec] border border-black rounded-2xl p-4 space-y-3.5">
                        <div className="flex items-center justify-between border-b border-black/15 pb-2">
                          <span className="font-display font-black text-sm text-black flex items-center gap-1.5">
                            <Sliders className="w-4 h-4 text-[#5c4ade]" />
                            <span>ปรับแต่งแก้ไขลายเซ็น</span>
                          </span>
                          <button
                            onClick={() => {
                              setBgThreshold(215);
                              setInkDarkness(1.5);
                              setRecolorMode('original');
                              setSigRotation(0);
                            }}
                            className="text-[11px] font-bold text-gray-600 hover:text-black underline"
                          >
                            รีเซ็ตค่า
                          </button>
                        </div>

                        {/* Background removal threshold */}
                        <div>
                          <div className="flex justify-between text-xs font-bold mb-1">
                            <span>ลบพื้นหลังกระดาษ (Threshold):</span>
                            <span className="px-1.5 py-0.2 bg-white border border-black rounded text-[11px]">
                              {bgThreshold}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={120}
                            max={248}
                            value={bgThreshold}
                            onChange={(e) => setBgThreshold(Number(e.target.value))}
                            className="w-full"
                          />
                        </div>

                        {/* Ink Darkness & Stroke Boost */}
                        <div>
                          <div className="flex justify-between text-xs font-bold mb-1">
                            <span>ความเข้มคมชัดเส้นหมึก:</span>
                            <span className="px-1.5 py-0.2 bg-white border border-black rounded text-[11px]">
                              {Math.round(inkDarkness * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.7}
                            max={2.8}
                            step={0.1}
                            value={inkDarkness}
                            onChange={(e) => setInkDarkness( parseFloat(e.target.value))}
                            className="w-full"
                          />
                        </div>

                        {/* Recolor Ink */}
                        <div>
                          <span className="block text-xs font-bold mb-1.5">
                            เปลี่ยนสีหมึกลายเซ็น:
                          </span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { id: 'original', label: 'สีหมึกเดิม', dot: '#6b7280' },
                              { id: '#0b3b95', label: 'น้ำเงินราชการ', dot: '#0b3b95' },
                              { id: '#000000', label: 'ดำสนิท', dot: '#000000' },
                              { id: '#d32f2f', label: 'หมึกแดง', dot: '#d32f2f' },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => setRecolorMode(opt.id)}
                                className={`px-2.5 py-1.5 rounded-xl border border-black text-xs font-bold flex items-center gap-1.5 ${
                                  recolorMode === opt.id
                                    ? 'bg-black text-white'
                                    : 'bg-white text-black hover:bg-gray-100'
                                }`}
                              >
                                <span
                                  className="w-3 h-3 rounded-full border border-white/50 shrink-0"
                                  style={{ backgroundColor: opt.dot }}
                                />
                                <span className="truncate">{opt.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={handleConfirmEditedSignature}
                          className="w-full slush-pill bg-[#5c4ade] text-white text-xs py-2.5 px-4 border border-black font-extrabold flex items-center justify-center gap-1.5 mt-2"
                        >
                          <Check className="w-4 h-4" />
                          <span>ใช้ลายเซ็นนี้วางบนเอกสาร</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TYPE MODE */}
              {createMode === 'type' && (
                <div className="flex flex-col items-center">
                  <div className="w-full mb-4">
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      พิมพ์ชื่อ-นามสกุล หรือข้อความลายเซ็น:
                    </label>
                    <input
                      type="text"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      className="w-full p-3 bg-[#f8f9fa] border border-black rounded-xl text-base font-semibold focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>

                  {/* Font choices */}
                  <div className="w-full space-y-2 mb-4">
                    <label className="block text-xs font-bold text-gray-700">
                      เลือกสไตล์ฟอนต์ลายเซ็น:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { font: 'Dancing Script', label: 'Dancing Script (พริ้วไหว)' },
                        { font: 'Caveat', label: 'Caveat (ลายมือธรรมชาติ)' },
                        { font: 'Alex Brush', label: 'Alex Brush (หรูหรา)' },
                        { font: 'Great Vibes', label: 'Great Vibes (คลาสสิก)' },
                      ].map((f) => (
                        <div
                          key={f.font}
                          onClick={() => setTypedFont(f.font)}
                          className={`p-3 border rounded-xl cursor-pointer transition flex flex-col justify-center items-center ${
                            typedFont === f.font
                              ? 'border-2 border-black bg-[#dceeff]'
                              : 'border-gray-200 hover:border-black'
                          }`}
                        >
                          <span
                            style={{ fontFamily: f.font, color: inkColor }}
                            className="text-2xl text-center truncate w-full"
                          >
                            {typedName || 'Signature'}
                          </span>
                          <span className="text-[10px] text-gray-500 font-bold mt-1">
                            {f.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={saveTypedSignature}
                    className="slush-pill bg-[#5c4ade] text-white text-xs py-2.5 px-5 border border-black font-extrabold flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>บันทึกและนำไปวางบนเอกสาร</span>
                  </button>
                </div>
              )}

              {/* STAMP MODE */}
              {createMode === 'stamp' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    onClick={() => generateOfficialStamp('certified')}
                    className="p-4 border-2 border-dashed border-[#0b3b95] rounded-2xl cursor-pointer hover:bg-blue-50 transition text-center"
                  >
                    <div className="border border-[#0b3b95] p-2 rounded mb-2">
                      <span className="font-bold text-sm text-[#0b3b95]">สำเนาถูกต้อง</span>
                      <div className="text-[10px] text-gray-500">ลงชื่อ / วันที่</div>
                    </div>
                    <span className="text-xs font-bold text-black">ตรายางสำเนาถูกต้อง</span>
                  </div>

                  <div
                    onClick={() => generateOfficialStamp('approved')}
                    className="p-4 border-2 border-dashed border-[#55db9c] rounded-2xl cursor-pointer hover:bg-green-50 transition text-center"
                  >
                    <div className="border border-[#55db9c] p-2 rounded mb-2">
                      <span className="font-bold text-sm text-green-700">★ อนุมัติ / APPROVED ★</span>
                    </div>
                    <span className="text-xs font-bold text-black">ตรายางอนุมัติ</span>
                  </div>

                  <div
                    onClick={() => generateOfficialStamp('date')}
                    className="p-4 border-2 border-dashed border-[#fb4903] rounded-2xl cursor-pointer hover:bg-orange-50 transition text-center"
                  >
                    <div className="border border-[#fb4903] p-2 rounded mb-2">
                      <span className="font-bold text-xs text-[#fb4903]">
                        {new Date().toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-black">ตรายางวันที่ปัจจุบัน</span>
                  </div>
                </div>
              )}
            </div>

            {/* Session Signatures List */}
            {savedSignatures.length > 0 && (
              <div className="w-full max-w-3xl mt-5">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-2">
                  ลายเซ็นในโปรเจคนี้ ({savedSignatures.length}):
                </span>
                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {savedSignatures.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setActiveSignatureUrl(s.dataUrl);
                        setActiveTab('place');
                      }}
                      className="p-2 border border-black bg-white rounded-xl cursor-pointer hover:scale-105 transition shrink-0 w-36 h-20 flex flex-col items-center justify-center relative"
                    >
                      <img src={s.dataUrl} alt={s.title} className="max-h-12 object-contain" />
                      <span className="text-[10px] text-gray-500 font-bold truncate w-full text-center mt-1">
                        {s.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Tab 2: Place & Edit Signature on Document (Full Document Editor Controls) */
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 bg-[#f4f3ec]/40">
            {/* Left Sidebar: Active Signature, Inspector Controls, and Signer Text Tools */}
            <div className="lg:col-span-4 bg-white border border-black rounded-[24px] p-4 flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                {/* 1. Active Signature Card */}
                <div className="p-3 bg-[#dceeff]/60 border border-black rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-black text-xs text-black">
                      ลายเซ็นที่เลือกใช้งาน:
                    </span>
                    <button
                      onClick={() => setActiveTab('create')}
                      className="text-[11px] font-extrabold text-[#5c4ade] hover:underline"
                    >
                      + สร้าง/ปรับแต่งลายเซ็น
                    </button>
                  </div>

                  {activeSignatureUrl ? (
                    <div className="bg-white border border-black rounded-xl p-2.5 text-center">
                      <img
                        src={activeSignatureUrl}
                        alt="Active signature"
                        className="max-h-14 mx-auto object-contain"
                      />
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <button
                          disabled={!localBuffer}
                          onClick={() =>
                            placeActiveSignatureAt(
                              canvasDimensions.width * 0.55,
                              canvasDimensions.height * 0.65
                            )
                          }
                          className="slush-pill bg-[#5c4ade] text-white text-[11px] py-1.5 px-3 border border-black font-extrabold flex items-center gap-1 disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>วางลายเซ็นลงหน้านี้</span>
                        </button>
                        <button
                          onClick={() => {
                            setRawEditingSigUrl(activeSignatureUrl);
                            setCreateMode('upload');
                            setActiveTab('create');
                          }}
                          className="slush-pill bg-[#ffd731] text-black text-[11px] py-1.5 px-3 border border-black font-extrabold flex items-center gap-1"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>แก้ไขลายเซ็น</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-white border border-dashed border-black rounded-xl text-center">
                      <p className="text-xs text-gray-600 font-bold mb-2">
                        ยังไม่ได้เลือกลายเซ็น
                      </p>
                      <button
                        onClick={() => setActiveTab('create')}
                        className="slush-pill bg-black text-white text-xs py-1.5 px-4 border border-black"
                      >
                        ไปหน้าสร้างลายเซ็น
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Selected Placed Signature Inspector (Resize / Rotate / Move / Delete) */}
                {selectedSig && (
                  <div className="p-3.5 bg-[#ffd731]/25 border-2 border-black rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-display font-black text-xs text-black flex items-center gap-1">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>ปรับขนาด & หมุนลายเซ็นที่เลือก</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={duplicateSelectedSignature}
                          className="p-1 bg-white border border-black rounded-lg hover:bg-gray-100"
                          title="ทำซ้ำ"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removePlacedSignature(selectedSig.id)}
                          className="p-1 bg-[#fb4903] text-white border border-black rounded-lg"
                          title="ลบลายเซ็นนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-bold">
                        <span>ความกว้าง (Width):</span>
                        <span>{Math.round(selectedSig.width)} px</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={420}
                        value={selectedSig.width}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          const ratio = selectedSig.height / Math.max(1, selectedSig.width);
                          updateSelectedSignature({
                            width: w,
                            height: Math.max(30, Math.round(w * ratio)),
                          });
                        }}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-bold">
                        <span>หมุนเอียงองศา (Rotation):</span>
                        <span>{selectedSig.rotation}°</span>
                      </div>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        value={selectedSig.rotation}
                        onChange={(e) =>
                          updateSelectedSignature({ rotation: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                      <div className="flex items-center gap-1 mt-1">
                        {[-15, 0, 15, 90].map((deg) => (
                          <button
                            key={deg}
                            onClick={() => updateSelectedSignature({ rotation: deg })}
                            className="px-2 py-0.5 bg-white border border-black rounded-full text-[10px] font-bold hover:bg-black hover:text-white"
                          >
                            {deg}°
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Document Text & Whiteout Tools (เหมือนฟังก์ชันแก้ไขเอกสาร) */}
                <div className="p-3.5 bg-[#f4f3ec] border border-black rounded-2xl space-y-2.5">
                  <span className="font-display font-black text-xs text-black block">
                    เครื่องมือพิมพ์ชื่อกำกับ & แก้ไขเอกสาร:
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={signerTextInput}
                      onChange={(e) => setSignerTextInput(e.target.value)}
                      placeholder="พิมพ์ชื่อ-สกุล / ตำแหน่ง / วันที่..."
                      className="flex-1 px-2.5 py-1.5 bg-white border border-black rounded-xl text-xs font-bold"
                    />
                    <button
                      disabled={!localBuffer}
                      onClick={() => handleAddSignerTextBox()}
                      className="px-3 py-1.5 bg-black text-white rounded-xl text-xs font-extrabold border border-black shrink-0 disabled:opacity-40"
                    >
                      + เพิ่มข้อความ
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      disabled={!localBuffer}
                      onClick={() =>
                        handleAddSignerTextBox(
                          `วันที่ ${new Date().toLocaleDateString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}`
                        )
                      }
                      className="px-2.5 py-1 bg-white border border-black rounded-full text-[11px] font-bold hover:bg-gray-100 disabled:opacity-40"
                    >
                      + ใส่วันที่วันนี้
                    </button>
                    <button
                      disabled={!localBuffer}
                      onClick={() => handleAddSignerTextBox('สำเนาถูกต้อง')}
                      className="px-2.5 py-1 bg-white border border-black rounded-full text-[11px] font-bold hover:bg-gray-100 disabled:opacity-40"
                    >
                      + คำว่า &quot;สำเนาถูกต้อง&quot;
                    </button>
                    <button
                      disabled={!localBuffer}
                      onClick={() => handleAddSignerTextBox('', true)}
                      className="px-2.5 py-1 bg-white border border-black rounded-full text-[11px] font-bold hover:bg-gray-100 disabled:opacity-40"
                    >
                      + ลบคำผิด (Whiteout)
                    </button>
                  </div>

                  {/* Selected Text Annotation Inspector */}
                  {selectedAnn && (
                    <div className="pt-2 border-t border-black/15 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-[#5c4ade]">
                          แก้ไขกล่องข้อความที่เลือก:
                        </span>
                        <button
                          onClick={() => removeAnnotation(selectedAnn.id)}
                          className="text-[11px] font-bold text-[#fb4903] hover:underline"
                        >
                          ลบกล่องนี้
                        </button>
                      </div>
                      {!selectedAnn.isWhiteout && (
                        <>
                          <input
                            type="text"
                            value={selectedAnn.text}
                            onChange={(e) => updateSelectedAnnotation({ text: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-black rounded-lg text-xs font-bold"
                          />
                          <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                            <span>ขนาดอักษร: {selectedAnn.fontSize}px</span>
                            <input
                              type="range"
                              min={10}
                              max={36}
                              value={selectedAnn.fontSize}
                              onChange={(e) => {
                                const sz = Number(e.target.value);
                                setSignerFontSize(sz);
                                updateSelectedAnnotation({ fontSize: sz });
                              }}
                              className="w-28"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Nav / Page Switch */}
              <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 border border-black rounded-full disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span>
                    หน้า {currentPage}/{totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 border border-black rounded-full disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                  <Move className="w-3 h-3" />
                  <span>ลากย้าย / ดึงมุมย่อ-ขยายได้</span>
                </span>
              </div>
            </div>

            {/* Right: PDF Interactive Document Canvas */}
            <div className="lg:col-span-8 bg-[#555555]/20 border border-black rounded-[24px] p-4 flex items-center justify-center overflow-auto relative">
              {!localBuffer ? (
                <div className="bg-white border-2 border-black rounded-[28px] p-8 max-w-md w-full text-center shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-[#dceeff] border border-black flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-7 h-7 text-black" />
                  </div>
                  <h3 className="font-display font-black text-lg text-black mb-1">
                    เลือกเอกสารที่ต้องการเซ็นชื่อ
                  </h3>
                  <p className="text-xs text-gray-600 mb-5">
                    รองรับทั้งไฟล์ PDF และรูปภาพเอกสาร (.jpg, .png) เพื่อวางลายเซ็นและข้อความกำกับ
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                    <button
                      onClick={() => docUploadRef.current?.click()}
                      className="slush-pill bg-black text-white text-xs py-2.5 px-5 border border-black font-extrabold flex items-center justify-center gap-1.5"
                    >
                      <Upload className="w-4 h-4 text-[#55db9c]" />
                      <span>เลือกไฟล์เอกสาร</span>
                    </button>
                    <button
                      onClick={handleLoadSampleDoc}
                      className="slush-pill bg-[#ffd731] text-black text-xs py-2.5 px-5 border border-black font-extrabold flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>ทดลองด้วยเอกสารตัวอย่าง</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  ref={containerRef}
                  onClick={handleCanvasClickToPlace}
                  className="relative bg-white shadow-xl border border-black cursor-crosshair select-none"
                  style={{
                    width: canvasDimensions.width,
                    height: canvasDimensions.height,
                  }}
                >
                  {isLoadingPdf && (
                    <div className="absolute inset-0 z-30 bg-white/80 flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-3 border-black border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="text-xs font-extrabold text-black">กำลังเรนเดอร์เอกสาร...</span>
                    </div>
                  )}

                  <canvas ref={pdfCanvasRef} className="block pointer-events-none" />

                  {/* Render Placed Text / Whiteout Annotations on this page */}
                  {currentAnnotations.map((ann) => {
                    const isSelected = selectedAnnotationId === ann.id;
                    return (
                      <div
                        key={ann.id}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedAnnotationId(ann.id);
                          setSelectedSigId(null);
                          setDragState({
                            targetType: 'ann',
                            id: ann.id,
                            mode: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            origX: ann.x,
                            origY: ann.y,
                            origW: ann.width ?? 160,
                            origH: ann.height ?? 34,
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          left: ann.x,
                          top: ann.y,
                          width: ann.width ?? 160,
                          height: ann.height ?? 34,
                          backgroundColor: ann.isWhiteout ? '#ffffff' : ann.backgroundColor,
                          color: ann.color,
                          fontSize: `${ann.fontSize}px`,
                          fontFamily: ann.fontFamily,
                        }}
                        className={`absolute flex items-center px-1.5 cursor-move select-none ${
                          isSelected
                            ? 'ring-2 ring-[#5c4ade] border border-dashed border-black z-20'
                            : 'hover:ring-1 hover:ring-blue-400 z-10'
                        }`}
                      >
                        <span className="font-semibold leading-tight whitespace-nowrap pointer-events-none">
                          {ann.text}
                        </span>

                        {isSelected && (
                          <>
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAnnotation(ann.id);
                              }}
                              className="absolute -top-3 -right-3 w-5 h-5 bg-[#fb4903] text-white rounded-full flex items-center justify-center border border-black shadow z-30"
                              title="ลบ"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setDragState({
                                  targetType: 'ann',
                                  id: ann.id,
                                  mode: 'resize',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  origX: ann.x,
                                  origY: ann.y,
                                  origW: ann.width ?? 160,
                                  origH: ann.height ?? 34,
                                });
                              }}
                              className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#55db9c] border border-black rounded-full cursor-nwse-resize z-30"
                              title="ลากเพื่อปรับขนาด"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Render Placed Signatures on this page */}
                  {currentSignatures.map((sig) => {
                    const isSelected = selectedSigId === sig.id;
                    return (
                      <div
                        key={sig.id}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedSigId(sig.id);
                          setSelectedAnnotationId(null);
                          setDragState({
                            targetType: 'sig',
                            id: sig.id,
                            mode: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            origX: sig.x,
                            origY: sig.y,
                            origW: sig.width,
                            origH: sig.height,
                          });
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSigId(sig.id);
                          setSelectedAnnotationId(null);
                        }}
                        className={`absolute cursor-move select-none group ${
                          isSelected
                            ? 'border-2 border-dashed border-[#5c4ade] bg-blue-50/15 z-20'
                            : 'border border-transparent hover:border-blue-400 z-10'
                        }`}
                        style={{
                          left: sig.x,
                          top: sig.y,
                          width: sig.width,
                          height: sig.height,
                          transform: `rotate(${sig.rotation}deg)`,
                        }}
                      >
                        <img
                          src={sig.signatureDataUrl}
                          alt="Signature Stamp"
                          className="w-full h-full object-contain pointer-events-none"
                        />

                        {/* Controls on selected signature */}
                        {isSelected && (
                          <>
                            <div className="absolute -top-3 -right-3 flex items-center gap-1 z-30">
                              <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePlacedSignature(sig.id);
                                }}
                                className="w-5 h-5 bg-[#fb4903] text-white rounded-full flex items-center justify-center border border-black shadow"
                                title="ลบลายเซ็น"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            {/* Bottom-right corner resize handle */}
                            <div
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setDragState({
                                  targetType: 'sig',
                                  id: sig.id,
                                  mode: 'resize',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  origX: sig.x,
                                  origY: sig.y,
                                  origW: sig.width,
                                  origH: sig.height,
                                });
                              }}
                              className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#55db9c] border border-black rounded-full cursor-nwse-resize shadow z-30"
                              title="ดึงมุมเพื่อย่อ-ขยายขนาดลายเซ็น"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
