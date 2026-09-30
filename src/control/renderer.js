const electron = window.require("electron");
const { ipcRenderer, shell } = electron;

export function send(doc) {
  return new Promise((resolve) => {
    const queryName = doc.query;
    const replyChannel =
      queryName &&
      [
        "getTotalPatients",
        "getTodayVisits",
        "getPendingResults",
        "getTotalVisits",
        "testByID",
        "getTests",
        "getTestsModal",
        "editTest",
        "deleteTest",
        "printVisit",
        "getPackages",
        "getVisits",
        "getVisitTotals",
        "updateVisitInfo",
        "getTopTests",
        "editMetaJson",
        "setSyncConfig",
        "getReportTemplates",
        "getReportTemplate",
        "saveReportTemplate",
        "deleteReportTemplate",
        "setDefaultReportTemplate",
        "exportReportTemplatePDF",
        "renderThemePreview",
        "renderReportPreview",
      ].includes(queryName)
        ? `asynchronous-reply-${queryName}`
        : "asynchronous-reply";

    ipcRenderer.once(replyChannel, (_, arg) => {
      resolve(arg);
    });
    ipcRenderer.send("asynchronous-message", doc);
  });
}

// For queries that never reply (e.g. syncNow) — a send() here would leave a
// stale once-listener that could swallow another query's reply.
export function fireAndForget(doc) {
  ipcRenderer.send("asynchronous-message", doc);
}

export function onSyncStatus(callback) {
  const listener = (_, status) => callback(status);
  ipcRenderer.on("sync-status", listener);
  return () => ipcRenderer.removeListener("sync-status", listener);
}

// The sync engine's HTTP calls run from the main process, which is
// architecturally invisible to this window's DevTools Network tab (that
// tab only ever sees requests this renderer itself makes). So instead of
// calling fetch() in main, the sync engine asks this renderer to make the
// request on its behalf — that way it shows up in Network like any other
// API call.
ipcRenderer.on("sync-fetch-request", async (_event, { requestId, url, options }) => {
  try {
    const res = await fetch(url, options);
    const body = await res.text();
    ipcRenderer.send(`sync-fetch-reply-${requestId}`, {
      status: res.status,
      ok: res.ok,
      body,
    });
  } catch (error) {
    ipcRenderer.send(`sync-fetch-reply-${requestId}`, { error: error.message });
  }
});

document.addEventListener("click", function (event) {
  if (event.target.tagName === "A" && event.target.href.startsWith("http")) {
    event.preventDefault();
    shell.openExternal(event.target.href);
  }
});
