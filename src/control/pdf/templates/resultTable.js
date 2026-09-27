require("jspdf-autotable");
const { PDF_CFG } = require("../config");

// Shared by single.js and panel.js: one autotable per test/panel, styled
// with a purple header and a colored dot+pill+arrow status, left-to-right
// column order. A row with no classifiable status (no numeric ref range)
// just gets a plain row — "no template data, that's it" rather than
// guessing or blocking the print.
const STATUS_LABEL = { normal: "طبيعي", high: "مرتفع", low: "منخفض", critical: "حرج" };
const STATUS_ARROW = { high: "▲", low: "▼", critical: "!!" };

// Left-to-right column order: Test Name | Result | Unit | Reference Range | Status
const COLS_WITH_STATUS = ["Test Name", "Result", "Unit", "Reference Range", "Status"];
const COLS_PLAIN = ["Test Name", "Result", "Unit", "Reference Range"];

const CELL_PAD = 1.8;

// Shared header look — reused by composite.js so a composite test's section
// tables match the single/panel tables' style instead of the plain gray
// head they used to have. Background, label text, and (via
// drawAccentOnHeadCell below) the line under the header all come from the
// same user-adjustable theme (Settings -> Table Header Color), so they never
// end up mismatched — with nothing set, all three fall back to brand purple.
function purpleHeadStyles(pdfConfig) {
  return {
    fillColor: pdfConfig.tableHeaderFill || PDF_CFG.brand.purpleTint,
    textColor: pdfConfig.tableHeaderText || PDF_CFG.brand.purpleDeep,
    fontStyle: "bold",
    fontSize: pdfConfig.font.size - 1,
    cellPadding: CELL_PAD,
    lineWidth: 0.2,
    lineColor: pdfConfig.table.headLine,
  };
}

function drawAccentOnHeadCell(doc, data, pdfConfig) {
  if (data.section !== "head") return false;
  doc.setDrawColor(...(pdfConfig.tableHeaderAccent || PDF_CFG.brand.purple));
  doc.setLineWidth(0.5);
  doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
  doc.setLineWidth(0.2);
  return true;
}

// A manually-drawn element (section header, ...) sits outside
// autotable's own pagination, so it can be orphaned at the bottom of a page
// if autotable decides *after* it's drawn that the next table needs a fresh
// page. Reserve room up front and break early instead, so headers stay
// attached to what follows them.
function ensureSpace(doc, y, needed, pdfConfig) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - pdfConfig.margin.bottom) {
    doc.addPage();
    return pdfConfig.margin.top;
  }
  return y;
}

/**
 * rows: [{ name, result, unit, ref, status: "normal"|"high"|"low"|"critical"|null }]
 */
function renderResultTable(doc, yStart, { rows }, pdfConfig = PDF_CFG) {
  const hasStatus = rows.some((r) => r.status);

  const y = ensureSpace(doc, yStart, 7 + 7, pdfConfig);

  const headRow = [hasStatus ? COLS_WITH_STATUS : COLS_PLAIN];

  const body = rows.map((r) => {
    const row = [r.name, r.result ?? "", r.unit ?? "", r.ref ?? ""];
    // status cell text is drawn as a pill in didDrawCell, not plain text
    if (hasStatus) row.push("");
    return row;
  });

  const nameCol = 0;
  const resultCol = 1;
  const statusCol = 4;

  doc.autoTable({
    startY: y,
    theme: "grid",
    head: headRow,
    body,
    styles: {
      font: pdfConfig.font.family,
      fontSize: pdfConfig.font.size - 1,
      cellPadding: CELL_PAD,
      lineColor: pdfConfig.table.headLine,
      overflow: "linebreak",
      halign: "left",
    },
    headStyles: purpleHeadStyles(pdfConfig),
    bodyStyles: {
      fillColor: pdfConfig.table.bodyFill,
      textColor: pdfConfig.table.bodyText,
    },
    columnStyles: hasStatus
      ? {
          [statusCol]: { halign: "center", cellWidth: 22 },
          [nameCol]: { fontStyle: "bold" },
          [resultCol]: { fontStyle: "bold" },
        }
      : {
          [nameCol]: { fontStyle: "bold" },
          [resultCol]: { fontStyle: "bold" },
        },
    margin: {
      left: pdfConfig.margin.left,
      right: pdfConfig.margin.right,
      top: pdfConfig.margin.top,
      bottom: pdfConfig.margin.bottom,
    },
    tableWidth: "auto",
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const status = rows[data.row.index]?.status;
      if (!status || data.column.index !== resultCol) return;
      // "critical"'s pill text is white (for its red pill fill), which would
      // be invisible on the plain white result cell — use its fill color (a
      // solid red) as the result's text color instead.
      data.cell.styles.textColor =
        status === "critical" ? PDF_CFG.status.critical.fill : PDF_CFG.status[status].text;
      data.cell.text = [
        `${data.cell.text.join(" ")}${STATUS_ARROW[status] ? " " + STATUS_ARROW[status] : ""}`,
      ];
    },
    didDrawCell: (data) => {
      if (drawAccentOnHeadCell(doc, data, pdfConfig)) return;
      if (!hasStatus || data.section !== "body" || data.column.index !== statusCol) return;
      const status = rows[data.row.index]?.status;
      if (!status) return;
      const colors = PDF_CFG.status[status];
      const { x, y: cellY, width, height } = data.cell;
      const padX = 1.5,
        padY = 1;
      const pillW = width - padX * 2;
      const pillH = height - padY * 2;
      const cx = x + width / 2;
      const cy = cellY + height / 2;

      doc.setFillColor(...colors.fill);
      doc.roundedRect(x + padX, cellY + padY, pillW, pillH, pillH / 2, pillH / 2, "F");

      // dot bullet
      const dotColor = status === "critical" ? [255, 255, 255] : colors.text;
      doc.setFillColor(...dotColor);
      doc.circle(cx + pillW / 2 - 3.5, cy, 0.7, "F");

      doc.setTextColor(...colors.text);
      doc.setFont(pdfConfig.font.family, "normal");
      doc.setFontSize(pdfConfig.font.size - 2.5);
      doc.text(STATUS_LABEL[status], cx - 1, cy, {
        align: "center",
        baseline: "middle",
        lang: "ar",
      });
      doc.setFontSize(pdfConfig.font.size);
      doc.setTextColor(...pdfConfig.table.bodyText);
    },
  });

  return doc.lastAutoTable.finalY + 6;
}

module.exports = {
  renderResultTable,
  ensureSpace,
  purpleHeadStyles,
  drawAccentOnHeadCell,
  STATUS_LABEL,
  STATUS_ARROW,
};
