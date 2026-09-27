// Basic design tokens (tweak to your brand)
const PDF_CFG = {
  page: { unit: "mm", format: "a4", orientation: "p", compress: true },
  margin: { left: 12, right: 12, top: 12, bottom: 16 },
  table: {
    headFill: [238, 238, 238], // #EEE
    headText: [0, 0, 0],
    headLine: [204, 204, 204],
    bodyFill: [255, 255, 255],
    bodyText: [0, 0, 0],
  },
  font: {
    family: "Frutiger",
    size: 10, // Default size, will be overridden
  },
  brand: {
    watermarkOpacity: 0.06,
    watermarkMaxWidth: 180, // mm
    purple: [106, 72, 184], // #6A48B8
    purpleDeep: [78, 56, 148], // #4E3894
    purpleTint: [245, 241, 252], // #F5F1FC
    groupFill: [238, 238, 238], // department/panel bar background
  },
  // Print-safe status colors — text stays legible in grayscale too since
  // each status also carries a label/arrow, not just a color.
  status: {
    normal: { text: [30, 122, 76], fill: [233, 246, 239] },
    high: { text: [180, 84, 10], fill: [253, 241, 228] },
    low: { text: [31, 87, 195], fill: [234, 240, 252] },
    critical: { text: [255, 255, 255], fill: [180, 35, 24] },
  },
};

// "#RRGGBB"/"#RGB" -> [r, g, b]. Returns null for anything else (missing,
// malformed) so callers can fall back to the default color.
function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

// Function to get dynamic font size configuration. `tableHeaderColor` /
// `tableHeaderTextColor` are optional "#RRGGBB" strings the lab picked in
// Settings to recolor the results table's header — background, label text,
// and the accent line under it all follow the chosen theme together, so the
// text and border never end up mismatched with the background. With
// nothing set, all three fall back to the brand purple defaults.
function getPDFConfig(fontSize = 10, tableHeaderColor = null, tableHeaderTextColor = null) {
  const textRgb = hexToRgb(tableHeaderTextColor);
  return {
    ...PDF_CFG,
    font: {
      ...PDF_CFG.font,
      size: fontSize,
    },
    tableHeaderFill: hexToRgb(tableHeaderColor) || PDF_CFG.brand.purpleTint,
    tableHeaderText: textRgb || PDF_CFG.brand.purpleDeep,
    // No separate "border" shade is configured — the accent line just
    // matches the label text so the two never clash.
    tableHeaderAccent: textRgb || PDF_CFG.brand.purple,
  };
}

module.exports = { PDF_CFG, getPDFConfig, hexToRgb };
