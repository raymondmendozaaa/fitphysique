import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function generateContractPdf({ contractText, signature, signedDate, memberName, gymLogoUrl, locationName }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size

  const { width, height } = page.getSize();
  const fontSize = 12;
  const margin = 50;

  // Load fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 🏋️ Add logo
  if (gymLogoUrl) {
    const logoBytes = await fetch(gymLogoUrl).then((res) => res.arrayBuffer());
    const logoImage = await pdfDoc.embedPng(logoBytes); // convert to .png if needed
    const logoDims = logoImage.scale(0.25);
    page.drawImage(logoImage, {
      x: margin,
      y: height - 80,
      width: logoDims.width,
      height: logoDims.height,
    });
  }

  // 🏢 Add gym name header
  page.drawText('THE GYM', {
    x: margin + 100,
    y: height - 50,
    size: 18,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  // 📜 Contract Content
  const contentY = height - 120;
  const textLines = contractText.split('\n');
  let yPosition = contentY;

  for (const line of textLines) {
    if (yPosition < 100) break; // stop early if we run out of space
    page.drawText(line.trim(), {
      x: margin,
      y: yPosition,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    yPosition -= 16;
  }

  // ✍️ Signature
  page.drawText(`Signed by: ${signature || memberName}`, {
    x: margin,
    y: 100,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  // 📆 Date
  page.drawText(`Date: ${signedDate}`, {
    x: margin,
    y: 85,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  // 📍 Location
  if (locationName) {
    page.drawText(`Location: ${locationName}`, {
      x: margin,
      y: 70,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  }

  // 📄 Disclaimer
  page.drawText("This document represents a digitally signed agreement between the member and THE GYM.", {
    x: margin,
    y: 40,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}