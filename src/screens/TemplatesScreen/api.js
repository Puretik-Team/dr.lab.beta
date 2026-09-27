// Persistence layer for report templates — thin wrappers over the IPC
// queries handled in src/control/main.js (backed by LabDB's report_templates).
import { send } from "../../control/renderer";
import { normalizeTemplate, mergeLabInfo } from "../../templates/schema";
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
