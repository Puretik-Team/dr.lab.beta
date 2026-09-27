// Realistic sample report data for the editor canvas, live preview and
// "export preview PDF". Same shape reportData.js builds from a real visit.

const t = (name, nameAr, result, unit, ref, status = "normal", comment = "") => ({
  name,
  nameAr,
  result,
  unit,
  ref,
  status,
  comment,
});

const CBC = {
  category: "Complete Blood Count (CBC)",
  categoryAr: "صورة الدم الكاملة",
  tests: [
    t("WBC", "كريات الدم البيضاء", "11.8", "10³/µL", "4.0 – 11.0", "high"),
    t("RBC", "كريات الدم الحمراء", "4.62", "10⁶/µL", "4.2 – 5.4"),
    t("Hemoglobin", "الهيموغلوبين", "11.2", "g/dL", "12.0 – 16.0", "low"),
    t("Hematocrit", "الهيماتوكريت", "36.1", "%", "36 – 46"),
    t("MCV", "متوسط حجم الكرية", "82.4", "fL", "80 – 100"),
    t("MCH", "متوسط هيموغلوبين الكرية", "27.9", "pg", "27 – 33"),
    t("MCHC", "تركيز الهيموغلوبين", "33.4", "g/dL", "32 – 36"),
    t("Platelets", "الصفائح الدموية", "268", "10³/µL", "150 – 450"),
    t("Neutrophils", "العدلات", "72", "%", "40 – 70", "high"),
    t("Lymphocytes", "اللمفاويات", "21", "%", "20 – 40"),
  ],
};

const BIOCHEM = {
  category: "Clinical Biochemistry",
  categoryAr: "الكيمياء الحيوية",
  tests: [
    t("Glucose (Fasting)", "سكر الدم الصائم", "126", "mg/dL", "70 – 110", "high", "Repeat fasting test recommended."),
    t("Urea", "اليوريا", "31", "mg/dL", "15 – 45"),
    t("Creatinine", "الكرياتينين", "0.82", "mg/dL", "0.6 – 1.2"),
    t("Uric Acid", "حمض اليوريك", "5.1", "mg/dL", "2.6 – 6.0"),
    t("ALT (GPT)", "إنزيم ALT", "28", "U/L", "< 40"),
    t("AST (GOT)", "إنزيم AST", "24", "U/L", "< 40"),
    t("Total Cholesterol", "الكوليسترول الكلي", "232", "mg/dL", "< 200", "high"),
    t("Triglycerides", "الدهون الثلاثية", "148", "mg/dL", "< 150"),
    t("HDL Cholesterol", "الكوليسترول الجيد", "38", "mg/dL", "> 40", "low"),
    t("LDL Cholesterol", "الكوليسترول الضار", "164", "mg/dL", "< 130", "high"),
    t("Potassium", "البوتاسيوم", "6.4", "mmol/L", "3.5 – 5.1", "critical", "Critical value — physician notified."),
  ],
};

const HORMONES = {
  category: "Hormones & Vitamins",
  categoryAr: "الهرمونات والفيتامينات",
  tests: [
    t("TSH", "الهرمون المحفز للغدة الدرقية", "2.14", "µIU/mL", "0.4 – 4.0"),
    t("Free T4", "الثايروكسين الحر", "1.21", "ng/dL", "0.8 – 1.8"),
    t("Free T3", "ثلاثي يود الثايرونين الحر", "3.1", "pg/mL", "2.3 – 4.2"),
    t("Vitamin D (25-OH)", "فيتامين د", "14.6", "ng/mL", "30 – 100", "low", "Deficiency range."),
    t("Vitamin B12", "فيتامين ب12", "412", "pg/mL", "200 – 900"),
    t("Ferritin", "الفيريتين", "18", "ng/mL", "15 – 150"),
  ],
};

const URINE = {
  category: "Urinalysis",
  categoryAr: "تحليل الإدرار",
  tests: [
    t("Color", "اللون", "Yellow", "", "Yellow", null),
    t("Appearance", "المظهر", "Clear", "", "Clear", null),
    t("pH", "الحموضة", "6.0", "", "5.0 – 8.0"),
    t("Specific Gravity", "الكثافة النوعية", "1.020", "", "1.005 – 1.030"),
    t("Protein", "البروتين", "Negative", "", "Negative", null),
    t("Glucose", "السكر", "Negative", "", "Negative", null),
    t("Pus Cells", "خلايا القيح", "2–4", "/HPF", "0 – 5", null),
    t("RBCs", "كريات الدم الحمراء", "0–1", "/HPF", "0 – 2", null),
  ],
};

const COAG = {
  category: "Coagulation",
  categoryAr: "تخثر الدم",
  tests: [
    t("PT", "زمن البروثرومبين", "12.8", "sec", "11 – 13.5"),
    t("INR", "INR", "1.05", "", "0.8 – 1.2"),
    t("aPTT", "زمن الثرومبوبلاستين الجزئي", "31", "sec", "25 – 35"),
  ],
};

const base = {
  patient: {
    name: "Sara Ahmed Hassan",
    id: "#1042",
    age: "34 years",
    gender: "Female",
    phone: "0770 123 4567",
    birth: "1991/03/14",
  },
  report: {
    number: "R-000231",
    date: "2026/09/27 10:45",
    collectionDate: "2026/09/27 08:30",
    doctor: "Dr. Omar Khalid",
    notes: "Fasting sample (12 h). Results reviewed and verified by the laboratory director.",
    verificationCode: "VX-4F21",
  },
  laboratory: {
    name: "Dr. Lab Medical Laboratory",
    subtitle: "Clinical Pathology · Hematology · Biochemistry",
    phone: "0780 000 0000",
    address: "Al-Mansour, Baghdad, Iraq",
    website: "www.drlab.app",
    email: "info@drlab.app",
  },
};

const SAMPLE_DATASETS = {
  standard: { label: "CBC + Biochemistry + Hormones", results: [CBC, BIOCHEM, HORMONES] },
  short: { label: "Single panel (CBC)", results: [CBC] },
  extended: {
    label: "Extended (multi-page)",
    results: [CBC, BIOCHEM, HORMONES, URINE, COAG, { ...BIOCHEM, category: "Follow-up Biochemistry" }],
  },
};

function getSampleData(key = "standard", labOverrides = null) {
  const set = SAMPLE_DATASETS[key] || SAMPLE_DATASETS.standard;
  const data = JSON.parse(JSON.stringify({ ...base, results: set.results }));
  if (labOverrides) {
    for (const [k, v] of Object.entries(labOverrides)) {
      if (v) data.laboratory[k] = v;
    }
  }
  return data;
}

module.exports = { getSampleData, SAMPLE_DATASETS };
