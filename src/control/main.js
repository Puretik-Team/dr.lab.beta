const { dialog, BrowserWindow, ipcMain, app } = require("electron");
var { createPDF, printReport } = require("../../initPDF");
const { machineIdSync } = require("node-machine-id");
const { LabDB } = require("./db");
const { syncEngine } = require("./sync");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const image = path.join(__dirname, "../../defaultHeader.png");
const logoPath = path.join(__dirname, "../../src/assets/logo3.png");
const bwipjs = require("bwip-js");
const sharp = require("sharp");
const Jimp = require("jimp");
const nodeHtmlToImage = require("node-html-to-image");
const log = require("electron-log");
const { createPDFForVisit } = require("./pdf/createPDFForVisit");
const { sendWhatsApp } = require("./whatsapp");
const nodemailer = require("nodemailer");

// Windows builds don't bundle a Puppeteer Chromium (only sharp gets a
// platform-specific install step in packager.js), so node-html-to-image's
// default browser launch fails there. Fall back to the system Edge/Chrome
// that ships with Windows instead of requiring a bundled browser.
function queryRegistryAppPath(exeName) {
  // Windows records the real install path for every registered browser
  // under the "App Paths" key regardless of where it was installed (Program
  // Files, per-user AppData, a custom drive, ...). Static folder guesses
  // miss non-default installs, so fall back to the registry, which is how
  // Windows itself resolves these executables (e.g. via Run/Start).
  for (const hive of ["HKLM", "HKCU"]) {
    try {
      const out = execFileSync(
        "reg",
        [
          "query",
          `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
          "/ve",
        ],
        { encoding: "utf8", windowsHide: true }
      );
      const match = out.match(/REG_SZ\s+(.+)/);
      const foundPath = match && match[1].trim();
      if (foundPath && fs.existsSync(foundPath)) return foundPath;
    } catch (_) {
      // Not registered in this hive — try the next one.
    }
  }
  return null;
}

function findWindowsBrowserExecutable() {
  if (process.platform !== "win32") return null;
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["ProgramFiles"] || "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["LOCALAPPDATA"] || "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles"] || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["LOCALAPPDATA"] || "", "Google/Chrome/Application/chrome.exe"),
  ];
  const staticHit = candidates.find((p) => p && fs.existsSync(p));
  if (staticHit) return staticHit;

  return queryRegistryAppPath("msedge.exe") || queryRegistryAppPath("chrome.exe");
}

// Configure logging for print operations
log.transports.file.level = "info";
log.transports.console.level = "debug";

// Helper function to log print operations
function logPrintOperation(operation, data, result = null, error = null) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    operation,
    data: data ? JSON.stringify(data, null, 2) : null,
    result: result ? JSON.stringify(result, null, 2) : null,
    error: error ? error.toString() : null,
  };

  if (error) {
    log.error(`[PRINT_ERROR] ${operation}:`, logData);
  } else {
    log.info(`[PRINT_INFO] ${operation}:`, logData);
  }
}

// Helper function to get watermark base64 for free users
function getWatermarkBase64() {
  try {
    if (fs.existsSync(logoPath)) {
      return fs.readFileSync(logoPath, { encoding: "base64" });
    }
  } catch (error) {
    console.error("Error reading watermark logo:", error);
  }
  return null;
}

ipcMain.on("asynchronous-message", async (event, arg) => {
  console.log(
    "🔍 DEBUG: Received query:",
    arg.query,
    "Type:",
    typeof arg.query
  );
  let labDB = new LabDB();
  await labDB.ready;
  switch (arg.query) {
    case "setSyncConfig": {
      // Renderer (usePlan) arms/disarms multi-PC sync after checking the
      // account's syncEnabled flag on the licensing server.
      try {
        syncEngine.configure(
          {
            enabled: arg?.data?.enabled,
            token: arg?.data?.token,
            apiUrl: arg?.data?.apiUrl,
          },
          event.sender
        );
        event.reply("asynchronous-reply-setSyncConfig", { success: true });
      } catch (error) {
        event.reply("asynchronous-reply-setSyncConfig", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "syncNow": {
      syncEngine.syncNow().catch((e) => console.error("syncNow error:", e));
      break;
    }

    case "getSyncStatus": {
      event.reply("asynchronous-reply", syncEngine.getStatus());
      break;
    }

    case "getPatients": {
      try {
        const resp = await labDB.getPatients({
          q: arg?.q || "",
          limit: arg?.limit || 10,
          skip: arg?.skip || 0,
        });
        event.reply("asynchronous-reply", resp);
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "addPatient": {
      try {
        const resp = await labDB.addPatient(arg.data);
        event.reply("asynchronous-reply", { success: true, id: resp.id });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "deletePatient": {
      try {
        const resp = await labDB.deletePatient(arg.id);
        event.reply("asynchronous-reply", { success: true, data: resp });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getTopTests": {
      try {
        const resp = await labDB.getTopTests();
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "updatePatient": {
      try {
        const resp = await labDB.updatePatient(arg.id, arg.data);
        event.reply("asynchronous-reply", { success: true, data: resp.data });
      } catch (error) {
        console.error("Error updating patient:", error); // Add this line
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }
    case "getDoctors": {
      try {
        const resp = await labDB.getDoctors({
          q: arg?.q || "",
          limit: arg?.limit || 10,
          skip: arg?.skip || 0,
        });
        event.reply("asynchronous-reply", resp);
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "addDoctor": {
      try {
        const resp = await labDB.addDoctor(arg.data);
        event.reply("asynchronous-reply", { success: true, id: resp.id });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "deleteDoctor": {
      try {
        const resp = await labDB.deleteDoctor(arg.id);
        event.reply("asynchronous-reply", { success: true, data: resp });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "updateDoctor": {
      try {
        const resp = await labDB.updateDoctor(arg.id, arg.data);
        event.reply("asynchronous-reply", { success: true, data: resp.data });
      } catch (error) {
        console.error("Error updating patient:", error); // Add this line
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "addTest": {
      try {
        // console.log("Received data for adding test:", arg.data);
        const resp = await labDB.addTest(arg.data);
        event.reply("asynchronous-reply", { success: true, id: resp.id });
      } catch (error) {
        console.error("Error adding test:", error);
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "deleteTest": {
      try {
        const resp = await labDB.deleteTest(arg.id);
        event.reply("asynchronous-reply", { success: resp.success });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "editTest": {
      try {
        const resp = await labDB.editTest(arg.id, arg.data);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }
    case "editMetaJson": {
      try {
        const resp = await labDB.editTestMetaJson(arg.id, arg.data);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "addNewData": {
      try {
        const resp = await labDB.addNewData(arg.data);
        event.reply("asynchronous-reply", { success: true, data: resp.data });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getTests": {
      try {
        const resp = await labDB.getTests(arg.data);
        // console.log("Received data for getting tests:", arg.data);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getTestsModal": {
      try {
        const resp = await labDB.getTestsModal(arg.data);
        // console.log("Received data for getting tests:", arg.data);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "testByID": {
      try {
        const resp = await labDB.testByID(arg.data.id);
        console.log("resp in main testByID", resp);
        event.reply("asynchronous-reply-testByID", {
          success: true,
          data: resp.data,
        });
      } catch (error) {
        event.reply("asynchronous-reply-testByID", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "addPackage": {
      try {
        const resp = await labDB.addPackage(arg.data);
        event.reply("asynchronous-reply", { success: true, data: resp.data });
      } catch (error) {
        console.error("Error adding package:", error);
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "deletePackage": {
      try {
        const resp = await labDB.deletePackage(arg.id);
        event.reply("asynchronous-reply", { success: resp.success });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "editPackage": {
      try {
        // console.log("Received data for editing package:", arg.data);
        const resp = await labDB.editPackage(arg.id, arg.data);
        event.reply("asynchronous-reply", { success: resp.success });
      } catch (error) {
        console.error("Error updating package:", error);
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getPackages": {
      try {
        const resp = await labDB.getPackages(arg.data);
        event.reply("asynchronous-reply-getPackages", resp);
      } catch (error) {
        event.reply("asynchronous-reply-getPackages", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "addVisit": {
      try {
        console.log(arg.data);
        const resp = await labDB.registerVisitV2(arg.data);
        event.reply("asynchronous-reply", { success: true, id: resp.id });
      } catch (error) {
        console.error("Error adding visit:", error.message);
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }
    case "updateVisit": {
      try {
        const resp = await labDB.saveVisitResults(arg.data);
        event.reply("asynchronous-reply", { success: true, id: resp.id });
      } catch (error) {
        console.error("Error adding visit:", error.message);
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }
    case "deleteVisit": {
      try {
        const resp = await labDB.deleteVisit(arg.id);
        event.reply("asynchronous-reply", { success: resp.success });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getVisits": {
      try {
        const resp = await labDB.getVisitsV2(arg.data);
        event.reply("asynchronous-reply-getVisits", resp);
      } catch (error) {
        event.reply("asynchronous-reply-getVisits", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getTotalVisits": {
      const { startDate, endDate } = arg.data;
      try {
        const resp = await labDB.getTotalVisits({
          startDate,
          endDate,
        });
        console.log("📤 IPC sending getTotalVisits response:", resp);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getTotalPatients": {
      try {
        const resp = await labDB.getTotalPatients();
        console.log("📤 IPC sending getTotalPatients response:", resp);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getTodayVisits": {
      try {
        const resp = await labDB.getTodayVisits();
        console.log("📤 IPC sending getTodayVisits response:", resp);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getVisitTotals": {
      try {
        const resp = await labDB.getVisitTotals(arg.data);
        console.log("📤 IPC sending getVisitTotals response:", resp);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getPendingResults": {
      try {
        const resp = await labDB.getPendingResults();
        console.log("📤 IPC sending getPendingResults response:", resp);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "updateVisitInfo": {
      try {
        const resp = await labDB.updateVisitV2(arg.id, arg.data);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "printVisit": {
      try {
        // Determine if watermark should be shown for free users
        const shouldShowWatermark = arg.data.planType === "FREE";
        const watermarkBase64 = shouldShowWatermark
          ? getWatermarkBase64()
          : null;

        const resp = await createPDFForVisit({
          visit: arg.data.visit,
          isView: arg.data.isView,
          headerDataUrl: arg.data.headerDataUrl,
          watermarkBase64: watermarkBase64,
          fontSize: arg.data.fontSize || 10,
          withQR: arg.data.withQR || false,
          headerEmpty: arg.data.headerEmpty || false,
          headerHeight: arg.data.headerHeight || null,
          footerEmpty: arg.data.footerEmpty || false,
          footerHeight: arg.data.footerHeight || null,
        });
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "sendWhatsapp": {
      try {
        const resp = await sendWhatsApp(arg.data);
        event.reply(`asynchronous-reply-${arg.query}`, resp);
      } catch (error) {
        event.reply(`asynchronous-reply-${arg.query}`, {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "getVisitByPatient": {
      try {
        const { patientId } = arg;
        if (!patientId)
          throw new Error("Patient ID is required to get visits by patient.");
        const resp = await labDB.getVisitByPatient(patientId);
        event.reply("asynchronous-reply", resp);
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }
    case "getVisitByDoctor": {
      try {
        const { doctorId, startDate, endDate } = arg.data;
        console.log("Received data for getting visit by doctor:", arg.data);
        if (!doctorId)
          throw new Error("Doctor ID is required to get visits by doctor.");
        const resp = await labDB.getVisitByDoctor(doctorId, startDate, endDate);
        event.reply("asynchronous-reply", resp);
      } catch (error) {
        console.error("Error in getVisitByDoctor:", error); // <-- Add this
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "saveHeadImage": {
      try {
        const { file } = arg;
        fs.copyFile(file, app.getPath("userData") + "/head.png", (err) => {
          if (err) {
            event.reply("asynchronous-reply", { success: false, error: err.message });
          } else {
            event.reply("asynchronous-reply", { success: true });
          }
        });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "saveFootImage": {
      try {
        // Normalize to PNG (jsPDF can't embed webp, and foot.png is read as PNG)
        await sharp(arg.file)
          .png()
          .toFile(path.join(app.getPath("userData"), "foot.png"));
        event.reply("asynchronous-reply", { success: true });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "removeFootImage": {
      try {
        fs.rmSync(path.join(app.getPath("userData"), "foot.png"), {
          force: true,
        });
        event.reply("asynchronous-reply", { success: true });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "initHeadImage": {
      try {
        const destPath = path.join(app.getPath("userData"), "head.png");

        fs.copyFile(image, destPath, (err) => {
          if (err) {
            event.reply("asynchronous-reply", { success: false, err });
          } else {
            event.reply("asynchronous-reply", { success: true });
          }
        });
      } catch (error) {
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "initHeadImage2": {
      try {
        const { labName, address, phone } = arg;
        const destPath = path.join(app.getPath("userData"), "head.png");

        const backgroundImagePath = path.join(__dirname, "cover.png");
        const base64Background = fs.readFileSync(backgroundImagePath, {
          encoding: "base64",
        });

        const html = `
              <body style="padding: 0; margin: 0; background-color: black;height: 180px;">
                <div
                  class="wraper"
                  style="width: 100%; position: relative; direction: rtl; background: white"
                >
                  <img
                    src="data:image/png;base64,${base64Background}"
                    style="
                      width: 100%;
                      height: auto;
                      object-fit: cover;
                      position: absolute;
                      top: 0;
                      left: 0;
                      right: 0;
                    "
                  />
                  <div
                    class="info"
                    style="
                      padding: 20px;
                      padding-top: 30px;
                      padding-right: 38px;
                      font-size: 20px;
                      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
                        Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',
                        sans-serif;
                    "
                  >
                    <b style="font-size: 28px; margin-top: 10px; display: block; color: #0054a4; position: relative; z-index: 9;">${labName}</b>
                    <p style="line-height: 0.3;">العنوان : ${address}</p>
                    <p>رقم الهاتف : ${phone}</p>
                  </div>
                </div>
              </body>
              `;

        const windowsExecutablePath = findWindowsBrowserExecutable();
        if (process.platform === "win32") {
          log.info(
            "[initHeadImage2] windows browser lookup:",
            windowsExecutablePath || "none found"
          );
        }
        const puppeteerArgs = windowsExecutablePath
          ? { executablePath: windowsExecutablePath }
          : {};

        nodeHtmlToImage({
          output: destPath,
          html,
          quality: 100,
          puppeteerArgs,
        })
          .then(() => {
            event.reply("asynchronous-reply", { success: true });
          })
          .catch((err) => {
            log.error("[initHeadImage2] failed to generate header image:", err && err.message);
            event.reply("asynchronous-reply", {
              success: false,
              error: err && err.message,
            });
          });
      } catch (error) {
        console.log(error);
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    case "checkInitHeadImage": {
      const destPath = path.join(app.getPath("userData"), "head.png");

      if (!destPath) {
        event.reply("asynchronous-reply", { success: false, err });
      }

      return event.reply("asynchronous-reply", { success: true });
    }

    case "insert": // { doc: "patients", data : {}, query: "insert" }
      db[arg.doc].insert(arg.data, (err, rows) => {
        event.reply("asynchronous-reply", { err, rows });
      });
      break;

    case "update": // { doc: "patients", data : {}, query: "insert" }
      db[arg.doc].update(arg.condition, arg.data, {}, (err) => {
        if (err) return;
        db[arg.doc].find(arg.condition, function (err, docs) {
          event.reply("asynchronous-reply", { err, row: docs[0] });
        });
      });
      break;

    case "remove": // { doc: "patients", data : {}, query: "insert" }
      db[arg.doc].remove(arg.condition, {}, (err, numRemoved) => {
        event.reply("asynchronous-reply", { err, numRemoved });
      });
      break;

    case "find":
      db[arg.doc]
        .find(arg?.search)
        .skip(arg?.skip || 0)
        .limit(arg?.limit || 100)
        .sort({ createdAt: -1 })
        .exec((err, rows) => {
          event.reply("asynchronous-reply", { err, rows });
        });
      break;

    case "count": // { doc: "patients", search : {}, query: "find", skip: 0, limit: 100 }
      db[arg.doc].count(arg.search, (err, count) => {
        event.reply("asynchronous-reply", { err, count });
      });
      break;
    case "print": // { doc: "patients", search : {}, query: "find", skip: 0, limit: 100 }'
      logPrintOperation("print_start", {
        dataType: typeof arg.data,
        isView: arg?.isView,
        patientName: arg.data?.patient || "unknown",
        testsCount: arg.data?.tests?.length || 0,
      });

      createPDF(arg.data, arg?.isView, (err, res, file) => {
        // If PDF creation failed, try to copy defaultHeader.png to userData and retry
        if (err && err.message && err.message.includes("ENOENT")) {
          console.log(
            "PDF creation failed, attempting to copy header image..."
          );
          const userDataPath = app.getPath("userData");
          const headerDestPath = path.join(userDataPath, "head.png");

          try {
            // Ensure userData directory exists
            if (!fs.existsSync(userDataPath)) {
              fs.mkdirSync(userDataPath, { recursive: true });
            }

            // Copy defaultHeader.png to userData/head.png
            fs.copyFileSync(image, headerDestPath);
            console.log(
              "Header image copied successfully, retrying PDF creation..."
            );

            // Retry PDF creation
            createPDF(
              arg.data,
              arg?.isView,
              (retryErr, retryRes, retryFile) => {
                event.reply("asynchronous-reply", {
                  err: retryErr,
                  res: retryRes,
                  file: retryFile,
                });
              }
            );
          } catch (copyErr) {
            console.error("Failed to copy header image:", copyErr);
            event.reply("asynchronous-reply", { err, res, file });
          }
        } else {
          event.reply("asynchronous-reply", { err, res, file });
        }
      });
      break;

    case "printReport": // { doc: "patients", search : {}, query: "find", skip: 0, limit: 100 }
      logPrintOperation("printReport_start", {
        dataType: typeof arg.data,
        recordsCount: arg.data?.records?.length || 0,
        dateRange: arg.data?.date || "unknown",
        total: arg.data?.total || 0,
      });

      printReport(arg.data, (err, res) => {
        // If report creation failed, try to copy defaultHeader.png to userData and retry
        if (err && err.message && err.message.includes("ENOENT")) {
          console.log(
            "Report creation failed, attempting to copy header image..."
          );
          const userDataPath = app.getPath("userData");
          const headerDestPath = path.join(userDataPath, "head.png");

          try {
            // Ensure userData directory exists
            if (!fs.existsSync(userDataPath)) {
              fs.mkdirSync(userDataPath, { recursive: true });
            }

            // Copy defaultHeader.png to userData/head.png
            fs.copyFileSync(image, headerDestPath);
            console.log(
              "Header image copied successfully, retrying report creation..."
            );

            // Retry report creation
            printReport(arg.data, (retryErr, retryRes) => {
              return event.reply("asynchronous-reply", {
                err: retryErr,
                res: retryRes,
              });
            });
          } catch (copyErr) {
            console.error("Failed to copy header image:", copyErr);
            return event.reply("asynchronous-reply", { err, res });
          }
        } else {
          return event.reply("asynchronous-reply", { err, res });
        }
      });
      break;

    // case "getUUID":
    //   try {
    //     const UUID = machineIdSync(true);
    //     console.log("Retrieved UUID:", UUID);
    //     event.reply("asynchronous-reply", { UUID });
    //   } catch (error) {
    //     console.error("Error retrieving UUID:", error);
    //     event.reply("asynchronous-reply", { error: "Failed to retrieve UUID" });
    //   }
    //   break;

    case "getUUID":
      let UUID = await machineIdSync(true);
      event.reply("asynchronous-reply", { UUID });
      break;

    case "printParcode":
      logPrintOperation("printParcode_start", {
        patientId: arg?.data?.id,
        patientName: arg?.data?.name,
        selectedPrinter: arg?.selectedPrinter,
      });

      const padding = 20;

      try {
        // Fetch the visit object
        const visit = await labDB.getVisitDetails(arg.data.id);
        let visitNumber = visit?.visit_number;

        bwipjs.toBuffer(
          {
            bcid: "code128",
            text: String(visitNumber),
            scale: 4,
            height: 5,
            includetext: false,
          },
          function (err, png) {
            if (err) {
              logPrintOperation(
                "printParcode_barcode_generation_failed",
                {
                  patientId: arg?.data?.id,
                  visitNumber: visitNumber,
                },
                null,
                err
              );

              event.reply("asynchronous-reply", {
                success: false,
                error: "Failed to generate barcode",
              });
            } else {
              logPrintOperation("printParcode_barcode_generated", {
                patientId: arg?.data?.id,
                visitNumber: visitNumber,
                barcodeSize: png.length,
              });
              sharp(png)
                .metadata()
                .then((metadata) => {
                  const barcodeWidth = metadata.width;
                  const barcodeHeight = metadata.height;

                  const textSvg = Buffer.from(`
                  <svg width="${barcodeWidth}" height="60">
                    <text x="50%" y="50%" font-size="35" text-anchor="middle" fill="black" dominant-baseline="middle">${
                      visit ? visit.patient.name : arg.data.name
                    }</text>
                  </svg>
                `);

                  const totalWidth = barcodeWidth + 2 * padding;
                  const totalHeight = barcodeHeight + 30 + padding + padding;

                  sharp({
                    create: {
                      width: totalWidth,
                      height: totalHeight,
                      channels: 4,
                      background: { r: 255, g: 255, b: 255, alpha: 1 },
                    },
                  })
                    .composite([
                      { input: png, top: padding, left: padding },
                      {
                        input: textSvg,
                        top: barcodeHeight + padding,
                        left: padding,
                      },
                    ])
                    .png()
                    .toBuffer((err, outputBuffer) => {
                      if (err) {
                        logPrintOperation(
                          "printParcode_image_composite_failed",
                          {
                            patientId: arg?.data?.id,
                            visitNumber: visitNumber,
                          },
                          null,
                          err
                        );

                        event.reply("asynchronous-reply", {
                          success: false,
                          error: "Failed to generate barcode image",
                        });
                      } else {
                        logPrintOperation(
                          "printParcode_image_composite_success",
                          {
                            patientId: arg?.data?.id,
                            visitNumber: visitNumber,
                            imageSize: outputBuffer.length,
                          }
                        );

                        const base64Image = outputBuffer.toString("base64");

                        const printWin = new BrowserWindow({
                          width: 162,
                          height: 76,
                          show: false,
                          webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false,
                          },
                        });

                        logPrintOperation("printParcode_window_created", {
                          patientId: arg?.data?.id,
                          visitNumber: visitNumber,
                          selectedPrinter: arg?.selectedPrinter,
                        });

                        const htmlContent = `
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <style>
                                body { margin: 0; padding-left: 5px; padding-top: 2px; }
                                img { width: 100%; height: 100%; object-fit: cover; }
                              </style>
                            </head>
                            <body>
                              <img src="data:image/png;base64,${base64Image}" alt="Barcode">
                            </body>
                          </html>
                        `;

                        printWin.loadURL(
                          `data:text/html;charset=utf-8,${encodeURIComponent(
                            htmlContent
                          )}`
                        );

                        printWin.webContents.on("did-finish-load", () => {
                          logPrintOperation("printParcode_content_loaded", {
                            patientId: arg?.data?.id,
                            visitNumber: visitNumber,
                            selectedPrinter: arg?.selectedPrinter,
                          });

                          // Check if printer is available before printing
                          printWin.webContents
                            .getPrintersAsync()
                            .then((printers) => {
                              const availablePrinters = printers.map(
                                (p) => p.name
                              );
                              const isPrinterAvailable =
                                availablePrinters.includes(arg.selectedPrinter);

                              logPrintOperation("printParcode_printer_check", {
                                patientId: arg?.data?.id,
                                selectedPrinter: arg?.selectedPrinter,
                                isPrinterAvailable: isPrinterAvailable,
                                availablePrinters: availablePrinters,
                              });

                              if (!isPrinterAvailable && arg.selectedPrinter) {
                                const error = `Selected printer "${arg.selectedPrinter}" is not available`;
                                logPrintOperation(
                                  "printParcode_printer_unavailable",
                                  {
                                    patientId: arg?.data?.id,
                                    selectedPrinter: arg?.selectedPrinter,
                                    availablePrinters: availablePrinters,
                                  },
                                  null,
                                  error
                                );

                                event.reply("asynchronous-reply", {
                                  success: false,
                                  error: error,
                                });
                                printWin.close();
                                return;
                              }

                              const printOptions = {
                                silent: true,
                                printBackground: true,
                                deviceName: arg.selectedPrinter,
                                margins: {
                                  marginType: "none",
                                },
                                pageSize: {
                                  width: 35400,
                                  height: 17700,
                                },
                              };

                              logPrintOperation("printParcode_print_start", {
                                patientId: arg?.data?.id,
                                visitNumber: visitNumber,
                                printOptions: printOptions,
                              });

                              printWin.webContents.print(
                                printOptions,
                                (success, failureReason) => {
                                  if (!success) {
                                    logPrintOperation(
                                      "printParcode_print_failed",
                                      {
                                        patientId: arg?.data?.id,
                                        visitNumber: visitNumber,
                                        selectedPrinter: arg?.selectedPrinter,
                                        failureReason: failureReason,
                                      },
                                      null,
                                      failureReason
                                    );

                                    event.reply("asynchronous-reply", {
                                      success: false,
                                      error: failureReason,
                                    });
                                  } else {
                                    logPrintOperation(
                                      "printParcode_print_success",
                                      {
                                        patientId: arg?.data?.id,
                                        visitNumber: visitNumber,
                                        selectedPrinter: arg?.selectedPrinter,
                                      },
                                      { success: true }
                                    );

                                    event.reply("asynchronous-reply", {
                                      success: true,
                                    });
                                  }
                                  printWin.close();
                                }
                              );
                            })
                            .catch((printerError) => {
                              logPrintOperation(
                                "printParcode_printer_list_failed",
                                {
                                  patientId: arg?.data?.id,
                                  visitNumber: visitNumber,
                                },
                                null,
                                printerError
                              );

                              // Continue with print attempt even if printer list fails
                              printWin.webContents.print(
                                {
                                  silent: true,
                                  printBackground: true,
                                  deviceName: arg.selectedPrinter,
                                  margins: {
                                    marginType: "none",
                                  },
                                  pageSize: {
                                    width: 35400,
                                    height: 17700,
                                  },
                                },
                                (success, failureReason) => {
                                  if (!success) {
                                    logPrintOperation(
                                      "printParcode_print_failed_fallback",
                                      {
                                        patientId: arg?.data?.id,
                                        visitNumber: visitNumber,
                                        selectedPrinter: arg?.selectedPrinter,
                                        failureReason: failureReason,
                                      },
                                      null,
                                      failureReason
                                    );

                                    event.reply("asynchronous-reply", {
                                      success: false,
                                      error: failureReason,
                                    });
                                  } else {
                                    logPrintOperation(
                                      "printParcode_print_success_fallback",
                                      {
                                        patientId: arg?.data?.id,
                                        visitNumber: visitNumber,
                                        selectedPrinter: arg?.selectedPrinter,
                                      },
                                      { success: true }
                                    );

                                    event.reply("asynchronous-reply", {
                                      success: true,
                                    });
                                  }
                                  printWin.close();
                                }
                              );
                            });
                        });
                      }
                    });
                })
                .catch((error) => {
                  logPrintOperation(
                    "printParcode_sharp_processing_failed",
                    {
                      patientId: arg?.data?.id,
                      visitNumber: visitNumber,
                    },
                    null,
                    error
                  );

                  event.reply("asynchronous-reply", {
                    success: false,
                    error: "Error processing image",
                  });
                });
            }
          }
        );
      } catch (error) {
        logPrintOperation(
          "printParcode_general_error",
          {
            patientId: arg?.data?.id,
            patientName: arg?.data?.name,
            selectedPrinter: arg?.selectedPrinter,
          },
          null,
          error
        );

        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;

    case "exportDatabaseFile": {
      try {
        const resp = await labDB.exportDatabase();
        event.reply("asynchronous-reply", resp);
      } catch (error) {
        console.error("❌ Unexpected error in ExportDatabaseFile:", error);
        event.reply("asynchronous-reply", {
          success: false,
          message: "حدث خطأ غير متوقع أثناء التصدير.",
        });
      }
      break;
    }

    case "ImportDatabaseFile": {
      try {
        const resp = await labDB.importDatabase();
        event.reply("asynchronous-reply", resp);
      } catch (error) {
        console.error("❌ Error in ImportDatabaseFile:", error);
        event.reply("asynchronous-reply", {
          success: false,
          message: "حدث خطأ أثناء الاستيراد.",
        });
      }
      break;
    }

    case "sendEmail": {
      try {
        const { name, labName, phone, feedback } = arg.data;
        
        const transporter = nodemailer.createTransport({
          service: "gmail",
          host: "smtp.gmail.com",
          port: 587,
          secure: false, 
          requireTLS: true,
          auth: {
            user: "puretiks4@gmail.com",
            pass: "frjuplscqvoqbgrc",
          },
        });

        // Email content
        const mailOptions = {
          from: "puretiks4@gmail.com",
          to: "murtadha.mohammed.94@gmail.com",
          subject: feedback ? "User Feedback - Dr.Lab" : "New User Registration - Dr.Lab",
          html: `
            <h2>${feedback ? "User Feedback" : "New User Registration"}</h2>
            <p><strong>User Name:</strong> ${name || "N/A"}</p>
            <p><strong>Lab Name:</strong> ${labName || "N/A"}</p>
            <p><strong>Phone Number:</strong> ${phone || "N/A"}</p>
            ${feedback ? `<p><strong>Feedback:</strong></p><p style="white-space: pre-wrap; background-color: #f5f5f5; padding: 10px; border-radius: 5px;">${feedback}</p>` : ""}
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          `,
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent successfully:", info.messageId);
        
        event.reply("asynchronous-reply", {
          success: true,
          message: "Email sent successfully",
        });
      } catch (error) {
        console.error("❌ Error sending email:", error);
        event.reply("asynchronous-reply", {
          success: false,
          error: error.message,
        });
      }
      break;
    }

    // Renderer only sends this after /app/leave-lab has already succeeded
    // server-side (see src/helper/leaveLab.js) — this step just wipes what's
    // left on disk so the next login (to this lab or another one) starts
    // clean. Relaunches the app, so no reply is expected on success.
    case "leaveLab": {
      try {
        const resp = await labDB.requestDataWipe();
        if (resp) event.reply("asynchronous-reply", resp);
      } catch (error) {
        console.error("❌ Error in leaveLab:", error);
        event.reply("asynchronous-reply", {
          success: false,
          message: "Failed to delete local data.",
        });
      }
      break;
    }

    default:
      console.log(
        "❌ DEBUG: Unknown query reached default case. Query was:",
        arg.query
      );
      event.reply("asynchronous-reply", { err: "Unknown query", res: null });
      break;
  }
});

ipcMain.handle("get-printers", async (event) => {
  try {
    logPrintOperation("get_printers_start", {});

    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      const error = "No active window";
      logPrintOperation("get_printers_no_window", {}, null, error);
      throw new Error(error);
    }

    const printers = await win.webContents.getPrintersAsync();
    const printerNames = printers.map((printer) => printer.name);

    logPrintOperation("get_printers_success", {
      printersCount: printers.length,
      printerNames: printerNames,
      printerDetails: printers.map((p) => ({
        name: p.name,
        status: p.status,
        isDefault: p.isDefault,
      })),
    });

    return printerNames;
  } catch (error) {
    logPrintOperation("get_printers_failed", {}, null, error);
    throw error;
  }
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((printer) => printer.name);
});
