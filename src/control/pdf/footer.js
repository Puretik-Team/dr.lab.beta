const fs = require("fs");
const path = require("path");
const electron = require("electron");
const { PDF_CFG } = require("./config");

// Space kept above the footer zone for the "1 of N" page counter (mm)
const PAGE_NUMBER_BAND = 8;

/**
 * Resolves the footer zone once per document, mirroring drawHeader's rules:
 *  - footerEmpty      → reserve blank space (footerHeight), draw no image
 *  - footerHeight set → overrides the image's natural aspect ratio
 *  - otherwise        → full page width, auto height from userData/foot.png
 * With no image and no height the footer is just the page counter, exactly as
 * before this feature existed.
 * Returns { height, dataUrl } — height is 0 when no footer zone is reserved.
 */
function getFooterMetrics(doc, { footerEmpty, footerHeight } = {}) {
  if (footerEmpty) {
    return { height: footerHeight || 0, dataUrl: null };
  }

  const app =
    (electron && electron.app) ||
    (electron && electron.remote && electron.remote.app) ||
    null;
  const userData = app ? app.getPath("userData") : process.cwd();
  const imgPath = path.join(userData, "foot.png");
  if (!fs.existsSync(imgPath)) {
    return { height: footerHeight || 0, dataUrl: null };
  }

  try {
    const dataUrl = `data:image/png;base64,${fs
      .readFileSync(imgPath)
      .toString("base64")}`;
    if (footerHeight) return { height: footerHeight, dataUrl };

    const pageWidth = doc.internal.pageSize.getWidth();
    const props = doc.getImageProperties(dataUrl);
    const height =
      props && props.width && props.height
        ? pageWidth * (props.height / props.width)
        : 20;
    return { height, dataUrl };
  } catch (err) {
    console.error("Footer image load error:", err);
    return { height: footerHeight || 0, dataUrl: null };
  }
}

/** Bottom margin autotable must keep clear on every page. */
function getFooterReserve(footerHeight) {
  return footerHeight > 0
    ? footerHeight + PAGE_NUMBER_BAND
    : PDF_CFG.margin.bottom;
}

function drawFooterWithPagination(doc, footer = { height: 0, dataUrl: null }) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont(PDF_CFG.font.family, "normal");
  doc.setFontSize(10);
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    if (footer.dataUrl && footer.height > 0) {
      doc.addImage(
        footer.dataUrl,
        "PNG",
        0,
        pageHeight - footer.height,
        pageWidth,
        footer.height
      );
    }
    const counterY =
      footer.height > 0 ? pageHeight - footer.height - 2 : pageHeight - 8;
    doc.text(`${p} of ${pageCount}`, PDF_CFG.margin.left, counterY, {
      align: "left",
    });
  }
}

module.exports = { drawFooterWithPagination, getFooterMetrics, getFooterReserve };
