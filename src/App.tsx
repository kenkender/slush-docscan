import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, X } from 'lucide-react';
import { Header } from './components/Header';
import { HeroDropzone } from './components/HeroDropzone';
import { GridMenu } from './components/GridMenu';
import { Footer } from './components/Footer';
import { CameraScannerModal } from './components/CameraScannerModal';
import { PdfEditorModal } from './components/PdfEditorModal';
import { OcrModal } from './components/OcrModal';
import { SignatureModal } from './components/SignatureModal';
import { ConverterModal } from './components/ConverterModal';
import { MergeSplitModal } from './components/MergeSplitModal';
import { CompressModal } from './components/CompressModal';
import { WatermarkModal } from './components/WatermarkModal';
import { DirectPrintModal } from './components/DirectPrintModal';
import { MobileQrModal } from './components/MobileQrModal';
import { generateSampleInvoicePdf } from './utils/demoFiles';
import { createPdfFromImages } from './utils/pdfHelper';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { ToolType } from './types/document';

export const App: React.FC = () => {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [previousTool, setPreviousTool] = useState<ToolType | null>(null);
  const [isMobileQrOpen, setIsMobileQrOpen] = useState(false);
  const [projectSessionKey, setProjectSessionKey] = useState(0);
  const [projectToast, setProjectToast] = useState<string | null>(null);

  // Current active file loaded in memory (only during an active workflow)
  const [currentFile, setCurrentFile] = useState<{
    buffer?: ArrayBuffer;
    dataUrl?: string;
    images?: string[];
    name: string;
    type?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.removeItem('slush_saved_signatures');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!projectToast) return;
    const timer = setTimeout(() => setProjectToast(null), 4500);
    return () => clearTimeout(timer);
  }, [projectToast]);

  // Trigger file loading from dropzone or top navigation (starts a fresh project with this file)
  const handleFileLoaded = async (file: File) => {
    setPreviousTool(null);
    setProjectSessionKey((prev) => prev + 1);

    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (isPdf) {
      const buffer = await file.arrayBuffer();
      setCurrentFile({ buffer, name: file.name, type: 'pdf' });
      setActiveTool('pdf-editor');
    } else if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setCurrentFile({ dataUrl, name: file.name, type: 'image' });
        setActiveTool('ocr');
      };
      reader.readAsDataURL(file);
    } else {
      const buffer = await file.arrayBuffer();
      setCurrentFile({ buffer, name: file.name, type: 'docx' });
      setActiveTool('converter');
    }

    try {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    } catch {
      // ignore
    }
  };

  // Load Built-in Demo PDF / Scanned Document
  const handleLoadDemo = async (targetTool: ToolType = 'pdf-editor') => {
    setPreviousTool(null);
    setProjectSessionKey((prev) => prev + 1);
    const sample = await generateSampleInvoicePdf();
    setCurrentFile({
      buffer: sample.buffer,
      name: sample.name,
      type: 'pdf',
    });
    setActiveTool(targetTool);
    try {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
    } catch {
      // ignore
    }
  };

  // Opening any tool from Header, HeroDropzone, or GridMenu ALWAYS starts a fresh project with no leftover files
  const handleSelectTool = (tool: ToolType) => {
    try {
      localStorage.removeItem('slush_saved_signatures');
    } catch {
      // ignore
    }
    setPreviousTool(null);
    setCurrentFile(null);
    setProjectSessionKey((prev) => prev + 1);
    setActiveTool(tool);
  };

  // Closing any modal via X button discards any leftover/in-progress files so next menu open is 100% clean
  const handleCloseModal = () => {
    try {
      localStorage.removeItem('slush_saved_signatures');
    } catch {
      // ignore
    }
    setActiveTool(null);
    setPreviousTool(null);
    setCurrentFile(null);
    setProjectSessionKey((prev) => prev + 1);
  };

  // Workflow bridge between tools (remembers origin step so user can step back!)
  const handleSendToTool = async (
    tool: ToolType,
    fileData: { buffer?: ArrayBuffer; dataUrl?: string; images?: string[]; name: string }
  ) => {
    let nextFile = { ...fileData };

    // If sending scanned image(s) without a PDF buffer to a PDF-based studio (pdf-editor, signature, watermark, compress),
    // automatically wrap the image(s) into a PDF ArrayBuffer so the target tool opens the document immediately
    if (
      !nextFile.buffer &&
      (tool === 'pdf-editor' || tool === 'signature' || tool === 'watermark')
    ) {
      const imgList =
        nextFile.images && nextFile.images.length > 0
          ? nextFile.images
          : nextFile.dataUrl
          ? [nextFile.dataUrl]
          : [];
      if (imgList.length > 0) {
        try {
          const pdfBytes = await createPdfFromImages(imgList, 'A4');
          nextFile = {
            ...nextFile,
            buffer: pdfBytes.buffer.slice(0) as ArrayBuffer,
            name: nextFile.name.endsWith('.pdf') ? nextFile.name : `${nextFile.name}.pdf`,
          };
        } catch (e) {
          console.error('Failed to convert images to PDF for tool bridge:', e);
        }
      }
    }

    setPreviousTool(activeTool);
    setCurrentFile(nextFile);
    setActiveTool(tool);
    try {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
    } catch {
      // ignore
    }
  };

  // Step back to previous studio tool (e.g. from Print Studio -> Scanner) without losing active project
  const handleGoBackStep = () => {
    if (previousTool) {
      setActiveTool(previousTool);
      setPreviousTool(null);
    }
  };

  // Cleanly finish current project & reset workspace for a fresh project after Save or Print
  const handleCompleteProject = (message: string) => {
    try {
      localStorage.removeItem('slush_saved_signatures');
    } catch {
      // ignore
    }
    setCurrentFile(null);
    setActiveTool(null);
    setPreviousTool(null);
    setProjectSessionKey((prev) => prev + 1);
    setProjectToast(message);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#dceeff] app-shell">
      {/* Hidden Global File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileLoaded(e.target.files[0]);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Project Completion / New Project Notification Pill */}
      {projectToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] no-print px-4 w-full max-w-md flex justify-center">
          <div className="bg-[#55db9c] text-black border border-black rounded-full px-4 py-2.5 flex items-center gap-2.5 text-xs sm:text-sm font-extrabold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{projectToast}</span>
            <button
              onClick={() => setProjectToast(null)}
              className="w-5 h-5 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center shrink-0"
              title="ปิดการแจ้งเตือน"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <Header
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        onOpenFileInput={() => fileInputRef.current?.click()}
        onLoadDemo={() => handleLoadDemo('pdf-editor')}
        onOpenMobileQr={() => setIsMobileQrOpen(true)}
      />

      {/* Main Page Content (suppressed during print) */}
      <main className="flex-1 no-print">
        {/* Slush Hero Section with Inflatable Ribbon and Dropzone */}
        <HeroDropzone
          onFileLoaded={handleFileLoaded}
          onSelectTool={handleSelectTool}
          onLoadDemo={() => handleLoadDemo('pdf-editor')}
        />

        {/* The 9-Card Grid Menu */}
        <GridMenu onSelectTool={handleSelectTool} />
      </main>

      {/* Footer */}
      <Footer />

      {/* MODALS */}
      <ErrorBoundary
        resetKey={`${activeTool ?? 'none'}-${isMobileQrOpen}-${projectSessionKey}`}
        onReset={() => {
          handleCloseModal();
          setIsMobileQrOpen(false);
        }}
      >
        {/* 1. Camera Document Scanner */}
        <CameraScannerModal
          key={`scanner-${projectSessionKey}`}
          isOpen={activeTool === 'scanner'}
          onClose={handleCloseModal}
          onSendToTool={handleSendToTool}
          onProjectComplete={handleCompleteProject}
        />

        {/* 2. PDF Text Editor & Redactor */}
        <PdfEditorModal
          key={`pdf-editor-${projectSessionKey}`}
          isOpen={activeTool === 'pdf-editor'}
          onClose={handleCloseModal}
          pdfBuffer={currentFile?.buffer || null}
          documentName={currentFile?.name || 'เอกสาร.pdf'}
          onSendToTool={handleSendToTool}
          onProjectComplete={handleCompleteProject}
        />

        {/* 3. Thai & English OCR to Text */}
        <OcrModal
          key={`ocr-${projectSessionKey}`}
          isOpen={activeTool === 'ocr'}
          onClose={handleCloseModal}
          initialSource={currentFile}
          onSendToTool={handleSendToTool}
          onProjectComplete={handleCompleteProject}
        />

        {/* 4. Signature & Stamp Studio */}
        <SignatureModal
          key={`signature-${projectSessionKey}`}
          isOpen={activeTool === 'signature'}
          onClose={handleCloseModal}
          pdfBuffer={currentFile?.buffer || null}
          documentName={currentFile?.name || 'เอกสาร.pdf'}
          onSendToTool={handleSendToTool}
          onProjectComplete={handleCompleteProject}
        />

        {/* 5. Universal File Converter */}
        <ConverterModal
          key={`converter-${projectSessionKey}`}
          isOpen={activeTool === 'converter'}
          onClose={handleCloseModal}
          initialFile={currentFile}
          onSendToTool={handleSendToTool}
          onProjectComplete={handleCompleteProject}
        />

        {/* 6. Merge & Split PDF */}
        <MergeSplitModal
          key={`merge-split-${projectSessionKey}`}
          isOpen={activeTool === 'merge-split'}
          onClose={handleCloseModal}
          initialBuffer={currentFile?.buffer || null}
          documentName={currentFile?.name}
          onSendToTool={handleSendToTool}
          onProjectComplete={handleCompleteProject}
        />

        {/* 7. Compress & Reduce File Size */}
        <CompressModal
          key={`compress-${projectSessionKey}`}
          isOpen={activeTool === 'compress'}
          onClose={handleCloseModal}
          initialFile={currentFile}
          onProjectComplete={handleCompleteProject}
        />

        {/* 8. Watermark Modal */}
        <WatermarkModal
          key={`watermark-${projectSessionKey}`}
          isOpen={activeTool === 'watermark'}
          onClose={handleCloseModal}
          pdfBuffer={currentFile?.buffer || null}
          documentName={currentFile?.name || 'เอกสาร.pdf'}
          onProjectComplete={handleCompleteProject}
        />

        {/* 9. Direct Print Center */}
        <DirectPrintModal
          key={`print-${projectSessionKey}`}
          isOpen={activeTool === 'print'}
          onClose={handleCloseModal}
          documentSource={currentFile}
          previousTool={previousTool}
          onGoBack={previousTool ? handleGoBackStep : undefined}
          onProjectComplete={handleCompleteProject}
          onSelectTool={handleSelectTool}
          onOpenFileInput={() => fileInputRef.current?.click()}
        />

        {/* 10. Mobile QR Connect Modal */}
        <MobileQrModal
          isOpen={isMobileQrOpen}
          onClose={() => setIsMobileQrOpen(false)}
          localIp="192.168.49.60"
          port={5173}
        />
      </ErrorBoundary>
    </div>
  );
};

export default App;
