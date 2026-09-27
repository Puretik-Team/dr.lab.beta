const { PDF_CFG } = require("../config");
const { formatRef, getSingleResultRJ, getResultStatus } = require("../utils");
const { renderResultTable } = require("./resultTable");

function toRow(item, genderCode) {
  const unit = item.unit || "";
  const result = getSingleResultRJ(item.result_json);
  return {
    name: item.name_en || item.name_ar || item.code,
    result,
    unit,
    ref: formatRef(item.ref_text, unit),
    status: result !== "" ? getResultStatus(item.ref_text, result, genderCode) : null,
  };
}

function renderSingle(doc, yStart, item, pdfConfig = PDF_CFG, genderCode = null) {
  return renderResultTable(doc, yStart, { rows: [toRow(item, genderCode)] }, pdfConfig);
}

// Consecutive standalone tests sharing a specimen don't each need their own
// table — one table with a row per test reads as one panel instead of a
// wall of near-identical single-row tables.
function renderSingleGroup(doc, yStart, items, pdfConfig = PDF_CFG, genderCode = null) {
  return renderResultTable(
    doc,
    yStart,
    { rows: items.map((it) => toRow(it, genderCode)) },
    pdfConfig
  );
}

module.exports = { renderSingle, renderSingleGroup };
