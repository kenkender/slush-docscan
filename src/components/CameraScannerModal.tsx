import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  RotateCw,
  Trash2,
  FileDown,
  Printer,
  X,
  Search,
  PenTool,
  Check,
  Sliders,
  Sparkles,
  Sun,
  Contrast,
  Eye,
  RotateCcw,
  Layers,
  Crop,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Move,
  Compass,
  Wand2,
  Upload
} from 'lucide-react';
import type {
  ScannedPage,
  ToolType,
  DocumentFilterType,
  ScanAdjustments,
  CropBox,
  PerspectiveQuad,
} from '../types/document';
import {
  processDocumentFilter,
  DEFAULT_SCAN_ADJUSTMENTS,
  cropImageDataUrl,
  warpPerspectiveDataUrl,
  detectDocumentCorners,
  detectSkewAngle,
  deskewImageDataUrl,
} from '../utils/imageFilters';
import { createPdfFromImages } from '../utils/pdfHelper';
import { generateSampleScannedImage } from '../utils/demoFiles';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToTool: (
    tool: ToolType,
    fileData: { buffer?: ArrayBuffer; dataUrl?: string; images?: string[]; name: string }
  ) => void;
  onProjectComplete?: (message: string) => void;
}

const FILTER_MODES: Array<{
  id: DocumentFilterType;
  label: string;
  sub: string;
  badgeColor: string;
}> = [
  {
    id: 'magic-color',
    label: 'Magic Color Pro',
    sub: 'สีสด ลบเงากระดาษอัตโนมัติ',
    badgeColor: '#55db9c',
  },
  {
    id: 'bw-adaptive',
    label: 'B&W ขาวดำไร้เงา',
    sub: 'Adaptive แยกตัวหนังสือแม้มีเงามืด',
    badgeColor: '#ffd731',
  },
  {
    id: 'bw-sharp',
    label: 'ขาวดำหมึกเข้ม',
    sub: 'ตัวอักษรและตรายางคมเข้มพิเศษ',
    badgeColor: '#e9ccff',
  },
  {
    id: 'lighten-color',
    label: 'สีสว่างคลีน',
    sub: 'ปรับพื้นขาวคงโทนสีธรรมชาติ',
    badgeColor: '#4da2ff',
  },
  {
    id: 'grayscale-pro',
    label: 'เทาไร้เงา',
    sub: 'โทนเทาเรียบเนียน ประหยัดหมึก',
    badgeColor: '#cccccc',
  },
  {
    id: 'original',
    label: 'สีต้นฉบับ',
    sub: 'ภาพถ่ายจริงจากกล้อง',
    badgeColor: '#ffffff',
  },
];

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onSendToTool,
  onProjectComplete,
}) => {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isComparingOriginal, setIsComparingOriginal] = useState(false);
  const [isProcessingFilter, setIsProcessingFilter] = useState(false);

  // Big Viewport & Zoom / Pan states
  const [isExpandedView, setIsExpandedView] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Crop State
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState<CropBox>({ x: 5, y: 5, width: 90, height: 90 });
  const [cropActiveHandle, setCropActiveHandle] = useState<string | null>(null);
  const cropStartRef = useRef<{ clientX: number; clientY: number; box: CropBox }>({
    clientX: 0,
    clientY: 0,
    box: { x: 5, y: 5, width: 90, height: 90 },
  });

  // Straighten / Perspective Balance State ("ปรับสมดุลภาพตรงเหมือนเครื่องถ่ายเอกสาร")
  const [isStraightening, setIsStraightening] = useState(false);
  const [straightenMode, setStraightenMode] = useState<'perspective' | 'deskew'>('perspective');
  const [perspectiveQuad, setPerspectiveQuad] = useState<PerspectiveQuad>({
    tl: { x: 4, y: 4 },
    tr: { x: 96, y: 4 },
    br: { x: 96, y: 96 },
    bl: { x: 4, y: 96 },
  });
  const [perspectiveAspect, setPerspectiveAspect] = useState<'auto' | 'a4-portrait' | 'a4-landscape'>('auto');
  const [activeQuadCorner, setActiveQuadCorner] = useState<'tl' | 'tr' | 'br' | 'bl' | null>(null);
  const [fineRotation, setFineRotation] = useState<number>(0);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const cropOverlayRef = useRef<HTMLDivElement>(null);

  // Safe Page Accessor & Normalizer to guarantee no undefined property crashes
  const rawCurrentPage = pages[selectedPageIndex];
  const currentPage: ScannedPage | undefined = rawCurrentPage
    ? {
        ...rawCurrentPage,
        rawMasterUrl: rawCurrentPage.rawMasterUrl || rawCurrentPage.originalDataUrl || rawCurrentPage.dataUrl,
        originalDataUrl: rawCurrentPage.originalDataUrl || rawCurrentPage.dataUrl,
        filter: rawCurrentPage.filter || 'magic-color',
        rotation: rawCurrentPage.rotation || 0,
        cropBox: rawCurrentPage.cropBox || { x: 0, y: 0, width: 100, height: 100 },
        adjustments: {
          darkness: rawCurrentPage.adjustments?.darkness ?? DEFAULT_SCAN_ADJUSTMENTS.darkness,
          sharpness: rawCurrentPage.adjustments?.sharpness ?? DEFAULT_SCAN_ADJUSTMENTS.sharpness,
          shadowClean: rawCurrentPage.adjustments?.shadowClean ?? DEFAULT_SCAN_ADJUSTMENTS.shadowClean,
          contrast: rawCurrentPage.adjustments?.contrast ?? DEFAULT_SCAN_ADJUSTMENTS.contrast,
          brightness: rawCurrentPage.adjustments?.brightness ?? DEFAULT_SCAN_ADJUSTMENTS.brightness,
        },
      }
    : undefined;

  const currentAdjustments: ScanAdjustments = currentPage
    ? currentPage.adjustments
    : DEFAULT_SCAN_ADJUSTMENTS;

  // Start Camera safely
  const startCamera = async () => {
    try {
      setCameraError(null);
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError('เบราว์เซอร์นี้ไม่รองรับการเปิดกล้องโดยตรง (โปรดใช้วิธีอัปโหลดรูปภาพแทน)');
        setIsCameraActive(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('ไม่พบอุปกรณ์กล้อง หรือยังไม่ได้รับสิทธิ์เข้าถึงกล้อง (คุณสามารถอัปโหลดรูปภาพเพื่อใช้งานแทนได้ทันที)');
      setIsCameraActive(false);
    }
  };

  // Wire stream to video element when mounted
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive]);

  // Stop Camera safely
  const stopCamera = () => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {
        // ignore
      }
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Keep camera OFF until user explicitly clicks the camera option; cleanup on close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCameraError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Reset zoom, pan & overlays when switching pages
  useEffect(() => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    setIsCropping(false);
    setIsStraightening(false);
    setFineRotation(0);
  }, [selectedPageIndex]);

  // Core non-destructive re-render helper: ALWAYS processes from originalDataUrl!
  const applyPageProcessing = useCallback(
    (
      pageIndex: number,
      targetOriginalUrl: string,
      filter: DocumentFilterType,
      rotation: number,
      adjustments: ScanAdjustments
    ) => {
      setIsProcessingFilter(true);
      const img = new Image();
      img.onload = () => {
        const updatedUrl = processDocumentFilter(img, filter, rotation, adjustments);
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === pageIndex
              ? {
                  ...p,
                  rawMasterUrl: p.rawMasterUrl || targetOriginalUrl,
                  originalDataUrl: targetOriginalUrl,
                  filter,
                  rotation,
                  adjustments,
                  dataUrl: updatedUrl,
                }
              : p
          )
        );
        setIsProcessingFilter(false);
      };
      img.onerror = () => {
        setIsProcessingFilter(false);
      };
      img.src = targetOriginalUrl;
    },
    []
  );

  // Add a new raw image to pages list with default Magic Color Pro
  const addNewScannedPage = (rawUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const initialAdjustments: ScanAdjustments = { ...DEFAULT_SCAN_ADJUSTMENTS };
      const initialFilter: DocumentFilterType = 'magic-color';
      const processedUrl = processDocumentFilter(img, initialFilter, 0, initialAdjustments);

      const newPage: ScannedPage = {
        id: Math.random().toString(36).substring(2, 9),
        rawMasterUrl: rawUrl,     // Permanent untouched camera/upload original
        originalDataUrl: rawUrl,  // Current active base
        dataUrl: processedUrl,
        rotation: 0,
        filter: initialFilter,
        adjustments: initialAdjustments,
        cropBox: { x: 0, y: 0, width: 100, height: 100 },
        width: img.width,
        height: img.height,
      };

      setPages((prev) => {
        const updated = [...prev, newPage];
        setSelectedPageIndex(updated.length - 1);
        return updated;
      });
      setIsCameraActive(false);
      setCameraError(null);
    };
    img.src = rawUrl;
  };

  // Capture photo from video stream
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawUrl = canvas.toDataURL('image/jpeg', 0.96);
    addNewScannedPage(rawUrl);
  };

  // Shared loader for uploaded or dropped image files
  const processUploadedFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawUrl = ev.target?.result as string;
        if (rawUrl) {
          addNewScannedPage(rawUrl);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Upload photo from computer / mobile storage
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDropUpload = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(e.dataTransfer.files);
    }
  };

  // Load sample scanned document
  const handleLoadSample = () => {
    const sampleUrl = generateSampleScannedImage();
    addNewScannedPage(sampleUrl);
  };

  // Change Filter Mode of current page
  const handleSelectFilter = (filterType: DocumentFilterType) => {
    if (!currentPage) return;
    let nextAdjustments = { ...currentAdjustments };
    if (filterType === 'original') {
      nextAdjustments = {
        darkness: 0,
        sharpness: 0,
        shadowClean: 0,
        contrast: 0,
        brightness: 0,
      };
    } else if (currentPage.filter === 'original') {
      nextAdjustments = { ...DEFAULT_SCAN_ADJUSTMENTS };
    }
    applyPageProcessing(
      selectedPageIndex,
      currentPage.originalDataUrl,
      filterType,
      currentPage.rotation,
      nextAdjustments
    );
  };

  // Update a specific adjustment slider
  const handleAdjustmentChange = (key: keyof ScanAdjustments, value: number) => {
    if (!currentPage) return;
    const updatedAdjustments: ScanAdjustments = {
      ...currentAdjustments,
      [key]: value,
    };
    applyPageProcessing(
      selectedPageIndex,
      currentPage.originalDataUrl,
      currentPage.filter,
      currentPage.rotation,
      updatedAdjustments
    );
  };

  // Apply quick enhancement preset
  const handleApplyPreset = (preset: 'auto' | 'faded-ink' | 'heavy-shadow' | 'reset') => {
    if (!currentPage) return;
    let nextAdj: ScanAdjustments;
    let nextFilter: DocumentFilterType = currentPage.filter;

    if (preset === 'auto') {
      nextAdj = { darkness: 12, sharpness: 40, shadowClean: 85, contrast: 12, brightness: 0 };
      if (nextFilter === 'original') nextFilter = 'magic-color';
    } else if (preset === 'faded-ink') {
      nextAdj = { darkness: 38, sharpness: 65, shadowClean: 90, contrast: 25, brightness: -5 };
      if (nextFilter === 'original') nextFilter = 'bw-adaptive';
    } else if (preset === 'heavy-shadow') {
      nextAdj = { darkness: 8, sharpness: 45, shadowClean: 100, contrast: 15, brightness: 10 };
      if (nextFilter === 'original') nextFilter = 'bw-adaptive';
    } else {
      nextAdj =
        currentPage.filter === 'original'
          ? { darkness: 0, sharpness: 0, shadowClean: 0, contrast: 0, brightness: 0 }
          : { ...DEFAULT_SCAN_ADJUSTMENTS };
    }

    applyPageProcessing(
      selectedPageIndex,
      currentPage.originalDataUrl,
      nextFilter,
      currentPage.rotation,
      nextAdj
    );
  };

  // Apply current filter & adjustments to ALL pages in the document
  const handleApplyToAllPages = () => {
    if (!currentPage || pages.length <= 1) return;
    const targetFilter = currentPage.filter;
    const targetAdj = { ...currentAdjustments };

    pages.forEach((p, idx) => {
      if (idx !== selectedPageIndex) {
        const pOrig = p.originalDataUrl || p.dataUrl;
        applyPageProcessing(idx, pOrig, targetFilter, p.rotation || 0, targetAdj);
      }
    });
  };

  // Rotate Current Page 90 deg
  const handleRotate = () => {
    if (!currentPage) return;
    const nextRotation = ((currentPage.rotation || 0) + 90) % 360;
    applyPageProcessing(
      selectedPageIndex,
      currentPage.originalDataUrl,
      currentPage.filter,
      nextRotation,
      currentAdjustments
    );
  };

  // Delete Page
  const handleDeletePage = (index: number) => {
    const newPages = pages.filter((_, idx) => idx !== index);
    setPages(newPages);
    if (selectedPageIndex >= newPages.length) {
      setSelectedPageIndex(Math.max(0, newPages.length - 1));
    }
  };

  // --- CROP HANDLERS ---
  const handleStartCrop = () => {
    if (!currentPage) return;
    setIsStraightening(false);
    setCropBox(currentPage.cropBox || { x: 5, y: 5, width: 90, height: 90 });
    setIsCropping(true);
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleApplyCrop = async () => {
    if (!currentPage) return;
    setIsProcessingFilter(true);
    const masterSource = currentPage.rawMasterUrl || currentPage.originalDataUrl;
    const cropped = await cropImageDataUrl(masterSource, cropBox);

    const img = new Image();
    img.onload = () => {
      const updatedUrl = processDocumentFilter(
        img,
        currentPage.filter,
        currentPage.rotation,
        currentAdjustments
      );

      setPages((prev) =>
        prev.map((p, idx) =>
          idx === selectedPageIndex
            ? {
                ...p,
                rawMasterUrl: p.rawMasterUrl || masterSource,
                originalDataUrl: cropped.dataUrl,
                dataUrl: updatedUrl,
                cropBox: cropBox,
                width: cropped.width,
                height: cropped.height,
                adjustments: currentAdjustments,
              }
            : p
        )
      );
      setIsCropping(false);
      setIsProcessingFilter(false);
    };
    img.onerror = () => {
      setIsCropping(false);
      setIsProcessingFilter(false);
    };
    img.src = cropped.dataUrl;
  };

  const handleResetCropToFull = () => {
    if (!currentPage || !currentPage.rawMasterUrl) return;
    setIsProcessingFilter(true);
    const masterUrl = currentPage.rawMasterUrl;
    applyPageProcessing(
      selectedPageIndex,
      masterUrl,
      currentPage.filter,
      currentPage.rotation,
      currentAdjustments
    );
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === selectedPageIndex
          ? {
              ...p,
              originalDataUrl: masterUrl,
              cropBox: { x: 0, y: 0, width: 100, height: 100 },
            }
          : p
      )
    );
    setCropBox({ x: 5, y: 5, width: 90, height: 90 });
    setIsCropping(false);
  };

  // Crop preset aspect ratios
  const handleSetCropPreset = (type: 'a4' | 'free' | 'auto') => {
    if (type === 'auto') {
      setCropBox({ x: 4, y: 4, width: 92, height: 92 });
    } else if (type === 'a4') {
      setCropBox({ x: 10, y: 3, width: 80, height: 94 });
    } else {
      setCropBox({ x: 2, y: 2, width: 96, height: 96 });
    }
  };

  // Crop drag event listeners (supports mouse + mobile touch via Pointer Events)
  const startHandleDrag = (handle: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCropActiveHandle(handle);
    cropStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      box: { ...cropBox },
    };
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const targetEl = cropOverlayRef.current || imageContainerRef.current;
      if (!cropActiveHandle || !targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaX = ((e.clientX - cropStartRef.current.clientX) / rect.width) * 100;
      const deltaY = ((e.clientY - cropStartRef.current.clientY) / rect.height) * 100;

      const prev = cropStartRef.current.box;
      const next = { ...prev };

      if (cropActiveHandle === 'move') {
        next.x = Math.max(0, Math.min(100 - prev.width, prev.x + deltaX));
        next.y = Math.max(0, Math.min(100 - prev.height, prev.y + deltaY));
      } else if (cropActiveHandle === 'tl') {
        const newX = Math.max(0, Math.min(prev.x + prev.width - 10, prev.x + deltaX));
        const newY = Math.max(0, Math.min(prev.y + prev.height - 10, prev.y + deltaY));
        next.width = prev.width + (prev.x - newX);
        next.height = prev.height + (prev.y - newY);
        next.x = newX;
        next.y = newY;
      } else if (cropActiveHandle === 'tr') {
        const newY = Math.max(0, Math.min(prev.y + prev.height - 10, prev.y + deltaY));
        next.width = Math.max(10, Math.min(100 - prev.x, prev.width + deltaX));
        next.height = prev.height + (prev.y - newY);
        next.y = newY;
      } else if (cropActiveHandle === 'bl') {
        const newX = Math.max(0, Math.min(prev.x + prev.width - 10, prev.x + deltaX));
        next.width = prev.width + (prev.x - newX);
        next.height = Math.max(10, Math.min(100 - prev.y, prev.height + deltaY));
        next.x = newX;
      } else if (cropActiveHandle === 'br') {
        next.width = Math.max(10, Math.min(100 - prev.x, prev.width + deltaX));
        next.height = Math.max(10, Math.min(100 - prev.y, prev.height + deltaY));
      } else if (cropActiveHandle === 'top') {
        const newY = Math.max(0, Math.min(prev.y + prev.height - 10, prev.y + deltaY));
        next.height = prev.height + (prev.y - newY);
        next.y = newY;
      } else if (cropActiveHandle === 'bottom') {
        next.height = Math.max(10, Math.min(100 - prev.y, prev.height + deltaY));
      } else if (cropActiveHandle === 'left') {
        const newX = Math.max(0, Math.min(prev.x + prev.width - 10, prev.x + deltaX));
        next.width = prev.width + (prev.x - newX);
        next.x = newX;
      } else if (cropActiveHandle === 'right') {
        next.width = Math.max(10, Math.min(100 - prev.x, prev.width + deltaX));
      }

      setCropBox(next);
    };

    const handlePointerUp = () => {
      if (cropActiveHandle) {
        setCropActiveHandle(null);
      }
    };

    if (cropActiveHandle) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [cropActiveHandle]);

  // --- STRAIGHTEN / PERSPECTIVE BALANCE HANDLERS ---
  const handleStartStraighten = async () => {
    if (!currentPage) return;
    setIsCropping(false);
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    setStraightenMode('perspective');
    setFineRotation(0);
    setIsStraightening(true);

    if (currentPage.perspectiveQuad) {
      setPerspectiveQuad(currentPage.perspectiveQuad);
    } else {
      const masterSource = currentPage.rawMasterUrl || currentPage.originalDataUrl;
      setIsAutoDetecting(true);
      const detected = await detectDocumentCorners(masterSource);
      setPerspectiveQuad(detected);
      setIsAutoDetecting(false);
    }
  };

  const handleAutoDetectQuad = async () => {
    if (!currentPage) return;
    setIsAutoDetecting(true);
    const masterSource = currentPage.rawMasterUrl || currentPage.originalDataUrl;
    const detected = await detectDocumentCorners(masterSource);
    setPerspectiveQuad(detected);
    setIsAutoDetecting(false);
  };

  const handleResetQuadFull = () => {
    setPerspectiveQuad({
      tl: { x: 2, y: 2 },
      tr: { x: 98, y: 2 },
      br: { x: 98, y: 98 },
      bl: { x: 2, y: 98 },
    });
  };

  const handleAutoDeskew = async () => {
    if (!currentPage) return;
    setIsAutoDetecting(true);
    const angle = await detectSkewAngle(currentPage.dataUrl || currentPage.originalDataUrl);
    setFineRotation(angle);
    setIsAutoDetecting(false);
  };

  const startQuadCornerDrag = (corner: 'tl' | 'tr' | 'br' | 'bl', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveQuadCorner(corner);
  };

  useEffect(() => {
    const handleQuadMove = (e: PointerEvent) => {
      const targetEl = cropOverlayRef.current || imageContainerRef.current;
      if (!activeQuadCorner || !targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

      setPerspectiveQuad((prev) => ({
        ...prev,
        [activeQuadCorner]: { x, y },
      }));
    };

    const handleQuadUp = () => {
      if (activeQuadCorner) {
        setActiveQuadCorner(null);
      }
    };

    if (activeQuadCorner) {
      window.addEventListener('pointermove', handleQuadMove);
      window.addEventListener('pointerup', handleQuadUp);
      window.addEventListener('pointercancel', handleQuadUp);
    }
    return () => {
      window.removeEventListener('pointermove', handleQuadMove);
      window.removeEventListener('pointerup', handleQuadUp);
      window.removeEventListener('pointercancel', handleQuadUp);
    };
  }, [activeQuadCorner]);

  const handleApplyStraighten = async () => {
    if (!currentPage) return;
    setIsProcessingFilter(true);
    const masterSource = currentPage.rawMasterUrl || currentPage.originalDataUrl;

    try {
      let transformed: { dataUrl: string; width: number; height: number };

      if (straightenMode === 'perspective') {
        transformed = await warpPerspectiveDataUrl(masterSource, perspectiveQuad, perspectiveAspect);
      } else {
        if (Math.abs(fineRotation) < 0.1) {
          setIsStraightening(false);
          setIsProcessingFilter(false);
          return;
        }
        transformed = await deskewImageDataUrl(currentPage.originalDataUrl, fineRotation);
      }

      if (!transformed.dataUrl) {
        setIsProcessingFilter(false);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const updatedUrl = processDocumentFilter(
          img,
          currentPage.filter,
          currentPage.rotation,
          currentAdjustments
        );
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === selectedPageIndex
              ? {
                  ...p,
                  rawMasterUrl: p.rawMasterUrl || masterSource,
                  originalDataUrl: transformed.dataUrl,
                  dataUrl: updatedUrl,
                  perspectiveQuad: straightenMode === 'perspective' ? perspectiveQuad : p.perspectiveQuad,
                  fineRotation:
                    straightenMode === 'deskew' ? (p.fineRotation || 0) + fineRotation : 0,
                  cropBox:
                    straightenMode === 'perspective'
                      ? { x: 0, y: 0, width: 100, height: 100 }
                      : p.cropBox,
                  width: transformed.width,
                  height: transformed.height,
                  adjustments: currentAdjustments,
                }
              : p
          )
        );
        setFineRotation(0);
        setIsStraightening(false);
        setIsProcessingFilter(false);
      };
      img.onerror = () => {
        setIsProcessingFilter(false);
      };
      img.src = transformed.dataUrl;
    } catch (e) {
      console.error('Straighten failed:', e);
      setIsProcessingFilter(false);
    }
  };

  const handleResetStraightenToOriginal = () => {
    if (!currentPage || !currentPage.rawMasterUrl) return;
    const masterUrl = currentPage.rawMasterUrl;
    applyPageProcessing(
      selectedPageIndex,
      masterUrl,
      currentPage.filter,
      currentPage.rotation,
      currentAdjustments
    );
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === selectedPageIndex
          ? {
              ...p,
              originalDataUrl: masterUrl,
              perspectiveQuad: undefined,
              fineRotation: 0,
              cropBox: { x: 0, y: 0, width: 100, height: 100 },
            }
          : p
      )
    );
    setFineRotation(0);
    setIsStraightening(false);
  };

  // Pan / drag when zoomed in
  const handleMouseDownPan = (e: React.PointerEvent) => {
    if (zoomLevel <= 1.0 || isCropping || isStraightening) return;
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y,
    };
  };

  const handleMouseMovePan = (e: React.PointerEvent) => {
    if (!isPanning || zoomLevel <= 1.0) return;
    setPanOffset({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const handleMouseUpPan = () => {
    setIsPanning(false);
  };

  const resetScannerState = () => {
    stopCamera();
    setPages([]);
    setSelectedPageIndex(0);
    setIsCropping(false);
    setIsStraightening(false);
    setFineRotation(0);
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    setCameraError(null);
  };

  // Export all pages as PDF, then reset & start fresh new project
  const handleExportPdf = async () => {
    if (pages.length === 0) return;
    const images = pages.map((p) => p.dataUrl);
    const pdfBytes = await createPdfFromImages(images, 'A4');
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `เอกสารสแกน_${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    resetScannerState();
    if (onProjectComplete) {
      onProjectComplete('✅ บันทึกไฟล์ PDF เรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
    } else {
      onClose();
    }
  };

  // Send current scan to OCR, Signature, or Print tool cleanly (no trailing onClose overwrite!)
  const handleSendToOcr = () => {
    if (!currentPage) return;
    onSendToTool('ocr', {
      dataUrl: currentPage.dataUrl,
      name: `เอกสารสแกน_หน้าที่_${selectedPageIndex + 1}.jpg`,
    });
  };

  const handleSendToSign = async () => {
    if (pages.length === 0) return;
    const images = pages.map((p) => p.dataUrl);
    const pdfBytes = await createPdfFromImages(images, 'A4');
    onSendToTool('signature', {
      buffer: pdfBytes.buffer as ArrayBuffer,
      name: `เอกสารสแกน_สำหรับเซ็น_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  const handleDirectPrint = () => {
    if (!currentPage || pages.length === 0) return;
    const allImages = pages.map((p) => p.dataUrl);
    onSendToTool('print', {
      dataUrl: allImages[0],
      images: allImages,
      name: `พิมพ์เอกสารสแกน_${pages.length}_หน้า.pdf`,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-1 sm:p-3 overflow-hidden no-print">
      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-[98vw] h-[96vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="p-3 sm:p-4 border-b border-black flex items-center justify-between bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#55db9c] border border-black flex items-center justify-center">
              <Camera className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-lg sm:text-xl text-black">
                  สแกนเอกสารด้วยกล้อง & สตูดิโอปรับแต่งภาพ
                </h2>
                <span className="hidden sm:inline-block px-2.5 py-0.5 text-[10px] font-extrabold bg-[#ffd731] border border-black rounded-full">
                  Ultra-Wide Viewport & Crop Studio
                </span>
              </div>
              <p className="text-xs text-gray-600">
                รองรับการครอปตัดขอบกระดาษอิสระ ซูมส่องความคมชัด 100%-275% และลบเงามืดด้วย Adaptive AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Maximize / Normal Toggle */}
            <button
              onClick={() => setIsExpandedView(!isExpandedView)}
              className="slush-pill bg-white text-xs py-1.5 px-3 border border-black hidden md:flex items-center gap-1.5"
              title={isExpandedView ? 'แสดงแถบด้านข้าง' : 'ขยายภาพเอกสารขนาดใหญ่พิเศษ'}
            >
              {isExpandedView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isExpandedView ? 'ย่อมุมมอง' : 'ขยายจอใหญ่พิเศษ'}</span>
            </button>

            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="w-9 h-9 rounded-full bg-white border border-black hover:bg-black hover:text-white flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Sidebar (Tools & Scan Modes) | Center Canvas (Document Viewport) | Right Sidebar (Sliders, Pages & Export) */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid gap-3 p-3 sm:p-4 bg-[#f4f3ec]/50 ${
            isExpandedView
              ? 'grid-cols-1'
              : 'grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)_265px] xl:grid-cols-[270px_minmax(0,1fr)_305px]'
          }`}
        >
          {/* LEFT COLUMN: Image Manipulation Tools, Crop Controls & Scan Modes */}
          {!isExpandedView && (
            <div className="order-2 md:order-1 flex flex-col space-y-3 md:overflow-y-auto min-h-0 pr-0.5">
              {/* 1. Image Tools & Crop Card */}
              <div className="bg-white border border-black rounded-[24px] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="font-display font-bold text-xs sm:text-sm text-black flex items-center gap-1.5">
                    <Crop className="w-4 h-4 text-[#fb4903]" />
                    <span>เครื่องมือจัดการภาพ</span>
                  </span>
                  {currentPage && (
                    <span className="px-2 py-0.5 bg-black text-white rounded-full text-[10px] font-bold">
                      หน้า {selectedPageIndex + 1}/{pages.length}
                    </span>
                  )}
                </div>

                {currentPage ? (
                  <div className="space-y-2">
                    {/* Crop Toggle Button */}
                    <button
                      onClick={isCropping ? () => setIsCropping(false) : handleStartCrop}
                      className={`w-full slush-pill text-xs py-2 px-3 border flex items-center justify-center gap-1.5 font-bold ${
                        isCropping
                          ? 'bg-[#fb4903] text-white border-black ring-2 ring-black'
                          : 'bg-[#ffd731] text-black border-black hover:bg-black hover:text-white'
                      }`}
                      title="ตัดขอบกระดาษ / ครอปมุมเอกสาร"
                    >
                      <Crop className="w-3.5 h-3.5 shrink-0" />
                      <span>{isCropping ? 'ปิดโหมดตัดขอบ' : '✂️ ตัดขอบ (Crop)'}</span>
                    </button>

                    {/* Crop Mode Sub-Controls (inside Left Sidebar so center image stays huge!) */}
                    {isCropping && (
                      <div className="p-2.5 bg-[#e9ccff] border border-black rounded-2xl space-y-2">
                        <div className="text-[11px] font-extrabold text-black flex items-center gap-1">
                          <span>สัดส่วนตัดขอบ (ลากกรอบบนภาพ):</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          <button
                            onClick={() => handleSetCropPreset('auto')}
                            className="px-2.5 py-1 text-[11px] font-bold bg-white border border-black rounded-full hover:bg-black hover:text-white text-left"
                          >
                            อัตโนมัติ (ตัดขอบ 4%)
                          </button>
                          <button
                            onClick={() => handleSetCropPreset('a4')}
                            className="px-2.5 py-1 text-[11px] font-bold bg-white border border-black rounded-full hover:bg-black hover:text-white text-left"
                          >
                            สัดส่วนกระดาษ A4
                          </button>
                          <button
                            onClick={() => handleSetCropPreset('free')}
                            className="px-2.5 py-1 text-[11px] font-bold bg-white border border-black rounded-full hover:bg-black hover:text-white text-left"
                          >
                            เต็มแผ่น (Free)
                          </button>
                        </div>

                        <div className="pt-1.5 border-t border-black/20 flex flex-col gap-1.5">
                          <button
                            onClick={handleApplyCrop}
                            className="w-full slush-pill bg-[#55db9c] text-black font-extrabold text-xs py-1.5 px-3 border border-black flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>นำการตัดขอบไปใช้</span>
                          </button>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={handleResetCropToFull}
                              className="slush-pill bg-white text-[10px] py-1 px-2 border border-black hover:bg-gray-100 flex items-center justify-center gap-1"
                              title="คืนค่ารูปเต็มแผ่น"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>คืนเต็มแผ่น</span>
                            </button>
                            <button
                              onClick={() => setIsCropping(false)}
                              className="slush-pill bg-white text-[10px] py-1 px-2 border border-black flex items-center justify-center"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Straighten / Perspective Balance Toggle Button */}
                    <button
                      onClick={
                        isStraightening
                          ? () => {
                              setIsStraightening(false);
                              setFineRotation(0);
                            }
                          : handleStartStraighten
                      }
                      className={`w-full slush-pill text-xs py-2 px-3 border flex items-center justify-center gap-1.5 font-bold ${
                        isStraightening
                          ? 'bg-[#fb4903] text-white border-black ring-2 ring-black'
                          : 'bg-[#55db9c] text-black border-black hover:bg-black hover:text-white'
                      }`}
                      title="ดัดมุมเอกสารที่ถ่ายเบี้ยว/เอียงให้เป็นแผ่นตรงเหมือนเครื่องถ่ายเอกสาร"
                    >
                      <Compass className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isStraightening ? 'ปิดโหมดปรับภาพตรง' : '📐 ปรับสมดุลภาพตรง'}
                      </span>
                    </button>

                    {/* Straighten Mode Sub-Controls inside Left Sidebar */}
                    {isStraightening && (
                      <div className="p-2.5 bg-[#dceeff] border border-black rounded-2xl space-y-2">
                        {/* Mode Tabs: 4-Corner Perspective vs Fine Deskew Tilt */}
                        <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-full border border-black">
                          <button
                            onClick={() => {
                              setStraightenMode('perspective');
                              setFineRotation(0);
                            }}
                            className={`py-1 px-2 rounded-full text-[10px] font-extrabold transition ${
                              straightenMode === 'perspective'
                                ? 'bg-black text-white'
                                : 'text-black hover:bg-gray-100'
                            }`}
                          >
                            ดัด 4 มุมตรง
                          </button>
                          <button
                            onClick={() => setStraightenMode('deskew')}
                            className={`py-1 px-2 rounded-full text-[10px] font-extrabold transition ${
                              straightenMode === 'deskew'
                                ? 'bg-black text-white'
                                : 'text-black hover:bg-gray-100'
                            }`}
                          >
                            หมุนเอียงละเอียด
                          </button>
                        </div>

                        {straightenMode === 'perspective' ? (
                          <div className="space-y-2">
                            <div className="text-[10px] font-bold text-gray-700 leading-snug">
                              ลากจุดกลม 4 มุมบนภาพให้ตรงขอบกระดาษเพื่อดัดให้ตรงเหมือนเครื่องถ่ายเอกสาร
                            </div>

                            <div className="grid grid-cols-2 gap-1">
                              <button
                                onClick={handleAutoDetectQuad}
                                disabled={isAutoDetecting}
                                className="px-2 py-1 text-[10px] font-extrabold bg-[#ffd731] border border-black rounded-full hover:bg-black hover:text-white flex items-center justify-center gap-1 disabled:opacity-50"
                              >
                                <Wand2 className="w-3 h-3 shrink-0" />
                                <span>{isAutoDetecting ? 'กำลังหา...' : 'หามุมอัตโนมัติ'}</span>
                              </button>
                              <button
                                onClick={handleResetQuadFull}
                                className="px-2 py-1 text-[10px] font-bold bg-white border border-black rounded-full hover:bg-gray-100"
                              >
                                มุมเต็มแผ่น
                              </button>
                            </div>

                            {/* Aspect Ratio Output Choice */}
                            <div>
                              <div className="text-[10px] font-bold text-black mb-1">
                                สัดส่วนหลังดัดตรง:
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                {[
                                  { id: 'auto' as const, label: 'อัตโนมัติ' },
                                  { id: 'a4-portrait' as const, label: 'A4 ตั้ง' },
                                  { id: 'a4-landscape' as const, label: 'A4 นอน' },
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    onClick={() => setPerspectiveAspect(opt.id)}
                                    className={`py-1 px-1 text-[10px] font-bold rounded-full border border-black ${
                                      perspectiveAspect === opt.id
                                        ? 'bg-black text-white'
                                        : 'bg-white text-black hover:bg-gray-100'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-[10px] font-bold text-gray-700 leading-snug">
                              ปรับองศาเอียงเทียบกับเส้นตารางสีฟ้าหรือกดจัดแนวอัตโนมัติ
                            </div>

                            <button
                              onClick={handleAutoDeskew}
                              disabled={isAutoDetecting}
                              className="w-full px-2.5 py-1.5 text-[11px] font-extrabold bg-[#ffd731] border border-black rounded-full hover:bg-black hover:text-white flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <Wand2 className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {isAutoDetecting
                                  ? 'กำลังคำนวณแนวตัวอักษร...'
                                  : 'จัดแนวตรงอัตโนมัติ (Auto Deskew)'}
                              </span>
                            </button>

                            <div className="bg-white border border-black rounded-xl p-2 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-extrabold">
                                <span>องศาเอียง:</span>
                                <span className="px-1.5 py-0.5 bg-[#dceeff] border border-black rounded-full text-[10px]">
                                  {fineRotation > 0 ? `+${fineRotation}°` : `${fineRotation}°`}
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-25"
                                max="25"
                                step="0.5"
                                value={fineRotation}
                                onChange={(e) => setFineRotation(Number(e.target.value))}
                                className="w-full accent-black cursor-pointer h-2 bg-gray-200 rounded-lg"
                              />
                              <div className="flex items-center justify-between gap-1">
                                <button
                                  onClick={() => setFineRotation((r) => Math.max(-25, r - 0.5))}
                                  className="flex-1 py-0.5 text-[10px] font-bold bg-[#f4f3ec] border border-black rounded-full hover:bg-black hover:text-white"
                                >
                                  -0.5° ซ้าย
                                </button>
                                <button
                                  onClick={() => setFineRotation(0)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-white border border-black rounded-full hover:bg-gray-100"
                                >
                                  0°
                                </button>
                                <button
                                  onClick={() => setFineRotation((r) => Math.min(25, r + 0.5))}
                                  className="flex-1 py-0.5 text-[10px] font-bold bg-[#f4f3ec] border border-black rounded-full hover:bg-black hover:text-white"
                                >
                                  +0.5° ขวา
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="pt-1.5 border-t border-black/20 flex flex-col gap-1.5">
                          <button
                            onClick={handleApplyStraighten}
                            disabled={isProcessingFilter}
                            className="w-full slush-pill bg-[#55db9c] text-black font-extrabold text-xs py-1.5 px-3 border border-black flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>
                              {isProcessingFilter ? 'กำลังดัดภาพ...' : 'นำภาพตรงไปใช้'}
                            </span>
                          </button>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={handleResetStraightenToOriginal}
                              className="slush-pill bg-white text-[10px] py-1 px-2 border border-black hover:bg-gray-100 flex items-center justify-center gap-1"
                              title="คืนค่าภาพต้นฉบับเดิมก่อนดัด"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>คืนต้นฉบับแท้</span>
                            </button>
                            <button
                              onClick={() => {
                                setIsStraightening(false);
                                setFineRotation(0);
                              }}
                              className="slush-pill bg-white text-[10px] py-1 px-2 border border-black flex items-center justify-center"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Compare Original & Rotate 90 */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onMouseDown={() => setIsComparingOriginal(true)}
                        onMouseUp={() => setIsComparingOriginal(false)}
                        onMouseLeave={() => setIsComparingOriginal(false)}
                        onTouchStart={() => setIsComparingOriginal(true)}
                        onTouchEnd={() => setIsComparingOriginal(false)}
                        className="slush-pill bg-[#e9ccff] text-black text-[11px] py-1.5 px-2 border border-black flex items-center justify-center gap-1 select-none"
                        title="กดค้างเพื่อเปรียบเทียบกับภาพต้นฉบับจริงก่อนแต่ง"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <span>ดูต้นฉบับ</span>
                      </button>

                      <button
                        onClick={handleRotate}
                        className="slush-pill bg-white text-black text-[11px] py-1.5 px-2 border border-black hover:bg-gray-100 flex items-center justify-center gap-1"
                        title="หมุนภาพ 90 องศา"
                      >
                        <RotateCw className="w-3.5 h-3.5 shrink-0" />
                        <span>หมุน 90°</span>
                      </button>
                    </div>

                    {/* Zoom Controls */}
                    <div className="bg-[#f4f3ec] border border-black rounded-2xl p-2">
                      <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                        <span className="text-black flex items-center gap-1">
                          <ZoomIn className="w-3.5 h-3.5" />
                          ซูมส่องรายละเอียด
                        </span>
                        {zoomLevel > 1.0 && (
                          <button
                            onClick={() => {
                              setZoomLevel(1.0);
                              setPanOffset({ x: 0, y: 0 });
                            }}
                            className="text-[10px] font-extrabold text-[#fb4903] hover:underline"
                          >
                            รีเซ็ต
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 bg-white p-1 rounded-full border border-black">
                        <button
                          onClick={() => {
                            const next = Math.max(1.0, zoomLevel - 0.25);
                            setZoomLevel(next);
                            if (next === 1.0) setPanOffset({ x: 0, y: 0 });
                          }}
                          disabled={zoomLevel <= 1.0}
                          className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-30"
                          title="ย่อขนาด"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-extrabold px-2 text-center">
                          {zoomLevel === 1.0 ? 'พอดีจอ (100%)' : `${Math.round(zoomLevel * 100)}%`}
                        </span>
                        <button
                          onClick={() => setZoomLevel((z) => Math.min(2.75, z + 0.25))}
                          disabled={zoomLevel >= 2.75}
                          className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-30"
                          title="ซูมส่องตัวหนังสือขนาดใหญ่"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-gray-400">
                    ถ่ายภาพหรืออัปโหลดเอกสารเพื่อใช้งานเครื่องมือ
                  </div>
                )}
              </div>

              {/* 2. Scan Filter Modes Card */}
              <div className="bg-white border border-black rounded-[24px] p-3.5 flex-1">
                <div className="pb-2 mb-2 border-b border-gray-100">
                  <div className="font-display font-bold text-xs sm:text-sm text-black flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#4da2ff]" />
                    <span>โหมดสแกนเอกสารสากล</span>
                  </div>
                  {currentPage && (
                    <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                      ปัจจุบัน:{' '}
                      <span className="text-black font-extrabold">
                        {FILTER_MODES.find((m) => m.id === currentPage.filter)?.label || 'Magic Color Pro'}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className={`grid grid-cols-2 gap-1.5 ${
                    !currentPage ? 'opacity-40 pointer-events-none' : ''
                  }`}
                >
                  {FILTER_MODES.map((mode) => {
                    const active = currentPage?.filter === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => handleSelectFilter(mode.id)}
                        title={mode.sub}
                        className={`p-2 rounded-2xl border text-left transition flex flex-col justify-between min-h-[58px] ${
                          active
                            ? 'bg-black text-white border-black ring-2 ring-[#4da2ff]'
                            : 'bg-white text-black border-black hover:bg-[#dceeff]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span
                            className="w-3 h-3 rounded-full border border-black shrink-0"
                            style={{ backgroundColor: mode.badgeColor }}
                          />
                          {active && (
                            <Check className="w-3 h-3 text-[#55db9c] shrink-0" />
                          )}
                        </div>
                        <div>
                          <div className="text-[11px] font-extrabold leading-tight">
                            {mode.label}
                          </div>
                          <div
                            className={`text-[9px] leading-tight mt-0.5 ${
                              active ? 'text-gray-300' : 'text-gray-500'
                            }`}
                          >
                            {mode.sub}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* CENTER COLUMN: Pure Uncluttered Document Viewport */}
          <div className="order-1 md:order-2 flex flex-col bg-white border border-black rounded-[28px] p-2.5 sm:p-3 relative min-h-[360px] md:min-h-0 overflow-hidden">
            {isCameraActive ? (
              <div className="w-full h-full flex flex-col items-center justify-center relative min-h-[340px]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="max-h-[70vh] w-full object-contain rounded-2xl border border-black bg-black"
                />

                {/* Shutter Capture Button */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    onClick={capturePhoto}
                    className="slush-pill bg-[#55db9c] hover:bg-[#4da2ff] text-black font-bold py-2.5 px-5 border border-black flex items-center gap-2 text-sm"
                  >
                    <Camera className="w-5 h-5" />
                    <span>กดถ่ายภาพสแกน</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="slush-pill bg-white text-xs py-2 px-4 border border-black"
                  >
                    อัปโหลดรูปแทน
                  </button>
                  <button
                    onClick={handleLoadSample}
                    className="slush-pill bg-[#ffd731] hover:bg-[#ffe066] text-black text-xs py-2 px-4 border border-black flex items-center gap-1.5 font-bold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ใช้รูปตัวอย่างทดสอบ</span>
                  </button>
                  <button
                    onClick={stopCamera}
                    className="slush-pill bg-white hover:bg-gray-100 text-black text-xs py-2 px-4 border border-black"
                  >
                    {pages.length > 0 ? 'กลับไปดูหน้าสแกน' : 'ปิดกล้อง (กลับหน้าเลือก)'}
                  </button>
                </div>
              </div>
            ) : currentPage ? (
              <div
                ref={imageContainerRef}
                onPointerDown={handleMouseDownPan}
                onPointerMove={handleMouseMovePan}
                onPointerUp={handleMouseUpPan}
                onPointerLeave={handleMouseUpPan}
                className={`w-full flex-1 min-h-[260px] overflow-hidden flex items-center justify-center p-2 bg-[#f8f9fa] rounded-2xl border-2 border-black relative select-none [container-type:size] ${
                  zoomLevel > 1.0 ? (isPanning ? 'cursor-grabbing touch-none' : 'cursor-grab touch-none') : 'cursor-default'
                }`}
              >
                {/* Floating Top Status Pills inside Center Document Stage */}
                <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-20 pointer-events-none">
                  <span className="px-2.5 py-1 bg-black text-white rounded-full text-[11px] font-bold border border-black">
                    หน้าที่ {selectedPageIndex + 1} / {pages.length}
                  </span>
                  {isProcessingFilter && (
                    <span className="px-2.5 py-1 bg-[#4da2ff] text-white rounded-full text-[11px] font-bold border border-black animate-pulse">
                      กำลังประมวลผล...
                    </span>
                  )}
                  {isCropping && (
                    <span className="px-2.5 py-1 bg-[#ffd731] text-black rounded-full text-[11px] font-extrabold border border-black">
                      โหมดตัดขอบ: ลากมุมหรือขอบสีเขียว
                    </span>
                  )}
                  {isStraightening && (
                    <span className="px-2.5 py-1 bg-[#55db9c] text-black rounded-full text-[11px] font-extrabold border border-black">
                      {straightenMode === 'perspective'
                        ? 'โหมดดัด 4 มุม: ลากจุดวงกลมไปวางที่มุมกระดาษ'
                        : `โหมดปรับเอียง: ${fineRotation > 0 ? `+${fineRotation}°` : `${fineRotation}°`} (เทียบตารางสีฟ้า)`}
                    </span>
                  )}
                  {isComparingOriginal && (
                    <span className="px-2.5 py-1 bg-black text-white rounded-full text-[11px] font-bold border border-white">
                      กำลังแสดง: ภาพถ่ายต้นฉบับจริง
                    </span>
                  )}
                </div>

                {/* Exit Fullscreen Toggle inside Stage when Expanded */}
                {isExpandedView && (
                  <button
                    onClick={() => setIsExpandedView(false)}
                    className="slush-pill bg-white text-black text-xs py-1.5 px-3 border border-black absolute top-3 right-3 z-20 flex items-center gap-1"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>แสดงแถบเครื่องมือซ้าย-ขวา</span>
                  </button>
                )}

                {/* Photocopier Fixed Alignment Grid Overlay (visible in Fine Deskew mode) */}
                {isStraightening && straightenMode === 'deskew' && (
                  <div className="absolute inset-0 z-10 pointer-events-none grid grid-cols-6 grid-rows-8">
                    {Array.from({ length: 48 }).map((_, cellIdx) => (
                      <div
                        key={cellIdx}
                        className="border-r border-b border-[#4da2ff]/40"
                      />
                    ))}
                  </div>
                )}

                {/* The Document Image (Uses full center height & width!) */}
                <div
                  className="relative transition-transform duration-75 inline-flex items-center justify-center"
                  style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel}) rotate(${
                      isStraightening && straightenMode === 'deskew' ? fineRotation : 0
                    }deg)`,
                    transformOrigin: 'center center',
                  }}
                >
                  <img
                    src={
                      isCropping || (isStraightening && straightenMode === 'perspective')
                        ? currentPage.rawMasterUrl || currentPage.originalDataUrl
                        : isComparingOriginal
                        ? currentPage.originalDataUrl
                        : currentPage.dataUrl
                    }
                    alt={`Scanned page ${selectedPageIndex + 1}`}
                    className="max-h-[94cqh] max-w-[94cqw] w-auto h-auto object-contain rounded shadow-md pointer-events-none"
                  />

                  {/* Interactive 4-Corner Perspective Warp Overlay */}
                  {isStraightening && straightenMode === 'perspective' && (
                    <div ref={cropOverlayRef} className="absolute inset-0 pointer-events-auto touch-none">
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="w-full h-full pointer-events-none overflow-visible"
                      >
                        {/* Darken area outside selected paper quad */}
                        <path
                          fill="rgba(0,0,0,0.52)"
                          fillRule="evenodd"
                          d={`M0,0 H100 V100 H0 Z M${perspectiveQuad.tl.x},${perspectiveQuad.tl.y} L${perspectiveQuad.tr.x},${perspectiveQuad.tr.y} L${perspectiveQuad.br.x},${perspectiveQuad.br.y} L${perspectiveQuad.bl.x},${perspectiveQuad.bl.y} Z`}
                        />

                        {/* Perspective-interpolated 3x3 helper mesh inside quad */}
                        {[1 / 3, 2 / 3].map((t, i) => {
                          const leftPt = {
                            x: perspectiveQuad.tl.x + (perspectiveQuad.bl.x - perspectiveQuad.tl.x) * t,
                            y: perspectiveQuad.tl.y + (perspectiveQuad.bl.y - perspectiveQuad.tl.y) * t,
                          };
                          const rightPt = {
                            x: perspectiveQuad.tr.x + (perspectiveQuad.br.x - perspectiveQuad.tr.x) * t,
                            y: perspectiveQuad.tr.y + (perspectiveQuad.br.y - perspectiveQuad.tr.y) * t,
                          };
                          const topPt = {
                            x: perspectiveQuad.tl.x + (perspectiveQuad.tr.x - perspectiveQuad.tl.x) * t,
                            y: perspectiveQuad.tl.y + (perspectiveQuad.tr.y - perspectiveQuad.tl.y) * t,
                          };
                          const bottomPt = {
                            x: perspectiveQuad.bl.x + (perspectiveQuad.br.x - perspectiveQuad.bl.x) * t,
                            y: perspectiveQuad.bl.y + (perspectiveQuad.br.y - perspectiveQuad.bl.y) * t,
                          };
                          return (
                            <g key={i}>
                              <line
                                x1={leftPt.x}
                                y1={leftPt.y}
                                x2={rightPt.x}
                                y2={rightPt.y}
                                stroke="rgba(255,255,255,0.75)"
                                strokeWidth="1.2"
                                strokeDasharray="4 3"
                                vectorEffect="non-scaling-stroke"
                              />
                              <line
                                x1={topPt.x}
                                y1={topPt.y}
                                x2={bottomPt.x}
                                y2={bottomPt.y}
                                stroke="rgba(255,255,255,0.75)"
                                strokeWidth="1.2"
                                strokeDasharray="4 3"
                                vectorEffect="non-scaling-stroke"
                              />
                            </g>
                          );
                        })}

                        {/* Paper boundary outline */}
                        <polygon
                          points={`${perspectiveQuad.tl.x},${perspectiveQuad.tl.y} ${perspectiveQuad.tr.x},${perspectiveQuad.tr.y} ${perspectiveQuad.br.x},${perspectiveQuad.br.y} ${perspectiveQuad.bl.x},${perspectiveQuad.bl.y}`}
                          fill="none"
                          stroke="#55db9c"
                          strokeWidth="2.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>

                      {/* 4 Draggable Corner Magnifier Handles */}
                      {(
                        [
                          { key: 'tl', label: 'บนซ้าย', pt: perspectiveQuad.tl },
                          { key: 'tr', label: 'บนขวา', pt: perspectiveQuad.tr },
                          { key: 'br', label: 'ล่างขวา', pt: perspectiveQuad.br },
                          { key: 'bl', label: 'ล่างซ้าย', pt: perspectiveQuad.bl },
                        ] as const
                      ).map(({ key, label, pt }) => (
                        <div
                          key={key}
                          onPointerDown={(e) => startQuadCornerDrag(key, e)}
                          style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                          title={`ลากปรับมุม${label}`}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-black cursor-move flex items-center justify-center transition-transform ${
                            activeQuadCorner === key
                              ? 'bg-[#ffd731] scale-125 ring-2 ring-white z-20'
                              : 'bg-[#55db9c] hover:scale-110 z-10'
                          }`}
                        >
                          <div className="w-2 h-2 rounded-full bg-black" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Interactive Crop Overlay (when in Crop mode) */}
                  {isCropping && (
                    <div ref={cropOverlayRef} className="absolute inset-0 pointer-events-auto touch-none">
                      {/* Top backdrop */}
                      <div
                        className="absolute left-0 right-0 top-0 bg-black/60 pointer-events-none"
                        style={{ height: `${cropBox.y}%` }}
                      />
                      {/* Bottom backdrop */}
                      <div
                        className="absolute left-0 right-0 bottom-0 bg-black/60 pointer-events-none"
                        style={{ height: `${100 - (cropBox.y + cropBox.height)}%` }}
                      />
                      {/* Left backdrop */}
                      <div
                        className="absolute left-0 bg-black/60 pointer-events-none"
                        style={{
                          top: `${cropBox.y}%`,
                          height: `${cropBox.height}%`,
                          width: `${cropBox.x}%`,
                        }}
                      />
                      {/* Right backdrop */}
                      <div
                        className="absolute right-0 bg-black/60 pointer-events-none"
                        style={{
                          top: `${cropBox.y}%`,
                          height: `${cropBox.height}%`,
                          width: `${100 - (cropBox.x + cropBox.width)}%`,
                        }}
                      />

                      {/* Active Crop Box with Rule-of-Thirds Grid */}
                      <div
                        onPointerDown={(e) => startHandleDrag('move', e)}
                        className="absolute border-2 border-[#55db9c] shadow-lg cursor-move bg-transparent"
                        style={{
                          left: `${cropBox.x}%`,
                          top: `${cropBox.y}%`,
                          width: `${cropBox.width}%`,
                          height: `${cropBox.height}%`,
                        }}
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                          <div className="border-r border-b border-white/40" />
                          <div className="border-r border-b border-white/40" />
                          <div className="border-b border-white/40" />
                          <div className="border-r border-b border-white/40" />
                          <div className="border-r border-b border-white/40" />
                          <div className="border-b border-white/40" />
                          <div className="border-r border-white/40" />
                          <div className="border-r border-white/40" />
                          <div />
                        </div>

                        {/* 4 Corner Handles */}
                        <div
                          onPointerDown={(e) => startHandleDrag('tl', e)}
                          className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-[#55db9c] border-2 border-black rounded-full cursor-nwse-resize shadow"
                        />
                        <div
                          onPointerDown={(e) => startHandleDrag('tr', e)}
                          className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-[#55db9c] border-2 border-black rounded-full cursor-nesw-resize shadow"
                        />
                        <div
                          onPointerDown={(e) => startHandleDrag('bl', e)}
                          className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-[#55db9c] border-2 border-black rounded-full cursor-nesw-resize shadow"
                        />
                        <div
                          onPointerDown={(e) => startHandleDrag('br', e)}
                          className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-[#55db9c] border-2 border-black rounded-full cursor-nwse-resize shadow"
                        />

                        {/* 4 Edge Handles */}
                        <div
                          onPointerDown={(e) => startHandleDrag('top', e)}
                          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-3 bg-white border border-black rounded-full cursor-ns-resize shadow"
                        />
                        <div
                          onPointerDown={(e) => startHandleDrag('bottom', e)}
                          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-3 bg-white border border-black rounded-full cursor-ns-resize shadow"
                        />
                        <div
                          onPointerDown={(e) => startHandleDrag('left', e)}
                          className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 bg-white border border-black rounded-full cursor-ew-resize shadow"
                        />
                        <div
                          onPointerDown={(e) => startHandleDrag('right', e)}
                          className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 bg-white border border-black rounded-full cursor-ew-resize shadow"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {zoomLevel > 1.0 && (
                  <span className="absolute bottom-3 left-3 bg-black/80 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 z-20 pointer-events-none">
                    <Move className="w-3 h-3 text-[#55db9c]" />
                    <span>คลิกค้างแล้วลากเพื่อเลื่อนดูข้อความ</span>
                  </span>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropUpload}
                className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-[#f8f9fa] rounded-2xl border-2 border-dashed border-black/35 text-center"
              >
                <div className="max-w-xl w-full space-y-5">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-black rounded-full text-[11px] font-extrabold text-black mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-[#5c4ade]" />
                      <span>พร้อมสแกนและปรับแต่งระดับสตูดิโอ</span>
                    </span>
                    <h4 className="font-display font-black text-xl sm:text-2xl text-black">
                      เลือกวิธีนำเข้าเอกสารเพื่อเริ่มสแกน
                    </h4>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">
                      เลือกเปิดกล้องถ่ายสด หรืออัปโหลดภาพถ่ายจากเครื่อง — รองรับดัดมุมตรง ตัดขอบ ลบเงามืด และ OCR
                    </p>
                  </div>

                  {/* Two Large Choice Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <button
                      onClick={startCamera}
                      className="group bg-[#55db9c] hover:bg-[#3fcf8c] border border-black rounded-[24px] p-5 sm:p-6 text-left transition-transform hover:-translate-y-0.5 flex flex-col items-start justify-between min-h-[156px] cursor-pointer"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-white border border-black flex items-center justify-center mb-3">
                        <Camera className="w-7 h-7 text-black" />
                      </div>
                      <div>
                        <div className="font-display font-black text-base sm:text-lg text-black leading-tight">
                          📸 เปิดกล้องถ่ายเอกสาร
                        </div>
                        <p className="text-xs text-black/80 font-semibold mt-1 leading-snug">
                          กดเปิดกล้องเว็บแคมหรือกล้องมือถือ เพื่อถ่ายเอกสารหลายหน้าต่อเนื่อง
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="group bg-[#dceeff] hover:bg-[#c8e4ff] border border-black rounded-[24px] p-5 sm:p-6 text-left transition-transform hover:-translate-y-0.5 flex flex-col items-start justify-between min-h-[156px] cursor-pointer"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#4da2ff] border border-black flex items-center justify-center mb-3">
                        <Upload className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="font-display font-black text-base sm:text-lg text-black leading-tight">
                          🖼️ อัปโหลดรูปภาพเอกสาร
                        </div>
                        <p className="text-xs text-black/80 font-semibold mt-1 leading-snug">
                          คลิกเลือกไฟล์ JPG, PNG, WEBP จากเครื่อง หรือลากรูปมาวางในกรอบนี้
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Secondary Large Sample Action */}
                  <div className="pt-1 flex flex-col items-center gap-2">
                    <button
                      onClick={handleLoadSample}
                      className="slush-pill bg-[#ffd731] hover:bg-[#ffe066] text-black text-xs sm:text-sm font-extrabold py-3 px-6 border border-black flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>ทดลองใช้รูปเอกสารตัวอย่าง (ดูฟิลเตอร์ & ดัดมุมตรง)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="mt-2 bg-[#fb4903] text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border border-black shrink-0">
                <span className="flex-1 text-center">{cameraError}</span>
                <button
                  onClick={() => setCameraError(null)}
                  className="w-5 h-5 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center shrink-0"
                  title="ปิดการแจ้งเตือน"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Fine-Tuning Sliders + Multi-page Thumbnails + Export */}
          {!isExpandedView && (
            <div className="order-3 flex flex-col justify-between space-y-3 md:overflow-y-auto min-h-0 pl-0.5">
            {/* 1. Fine-Tuning Sliders Card */}
            <div className="bg-white border border-black rounded-[24px] p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#5c4ade]" />
                  <span className="font-display font-bold text-xs sm:text-sm text-black">
                    ปรับความเข้ม & คมชัด
                  </span>
                </div>

                {currentPage && (
                  <button
                    onClick={() => handleApplyPreset('reset')}
                    className="text-[10px] font-bold text-gray-600 hover:text-black flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-300 hover:border-black"
                  >
                    <RotateCcw className="w-3 h-3" />
                    รีเซ็ต
                  </button>
                )}
              </div>

              {currentPage ? (
                <div className="space-y-2.5">
                  {/* Quick Presets */}
                  <div className="flex flex-wrap items-center gap-1 pb-1.5 border-b border-gray-100">
                    <button
                      onClick={() => handleApplyPreset('auto')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#55db9c] text-black border border-black hover:opacity-90 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> สมดุล AI
                    </button>
                    <button
                      onClick={() => handleApplyPreset('faded-ink')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ffd731] text-black border border-black hover:opacity-90"
                    >
                      🖊️ เร่งหมึกจาง
                    </button>
                    <button
                      onClick={() => handleApplyPreset('heavy-shadow')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#dceeff] text-black border border-black hover:opacity-90"
                    >
                      ☀️ ลบเงามืดจัด
                    </button>
                  </div>

                  {/* Slider 1: Ink Darkness */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-0.5">
                      <span className="text-black flex items-center gap-1">
                        🖊️ ความเข้มหมึก (Ink Darkness)
                      </span>
                      <span className="px-1.5 py-0.2 bg-gray-100 border border-black rounded-full text-[10px]">
                        {currentAdjustments.darkness > 0
                          ? `+${currentAdjustments.darkness}`
                          : currentAdjustments.darkness}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="1"
                        value={currentAdjustments.darkness}
                        onChange={(e) => handleAdjustmentChange('darkness', Number(e.target.value))}
                        className="flex-1 accent-black cursor-pointer h-2 bg-gray-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Slider 2: Sharpness */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-0.5">
                      <span className="text-black flex items-center gap-1">
                        🔪 ความคมชัดขอบ (Sharpness)
                      </span>
                      <span className="px-1.5 py-0.2 bg-gray-100 border border-black rounded-full text-[10px]">
                        {currentAdjustments.sharpness}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={currentAdjustments.sharpness}
                        onChange={(e) => handleAdjustmentChange('sharpness', Number(e.target.value))}
                        className="flex-1 accent-black cursor-pointer h-2 bg-gray-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Slider 3: Shadow Removal */}
                  {currentPage.filter !== 'original' && (
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold mb-0.5">
                        <span className="text-black flex items-center gap-1">
                          ☀️ ลบเงามืดกระดาษ (Shadow Clean)
                        </span>
                        <span className="px-1.5 py-0.2 bg-gray-100 border border-black rounded-full text-[10px]">
                          {currentAdjustments.shadowClean}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={currentAdjustments.shadowClean}
                        onChange={(e) =>
                          handleAdjustmentChange('shadowClean', Number(e.target.value))
                        }
                        className="w-full accent-black cursor-pointer h-2 bg-gray-200 rounded-lg"
                      />
                    </div>
                  )}

                  {/* Slider 4: Brightness & Contrast */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold mb-0.5">
                        <span className="flex items-center gap-1">
                          <Sun className="w-3 h-3" /> สว่าง
                        </span>
                        <span>{currentAdjustments.brightness}</span>
                      </div>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="2"
                        value={currentAdjustments.brightness}
                        onChange={(e) =>
                          handleAdjustmentChange('brightness', Number(e.target.value))
                        }
                        className="w-full accent-black cursor-pointer h-1.5 bg-gray-200 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold mb-0.5">
                        <span className="flex items-center gap-1">
                          <Contrast className="w-3 h-3" /> คอนทราสต์
                        </span>
                        <span>{currentAdjustments.contrast}</span>
                      </div>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="2"
                        value={currentAdjustments.contrast}
                        onChange={(e) =>
                          handleAdjustmentChange('contrast', Number(e.target.value))
                        }
                        className="w-full accent-black cursor-pointer h-1.5 bg-gray-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {pages.length > 1 && (
                    <button
                      onClick={handleApplyToAllPages}
                      className="w-full mt-1 py-1 px-2.5 rounded-full bg-[#e9ccff] border border-black text-[11px] font-bold text-black hover:bg-black hover:text-white transition flex items-center justify-center gap-1"
                    >
                      <Layers className="w-3 h-3" />
                      <span>ใช้ค่านี้กับทุกหน้า ({pages.length} หน้า)</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-gray-400">
                  เลือกหรือถ่ายภาพเอกสารเพื่อปรับค่า
                </div>
              )}
            </div>

            {/* 2. Pages Gallery Card */}
            <div className="bg-white border border-black rounded-[24px] p-3">
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-gray-100">
                <span className="font-display font-bold text-xs text-black">
                  หน้ารวมในเล่ม ({pages.length} หน้า)
                </span>
                <div className="flex items-center gap-1">
                  {!isCameraActive && (
                    <button
                      onClick={startCamera}
                      className="text-[10px] font-bold px-2 py-0.5 bg-[#55db9c] border border-black rounded-full hover:bg-black hover:text-white"
                    >
                      + ถ่ายเพิ่ม
                    </button>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[10px] font-bold px-2 py-0.5 bg-white border border-black rounded-full hover:bg-gray-100"
                  >
                    + อัปโหลด
                  </button>
                  {pages.length > 0 && (
                    <button
                      onClick={resetScannerState}
                      className="text-[10px] font-bold px-2 py-0.5 bg-[#fb4903] text-white border border-black rounded-full hover:bg-black"
                      title="ล้างเอกสารทั้งหมดเพื่อเริ่มสแกนโปรเจคใหม่"
                    >
                      ล้างใหม่
                    </button>
                  )}
                </div>
              </div>

              {pages.length === 0 ? (
                <div className="text-center py-3 text-xs text-gray-400">
                  ยังไม่มีเอกสารที่สแกน
                </div>
              ) : (
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {pages.map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedPageIndex(idx);
                        setIsCameraActive(false);
                      }}
                      className={`relative rounded-xl border p-1 cursor-pointer transition shrink-0 w-16 ${
                        selectedPageIndex === idx && !isCameraActive
                          ? 'border-2 border-black bg-[#dceeff] scale-105'
                          : 'border-gray-300 bg-white hover:border-black'
                      }`}
                    >
                      <img
                        src={p.dataUrl}
                        alt={`Page ${idx + 1}`}
                        className="w-full h-14 object-cover rounded"
                      />
                      <span className="absolute bottom-1 right-1 bg-black text-white text-[8px] font-bold px-1 rounded">
                        #{idx + 1}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePage(idx);
                        }}
                        className="absolute top-1 right-1 bg-white hover:bg-[#fb4903] hover:text-white p-0.5 rounded-full border border-black"
                        title="ลบหน้านี้"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Export Actions Card */}
            <div className="bg-white border border-black rounded-[24px] p-3 space-y-1.5">
              <button
                disabled={pages.length === 0}
                onClick={handleExportPdf}
                className="w-full slush-pill bg-black text-white text-xs py-2 px-3 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <FileDown className="w-4 h-4 text-[#55db9c]" />
                  <span>บันทึก PDF ({pages.length} หน้า)</span>
                </div>
                <Check className="w-3.5 h-3.5" />
              </button>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  disabled={pages.length === 0}
                  onClick={handleSendToOcr}
                  className="slush-pill bg-[#ffd731] text-black text-[10px] py-2 px-1 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1"
                >
                  <Search className="w-3 h-3 shrink-0" />
                  <span>อ่าน OCR</span>
                </button>

                <button
                  disabled={pages.length === 0}
                  onClick={handleSendToSign}
                  className="slush-pill bg-[#5c4ade] text-white text-[10px] py-2 px-1 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1"
                >
                  <PenTool className="w-3 h-3 shrink-0" />
                  <span>วางลายเซ็น</span>
                </button>

                <button
                  disabled={pages.length === 0}
                  onClick={handleDirectPrint}
                  title="จัดตำแหน่ง ย่อ/ขยายขนาดบนกระดาษ A4 ก่อนสั่งพิมพ์"
                  className="slush-pill bg-[#4da2ff] text-white text-[10px] py-2 px-1 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1"
                >
                  <Printer className="w-3 h-3 shrink-0" />
                  <span>สั่งพิมพ์</span>
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </div>
  );
};
