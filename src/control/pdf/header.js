// header.js
const fs = require("fs");
const path = require("path");
const electron = require("electron");
const { PDF_CFG } = require("./config");

/**
 * Draws a full-width header image (auto height) from userData/head.png,
 * then writes patient/date/age on the next line.
 * Returns the Y position to continue drawing.
 */
function drawHeader(doc, { patient, dateText, ageText, headerEmpty, headerHeight: headerHeightOverride }) {
  const { margin } = PDF_CFG;

  let headerHeight = 0;

  if (!headerEmpty) {
    // get userData path safely (renderer or main)
    const app =
      (electron && electron.app) ||
      (electron && electron.remote && electron.remote.app) ||
      null;

    const userData = app ? app.getPath("userData") : process.cwd();
    const imgPath = path.join(userData, "head.png");

    if (fs.existsSync(imgPath)) {
      try {
        const ext = path.extname(imgPath).toLowerCase();
        const format = ext === ".jpg" || ext === ".jpeg" ? "JPEG" : "PNG";
        const base64 = fs.readFileSync(imgPath).toString("base64");
        const dataUrl = `data:image/${format.toLowerCase()};base64,${base64}`;

        const pageWidth = doc.internal.pageSize.getWidth();

        if (headerHeightOverride) {
          // user-defined height overrides the image's natural aspect ratio
          headerHeight = headerHeightOverride;
        } else {
          // scale to full page width, auto height
          const props = doc.getImageProperties(dataUrl);
          if (props && props.width && props.height) {
            headerHeight = pageWidth * (props.height / props.width);
          } else {
            // fallback height if props missing
            headerHeight = 28;
          }
        }

        doc.addImage(dataUrl, format, 0, 0, pageWidth, headerHeight);
      } catch (err) {
        // if image fails, just skip it and keep texts higher
        headerHeight = 0;
        console.error("Header image load error:", err);
      }
    }
  } else if (headerHeightOverride) {
    // empty header still reserves the configured blank space
    headerHeight = headerHeightOverride;
  }

  const topY = headerHeight > 0 ? headerHeight + 10 : margin.top + 10;

  // Always pin the registered font: this also runs from the addPage hook, where
  // the active font may be whatever autotable/composite left behind.
  doc.setFont(PDF_CFG.font.family, "normal");
  doc.text(`التاريخ : ${dateText || "-"}`, margin.left, topY, { lang: "ar" });
  doc.text(`العمر : ${ageText || "-"}`, 90, topY, { lang: "ar" });
  doc.text(
    `الاسم : ${patient || "-"}`,
    doc.internal.pageSize.getWidth() - margin.right,
    topY,
    { lang: "ar", align: "right" }
  );

  return topY + 6;
}

function addQRCodeToHeader(doc, { patientId, qrCodeDataUrl, startY }) {
  if (!patientId || !qrCodeDataUrl) return startY;

  try {
    const qrSize = 20; // QR code size in mm
    const pageWidth = doc.internal.pageSize.getWidth();
    const qrX = (pageWidth - qrSize) / 2; // Center horizontally
    const qrY = startY + 2; // Position below the patient info

    // Add QR code to PDF
    doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    
    // Add label below QR code
    doc.setFontSize(7);
    doc.text(`ID: ${patientId}`, pageWidth / 2, qrY + qrSize + 3, { 
      align: "center" 
    });
    doc.setFontSize(10); // Reset font size
    
    return Math.max(startY, qrY + qrSize + 6);
  } catch (err) {
    console.error("QR code rendering error:", err);
    return startY;
  }
}

module.exports = { drawHeader, addQRCodeToHeader };
