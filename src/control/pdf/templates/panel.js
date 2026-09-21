require("jspdf-autotable");
const { PDF_CFG } = require("../config");
const { formatRef, getPanelResultRJ } = require("../utils");

function renderPanel(doc, yStart, item, pdfConfig = PDF_CFG) {
  const meta = safeParse(item.meta_json);
  const rows = Array.isArray(meta?.items) ? meta.items : [];

  const body = rows.map((r) => {
    const refStr = formatRef(r.ref, r.unit);
    const result = getPanelResultRJ(item.result_json, r.code);
    return [
      r.name_en || r.code || "",
      String(result || ""),
      [refStr, r.unit ? ` ${r.unit}` : ""].join(""),
    ];
  });

  doc.autoTable({
    startY: yStart,
    theme: "grid",
    head: [[item.name_en || item.code, "Result", "Ref / Unit"]],
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
    bodyStyles: {
      fillColor: pdfConfig.table.bodyFill,
      textColor: pdfConfig.table.bodyText,
    },
    margin: {
      left: pdfConfig.margin.left,
      right: pdfConfig.margin.right,
      top: pdfConfig.margin.top,
      bottom: pdfConfig.margin.bottom,
    },
    tableWidth: "auto",
  });

  return doc.lastAutoTable.finalY + 10;
}

function safeParse(v) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

module.exports = { renderPanel };
