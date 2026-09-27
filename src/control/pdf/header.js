// header.js
const fs = require("fs");
const path = require("path");
const electron = require("electron");
const { PDF_CFG } = require("./config");

const GRID_COLS = 4;
const ROW_H = 7.2; // mm
const CELL_PAD = 2.5;

/**
 * A bordered patient-info grid (2 rows x 4 cols), each cell a small gray
 * label over a bold value. Falls back to "-" for anything missing rather
 * than hiding the cell — the grid shape stays identical run to run.
 */
function drawPatientGrid(doc, y, fields) {
  const { margin } = PDF_CFG;
  const pageWidth = doc.internal.pageSize.getWidth();
  const gridW = pageWidth - margin.left - margin.right;
  const colW = gridW / GRID_COLS;
  const rows = [fields.slice(0, 4), fields.slice(4, 8)];

  doc.setDrawColor(228, 226, 234);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin.left, y, gridW, ROW_H * 2, 1.5, 1.5, "S");
  // internal dividers
  for (let c = 1; c < GRID_COLS; c++) {
    const x = margin.left + colW * c;
    doc.line(x, y, x, y + ROW_H * 2);
  }
  doc.line(margin.left, y + ROW_H, margin.left + gridW, y + ROW_H);

  rows.forEach((row, r) => {
    row.forEach((field, c) => {
      const cellX = margin.left + colW * c;
      const cellY = y + ROW_H * r;
      const labelY = cellY + 3;
      const valueY = cellY + 5.9;

      const textX = cellX + colW - CELL_PAD; // right edge — text grows leftward (RTL)

      doc.setFont(PDF_CFG.font.family, "normal");
      doc.setFontSize(6.2);
      doc.setTextColor(107, 104, 128);
      doc.text(field.label, textX, labelY, {
        lang: "ar",
        align: "right",
        maxWidth: colW - CELL_PAD * 2,
      });

      doc.setFontSize(field.highlight ? PDF_CFG.font.size + 1 : PDF_CFG.font.size - 1);
      doc.setTextColor(30, 27, 55);
      doc.text(String(field.value ?? "-") || "-", textX, valueY, {
        lang: "ar",
        align: "right",
        maxWidth: colW - CELL_PAD * 2,
      });
    });
  });

  doc.setTextColor(...PDF_CFG.table.bodyText);
  doc.setFontSize(PDF_CFG.font.size);
  return y + ROW_H * 2 + 4;
}

/**
 * Draws a full-width header image (auto height) from userData/head.png,
 * then the patient-info grid below it.
 * Returns the Y position to continue drawing.
 */
function drawHeader(
  doc,
  {
    patient,
    dateText,
    ageText,
    genderText,
    patientId,
    patientPhone,
    doctorName,
    sampleDateText,
    reportDateText,
    reportNo,
    headerEmpty,
    headerHeight: headerHeightOverride,
  }
) {
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

  const gridY = headerHeight > 0 ? headerHeight + 6 : margin.top + 6;

  // Always pin the registered font: this also runs from the addPage hook, where
  // the active font may be whatever autotable/composite left behind.
  doc.setFont(PDF_CFG.font.family, "normal");

  return drawPatientGrid(doc, gridY, [
    { label: "اسم المريض", value: patient, highlight: true },
    { label: "رقم الملف", value: patientId },
    { label: "العمر / الجنس", value: `${ageText || "-"} / ${genderText || "-"}` },
    { label: "رقم الهاتف", value: patientPhone },
    { label: "الطبيب المُحيل", value: doctorName },
    { label: "تاريخ سحب العينة", value: sampleDateText },
    { label: "تاريخ التقرير", value: reportDateText || dateText },
    { label: "رقم التقرير", value: reportNo },
  ]);
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
