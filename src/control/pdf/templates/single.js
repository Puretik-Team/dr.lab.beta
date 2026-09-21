require("jspdf-autotable");
const { PDF_CFG } = require("../config");
const { formatRef, getSingleResultRJ } = require("../utils");

function renderSingle(doc, yStart, item, pdfConfig = PDF_CFG) {
  const unit = item.unit || "";
  const refStr = formatRef(item.ref_text, unit);
  const result = getSingleResultRJ(item.result_json);

  doc.autoTable({
    startY: yStart,
    theme: "grid",
    head: [["Test", "Result", "Normal Value"]],
    body: [
      [item.name_en || item.name_ar || item.code, `${result} ${unit}`, refStr],
    ],
    styles: {
      font: pdfConfig.font.family,
      fontSize: pdfConfig.font.size,
      cellPadding: 3,
      lineColor: pdfConfig.table.headLine,
      overflow: "linebreak",
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

  return doc.lastAutoTable.finalY + 8;
}

module.exports = { renderSingle };
