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

// Keeps downloaded designs current. Whenever the lab is online:
//  - a downloaded copy is refreshed when the server has a newer version or its
//    free/paid flag or position changed;
//  - a saved report design built from a catalog design is rebuilt with the new
//    layout (the lab's own logo, color and details live in its settings, so
//    they carry over);
//  - a saved design from the old built-in set ("modernPurple", ...) is moved
//    to its catalog entry, matched by legacyKey. The layout is identical, so
//    reports print the same; from then on it receives the entry's updates.
// Matching is by the server's template id. Never throws; offline simply does
// nothing.
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
    const raw = await res.json();
    const server = raw.filter(usable);
    lastCatalogSync = Date.now();
    const byId = new Map(server.map((e) => [e.id, e]));
    const byKey = new Map(server.filter((e) => e.legacyKey).map((e) => [e.legacyKey, e]));

    // 1. local downloads
    const cached = await listCachedCatalog();
    for (const c of cached) {
      const e = byId.get(c.id);
      const changed =
        e &&
        ((e.version || 1) > (c.version || 1) ||
          !!e.isFree !== !!c.isFree ||
          (e.sortOrder || 0) !== (c.sortOrder || 0) ||
          (e.legacyKey || null) !== (c.legacyKey || null));
      if (changed) await downloadCatalogTemplate(e);
    }

    // 2. saved report designs
    const saved = await listTemplates();
    for (const t of saved) {
      const settings = t.content?.simple;
      if (!settings) continue;
      const m = /^catalog:(\d+)$/.exec(settings.design || "");
      // A design the server no longer lists was deleted or unpublished: the lab
      // has to pick another one, so it counts as not selected.
      if (m && !raw.some((x) => x.id === Number(m[1]))) {
        if (t.isDefault) await clearSelection();
        continue;
      }
      const e = m ? byId.get(Number(m[1])) : byKey.get(settings.design);
      if (!e) continue;
      const migrating = !m;
      if (!migrating && (e.version || 1) <= (settings.catalogVersion || 0)) continue;
      const next = { ...settings, design: `catalog:${e.id}`, catalog: e.configJson, catalogVersion: e.version };
      // The Dr. Lab logo/badge images are bundled with the screen, not
      // available here — reuse the copies already embedded in the saved design.
      const own = (role) => t.elements.find((el) => el.role === role)?.src || "";
      const forced = !!e.configJson?.content?.forceDrLabLogo;
      const rebuilt = buildSimpleTemplate(next, t, false, true, own("drlabBadge"), forced ? own("logo") : "");
      // buildSimpleTemplate always marks its result default; keep the saved
      // design's own state.
      rebuilt.isDefault = t.isDefault;
      await saveTemplate(rebuilt);
      if (migrating) await downloadCatalogTemplate(e);
    }
  } catch (e) {
    // offline / signed out — try again next time
  }
}

// ------------------------------------------------- is a design selected?
// One rule: printing needs a selected report design. A design counts as
// selected when the lab saved one, or chose the classic header/footer.
// It stops counting when the design stops being available to the lab (deleted
// on the server, or paid while the plan is free) — see clearSelection.
const CHOSEN_KEY = "report-design-chosen";

// Called once a design has been picked (a saved design, or the classic
// header/footer).
export function markDesignChosen() {
  try {
    localStorage.setItem(CHOSEN_KEY, "1");
  } catch (e) {}
}

// Back to "nothing selected": no default design, classic header/footer not chosen.
async function clearSelection() {
  try {
    localStorage.removeItem(CHOSEN_KEY);
  } catch (e) {}
  await setDefaultTemplate(null);
}

export async function hasSelectedDesign() {
  const saved = await listTemplates();
  return saved.some((t) => t.isDefault) || !!localStorage.getItem(CHOSEN_KEY);
}

// On a free plan, a paid design can't stay selected (e.g. a subscription
// ended). Works from what's on this PC, so it needs no connection.
export async function dropPaidSelectionIfFree(planType) {
  if (planType !== "FREE") return;
  const def = (await listTemplates()).find((t) => t.isDefault);
  const s = def?.content?.simple;
  if (!s) return;
  const m = /^catalog:(\d+)$/.exec(s.design || "");
  let paid;
  if (m) {
    const e = (await listCachedCatalog().catch(() => [])).find((c) => c.id === Number(m[1]));
    paid = !!e && !e.isFree; // not downloaded here: can't tell, leave it
  } else {
    paid = !!s.design && s.design !== "minimal"; // the old built-ins: only Simple was free
  }
  if (paid) await clearSelection();
}
