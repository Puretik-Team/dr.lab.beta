// Turns a real visit (the shape getVisitsV2 returns / printVisit receives)
// into the engine's report-data shape. Reuses the classic PDF pipeline's
// reference-range parsing and status classification so both layouts always
// flag the same results as high/low/critical.
const dayjs = require("dayjs");
const {
  formatRef,
  getResultStatus,
  normalizeGenderCode,
  getSingleResultRJ,
  getPanelResultRJ,
  getCompositeResultRJ,
} = require("../control/pdf/utils");

function safeParse(v) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

const WORDS = {
  en: { years: "years", months: "months", days: "days", M: "Male", F: "Female", tests: "Tests" },
  ar: { years: "سنة", months: "شهر", days: "يوم", M: "ذكر", F: "أنثى", tests: "الفحوصات" },
};

function calcAge(birth, w) {
  const b = dayjs(birth);
  if (!birth || !b.isValid()) return "-";
  const years = dayjs().diff(b, "year");
  if (years >= 1) return `${years} ${w.years}`;
  const months = dayjs().diff(b, "month");
  return months >= 1 ? `${months} ${w.months}` : `${dayjs().diff(b, "day")} ${w.days}`;
}

function genderLabel(g, w) {
  const code = normalizeGenderCode(g);
  return code ? w[code] : g || "-";
}

function commentOf(rj) {
  if (!rj || typeof rj !== "object") return "";
  return rj.comment || rj.note || rj.notes || "";
}

// `language` is the template's language — Arabic templates get Arabic
// age/gender words so they don't print as English inside an RTL layout.
function visitToReportData(visit = {}, labInfo = null, language = "en") {
  const w = WORDS[language === "ar" ? "ar" : "en"];
  const patient = visit.patient || {};
  const genderCode = normalizeGenderCode(patient.gender);
  const createdAt = visit.createdAt || visit.created_at || new Date();
  const results = [];
  let singles = null; // consecutive singles share one category, like the classic layout

  for (const item of Array.isArray(visit.tests) ? visit.tests : []) {
    const rj = safeParse(item.result_json);
    if (item.type === "panel") {
      singles = null;
      const meta = safeParse(item.meta_json);
      results.push({
        category: item.name_en || item.name_ar || item.code,
        categoryAr: item.name_ar || "",
        tests: (Array.isArray(meta?.items) ? meta.items : []).map((r) => {
          const result = getPanelResultRJ(rj, r.code);
          return {
            name: r.name_en || r.code || "",
            nameAr: r.name_ar || "",
            result: String(result ?? ""),
            unit: r.unit || "",
            ref: formatRef(r.ref, r.unit),
            status: result !== "" ? getResultStatus(r.ref, result, genderCode) : null,
            comment: commentOf(rj?.items?.[r.code]),
          };
        }),
        comment: commentOf(rj),
      });
    } else if (item.type === "composite") {
      singles = null;
      const meta = safeParse(item.meta_json);
      for (const sec of Array.isArray(meta?.sections) ? meta.sections : []) {
        results.push({
          category: [item.name_en, sec.name_en].filter(Boolean).join(" — ") || sec.code,
          categoryAr: sec.name_ar || "",
          tests: (Array.isArray(sec.fields) ? sec.fields : []).map((f) => ({
            name: f.label_en || f.code,
            nameAr: f.label_ar || "",
            result: String(getCompositeResultRJ(rj, sec.code, f.code) ?? ""),
            unit: f.unit || "",
            ref: f.ref ? formatRef(f.ref, f.unit) : "",
            status: null,
            comment: "",
          })),
        });
      }
    } else {
      const result = getSingleResultRJ(rj);
      const row = {
        name: item.name_en || item.name_ar || item.code,
        nameAr: item.name_ar || "",
        result: String(result ?? ""),
        unit: item.unit || "",
        ref: formatRef(item.ref_text, item.unit),
        status: result !== "" ? getResultStatus(item.ref_text, result, genderCode) : null,
        comment: commentOf(rj),
      };
      const category = item.sample_type ? `${w.tests} — ${item.sample_type}` : w.tests;
      if (singles && singles.category === category) singles.tests.push(row);
      else {
        singles = { category, categoryAr: "", tests: [row] };
        results.push(singles);
      }
    }
  }

  const number = visit.visitNumber || visit.visit_number || visit.id || "";
  return {
    patient: {
      name: patient.name || "-",
      id: patient.id != null ? `#${patient.id}` : "-",
      age: calcAge(patient.birth, w),
      gender: genderLabel(patient.gender, w),
      phone: patient.phone || "-",
      birth: patient.birth ? dayjs(patient.birth).format("YYYY/MM/DD") : "-",
    },
    report: {
      number: String(number),
      date: dayjs().format("YYYY/MM/DD HH:mm"),
      collectionDate: dayjs(createdAt).format("YYYY/MM/DD HH:mm"),
      doctor: visit.doctor?.name || "-",
      notes: visit.notes || "",
      verificationCode: `DL-${String(number || patient.id || "").padStart(6, "0")}`,
    },
    laboratory: {
      name: labInfo?.name || "",
      subtitle: labInfo?.subtitle || "",
      phone: labInfo?.phone || "",
      address: labInfo?.address || "",
      website: labInfo?.website || "",
      email: labInfo?.email || "",
    },
    results,
  };
}

module.exports = { visitToReportData };
