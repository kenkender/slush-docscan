import React from 'react';

export const StickerRocket: React.FC<{ className?: string; rotate?: string }> = ({ className = '', rotate = '-rotate-12' }) => (
  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#fb4903] text-white border border-black rounded-[18px] select-none ${rotate} ${className}`}>
    <span className="text-base">🚀</span>
    <span className="text-xs font-bold tracking-wider uppercase">ULTRA FAST</span>
  </div>
);

export const StickerOcr: React.FC<{ className?: string; rotate?: string }> = ({ className = '', rotate = 'rotate-6' }) => (
  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#55db9c] text-black border border-black rounded-[18px] select-none ${rotate} ${className}`}>
    <span className="text-base">👁️</span>
    <span className="text-xs font-bold tracking-wider uppercase">THAI + ENG OCR</span>
  </div>
);

export const StickerSignature: React.FC<{ className?: string; rotate?: string }> = ({ className = '', rotate = '-rotate-6' }) => (
  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5c4ade] text-white border border-black rounded-[18px] select-none ${rotate} ${className}`}>
    <span className="text-base">✍️</span>
    <span className="text-xs font-bold tracking-wider uppercase">E-SIGN READY</span>
  </div>
);

export const StickerSeal: React.FC<{ className?: string; rotate?: string }> = ({ className = '', rotate = 'rotate-12' }) => (
  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ffd731] text-black border border-black rounded-[18px] select-none ${rotate} ${className}`}>
    <span className="text-base">★</span>
    <span className="text-xs font-bold tracking-wider uppercase">สำเนาถูกต้อง</span>
  </div>
);

export const StickerPrint: React.FC<{ className?: string; rotate?: string }> = ({ className = '', rotate = '-rotate-3' }) => (
  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e9ccff] text-black border border-black rounded-[18px] select-none ${rotate} ${className}`}>
    <span className="text-base">🖨️</span>
    <span className="text-xs font-bold tracking-wider uppercase">DIRECT PRINT</span>
  </div>
);

/**
 * Slush 3D Blue Ribbon Curved Sculpture motif
 */
export const Slush3DRibbon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 1000 240"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`w-full pointer-events-none select-none ${className}`}
  >
    {/* Dark ribbon depth back-layer */}
    <path
      d="M -50 180 C 150 260, 320 80, 520 120 C 720 160, 850 40, 1050 90 L 1050 140 C 850 90, 720 210, 520 170 C 320 130, 150 310, -50 230 Z"
      fill="#297fdc"
      stroke="#000000"
      strokeWidth="2"
    />
    {/* Main Electric Blue tubular ribbon */}
    <path
      d="M -50 140 C 160 210, 310 40, 510 80 C 710 120, 840 -10, 1050 40 L 1050 110 C 840 60, 710 190, 510 150 C 310 110, 160 280, -50 210 Z"
      fill="#4da2ff"
      stroke="#000000"
      strokeWidth="2.5"
    />
    {/* Highlight tube reflection */}
    <path
      d="M -40 148 C 160 218, 305 52, 505 92 C 705 132, 835 5, 1040 52"
      stroke="#ffffff"
      strokeWidth="4"
      strokeLinecap="round"
      opacity="0.6"
    />
  </svg>
);
