import React, { useState, useRef, useEffect } from 'react';
import { Layers, Scissors, Plus, Trash2, Upload, FileText, X } from 'lucide-react';
import { mergePdfs, splitPdf, getPdfPageCount } from '../utils/pdfHelper';
import type { ToolType } from '../types/document';

interface MergeSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBuffer?: ArrayBuffer | null;
  documentName?: string;
  onSendToTool?: (tool: ToolType, fileData: { buffer?: ArrayBuffer; dataUrl?: string; name: string }) => void;
  onProjectComplete?: (message: string) => void;
}

export const MergeSplitModal: React.FC<MergeSplitModalProps> = ({
  isOpen,
  onClose,
  initialBuffer,
  documentName,
  onProjectComplete,
}) => {
  const [mode, setMode] = useState<'merge' | 'split'>('merge');

  // Merge state
  const [mergeFiles, setMergeFiles] = useState<Array<{ name: string; buffer: ArrayBuffer; pages: number }>>([]);

  // Split state
  const [splitPageInput, setSplitPageInput] = useState('1');
  const [splitDocTotalPages, setSplitDocTotalPages] = useState(1);
  const [splitBuffer, setSplitBuffer] = useState<ArrayBuffer | null>(null);
  const [splitDocName, setSplitDocName] = useState<string>(documentName || '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitFileInputRef = useRef<HTMLInputElement>(null);

  // Initialize if initialBuffer provided
  useEffect(() => {
    if (initialBuffer) {
      getPdfPageCount(initialBuffer).then((pages) => {
        setSplitDocTotalPages(pages);
        setSplitBuffer(initialBuffer);
        setSplitDocName(documentName || 'Document 1.pdf');
        setMergeFiles([{ name: documentName || 'Document 1.pdf', buffer: initialBuffer, pages }]);
      });
    } else {
      setSplitBuffer(null);
      setSplitDocName('');
      setMergeFiles([]);
    }
  }, [initialBuffer, documentName]);

  if (!isOpen) return null;

  const handleAddMergeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      for (const file of Array.from(e.target.files)) {
        const buffer = await file.arrayBuffer();
        const pages = await getPdfPageCount(buffer);
        setMergeFiles((prev) => [...prev, { name: file.name, buffer, pages }]);
      }
      e.target.value = '';
    }
  };

  const handleSelectSplitFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const pages = await getPdfPageCount(buffer);
      setSplitBuffer(buffer);
      setSplitDocName(file.name);
      setSplitDocTotalPages(pages);
      setSplitPageInput('1');
    } catch (err) {
      console.error(err);
    } finally {
      e.target.value = '';
    }
  };

  const handleExecuteMerge = async () => {
    if (mergeFiles.length < 2) return;
    try {
      const buffers = mergeFiles.map((f) => f.buffer);
      const mergedBytes = await mergePdfs(buffers);
      const blob = new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `รวมเอกสาร_Merged_${Date.now()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMergeFiles([]);
      if (onProjectComplete) {
        onProjectComplete('📚 รวมเอกสาร PDF และบันทึกเรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการรวมเอกสาร');
    }
  };

  const handleExecuteSplit = async () => {
    if (!splitBuffer) return;
    try {
      const pagesToExtract: number[] = [];
      const parts = splitPageInput.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes('-')) {
          const [start, end] = trimmed.split('-').map(Number);
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= splitDocTotalPages) pagesToExtract.push(i);
          }
        } else {
          const num = Number(trimmed);
          if (num >= 1 && num <= splitDocTotalPages) pagesToExtract.push(num);
        }
      }

      if (pagesToExtract.length === 0) {
        alert('กรุณาระบุหน้าที่ต้องการแยกให้ถูกต้อง');
        return;
      }

      const splitBytes = await splitPdf(splitBuffer, pagesToExtract);
      const blob = new Blob([new Uint8Array(splitBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `แยกเอกสาร_หน้า_${pagesToExtract.join('_')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (onProjectComplete) {
        onProjectComplete('✂️ แยกหน้า PDF และบันทึกเรียบร้อยแล้ว — เริ่มโปรเจคใหม่พร้อมใช้งาน');
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการแยกหน้าเอกสาร');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden no-print">
      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black flex items-center justify-between bg-[#dceeff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e9ccff] border border-black flex items-center justify-center">
              <Layers className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-xl text-black">
                  รวมไฟล์ & แยกหน้าเอกสาร PDF
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-[#55db9c] border border-black rounded-full">
                  Merge & Split PDF
                </span>
              </div>
              <p className="text-xs text-gray-600">
                รวมไฟล์ PDF หลายเล่มเข้าเป็นไฟล์เดียว หรือเลือกแยกเฉพาะหน้าที่ต้องการออกมา
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

        {/* Mode Selector */}
        <div className="p-3 bg-[#f4f3ec] border-b border-black flex items-center justify-center gap-3">
          <button
            onClick={() => setMode('merge')}
            className={`slush-pill text-xs py-2 px-5 border ${
              mode === 'merge' ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>รวมไฟล์ PDF หลายเล่ม (Merge)</span>
          </button>

          <button
            onClick={() => setMode('split')}
            className={`slush-pill text-xs py-2 px-5 border ${
              mode === 'split' ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
            }`}
          >
            <Scissors className="w-4 h-4" />
            <span>แยกหน้าเฉพาะที่ต้องการ (Split)</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#f8f9fa] flex flex-col items-center">
          {mode === 'merge' ? (
            <div className="w-full max-w-2xl bg-white border border-black rounded-[28px] p-6">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                <span className="font-display font-bold text-base text-black">
                  รายการไฟล์ PDF ที่จะรวม ({mergeFiles.length} ไฟล์):
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="slush-pill bg-white text-xs py-1.5 px-3 border border-black hover:bg-gray-100 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มไฟล์ PDF</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleAddMergeFile}
                  className="hidden"
                />
              </div>

              {mergeFiles.length === 0 ? (
                <div className="text-center py-10 text-xs text-gray-500">
                  คลิกปุ่ม &apos;เพิ่มไฟล์ PDF&apos; เพื่อเลือกไฟล์ตั้งแต่ 2 ไฟล์ขึ้นไปที่ต้องการรวมเล่ม
                </div>
              ) : (
                <div className="space-y-2 mb-6">
                  {mergeFiles.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-black rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-xs text-black block truncate max-w-sm">
                            {f.name}
                          </span>
                          <span className="text-[10px] text-gray-500">จำนวน {f.pages} หน้า</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setMergeFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-gray-400 hover:text-[#fb4903]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                disabled={mergeFiles.length < 2}
                onClick={handleExecuteMerge}
                className="w-full slush-pill bg-[#55db9c] text-black text-xs py-3 px-6 border border-black font-extrabold disabled:opacity-40"
              >
                รวมไฟล์เป็นเอกสารเดียวทันที ({mergeFiles.reduce((acc, f) => acc + f.pages, 0)} หน้า)
              </button>
            </div>
          ) : (
            <div className="w-full max-w-xl bg-white border border-black rounded-[28px] p-6">
              <input
                ref={splitFileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleSelectSplitFile}
                className="hidden"
              />

              <div className="p-3 bg-[#f4f3ec] border border-black rounded-2xl flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-[#5c4ade] shrink-0" />
                  <span className="text-xs font-extrabold text-black truncate">
                    {splitBuffer ? `${splitDocName} (${splitDocTotalPages} หน้า)` : 'ยังไม่ได้เลือกไฟล์ PDF ที่จะแยกหน้า'}
                  </span>
                </div>
                <button
                  onClick={() => splitFileInputRef.current?.click()}
                  className="px-3 py-1 rounded-full bg-white border border-black text-xs font-bold hover:bg-gray-100 flex items-center gap-1 shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>เลือกไฟล์ PDF</span>
                </button>
              </div>

              <h4 className="font-display font-bold text-base text-black mb-1">
                กำหนดหน้าที่ต้องการดึงออกมา
              </h4>
              <p className="text-xs text-gray-500 mb-4">
                {splitBuffer
                  ? `เอกสารที่เลือกมีทั้งหมด ${splitDocTotalPages} หน้า`
                  : 'กรุณาเลือกไฟล์ PDF ด้านบนก่อนระบุเลขหน้า'}
              </p>

              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  ระบุหน้า (เช่น 1 หรือ 1, 3 หรือ 1-3, 5):
                </label>
                <input
                  type="text"
                  value={splitPageInput}
                  onChange={(e) => setSplitPageInput(e.target.value)}
                  placeholder="เช่น 1-3, 5"
                  className="w-full p-3 bg-gray-50 border border-black rounded-xl text-sm font-bold focus:outline-none"
                />
              </div>

              <button
                disabled={!splitBuffer}
                onClick={handleExecuteSplit}
                className="w-full slush-pill bg-black text-white text-xs py-3 px-6 border border-black font-extrabold disabled:opacity-40"
              >
                แยกหน้าและดาวน์โหลด PDF ทันที
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
