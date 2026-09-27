const { PDF_CFG } = require("../config");
const { formatRef, getPanelResultRJ, getResultStatus } = require("../utils");
const { renderResultTable } = require("./resultTable");

function renderPanel(doc, yStart, item, pdfConfig = PDF_CFG, genderCode = null) {
  const meta = safeParse(item.meta_json);
  const metaRows = Array.isArray(meta?.items) ? meta.items : [];

  const rows = metaRows.map((r) => {
    const result = getPanelResultRJ(item.result_json, r.code);
    return {
      name: r.name_en || r.code || "",
      result,
      unit: r.unit || "",
      ref: formatRef(r.ref, r.unit),
      status: result !== "" ? getResultStatus(r.ref, result, genderCode) : null,
    };
  });

  return renderResultTable(doc, yStart, { rows }, pdfConfig);
}

function safeParse(v) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

module.exports = { renderPanel };
