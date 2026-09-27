// Renders a report template to PDF from the main process.
//
// The template engine (src/templates/engine.js) runs inside a hidden
// BrowserWindow — the exact code the editor's live preview uses — and
// Chromium's printToPDF turns the paginated pages into the PDF. That gives
// the export correct Arabic shaping, mixed RTL/LTR text, vector SVG and
// embedded fonts, and guarantees the PDF matches the on-screen preview.
const { BrowserWindow, app } = require("electron");
const fs = require("fs");
const path = require("path");
const log = require("electron-log");

const ENGINE_PATH = path.join(__dirname, "../../templates/engine.js");
const FONT_DIR = path.join(__dirname, "../../fonts");

const FONT_FILES = [
  { family: "Frutiger", file: "Frutiger LT Arabic 45 Light.ttf", weight: 300 },
  { family: "Frutiger", file: "Frutiger LT Arabic 55 Roman.ttf", weight: 400 },
  { family: "Frutiger", file: "Frutiger LT Arabic 65 Bold.ttf", weight: 700 },
  { family: "Circular", file: "CircularStd-Book.ttf", weight: 400 },
  { family: "Circular", file: "CircularStd-Bold.ttf", weight: 700 },
];

let fontCache = null;
function loadFonts() {
  if (fontCache) return fontCache;
  fontCache = FONT_FILES.map((f) => {
    try {
      const b64 = fs.readFileSync(path.join(FONT_DIR, f.file)).toString("base64");
      return { family: f.family, weight: f.weight, url: `data:font/ttf;base64,${b64}` };
    } catch (err) {
      log.error(`[PDF_ERROR] template font missing: ${f.file}`, err.message);
      return null;
    }
  }).filter(Boolean);
  return fontCache;
}

function ensureRenderPage() {
  const htmlPath = path.join(app.getPath("userData"), "template-render.html");
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>render</title></head><body></body></html>';
  if (!fs.existsSync(htmlPath) || fs.readFileSync(htmlPath, "utf8") !== html) {
    fs.writeFileSync(htmlPath, html);
  }
  return htmlPath;
}

/**
 * @param {object} opts
 * @param {object} opts.template  normalized template
 * @param {object} opts.data      report data (sampleData / visitToReportData shape)
 * @param {"preview"|"blank"} opts.mode
 * @param {{src:string,opacity:number}} [opts.watermark]
 * @param {string} opts.outPath   where to write the PDF
 */
async function renderTemplateToPDF({ template, data, mode = "preview", watermark = null, outPath }) {
  const started = Date.now();
  log.info("[PDF_INFO] template render start", {
    templateId: template?.id,
    name: template?.name,
    mode,
    categories: data?.results?.length || 0,
  });

  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  try {
    await win.loadFile(ensureRenderPage());
    const payload = JSON.stringify({ template, data, mode, watermark, fonts: loadFonts() });
    const result = await win.webContents.executeJavaScript(
      `(async () => {
        const engine = require(${JSON.stringify(ENGINE_PATH)});
        return await engine.renderForPrint(document, ${payload});
      })()`,
      true
    );

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: result.size.width / 25.4, height: result.size.height / 25.4 },
    });
    fs.writeFileSync(outPath, pdf);

    log.info("[PDF_INFO] template render done", {
      templateId: template?.id,
      mode,
      pages: result.pageCount,
      bytes: pdf.length,
      ms: Date.now() - started,
      outPath,
    });
    return { success: true, filePath: outPath, pageCount: result.pageCount };
  } catch (err) {
    log.error("[PDF_ERROR] template render failed", {
      templateId: template?.id,
      mode,
      error: err && (err.stack || err.message || String(err)),
    });
    return { success: false, error: err?.message || String(err) };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { renderTemplateToPDF };
