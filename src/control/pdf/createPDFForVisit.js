const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const dayjs = require("dayjs");
const bwipjs = require("bwip-js");

const { PDF_CFG, getPDFConfig } = require("./config");
const { addFontIfNeeded, normalizeGenderCode } = require("./utils");
const { drawHeader, addQRCodeToHeader } = require("./header");
const {
  drawFooterWithPagination,
  getFooterMetrics,
  getFooterReserve,
} = require("./footer");
const { drawWatermark } = require("./watermark");

const { renderSingle, renderSingleGroup } = require("./templates/single");
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
  footerEmpty = false,
  footerHeight = null,
  labInfo = null,
  tableHeaderColor = null,
  tableHeaderTextColor = null,
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

    const pdfConfig = getPDFConfig(fontSize, tableHeaderColor, tableHeaderTextColor);
    const doc = new jsPDF(pdfConfig.page);
    addFontIfNeeded(doc, fontSize);

    let headerImgWidth = headerDataUrl ? doc.internal.pageSize.getWidth() : 0;

    const createdAt = visit?.createdAt || visit?.created_at;
    const headerArgs = {
      logoDataUrl: headerDataUrl,
      headerImgWidth,
      patient: visit?.patient?.name,
      dateText: dayjs(createdAt || new Date()).format("YYYY/MM/DD"),
      ageText: visit?.patient?.birth ? calcAgeText(visit.patient.birth) : "-",
      genderText: translateGender(visit?.patient?.gender),
      patientId: patientId != null ? `#${patientId}` : "-",
      patientPhone: visit?.patient?.phone,
      doctorName: visit?.doctor?.name,
      sampleDateText: dayjs(createdAt || new Date()).format("YYYY/MM/DD · HH:mm"),
      reportDateText: dayjs().format("YYYY/MM/DD · HH:mm"),
      reportNo: visit?.visitNumber || visit?.visit_number,
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
      // Restore font/size so the redraw doesn't change what the table continues with.
      const prevFont = doc.getFont();
      const prevSize = doc.getFontSize();
      drawHeader(doc, headerArgs);
      if (watermarkBase64) drawWatermark(doc, { logoBase64: watermarkBase64 });
      doc.setFont(prevFont.fontName, prevFont.fontStyle);
      doc.setFontSize(prevSize);
    });

    const footer = getFooterMetrics(doc, { footerEmpty, footerHeight });

    // Reserve the same top space (header image/blank area) and bottom space
    // (footer image/blank area) on every page jspdf-autotable creates while
    // paginating a long result list, not just the first one.
    const tableConfig = {
      ...pdfConfig,
      margin: {
        ...pdfConfig.margin,
        top: startY,
        bottom: getFooterReserve(footer.height),
      },
    };

    const genderCode = normalizeGenderCode(visit?.patient?.gender);

    let y = Math.max(startY + 6, qrEndY);
    const tests = groupConsecutiveSingles(Array.isArray(visit?.tests) ? visit.tests : []);
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      if (i > 0) y = (doc.lastAutoTable?.finalY || y) + 6;
      if (t.type === "single") y = renderSingle(doc, y, t, tableConfig, genderCode);
      else if (t.type === "single-group")
        y = renderSingleGroup(doc, y, t.items, tableConfig, genderCode);
      else if (t.type === "panel") y = renderPanel(doc, y, t, tableConfig, genderCode);
      else if (t.type === "composite")
        y = renderComposite(doc, y, t, tableConfig);
      else {
        doc.autoTable(doc, {
          startY: y,
          head: [["Test", "Value"]],
          body: [[t.name_en || t.code, ""]],
          margin: { top: startY, bottom: tableConfig.margin.bottom },
        });
        y = doc.lastAutoTable.finalY + 6;
      }
    }

    drawFooterWithPagination(doc, footer, { labInfo });

    const filePath = (app ? app.getPath("userData") : ".") + "/visit.pdf";
    await doc.save(filePath);
    if (isView && shell) shell.openPath(filePath);
    const file = LocalFileData ? new LocalFileData(filePath) : null;

    return { success: true, filePath, file };
  } catch (err) {
    return { success: false, error: err };
  }
}

// Consecutive standalone ("single") tests sharing a specimen type get merged
// into one { type: "single-group", items } so they render as one bar/table
// instead of a separate bar/table per test — matches how a panel already
// groups its own rows. Order is preserved; only adjacent runs are merged, so
// this never reorders anything relative to how the tests were added.
function groupConsecutiveSingles(tests) {
  const out = [];
  for (const t of tests) {
    const prev = out[out.length - 1];
    const sameSpecimenSingle =
      t.type === "single" &&
      prev &&
      prev.type === "single-group" &&
      (prev.items[0]?.sample_type || null) === (t.sample_type || null);

    if (sameSpecimenSingle) {
      prev.items.push(t);
    } else if (t.type === "single") {
      out.push({ type: "single-group", items: [t] });
    } else {
      out.push(t);
    }
  }
  // A "group" of exactly one test renders identically to a plain single —
  // no need to special-case it in the render loop.
  return out;
}

function calcAgeText(isoBirth) {
  const b = dayjs(isoBirth);
  if (!b.isValid()) return "-";
  const years = dayjs().diff(b, "year");
  return `${years} سنة`;
}

function translateGender(g) {
  const v = String(g || "").trim().toLowerCase();
  if (v === "male" || v === "m" || v === "ذكر") return "ذكر";
  if (v === "female" || v === "f" || v === "أنثى") return "أنثى";
  return g || "-";
}

module.exports = { createPDFForVisit };
