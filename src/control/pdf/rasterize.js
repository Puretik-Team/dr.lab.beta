// Renders page 1 of a PDF to a PNG data URL, using pdf.js inside a hidden
// window (Chromium provides the canvas). Used by the Report Design theme
// preview so it shows the real classic report instead of an imitation.
const { BrowserWindow, app } = require("electron");
const fs = require("fs");
const path = require("path");
const log = require("electron-log");

const PDFJS = require.resolve("pdfjs-dist/legacy/build/pdf.js");
const PDFJS_WORKER = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

let win = null;

async function getWindow() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false },
  });
  const htmlPath = path.join(app.getPath("userData"), "pdf-raster.html");
  fs.writeFileSync(htmlPath, '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await win.loadFile(htmlPath);
  return win;
}

// Never leave the caller waiting forever (the preview UI would spin
// endlessly): after this long the window is thrown away and we reject.
const RENDER_TIMEOUT_MS = 30000;

async function pdfFirstPageToPng(pdfPath, widthPx = 900) {
  const started = Date.now();
  const w = await getWindow();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        if (win && !win.isDestroyed()) win.destroy();
      } catch (_) {}
      win = null;
      reject(new Error(`PDF preview timed out after ${RENDER_TIMEOUT_MS / 1000}s`));
    }, RENDER_TIMEOUT_MS);
  });
  try {
    const image = await Promise.race([render(w, pdfPath, widthPx), timeout]);
    log.info(`[PDF_INFO] rasterize ok in ${Date.now() - started}ms`);
    return image;
  } catch (error) {
    log.error("[PDF_ERROR] rasterize failed:", error && (error.stack || error.message || String(error)));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function render(w, pdfPath, widthPx) {
  // pdf.js runs its "worker" on the main thread of this hidden window: the
  // worker module is require()d (asar-aware) and handed over via
  // globalThis.pdfjsWorker. A real Web Worker built from a blob: URL hangs
  // on some Windows builds (file:// origin + blob worker never reports
  // back), which showed up as an endless loading spinner.
  return w.webContents.executeJavaScript(
    `(async () => {
      const fs = require("fs");
      const pdfjs = require(${JSON.stringify(PDFJS)});
      if (!globalThis.pdfjsWorker) {
        globalThis.pdfjsWorker = { WorkerMessageHandler: require(${JSON.stringify(PDFJS_WORKER)}).WorkerMessageHandler };
      }
      pdfjs.GlobalWorkerOptions.workerSrc = "pdf.worker.js";
      const data = new Uint8Array(fs.readFileSync(${JSON.stringify(pdfPath)}));
      const doc = await pdfjs.getDocument({ data }).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: ${Number(widthPx)} / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      await doc.destroy();
      return canvas.toDataURL("image/png");
    })()`,
    true
  );
}

module.exports = { pdfFirstPageToPng };
