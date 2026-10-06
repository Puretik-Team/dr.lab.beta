// Persistence layer for report templates — thin wrappers over the IPC
// queries handled in src/control/main.js (backed by LabDB's report_templates).
import { send } from "../../control/renderer";
import { normalizeTemplate, mergeLabInfo, SCHEMA_VERSION } from "../../templates/schema";
import { apiCall } from "../../libs/api";
import { buildSimpleTemplate } from "../../templates/simple";
import { getSampleData } from "../../templates/sampleData";

function unwrap(resp) {
  if (!resp || resp.success === false) {
    if (resp?.canceled) return null;
    throw new Error(resp?.error || "Unexpected error");
  }
  return resp.data ?? resp;
}

export async function listTemplates() {
  const data = unwrap(await send({ query: "getReportTemplates" }));
  return (data || []).map(normalizeTemplate);
}

export async function saveTemplate(template) {
  return normalizeTemplate(unwrap(await send({ query: "saveReportTemplate", data: template })));
}

export async function setDefaultTemplate(id) {
  return unwrap(await send({ query: "setDefaultReportTemplate", id }));
}

// The signed-in lab's profile (set at login) — fills {{laboratory.*}} when a
// template doesn't override it.
export function getAccountLab() {
  try {
    const u = JSON.parse(localStorage.getItem("lab-user"));
    if (u) return { name: u.labName, phone: u.phone, address: u.address, email: u.email };
  } catch (_) {}
  return {};
}

export function previewData(template, datasetKey = "standard") {
  const lab = mergeLabInfo(template, getAccountLab());
  const data = getSampleData(datasetKey, lab);
  // Simple designs preview exactly what the user typed — no sample lab text
  // filling the fields they left empty.
  if (template.content?.simple) data.laboratory = lab;
  // Real patients' names, doctors and notes are usually typed in Arabic —
  // preview them that way so the design is judged on realistic data.
  Object.assign(data.patient, { name: "سارة أحمد حسن" });
  data.report.doctor = "د. عمر خالد";
  data.report.notes = "عينة صائمة لمدة ١٢ ساعة. تمت مراجعة النتائج من قبل مدير المختبر.";
  return data;
}

// Renders a sample report and opens it in the PDF viewer — no save dialog.
export async function showExample(template) {
  return unwrap(
    await send({
      query: "exportReportTemplatePDF",
      data: { template, mode: "preview", openOnly: true, sampleData: previewData(template, "standard"), labInfo: getAccountLab() },
    })
  );
}

// ---------------------------------------------------------------- catalog
// Extra designs published from the admin dashboard. Listed from the server
// when online; picking one downloads it into the local database, which is
// also what the list falls back to offline.

// Designs from a newer schema than this app understands are hidden.
const usable = (e) => e && e.configJson && Array.isArray(e.configJson.elements) && (e.schemaVersion || 1) <= SCHEMA_VERSION;

export async function listCachedCatalog() {
  const data = unwrap(await send({ query: "getCatalogTemplates" }));
  return (data || []).filter(usable);
}

// Labs are often offline or on a poor connection, so the server list gets a
// short deadline instead of leaving the picker waiting on a dead request.
const CATALOG_TIMEOUT_MS = 8000;

export async function listCatalog() {
  try {
    const res = await Promise.race([
      apiCall({ pathname: "/app/templates", auth: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CATALOG_TIMEOUT_MS)),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    if (Array.isArray(list)) return list.filter(usable);
  } catch (e) {
    // offline / signed-out — use what's already downloaded
  }
  return listCachedCatalog();
}

export async function downloadCatalogTemplate(entry) {
  return unwrap(await send({ query: "saveCatalogTemplate", data: entry }));
}

export async function deleteCatalogTemplate(id) {
  return unwrap(await send({ query: "deleteCatalogTemplate", id }));
}

// Keeps downloaded designs current. Whenever the lab is online, any design
// whose server version is newer than the local copy is re-downloaded, and a
// saved report design built from it is rebuilt with the new layout (the lab's
// own logo, color and details live in its settings, so they carry over).
// Matching is by the server's template id, which both the local copy and the
// saved report design remember. Never throws; offline simply does nothing.
let lastCatalogSync = 0;
const CATALOG_SYNC_EVERY_MS = 10 * 60 * 1000;

export async function syncCatalogUpdates({ force = false } = {}) {
  if (!force && Date.now() - lastCatalogSync < CATALOG_SYNC_EVERY_MS) return;
  try {
    const res = await Promise.race([
      apiCall({ pathname: "/app/templates", auth: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CATALOG_TIMEOUT_MS)),
    ]);
    if (!res.ok) return;
    const server = (await res.json()).filter(usable);
    lastCatalogSync = Date.now();
    const newer = new Map(server.map((e) => [e.id, e]));

    // 1. local downloads
    const cached = await listCachedCatalog();
    for (const c of cached) {
      const e = newer.get(c.id);
      if (e && (e.version || 1) > (c.version || 1)) await downloadCatalogTemplate(e);
    }

    // 2. saved report designs built from a catalog design
    const saved = await listTemplates();
    for (const t of saved) {
      const settings = t.content?.simple;
      const m = /^catalog:(\d+)$/.exec(settings?.design || "");
      const e = m && newer.get(Number(m[1]));
      if (!e || (e.version || 1) <= (settings.catalogVersion || 0)) continue;
      const rebuilt = buildSimpleTemplate(
        { ...settings, catalog: e.configJson, catalogVersion: e.version },
        t
      );
      // buildSimpleTemplate always marks its result default; keep the saved
      // design's own state.
      rebuilt.isDefault = t.isDefault;
      await saveTemplate(rebuilt);
    }
  } catch (e) {
    // offline / signed out — try again next time
  }
}
