import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Printer,
  X,
  FilePlus2,
  Camera,
  Upload,
  Move,
  Scissors,
  RotateCw,
  Layers,
  Plus,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { renderPdfPageToCanvas, getPdfPageCount } from '../utils/pdfHelper';
import { trimWhiteBordersDataUrl, rotateImageDataUrl } from '../utils/imageFilters';
import type { ToolType } from '../types/document';

interface DirectPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentSource?: {
    buffer?: ArrayBuffer;
    dataUrl?: string;
    images?: string[];
    name: string;
  } | null;
  previousTool?: ToolType | null;
  onGoBack?: () => void;
  onProjectComplete?: (message: string) => void;
  onSelectTool?: (tool: ToolType) => void;
  onOpenFileInput?: () => void;
}

interface PrintLayoutItem {
  id: string;
  sheetIndex: number;
  src: string;
  origSrc: string;
  naturalW: number;
  naturalH: number;
  xPct: number; // 0..100 (% of sheet width)
  yPct: number; // 0..100 (% of sheet height)
  wPct: number; // 10..100 (% of sheet width)
}

function getPaperDimensionsMm(
  pageSize: 'A4' | 'Letter',
  orientation: 'portrait' | 'landscape'
): { widthMm: number; heightMm: number } {
  const baseW = pageSize === 'A4' ? 210 : 215.9;
  const baseH = pageSize === 'A4' ? 297 : 279.4;
  return orientation === 'portrait'
    ? { widthMm: baseW, heightMm: baseH }
    : { widthMm: baseH, heightMm: baseW };
}

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth || img.width || 800, height: img.naturalHeight || img.height || 1000 });
    img.onerror = () => resolve({ width: 800, height: 1000 });
    img.src = src;
  });
}

function loadHtmlImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export const DirectPrintModal: React.FC<DirectPrintModalProps> = ({
  isOpen,
  onClose,
  documentSource,
  previousTool,
  onGoBack,
  onProjectComplete,
  onSelectTool,
  onOpenFileInput,
}) => {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4');
  const [margins, setMargins] = useState<'normal' | 'none'>('normal');
  const [collageSingleSheet, setCollageSingleSheet] = useState(false);

  const [items, setItems] = useState<PrintLayoutItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingItem, setIsProcessingItem] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPostPrintPrompt, setShowPostPrintPrompt] = useState(false);

  // Drag / Resize state on the virtual paper
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'resize';
    itemId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startW: number;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ xCenter: boolean; yCenter: boolean }>({
    xCenter: false,
    yCenter: false,
  });

  const sheetRef = useRef<HTMLDivElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const activeIframeRef = useRef<HTMLIFrameElement | null>(null);

  const { widthMm, heightMm } = getPaperDimensionsMm(pageSize, orientation);
  const sheetAspect = widthMm / heightMm;

  const computeHeightPct = useCallback(
    (item: PrintLayoutItem, aspect: number = sheetAspect): number => {
      const imgAspect = item.naturalW / Math.max(1, item.naturalH);
      return (item.wPct * aspect) / Math.max(0.05, imgAspect);
    },
    [sheetAspect]
  );

  // Build default centered item placement fitting inside current sheet proportions
  const createDefaultItem = useCallback(
    async (src: string, sheetIndex: number, aspect: number): Promise<PrintLayoutItem> => {
      const { width, height } = await loadImageSize(src);
      const imgAspect = width / Math.max(1, height);
      const maxInitialWPct = Math.min(88, (88 * imgAspect) / aspect);
      const wPct = Math.max(20, Math.round(maxInitialWPct * 10) / 10);
      const hPct = (wPct * aspect) / imgAspect;
      return {
        id: Math.random().toString(36).substring(2, 9),
        sheetIndex,
        src,
        origSrc: src,
        naturalW: width,
        naturalH: height,
        xPct: Math.max(0, (100 - wPct) / 2),
        yPct: Math.max(0, (100 - hPct) / 2),
        wPct,
      };
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    setShowPostPrintPrompt(false);

    if (!documentSource) {
      setItems([]);
      setSelectedItemId(null);
      setActiveSheetIdx(0);
      return;
    }

    const preparePages = async () => {
      setIsLoading(true);
      setCollageSingleSheet(false);
      let rawImages: string[] = [];

      if (documentSource.images && documentSource.images.length > 0) {
        rawImages = documentSource.images;
      } else if (documentSource.buffer) {
        try {
          const total = await getPdfPageCount(documentSource.buffer);
          for (let i = 1; i <= Math.min(total, 50); i++) {
            const { canvas } = await renderPdfPageToCanvas(documentSource.buffer, i, 2.0);
            rawImages.push(canvas.toDataURL('image/jpeg', 0.95));
          }
        } catch (e) {
          console.error(e);
        }
      } else if (documentSource.dataUrl) {
        rawImages = [documentSource.dataUrl];
      }

      const initAspect = getPaperDimensionsMm(pageSize, orientation);
      const ratio = initAspect.widthMm / initAspect.heightMm;
      const created = await Promise.all(
        rawImages.map((src, idx) => createDefaultItem(src, idx, ratio))
      );
      setItems(created);
      setSelectedItemId(created[0]?.id || null);
      setActiveSheetIdx(0);
      setIsLoading(false);
    };

    preparePages();
  }, [isOpen, documentSource]);

  // Cleanup any stray print iframe if modal unmounts
  useEffect(() => {
    return () => {
      if (activeIframeRef.current?.parentNode) {
        activeIframeRef.current.parentNode.removeChild(activeIframeRef.current);
        activeIframeRef.current = null;
      }
    };
  }, []);

  // Re-clamp items gently if user toggles Portrait <-> Landscape so nothing goes off-sheet
  useEffect(() => {
    setItems((prev) =>
      prev.map((it) => {
        const hPct = computeHeightPct(it, sheetAspect);
        let nextW = it.wPct;
        if (hPct > 96) {
          const imgAspect = it.naturalW / Math.max(1, it.naturalH);
          nextW = Math.max(15, (94 * imgAspect) / sheetAspect);
        }
        const finalH = (nextW * sheetAspect) / Math.max(0.05, it.naturalW / Math.max(1, it.naturalH));
        return {
          ...it,
          wPct: nextW,
          xPct: Math.max(0, Math.min(100 - nextW, it.xPct)),
          yPct: Math.max(0, Math.min(Math.max(0, 100 - finalH), it.yPct)),
        };
      })
    );
  }, [sheetAspect, computeHeightPct]);

  // Pointer Move & Up listeners for smooth Drag & Resize directly on the sheet
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const sheetEl = sheetRef.current;
      if (!sheetEl) return;
      const rect = sheetEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaXPct = ((e.clientX - dragState.startClientX) / rect.width) * 100;
      const deltaYPct = ((e.clientY - dragState.startClientY) / rect.height) * 100;

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== dragState.itemId) return it;
          const imgAspect = it.naturalW / Math.max(1, it.naturalH);

          if (dragState.mode === 'move') {
            const hPct = (it.wPct * sheetAspect) / Math.max(0.05, imgAspect);
            let nextX = Math.max(0, Math.min(100 - it.wPct, dragState.startX + deltaXPct));
            let nextY = Math.max(0, Math.min(Math.max(0, 100 - hPct), dragState.startY + deltaYPct));

            const centerX = (100 - it.wPct) / 2;
            const centerY = (100 - hPct) / 2;
            let snappedX = false;
            let snappedY = false;

            if (Math.abs(nextX - centerX) < 1.8) {
              nextX = centerX;
              snappedX = true;
            }
            if (Math.abs(nextY - centerY) < 1.8) {
              nextY = centerY;
              snappedY = true;
            }
            setSnapGuides({ xCenter: snappedX, yCenter: snappedY });

            return { ...it, xPct: nextX, yPct: nextY };
          } else {
            // Resize width cleanly while keeping aspect ratio & sheet boundaries
            const maxWFromHeight = (98 * imgAspect) / sheetAspect;
            const maxW = Math.min(100 - it.xPct, maxWFromHeight);
            const nextW = Math.max(12, Math.min(maxW, dragState.startW + deltaXPct));
            const nextH = (nextW * sheetAspect) / Math.max(0.05, imgAspect);
            const nextY = Math.min(it.yPct, Math.max(0, 100 - nextH));
            return { ...it, wPct: nextW, yPct: nextY };
          }
        })
      );
    };

    const handlePointerUp = () => {
      setDragState(null);
      setSnapGuides({ xCenter: false, yCenter: false });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragState, sheetAspect]);

  if (!isOpen) return null;

  const totalSheets = collageSingleSheet
    ? items.length > 0
      ? 1
      : 0
    : Math.max(1, ...items.map((it) => it.sheetIndex + 1));

  const safeSheetIdx = Math.min(activeSheetIdx, Math.max(0, totalSheets - 1));
  const currentSheetItems = collageSingleSheet
    ? items
    : items.filter((it) => it.sheetIndex === safeSheetIdx);

  const selectedItem =
    items.find((it) => it.id === selectedItemId && (collageSingleSheet || it.sheetIndex === safeSheetIdx)) ||
    currentSheetItems[0] ||
    null;

  // Toggle between 1-per-sheet vs arranging all images together onto Sheet #1
  const handleToggleCollage = () => {
    const nextCollage = !collageSingleSheet;
    setCollageSingleSheet(nextCollage);
    if (nextCollage && items.length >= 2) {
      // Neatly stack up to N items vertically so none overlap initially
      const slotH = 88 / items.length;
      setItems((prev) =>
        prev.map((it, idx) => {
          const imgAspect = it.naturalW / Math.max(1, it.naturalH);
          const maxWForSlot = ((slotH - 4) * imgAspect) / sheetAspect;
          const nextW = Math.min(it.wPct, Math.max(25, Math.min(72, maxWForSlot)));
          const nextH = (nextW * sheetAspect) / Math.max(0.05, imgAspect);
          const yCenterSlot = 6 + idx * slotH + (slotH - nextH) / 2;
          return {
            ...it,
            sheetIndex: 0,
            wPct: nextW,
            xPct: Math.max(0, (100 - nextW) / 2),
            yPct: Math.max(2, Math.min(100 - nextH - 2, yCenterSlot)),
          };
        })
      );
      setActiveSheetIdx(0);
    } else if (!nextCollage) {
      setItems((prev) =>
        prev.map((it, idx) => ({
          ...it,
          sheetIndex: idx,
        }))
      );
    }
  };

  // Add additional image onto the current active sheet (e.g. Back side of ID Card!)
  const handleAddImageToSheet = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    Array.from(e.target.files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const src = ev.target?.result as string;
        if (!src) return;
        const item = await createDefaultItem(src, safeSheetIdx, sheetAspect);
        // Shrink slightly if adding alongside another item so both are easy to see
        const hasExisting = currentSheetItems.length > 0;
        const nextW = hasExisting ? Math.min(item.wPct, 52) : item.wPct;
        const nextY = hasExisting ? 54 : item.yPct;
        const newItem: PrintLayoutItem = {
          ...item,
          wPct: nextW,
          xPct: (100 - nextW) / 2,
          yPct: Math.min(nextY, Math.max(0, 100 - computeHeightPct({ ...item, wPct: nextW }))),
        };
        setItems((prev) => [...prev, newItem]);
        setSelectedItemId(newItem.id);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Update selected item properties safely
  const updateSelectedItem = (updater: (it: PrintLayoutItem) => PrintLayoutItem) => {
    if (!selectedItem) return;
    setItems((prev) => prev.map((it) => (it.id === selectedItem.id ? updater(it) : it)));
  };

  // Quick align preset ('top-center' leaves white space below for ID copy certification!)
  const handleAlignPreset = (preset: 'top-center' | 'center' | 'bottom-center') => {
    updateSelectedItem((it) => {
      const hPct = computeHeightPct(it);
      const xPct = Math.max(0, (100 - it.wPct) / 2);
      const safeMarginY = margins === 'normal' ? 6 : 2;
      let yPct = Math.max(0, (100 - hPct) / 2);
      if (preset === 'top-center') yPct = safeMarginY;
      if (preset === 'bottom-center') yPct = Math.max(0, 100 - hPct - safeMarginY);
      return { ...it, xPct, yPct };
    });
  };

  // Quick size preset (including Real Thai ID Card width 85.6mm on A4/Letter!)
  const handleSizePreset = (preset: 'id-card' | 'half' | 'full') => {
    updateSelectedItem((it) => {
      const imgAspect = it.naturalW / Math.max(1, it.naturalH);
      const maxFitW = Math.min(96, (96 * imgAspect) / sheetAspect);
      let targetW = maxFitW;
      if (preset === 'id-card') {
        // Standard ISO ID-1 card width is 85.6mm -> real physical percentage of current paper width!
        targetW = Math.min(maxFitW, (85.6 / widthMm) * 100);
      } else if (preset === 'half') {
        targetW = Math.min(maxFitW, 62);
      }
      const nextH = (targetW * sheetAspect) / Math.max(0.05, imgAspect);
      const nextX = Math.max(0, Math.min(100 - targetW, (100 - targetW) / 2));
      const nextY = Math.max(0, Math.min(Math.max(0, 100 - nextH), it.yPct));
      return { ...it, wPct: Math.round(targetW * 10) / 10, xPct: nextX, yPct: nextY };
    });
  };

  // Slider resize handler
  const handleWidthSlider = (val: number) => {
    updateSelectedItem((it) => {
      const imgAspect = it.naturalW / Math.max(1, it.naturalH);
      const maxFitW = Math.min(100, (98 * imgAspect) / sheetAspect);
      const nextW = Math.max(12, Math.min(maxFitW, val));
      const nextH = (nextW * sheetAspect) / Math.max(0.05, imgAspect);
      return {
        ...it,
        wPct: nextW,
        xPct: Math.min(it.xPct, Math.max(0, 100 - nextW)),
        yPct: Math.min(it.yPct, Math.max(0, 100 - nextH)),
      };
    });
  };

  // Auto-trim white margins around ID Card / receipt so it moves freely on the page
  const handleAutoTrimItem = async () => {
    if (!selectedItem) return;
    setIsProcessingItem(true);
    const trimmed = await trimWhiteBordersDataUrl(selectedItem.src);
    if (trimmed.dataUrl) {
      updateSelectedItem((it) => {
        const nextItem = {
          ...it,
          src: trimmed.dataUrl,
          naturalW: trimmed.width,
          naturalH: trimmed.height,
        };
        const imgAspect = trimmed.width / Math.max(1, trimmed.height);
        const hPct = (it.wPct * sheetAspect) / Math.max(0.05, imgAspect);
        return {
          ...nextItem,
          xPct: Math.max(0, Math.min(100 - it.wPct, it.xPct)),
          yPct: Math.max(0, Math.min(Math.max(0, 100 - hPct), it.yPct)),
        };
      });
    }
    setIsProcessingItem(false);
  };

  const handleRestoreItemOrig = async () => {
    if (!selectedItem || selectedItem.src === selectedItem.origSrc) return;
    const { width, height } = await loadImageSize(selectedItem.origSrc);
    updateSelectedItem((it) => ({
      ...it,
      src: it.origSrc,
      naturalW: width,
      naturalH: height,
    }));
  };

  const handleRotateItem90 = async () => {
    if (!selectedItem) return;
    setIsProcessingItem(true);
    const rotated = await rotateImageDataUrl(selectedItem.src, 90);
    if (rotated.dataUrl) {
      updateSelectedItem((it) => {
        const imgAspect = rotated.width / Math.max(1, rotated.height);
        const maxW = Math.min(96, (94 * imgAspect) / sheetAspect);
        const nextW = Math.min(it.wPct, maxW);
        const nextH = (nextW * sheetAspect) / Math.max(0.05, imgAspect);
        return {
          ...it,
          src: rotated.dataUrl,
          naturalW: rotated.width,
          naturalH: rotated.height,
          wPct: nextW,
          xPct: Math.max(0, Math.min(100 - nextW, it.xPct)),
          yPct: Math.max(0, Math.min(Math.max(0, 100 - nextH), it.yPct)),
        };
      });
    }
    setIsProcessingItem(false);
  };

  /**
   * Composite arranged sheet items onto a pure crisp white high-DPI canvas matching preview 1:1.
   */
  const composeSheetToDataUrl = async (sheetIdx: number): Promise<string> => {
    const sheetItems = collageSingleSheet ? items : items.filter((it) => it.sheetIndex === sheetIdx);
    const longSide = 2200;
    const canvasW = orientation === 'portrait' ? Math.round(longSide * sheetAspect) : longSide;
    const canvasH = orientation === 'portrait' ? longSide : Math.round(longSide / sheetAspect);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (const item of sheetItems) {
      const imgEl = await loadHtmlImg(item.src);
      if (!imgEl) continue;
      const drawX = (item.xPct / 100) * canvasW;
      const drawY = (item.yPct / 100) * canvasH;
      const drawW = (item.wPct / 100) * canvasW;
      const hPct = computeHeightPct(item);
      const drawH = (hPct / 100) * canvasH;
      ctx.drawImage(imgEl, drawX, drawY, drawW, drawH);
    }

    return canvas.toDataURL('image/jpeg', 0.96);
  };

  /**
   * Render composed sheets into an isolated hidden iframe so web page UI can never leak onto paper.
   */
  const handleTriggerPrint = async () => {
    if (items.length === 0 || isPrinting) return;
    setIsPrinting(true);

    const composedSheets: string[] = [];
    for (let s = 0; s < totalSheets; s++) {
      const url = await composeSheetToDataUrl(s);
      if (url) composedSheets.push(url);
    }

    if (composedSheets.length === 0) {
      setIsPrinting(false);
      return;
    }

    if (activeIframeRef.current?.parentNode) {
      activeIframeRef.current.parentNode.removeChild(activeIframeRef.current);
      activeIframeRef.current = null;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
    activeIframeRef.current = iframe;

    const iframeWin = iframe.contentWindow;
    const iframeDoc = iframeWin?.document;
    if (!iframeWin || !iframeDoc) {
      setIsPrinting(false);
      return;
    }

    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${(documentSource?.name || 'เอกสารพร้อมพิมพ์').replace(/</g, '&lt;')}</title>
    <style>
      @page {
        size: ${pageSize} ${orientation};
        margin: 0;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        width: 100%;
      }
      .print-sheet {
        width: 100vw;
        height: 99vh;
        display: flex;
        align-items: center;
        justify-content: center;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
        overflow: hidden;
        background: #ffffff;
      }
      .print-sheet:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .print-sheet img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
    </style>
  </head>
  <body></body>
</html>`);
    iframeDoc.close();

    const imageLoadPromises: Promise<void>[] = [];
    composedSheets.forEach((src) => {
      const sheet = iframeDoc.createElement('div');
      sheet.className = 'print-sheet';

      const img = iframeDoc.createElement('img');
      const loadPromise = new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      img.src = src;
      imageLoadPromises.push(loadPromise);

      sheet.appendChild(img);
      iframeDoc.body.appendChild(sheet);
    });

    await Promise.all(imageLoadPromises);

    let finished = false;
    const handlePrintDialogReturned = () => {
      if (finished) return;
      finished = true;
      setIsPrinting(false);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      if (activeIframeRef.current === iframe) {
        activeIframeRef.current = null;
      }
      // Show explicit post-print dialog instead of auto-discarding work on browser Cancel!
      setShowPostPrintPrompt(true);
    };

    iframeWin.addEventListener('afterprint', handlePrintDialogReturned, { once: true });

    setTimeout(() => {
      iframeWin.focus();
      iframeWin.print();
      setTimeout(() => {
        handlePrintDialogReturned();
      }, 300);
    }, 80);
  };

  const selectedCmWidth = selectedItem
    ? Math.round(((selectedItem.wPct / 100) * widthMm) / 10 * 10) / 10
    : 0;

  const backLabel =
    previousTool === 'scanner'
      ? 'ย้อนกลับไปหน้าสแกนเอกสาร'
      : previousTool === 'pdf-editor'
      ? 'ย้อนกลับไปแก้ไข PDF'
      : previousTool === 'signature'
      ? 'ย้อนกลับไปวางลายเซ็น'
      : 'ย้อนกลับขั้นตอนก่อนหน้า';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-3 overflow-hidden no-print">
      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-black flex items-center justify-between gap-2 bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#4da2ff] border border-black flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-black text-base sm:text-xl text-black truncate">
                  จัดหน้า & ศูนย์สั่งพิมพ์เอกสารด่วน (Print Layout Studio)
                </h2>
                <span className="hidden md:inline-block px-2.5 py-0.5 text-[10px] font-extrabold bg-[#ffd731] border border-black rounded-full">
                  ลากขยับ & ย่อขยายก่อนพิมพ์ได้อิสระ
                </span>
              </div>
              <p className="text-xs text-gray-600 truncate">
                ลากจัดตำแหน่งเอกสารหรือบัตรบนหน้ากระดาษ ย่อ/ขยายขนาดจริง และสั่งพิมพ์เฉพาะหน้าเอกสาร 100%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onGoBack && (
              <button
                onClick={onGoBack}
                className="slush-pill bg-[#ffd731] hover:bg-black hover:text-white text-black text-xs py-1.5 px-3 border border-black flex items-center gap-1.5 font-extrabold"
                title={backLabel}
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{backLabel}</span>
                <span className="sm:hidden">ย้อนกลับ</span>
              </button>
            )}

            <button
              onClick={onClose}
              title="ปิดหน้าต่างพิมพ์"
              className="w-9 h-9 rounded-full bg-white border border-black hover:bg-black hover:text-white flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-12 gap-3.5 p-3.5 bg-[#f4f3ec]/50">
          {/* Left Panel: Paper & Selected Item Layout Controls */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-3 md:overflow-y-auto min-h-0 pr-0.5">
            <div className="space-y-3">
              {/* 1. Paper Configuration */}
              <div className="bg-white border border-black rounded-[24px] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="font-display font-bold text-xs sm:text-sm text-black">
                    ตั้งค่าหน้ากระดาษ
                  </span>
                  {documentSource?.name && (
                    <span className="px-2 py-0.5 bg-[#dceeff] border border-black rounded-full text-[10px] font-bold truncate max-w-[160px]">
                      {documentSource.name}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setOrientation('portrait')}
                    className={`slush-pill text-[11px] py-1.5 px-2 border ${
                      orientation === 'portrait'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-black border-black hover:bg-gray-100'
                    }`}
                  >
                    แนวตั้ง (Portrait)
                  </button>
                  <button
                    onClick={() => setOrientation('landscape')}
                    className={`slush-pill text-[11px] py-1.5 px-2 border ${
                      orientation === 'landscape'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-black border-black hover:bg-gray-100'
                    }`}
                  >
                    แนวนอน (Landscape)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => setPageSize('A4')}
                      className={`py-1.5 px-2 rounded-full text-[11px] font-bold border border-black ${
                        pageSize === 'A4' ? 'bg-black text-white' : 'bg-white text-black'
                      }`}
                    >
                      A4
                    </button>
                    <button
                      onClick={() => setPageSize('Letter')}
                      className={`py-1.5 px-2 rounded-full text-[11px] font-bold border border-black ${
                        pageSize === 'Letter' ? 'bg-black text-white' : 'bg-white text-black'
                      }`}
                    >
                      Letter
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => setMargins('normal')}
                      className={`py-1.5 px-1.5 rounded-full text-[10px] font-bold border border-black ${
                        margins === 'normal' ? 'bg-black text-white' : 'bg-white text-black'
                      }`}
                      title="แสดงเส้นประขอบเขตปลอดภัยในการพิมพ์"
                    >
                      ขอบปลอดภัย
                    </button>
                    <button
                      onClick={() => setMargins('none')}
                      className={`py-1.5 px-1.5 rounded-full text-[10px] font-bold border border-black ${
                        margins === 'none' ? 'bg-black text-white' : 'bg-white text-black'
                      }`}
                    >
                      ชิดขอบเต็ม
                    </button>
                  </div>
                </div>

                {items.length >= 2 && (
                  <button
                    onClick={handleToggleCollage}
                    className={`w-full py-1.5 px-3 rounded-full border border-black text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition ${
                      collageSingleSheet
                        ? 'bg-[#55db9c] text-black'
                        : 'bg-[#e9ccff] text-black hover:bg-black hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      {collageSingleSheet
                        ? `กำลังจัดวางรวมใน 1 แผ่น (${items.length} รูป)`
                        : `รวม ${items.length} รูปมาวางในแผ่น ${pageSize} เดียว`}
                    </span>
                  </button>
                )}
              </div>

              {/* 2. Interactive Selected Item Position & Scale Studio */}
              <div className="bg-white border border-black rounded-[24px] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="font-display font-bold text-xs sm:text-sm text-black flex items-center gap-1.5">
                    <Move className="w-4 h-4 text-[#5c4ade]" />
                    <span>จัดตำแหน่ง & ขนาดบนกระดาษ</span>
                  </span>
                  {selectedItem && (
                    <span className="px-2 py-0.5 bg-[#ffd731] border border-black rounded-full text-[10px] font-extrabold">
                      ~{selectedCmWidth} ซม.
                    </span>
                  )}
                </div>

                {selectedItem ? (
                  <div className="space-y-2.5">
                    {/* Auto Trim White Margins & Rotate */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={handleAutoTrimItem}
                        disabled={isProcessingItem}
                        className="slush-pill bg-[#ffd731] hover:bg-black hover:text-white text-black text-[11px] py-1.5 px-2 border border-black flex items-center justify-center gap-1 font-extrabold disabled:opacity-50"
                        title="ตัดพื้นที่สีขาวว่างๆ รอบบัตร/รูปออกเพื่อให้ขยับวางมุมต่างๆ ได้สะดวก"
                      >
                        <Scissors className="w-3.5 h-3.5 shrink-0" />
                        <span>ตัดขอบขาวรอบรูป</span>
                      </button>

                      <button
                        onClick={handleRotateItem90}
                        disabled={isProcessingItem}
                        className="slush-pill bg-white hover:bg-gray-100 text-black text-[11px] py-1.5 px-2 border border-black flex items-center justify-center gap-1 font-bold disabled:opacity-50"
                      >
                        <RotateCw className="w-3.5 h-3.5 shrink-0" />
                        <span>หมุนรูป 90°</span>
                      </button>
                    </div>

                    {selectedItem.src !== selectedItem.origSrc && (
                      <button
                        onClick={handleRestoreItemOrig}
                        className="w-full py-1 px-2 text-[10px] font-bold bg-[#f4f3ec] border border-black rounded-full hover:bg-gray-200 flex items-center justify-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>คืนค่ารูปเดิมก่อนตัดขอบขาว</span>
                      </button>
                    )}

                    {/* Quick Alignment */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-600 mb-1">
                        จัดตำแหน่งด่วน (หรือคลิกลากบนแผ่นกระดาษได้เลย):
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() => handleAlignPreset('top-center')}
                          className="py-1.5 px-1 text-[10px] font-bold bg-[#dceeff] hover:bg-black hover:text-white border border-black rounded-full"
                          title="วางด้านบน เหลือพื้นที่ด้านล่างสำหรับเขียนสำเนาถูกต้องและเซ็นชื่อ"
                        >
                          ⬆️ ชิดบน (เว้นเซ็น)
                        </button>
                        <button
                          onClick={() => handleAlignPreset('center')}
                          className="py-1.5 px-1 text-[10px] font-bold bg-white hover:bg-black hover:text-white border border-black rounded-full"
                        >
                          🎯 กลางแผ่น
                        </button>
                        <button
                          onClick={() => handleAlignPreset('bottom-center')}
                          className="py-1.5 px-1 text-[10px] font-bold bg-white hover:bg-black hover:text-white border border-black rounded-full"
                        >
                          ⬇️ ชิดล่าง
                        </button>
                      </div>
                    </div>

                    {/* Quick Size Presets */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-600 mb-1">
                        ปรับขนาดเร็ว & สเกลละเอียด:
                      </div>
                      <div className="grid grid-cols-3 gap-1 mb-2">
                        <button
                          onClick={() => handleSizePreset('id-card')}
                          className="py-1.5 px-1 text-[10px] font-extrabold bg-[#55db9c] hover:bg-black hover:text-white border border-black rounded-full"
                          title="ปรับความกว้างเป็น ~8.56 ซม. เท่าขนาดบัตรประชาชน/บัตรเครดิตจริง"
                        >
                          🪪 เท่าบัตรจริง
                        </button>
                        <button
                          onClick={() => handleSizePreset('half')}
                          className="py-1.5 px-1 text-[10px] font-bold bg-white hover:bg-black hover:text-white border border-black rounded-full"
                        >
                          ครึ่งแผ่น (62%)
                        </button>
                        <button
                          onClick={() => handleSizePreset('full')}
                          className="py-1.5 px-1 text-[10px] font-bold bg-white hover:bg-black hover:text-white border border-black rounded-full"
                        >
                          พอดีเต็มแผ่น
                        </button>
                      </div>

                      <div className="bg-[#f4f3ec] border border-black rounded-xl p-2">
                        <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                          <span>ขนาดความกว้างบนกระดาษ:</span>
                          <span>
                            {Math.round(selectedItem.wPct)}% (~{selectedCmWidth} ซม.)
                          </span>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="100"
                          step="1"
                          value={Math.round(selectedItem.wPct)}
                          onChange={(e) => handleWidthSlider(Number(e.target.value))}
                          className="w-full accent-black cursor-pointer h-2 bg-gray-200 rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Add another photo (e.g. Back of ID Card) onto same sheet */}
                    <button
                      onClick={() => addImageInputRef.current?.click()}
                      className="w-full py-1.5 px-3 text-[11px] font-bold bg-[#e9ccff] hover:bg-black hover:text-white border border-black rounded-full flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>เพิ่มรูปอื่นมาวางบนแผ่นนี้ (เช่น ด้านหลังบัตร)</span>
                    </button>
                    <input
                      ref={addImageInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleAddImageToSheet}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-gray-400">
                    เลือกหรือนำเข้าเอกสารเพื่อปรับตำแหน่ง
                  </div>
                )}
              </div>
            </div>

            {/* Print Action */}
            <div className="space-y-1.5 shrink-0">
              <button
                disabled={items.length === 0 || isLoading || isPrinting}
                onClick={handleTriggerPrint}
                className="w-full slush-pill bg-[#4da2ff] hover:bg-black hover:text-white text-white text-sm py-3 px-6 border border-black font-extrabold flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Printer className="w-5 h-5" />
                <span>
                  {isPrinting
                    ? 'กำลังจัดเตรียมหน้าพิมพ์...'
                    : `สั่งพิมพ์ทันที (${totalSheets} แผ่น)`}
                </span>
              </button>

              <div className={`grid gap-1.5 ${onGoBack && onProjectComplete && items.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {onGoBack && (
                  <button
                    onClick={onGoBack}
                    className="slush-pill bg-[#ffd731] hover:bg-black hover:text-white text-black text-xs py-2 px-3 border border-black flex items-center justify-center gap-1.5 font-bold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span>ย้อนกลับแก้เอกสาร</span>
                  </button>
                )}

                {onProjectComplete && items.length > 0 && (
                  <button
                    onClick={() => onProjectComplete('✨ เริ่มโปรเจคเอกสารใหม่เรียบร้อยแล้ว')}
                    className="slush-pill bg-white hover:bg-gray-100 text-black text-xs py-2 px-3 border border-black flex items-center justify-center gap-1.5"
                  >
                    <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
                    <span>เริ่มโปรเจคใหม่</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Interactive Visual Sheet Editor */}
          <div className="md:col-span-7 bg-[#e9e9e9]/70 border border-black rounded-[24px] p-3 sm:p-4 flex flex-col min-h-[380px] overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-extrabold text-black flex items-center gap-1.5">
                <span>🎯 คลิกแล้วลากเอกสารบนกระดาษ หรือดึงมุมขวาล่างเพื่อปรับขนาด</span>
              </span>

              {totalSheets > 1 && (
                <div className="flex items-center gap-1 bg-white border border-black rounded-full px-2 py-0.5 text-[11px] font-bold">
                  <button
                    onClick={() => setActiveSheetIdx((s) => Math.max(0, s - 1))}
                    disabled={safeSheetIdx === 0}
                    className="p-0.5 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span>
                    แผ่นที่ {safeSheetIdx + 1} / {totalSheets}
                  </span>
                  <button
                    onClick={() => setActiveSheetIdx((s) => Math.min(totalSheets - 1, s + 1))}
                    disabled={safeSheetIdx >= totalSheets - 1}
                    className="p-0.5 disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden [container-type:size]">
              {isLoading ? (
                <div className="text-xs font-bold text-black flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>กำลังจัดเตรียมกระดาษจำลอง...</span>
                </div>
              ) : items.length > 0 ? (
                <div
                  ref={sheetRef}
                  className="bg-white border-2 border-black relative select-none overflow-hidden touch-none"
                  style={{
                    width: `min(94cqw, calc(94cqh * ${sheetAspect}))`,
                    aspectRatio: String(sheetAspect),
                  }}
                >
                  {/* Safe margin visual guide */}
                  {margins === 'normal' && (
                    <div
                      className="absolute border border-dashed border-gray-300 pointer-events-none z-0"
                      style={{ top: '4.5%', right: '4.5%', bottom: '4.5%', left: '4.5%' }}
                    />
                  )}

                  {/* Magnetic Snap Center Lines (appear while centered) */}
                  {snapGuides.xCenter && (
                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-[#4da2ff] z-20 pointer-events-none" />
                  )}
                  {snapGuides.yCenter && (
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-[#4da2ff] z-20 pointer-events-none" />
                  )}

                  {/* Draggable & Resizable Items on the current sheet */}
                  {currentSheetItems.map((item) => {
                    const hPct = computeHeightPct(item);
                    const isSelected = selectedItem?.id === item.id;

                    return (
                      <div
                        key={item.id}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setSelectedItemId(item.id);
                          setDragState({
                            mode: 'move',
                            itemId: item.id,
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            startX: item.xPct,
                            startY: item.yPct,
                            startW: item.wPct,
                          });
                        }}
                        style={{
                          left: `${item.xPct}%`,
                          top: `${item.yPct}%`,
                          width: `${item.wPct}%`,
                          height: `${hPct}%`,
                        }}
                        className={`absolute cursor-move transition-[outline] ${
                          isSelected
                            ? 'ring-2 ring-[#4da2ff] outline outline-1 outline-dashed outline-black z-10'
                            : 'hover:ring-1 hover:ring-black/40 z-5'
                        }`}
                      >
                        <img
                          src={item.src}
                          alt="Printable item"
                          className="w-full h-full object-fill pointer-events-none select-none"
                        />

                        {isSelected && (
                          <>
                            <span className="absolute -top-5 left-0 px-1.5 py-0.5 bg-black text-white text-[9px] font-bold rounded pointer-events-none whitespace-nowrap">
                              ลากย้ายตำแหน่งได้
                            </span>

                            {/* Bottom-Right Resize Handle */}
                            <div
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setDragState({
                                  mode: 'resize',
                                  itemId: item.id,
                                  startClientX: e.clientX,
                                  startClientY: e.clientY,
                                  startX: item.xPct,
                                  startY: item.yPct,
                                  startW: item.wPct,
                                });
                              }}
                              title="ลากมุมนี้เพื่อย่อ/ขยายขนาด"
                              className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#55db9c] border-2 border-black rounded-sm cursor-nwse-resize z-20"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <p className="text-xs font-bold text-gray-500">
                    ยังไม่มีเอกสารที่เตรียมไว้สำหรับจัดหน้าและพิมพ์
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {onSelectTool && (
                      <button
                        onClick={() => onSelectTool('scanner')}
                        className="slush-pill bg-[#55db9c] text-black text-xs py-2 px-4 border border-black flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>ไปหน้าสแกนเอกสาร</span>
                      </button>
                    )}
                    {onOpenFileInput && (
                      <button
                        onClick={onOpenFileInput}
                        className="slush-pill bg-white text-black text-xs py-2 px-4 border border-black flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>เลือกไฟล์เอกสาร</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Post-Print Choice Overlay: distinguishes Print Done vs Cancel & Step Back */}
        {showPostPrintPrompt && (
          <div className="absolute inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black rounded-[28px] p-6 max-w-md w-full text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#dceeff] border border-black flex items-center justify-center mx-auto">
                <Printer className="w-7 h-7 text-[#4da2ff]" />
              </div>
              <div>
                <h3 className="font-display font-black text-xl text-black">
                  ออกจากหน้าต่างสั่งพิมพ์แล้ว
                </h3>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  เอกสารของคุณยังคงอยู่ — เลือกขั้นตอนถัดไปที่ต้องการได้เลย
                </p>
              </div>

              <div className="space-y-2 pt-1">
                {onProjectComplete && (
                  <button
                    onClick={() => {
                      setShowPostPrintPrompt(false);
                      onProjectComplete('🖨️ พิมพ์เอกสารเรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
                    }}
                    className="w-full slush-pill bg-[#55db9c] hover:bg-[#3fcf8c] text-black font-extrabold text-xs sm:text-sm py-3 px-4 border border-black flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>พิมพ์สำเร็จแล้ว — เริ่มโปรเจคใหม่ทันที</span>
                  </button>
                )}

                {onGoBack && (
                  <button
                    onClick={() => {
                      setShowPostPrintPrompt(false);
                      onGoBack();
                    }}
                    className="w-full slush-pill bg-[#ffd731] hover:bg-black hover:text-white text-black font-extrabold text-xs sm:text-sm py-3 px-4 border border-black flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    <span>{backLabel} (แก้ภาพ/เอกสารเดิม)</span>
                  </button>
                )}

                <button
                  onClick={() => setShowPostPrintPrompt(false)}
                  className="w-full slush-pill bg-white hover:bg-gray-100 text-black font-bold text-xs py-2.5 px-4 border border-black flex items-center justify-center gap-2"
                >
                  <Move className="w-3.5 h-3.5 shrink-0" />
                  <span>ปรับจัดตำแหน่งบนหน้ากระดาษนี้ต่อ</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
