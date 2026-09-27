require("jspdf-autotable");
const { PDF_CFG } = require("../config");
const { getCompositeResultRJ } = require("../utils");
const { ensureSpace, purpleHeadStyles, drawAccentOnHeadCell } = require("./resultTable");

// Styled the same as single.js/panel.js's tables (purple LTR header) so a
// composite test doesn't look like a different, older report.
function renderComposite(doc, yStart, item, pdfConfig = PDF_CFG) {
  const meta = safeParse(item.meta_json);
  const sections = Array.isArray(meta?.sections) ? meta.sections : [];

  let y = yStart;

  sections.forEach((sec) => {
    const fields = Array.isArray(sec.fields) ? sec.fields : [];
    const sectionName = [sec.name_en, sec.name_ar].filter(Boolean).join(" / ") || sec.code;

    // Field name first (left), value second (right) — same left-to-right
    // column order used everywhere else in the report.
    const body = fields.map((f) => {
      const val = getCompositeResultRJ(item.result_json, sec.code, f.code);
      const label = [f.label_en].filter(Boolean).join(" / ") || f.code;
      return [label, String(val ?? "")];
    });

    y = ensureSpace(doc, y + 3, 7 + 7, pdfConfig);

    doc.autoTable({
      startY: y,
      theme: "grid",
      head: [[sectionName, "Value"]],
      body,
      styles: {
        font: pdfConfig.font.family,
        fontSize: pdfConfig.font.size - 1,
        cellPadding: 1.8,
        lineColor: pdfConfig.table.headLine,
        halign: "left",
      },
      headStyles: purpleHeadStyles(pdfConfig),
      margin: {
        left: pdfConfig.margin.left,
        right: pdfConfig.margin.right,
        top: pdfConfig.margin.top,
        bottom: pdfConfig.margin.bottom,
      },
      tableWidth: "auto",
      didDrawCell: (data) => drawAccentOnHeadCell(doc, data, pdfConfig),
    });

    y = doc.lastAutoTable.finalY + 5;
  });

  return y + 1;
}

function safeParse(v) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

module.exports = { renderComposite };
