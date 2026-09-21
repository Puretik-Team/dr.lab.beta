require("jspdf-autotable");
const { PDF_CFG } = require("../config");
const { getCompositeResultRJ } = require("../utils");

function renderComposite(doc, yStart, item, pdfConfig = PDF_CFG) {
  const meta = safeParse(item.meta_json);
  const sections = Array.isArray(meta?.sections) ? meta.sections : [];
  let y = yStart;

  // 👉 أضف عنوان رئيسي للتحليل نفسه
  const title = item.name_en || item.name_ar || item.code;
  if (title) {
    // Frutiger is registered as "normal" only — asking for "bold" makes jsPDF
    // silently fall back to Times, which garbles Arabic and leaks into later text.
    doc.setFont(pdfConfig.font.family, "normal");
    doc.setFontSize(pdfConfig.font.size + 1);
    doc.text(title, pdfConfig.margin.left, y);
    doc.setFontSize(pdfConfig.font.size);
    y += 4; // مسافة بعد العنوان
  }

  sections.forEach((sec, sIdx) => {
    const fields = Array.isArray(sec.fields) ? sec.fields : [];
    const body = fields.map((f) => {
      const val = getCompositeResultRJ(item.result_json, sec.code, f.code);
      const label = [f.label_en].filter(Boolean).join(" / ");
      return [label || f.code, String(val ?? "")];
    });

    doc.autoTable({
      startY: sIdx === 0 ? y : (doc.lastAutoTable?.finalY || y) + 8,
      theme: "grid",
      head: [
        [
          `${sec.name_en || sec.code}${sec.name_ar ? " / " + sec.name_ar : ""}`,
          "Value",
        ],
      ],
      body,
      styles: {
        font: pdfConfig.font.family,
        fontSize: pdfConfig.font.size,
        cellPadding: 3,
        lineColor: pdfConfig.table.headLine,
      },
      headStyles: {
        fillColor: pdfConfig.table.headFill,
        textColor: pdfConfig.table.headText,
      },
      margin: {
        left: pdfConfig.margin.left,
        right: pdfConfig.margin.right,
        top: pdfConfig.margin.top,
        bottom: pdfConfig.margin.bottom,
      },
      tableWidth: "auto",
    });
  });

  return (doc.lastAutoTable?.finalY || yStart) + 10;
}

function safeParse(v) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

module.exports = { renderComposite };
