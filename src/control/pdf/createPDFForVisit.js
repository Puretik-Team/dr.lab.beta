const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const dayjs = require("dayjs");
const bwipjs = require("bwip-js");

const { PDF_CFG, getPDFConfig } = require("./config");
const { addFontIfNeeded } = require("./utils");
const { drawHeader, addQRCodeToHeader } = require("./header");
const { drawFooterWithPagination } = require("./footer");
const { drawWatermark } = require("./watermark");

const { renderSingle } = require("./templates/single");
const { renderPanel } = require("./templates/panel");
const { renderComposite } = require("./templates/composite");
const electron = require("electron");
const { LocalFileData } = require("get-file-object-from-local-path");

async function createPDFForVisit({
  visit,
  isView = true,
  headerDataUrl,
  watermarkBase64,
  fontSize = 10,
  withQR = false,
  headerEmpty = false,
  headerHeight = null,
}) {
  const { app, shell } = electron || {};
  try {
    // Generate QR code asynchronously only if withQR is true
    const patientId = visit?.patient?.id || visit?.patient_id;
    let qrCodeDataUrl = null;
    
    if (withQR && patientId) {
      try {
        const png = await new Promise((resolve, reject) => {
          bwipjs.toBuffer({
            bcid: 'qrcode',
            text: `${patientId}`,
            scale: 3,
            height: 10,
            includetext: false,
          }, (err, png) => {
            if (err) reject(err);
            else resolve(png);
          });
        });
        qrCodeDataUrl = `data:image/png;base64,${png.toString('base64')}`;
      } catch (qrErr) {
        console.error("QR code generation error:", qrErr);
        // Continue without QR code if generation fails
      }
    }

    const pdfConfig = getPDFConfig(fontSize);
    const doc = new jsPDF(pdfConfig.page);
    addFontIfNeeded(doc, fontSize);

    let headerImgWidth = headerDataUrl ? doc.internal.pageSize.getWidth() : 0;

    const headerArgs = {
      logoDataUrl: headerDataUrl,
      headerImgWidth,
      patient: visit?.patient?.name,
      dateText: dayjs(visit?.created_at || new Date()).format("YYYY/MM/DD"),
      ageText: visit?.patient?.birth ? calcAgeText(visit.patient.birth) : "-",
      headerEmpty,
      headerHeight,
    };

    const startY = drawHeader(doc, headerArgs);

    // Add QR code next to patient info only if withQR is true
    const qrEndY = withQR ? addQRCodeToHeader(doc, {
      patientId,
      qrCodeDataUrl,
      startY,
    }) : startY;

    if (watermarkBase64) drawWatermark(doc, { logoBase64: watermarkBase64 });

    // Header/watermark are only drawn on the current page above — redraw
    // them on every page jspdf-autotable adds while paginating long results.
    doc.internal.events.subscribe("addPage", () => {
      drawHeader(doc, headerArgs);
      if (watermarkBase64) drawWatermark(doc, { logoBase64: watermarkBase64 });
    });

    // Reserve the same top space (header image/blank area) on every page
    // jspdf-autotable creates while paginating a long result list, not just
    // the first one.
    const tableConfig = {
      ...pdfConfig,
      margin: { ...pdfConfig.margin, top: startY },
    };

    let y = Math.max(startY + 6, qrEndY);
    const tests = Array.isArray(visit?.tests) ? visit.tests : [];
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      if (i > 0) y = (doc.lastAutoTable?.finalY || y) + 10;
      if (t.type === "single") y = renderSingle(doc, y, t, tableConfig);
      else if (t.type === "panel") y = renderPanel(doc, y, t, tableConfig);
      else if (t.type === "composite")
        y = renderComposite(doc, y, t, tableConfig);
      else {
        doc.autoTable(doc, {
          startY: y,
          head: [["Test", "Value"]],
          body: [[t.name_en || t.code, ""]],
          margin: { top: startY },
        });
        y = doc.lastAutoTable.finalY + 8;
      }

      // 🔹 Divider line after each test (except last one)
      if (i < tests.length - 1) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const lineY = (doc.lastAutoTable?.finalY || y) + 4;
        // doc.setDrawColor(180); // light gray
        // doc.setLineWidth(0.2);
        // doc.line(PDF_CFG.margin.left, lineY, pageWidth - PDF_CFG.margin.right, lineY);
        y = lineY + 10;
      }
    }

    drawFooterWithPagination(doc);

    const filePath = (app ? app.getPath("userData") : ".") + "/visit.pdf";
    await doc.save(filePath);
    if (isView && shell) shell.openPath(filePath);
    const file = LocalFileData ? new LocalFileData(filePath) : null;

    return { success: true, filePath, file };
  } catch (err) {
    return { success: false, error: err };
  }
}

function calcAgeText(isoBirth) {
  const b = dayjs(isoBirth);
  if (!b.isValid()) return "-";
  const years = dayjs().diff(b, "year");
  return `${years} سنة`;
}

module.exports = { createPDFForVisit };
