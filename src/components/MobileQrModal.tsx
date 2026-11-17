import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Copy, Check, X, Wifi } from 'lucide-react';

interface MobileQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  localIp: string;
  port: number;
}

export const MobileQrModal: React.FC<MobileQrModalProps> = ({
  isOpen,
  onClose,
  localIp,
  port,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const fullUrl = `http://${localIp}:${port}`;

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(fullUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error(err));
    }
  }, [isOpen, fullUrl]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden no-print">
      <div className="bg-white border-2 border-black rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black flex items-center justify-between bg-[#dceeff]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#5c4ade] border border-black flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-display font-black text-xl text-black">
                เปิดใช้งานบนมือถือ
              </h2>
              <p className="text-xs text-gray-600">
                สแกน QR Code หรือพิมพ์ IP Address บนมือถือ
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

        {/* Slush QR Card */}
        <div className="p-6 flex flex-col items-center">
          {/* Slush 20px radius card with #5c4ade background */}
          <div className="w-full bg-[#5c4ade] border border-black rounded-[24px] p-5 flex flex-col items-center text-center shadow-sm">
            <div className="bg-white border border-black rounded-[18px] p-3 mb-4 shadow-xs">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code for Mobile" className="w-52 h-52 object-contain" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-gray-400">
                  กำลังสร้าง QR Code...
                </div>
              )}
            </div>

            <span className="font-display font-extrabold text-sm text-white tracking-widest uppercase mb-1">
              📱 SCAN TO OPEN ON MOBILE
            </span>
            <span className="text-xs text-blue-100 font-medium">
              เปิดกล้องมือถือแล้วส่องที่ QR Code นี้ได้เลย
            </span>
          </div>

          {/* Direct URL Box */}
          <div className="w-full mt-5 bg-gray-50 border border-black rounded-2xl p-3 flex items-center justify-between gap-2">
            <div className="overflow-hidden">
              <span className="text-[10px] text-gray-500 font-bold block">
                หรือพิมพ์ URL นี้ในเบราว์เซอร์มือถือ:
              </span>
              <span className="font-mono text-sm font-bold text-black truncate block">
                {fullUrl}
              </span>
            </div>

            <button
              onClick={handleCopy}
              className={`slush-pill text-xs py-1.5 px-3 border shrink-0 ${
                copied ? 'bg-[#55db9c] text-black border-black font-bold' : 'bg-black text-white border-black'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>คัดลอก</span>
                </>
              )}
            </button>
          </div>

          {/* Wi-Fi Requirement note */}
          <div className="mt-4 flex items-start gap-2.5 text-left bg-[#ffd731]/20 border border-black p-3 rounded-2xl text-xs text-gray-800">
            <Wifi className="w-4 h-4 text-black shrink-0 mt-0.5" />
            <div>
              <strong className="block text-black">เงื่อนไขสำคัญ:</strong>
              มือถือและคอมพิวเตอร์เครื่องนี้จะต้องเชื่อมต่อ <strong>Wi-Fi วงเดียวกัน</strong> (หรือ Hotspot เดียวกัน) ครับ
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
