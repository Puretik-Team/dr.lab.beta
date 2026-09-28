// Renders page 1 of a PDF to a PNG data URL, using pdf.js inside a hidden
// window (Chromium provides the canvas). Used by the Report Design theme
// preview so it shows the real classic report instead of an imitation.
const { BrowserWindow, app } = require("electron");
const fs = require("fs");
const path = require("path");

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

async function pdfFirstPageToPng(pdfPath, widthPx = 900) {
  const w = await getWindow();
  // The worker is loaded from a Blob of its source (read via Node's
  // asar-aware fs) so it also works from inside the packaged app.asar.
  return w.webContents.executeJavaScript(
    `(async () => {
      const fs = require("fs");
      const pdfjs = require(${JSON.stringify(PDFJS)});
      if (!window.__pdfWorkerUrl) {
        const src = fs.readFileSync(${JSON.stringify(PDFJS_WORKER)}, "utf8");
        window.__pdfWorkerUrl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      }
      pdfjs.GlobalWorkerOptions.workerSrc = window.__pdfWorkerUrl;
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
