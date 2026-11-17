import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Generate a realistic official document / invoice PDF for quick testing
 */
export async function generateSampleInvoicePdf(): Promise<{ buffer: ArrayBuffer; name: string }> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();

  // Header Box
  page.drawRectangle({
    x: 40,
    y: height - 100,
    width: width - 80,
    height: 60,
    color: rgb(0.86, 0.93, 1.0), // Sky wash
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  page.drawText('SLUSH CORP - OFFICIAL DOCUMENT & INVOICE', {
    x: 60,
    y: height - 68,
    size: 16,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  page.drawText('Document No: INV-2026-9982   |   Date: 17 November 2026', {
    x: 60,
    y: height - 88,
    size: 10,
    font: fontHelvetica,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Client Details
  page.drawText('BILL TO / CUSTOMER INFORMATION:', {
    x: 40,
    y: height - 135,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  page.drawText('Organization: Department of Digital Document Services\nContact Person: Somchai Prasert\nAddress: 123 Sukhumvit Road, Bangkok 10110, Thailand\nTax ID: 0105562089123', {
    x: 40,
    y: height - 155,
    size: 10,
    font: fontHelvetica,
    lineHeight: 15,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Items Table Header
  const tableTop = height - 250;
  page.drawRectangle({
    x: 40,
    y: tableTop,
    width: width - 80,
    height: 25,
    color: rgb(0.3, 0.63, 1.0), // Electric Blue
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  page.drawText('ITEM DESCRIPTION', { x: 50, y: tableTop + 7, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('QTY', { x: 340, y: tableTop + 7, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('UNIT PRICE (THB)', { x: 400, y: tableTop + 7, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('TOTAL (THB)', { x: 500, y: tableTop + 7, size: 9, font: fontBold, color: rgb(1, 1, 1) });

  // Rows
  const items = [
    { desc: '1. Document Scanner AI License (Enterprise)', qty: '1', price: '12,500.00', total: '12,500.00' },
    { desc: '2. Thai-English OCR Processing Engine', qty: '1', price: '8,900.00', total: '8,900.00' },
    { desc: '3. Digital Signature & Verification Seal Module', qty: '2', price: '3,200.00', total: '6,400.00' },
    { desc: '4. Cloud Archiving & Universal PDF Converter', qty: '1', price: '4,500.00', total: '4,500.00' },
  ];

  let curY = tableTop - 25;
  items.forEach((item, idx) => {
    page.drawRectangle({
      x: 40,
      y: curY,
      width: width - 80,
      height: 25,
      color: idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });

    page.drawText(item.desc, { x: 50, y: curY + 7, size: 9, font: fontHelvetica, color: rgb(0, 0, 0) });
    page.drawText(item.qty, { x: 345, y: curY + 7, size: 9, font: fontHelvetica, color: rgb(0, 0, 0) });
    page.drawText(item.price, { x: 410, y: curY + 7, size: 9, font: fontHelvetica, color: rgb(0, 0, 0) });
    page.drawText(item.total, { x: 505, y: curY + 7, size: 9, font: fontHelvetica, color: rgb(0, 0, 0) });

    curY -= 25;
  });

  // Summary box
  const sumY = curY - 20;
  page.drawText('SUBTOTAL:', { x: 380, y: sumY, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('32,300.00 THB', { x: 490, y: sumY, size: 10, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('VAT (7%):', { x: 380, y: sumY - 18, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('2,261.00 THB', { x: 490, y: sumY - 18, size: 10, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawRectangle({
    x: 370,
    y: sumY - 45,
    width: width - 410,
    height: 22,
    color: rgb(0.98, 0.84, 0.19), // Sunburst yellow
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  page.drawText('GRAND TOTAL:', { x: 380, y: sumY - 39, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('34,561.00 THB', { x: 485, y: sumY - 39, size: 10, font: fontBold, color: rgb(0, 0, 0) });

  // Signature Block
  const sigY = 120;
  page.drawRectangle({
    x: 320,
    y: sigY,
    width: 235,
    height: 90,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  page.drawText('AUTHORIZED SIGNATURE / OFFICIAL SEAL', {
    x: 330,
    y: sigY + 70,
    size: 8,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.3),
  });

  page.drawLine({
    start: { x: 340, y: sigY + 25 },
    end: { x: 535, y: sigY + 25 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawText('( ................................................................ )', {
    x: 350,
    y: sigY + 12,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Footer
  page.drawText('This document is electronically verified. Thank you for your business.', {
    x: 50,
    y: 35,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  const cleanBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ) as ArrayBuffer;
  return {
    buffer: cleanBuffer,
    name: 'ตัวอย่างเอกสารใบเสร็จ_Invoice_Demo.pdf',
  };
}

/**
 * Generate a realistic scanned document image with text for testing OCR & image filters
 */
export function generateSampleScannedImage(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1100;
  const ctx = canvas.getContext('2d')!;

  // Paper background with warm subtle scan tone
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border outline
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  // Header
  ctx.fillStyle = '#4da2ff';
  ctx.fillRect(50, 50, canvas.width - 100, 60);
  ctx.strokeRect(50, 50, canvas.width - 100, 60);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('ใบสำคัญรับเงิน / RECEIPT VOUCHER', 70, 90);

  // Scanned text contents
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('บริษัท สลัช ด็อคสแกน จำกัด (สำนักงานใหญ่)', 50, 160);

  ctx.font = '16px sans-serif';
  ctx.fillText('เลขประจำตัวผู้เสียภาษีอากร: 0105562099999', 50, 190);
  ctx.fillText('วันที่ทำรายการ (Date): 17 พฤศจิกายน 2569 / 17 Nov 2026', 50, 220);
  ctx.fillText('เลขที่เอกสาร (Receipt No): RC-20261117-0042', 50, 250);

  ctx.fillText('ได้รับเงินจาก (Received From): คุณสมศักดิ์ มั่งมีศรีสุข', 50, 300);
  ctx.fillText('ที่อยู่: 88/9 อาคารดิจิทัล ถนนสุขุมวิท เขตวัฒนา กรุงเทพฯ 10110', 50, 330);

  // Items table
  ctx.fillStyle = '#e9ccff';
  ctx.fillRect(50, 380, canvas.width - 100, 35);
  ctx.strokeRect(50, 380, canvas.width - 100, 35);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('รายการ (Description)', 70, 403);
  ctx.fillText('จำนวนเงิน (Amount - THB)', 540, 403);

  ctx.font = '16px sans-serif';
  const rows = [
    { name: '1. ค่าบริการสแกนเอกสารดิจิทัลความละเอียดสูง', price: '4,500.00' },
    { name: '2. ค่าลิขสิทธิ์ระบบ AI OCR ภาษาไทยและภาษาอังกฤษ', price: '9,800.00' },
    { name: '3. โมดูลปั๊มลายเซ็นอิเล็กทรอนิกส์และตรายาง', price: '3,200.00' },
    { name: '4. บริการแปลงไฟล์เอกสารความปลอดภัยสูง', price: '1,500.00' },
  ];

  let y = 445;
  rows.forEach((r) => {
    ctx.fillText(r.name, 70, y);
    ctx.fillText(r.price, 580, y);
    y += 40;
  });

  // Total
  ctx.fillStyle = '#ffd731';
  ctx.fillRect(400, y + 20, 350, 45);
  ctx.strokeRect(400, y + 20, 350, 45);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('ยอดรวมทั้งสิ้น: 19,000.00 บาท', 420, y + 50);

  // Note
  ctx.font = 'italic 15px sans-serif';
  ctx.fillText('(หนึ่งหมื่นเก้าพันบาทถ้วน / Nineteen Thousand Baht Only)', 70, y + 100);

  // Stamp Box
  ctx.strokeStyle = '#5c4ade';
  ctx.lineWidth = 2;
  ctx.strokeRect(500, 850, 240, 100);
  ctx.fillStyle = '#5c4ade';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('[ ตรายางอนุมัติ / APPROVED ]', 530, 880);
  ctx.fillText('ลงชื่อ...................................................', 520, 930);

  return canvas.toDataURL('image/jpeg', 0.95);
}
