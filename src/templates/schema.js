// Report template schema — shared by the React editor (renderer), the
// rendering engine, and the main-process PDF exporter, so it stays plain
// CommonJS with no DOM/Node dependencies.
//
// A template is a positioned-element document measured in millimetres. All
// element coordinates are page-absolute; `zone` decides how an element
// behaves when a report paginates:
//   background → drawn on every page, behind everything
//   header     → drawn on every page (repeats)
//   footer     → drawn on every page (repeats)
//   body       → drawn on page 1 only, except the results table (which flows
//                across pages) and body elements placed *below* it (which
//                follow the table wherever it ends).

const SCHEMA_VERSION = 1;

const PAGE_SIZES = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
};

const ZONES = ["background", "header", "body", "footer"];

// Fonts offered in the editor. "Frutiger" and "Circular" ship with the app
// (src/fonts) and are embedded into exported PDFs; the rest are system fonts.
const FONTS = [
  { value: "Frutiger", label: "Frutiger (Arabic + Latin)" },
  { value: "Circular", label: "Circular" },
  { value: "Tahoma", label: "Tahoma" },
  { value: "Arial", label: "Arial" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Courier New", label: "Courier New" },
];

// Every {{binding}} the engine can resolve. `sample` is only for the picker's
// hint text — real values come from sampleData.js / reportData.js.
const PLACEHOLDERS = [
  {
    group: "Patient",
    items: [
      { key: "patient.name", label: "Patient name", sample: "Sara Ahmed" },
      { key: "patient.id", label: "Patient ID", sample: "#1042" },
      { key: "patient.age", label: "Age", sample: "34 years" },
      { key: "patient.gender", label: "Gender", sample: "Female" },
      { key: "patient.phone", label: "Phone number", sample: "0770 123 4567" },
      { key: "patient.birth", label: "Date of birth", sample: "1991/03/14" },
    ],
  },
  {
    group: "Report",
    items: [
      { key: "report.number", label: "Report number", sample: "R-000231" },
      { key: "report.date", label: "Report date", sample: "2026/09/27" },
      { key: "report.collectionDate", label: "Collection date", sample: "2026/09/27 08:30" },
      { key: "report.doctor", label: "Referring physician", sample: "Dr. Omar Khalid" },
      { key: "report.notes", label: "Report comments", sample: "Fasting sample." },
      { key: "report.verificationCode", label: "Verification code", sample: "VX-4F21" },
    ],
  },
  {
    group: "Laboratory",
    items: [
      { key: "laboratory.name", label: "Laboratory name", sample: "Dr. Lab" },
      { key: "laboratory.subtitle", label: "Laboratory subtitle", sample: "Medical Laboratory" },
      { key: "laboratory.phone", label: "Laboratory phone", sample: "0780 000 0000" },
      { key: "laboratory.address", label: "Laboratory address", sample: "Baghdad, Iraq" },
      { key: "laboratory.website", label: "Website", sample: "www.drlab.app" },
      { key: "laboratory.email", label: "Email", sample: "info@drlab.app" },
    ],
  },
  {
    group: "Page",
    items: [
      { key: "page.number", label: "Page number", sample: "1" },
      { key: "page.total", label: "Total pages", sample: "2" },
    ],
  },
];

const PLACEHOLDER_KEYS = PLACEHOLDERS.flatMap((g) => g.items.map((i) => i.key));

const RESULT_COLUMNS = [
  { key: "name", label: "Test", labelAr: "الفحص", width: 34, align: "start", visible: true },
  { key: "result", label: "Result", labelAr: "النتيجة", width: 16, align: "center", visible: true },
  { key: "unit", label: "Unit", labelAr: "الوحدة", width: 13, align: "center", visible: true },
  { key: "ref", label: "Reference Range", labelAr: "المدى الطبيعي", width: 23, align: "center", visible: true },
  { key: "status", label: "Status", labelAr: "الحالة", width: 14, align: "center", visible: true },
];

const DEFAULT_STATUS_COLORS = {
  normal: { text: "#1E7A4C", fill: "#E9F6EF" },
  high: { text: "#B4540A", fill: "#FDF1E4" },
  low: { text: "#1F57C3", fill: "#EAF0FC" },
  critical: { text: "#FFFFFF", fill: "#B42318" },
};

const BRAND = {
  purple: "#6A48B8",
  purpleDeep: "#4E3894",
  lavender: "#F5F1FC",
  ink: "#1E1B37",
  muted: "#6B6880",
  line: "#E4E2EA",
};

let idCounter = 0;
function uid(prefix = "el") {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${idCounter}`;
}

const TEXT_DEFAULTS = {
  fontFamily: "Frutiger",
  fontSize: 10, // pt
  fontWeight: 400,
  fontStyle: "normal",
  color: BRAND.ink,
  align: "start", // start | center | end | justify
  verticalAlign: "top", // top | middle | bottom
  lineHeight: 1.3,
  letterSpacing: 0, // pt
  direction: "auto", // auto | rtl | ltr
  background: "",
  padding: 0, // mm
};

// Base shape of each element type. createElement() merges overrides on top.
const ELEMENT_DEFAULTS = {
  text: { w: 60, h: 8, ...TEXT_DEFAULTS, content: "Text" },
  field: {
    w: 60,
    h: 10,
    ...TEXT_DEFAULTS,
    label: "Label",
    binding: "patient.name",
    layout: "stacked", // stacked | inline
    labelColor: BRAND.muted,
    labelSize: 7,
  },
  patientInfo: {
    w: 186,
    h: 16,
    ...TEXT_DEFAULTS,
    fontSize: 9,
    columns: 4,
    labelColor: BRAND.muted,
    labelSize: 6.5,
    borderColor: BRAND.line,
    borderWidth: 0.25,
    borderRadius: 1.5,
    background: "#FFFFFF",
    labelLanguage: "en", // en | ar | both
    fields: [
      "patient.name",
      "patient.id",
      "patient.age",
      "patient.gender",
      "report.doctor",
      "report.collectionDate",
      "report.date",
      "report.number",
    ],
  },
  image: {
    w: 30,
    h: 20,
    src: "",
    fit: "contain", // contain | cover | fill
    borderRadius: 0,
    role: "", // "logo" marks the lab logo slot
  },
  svg: {
    w: 30,
    h: 30,
    libraryId: "microscope",
    palette: "purple", // purple | lavender | mono | custom
    color: BRAND.purple,
    src: "", // uploaded SVG (data URL) — overrides libraryId
    fit: "contain",
  },
  rect: {
    w: 40,
    h: 20,
    fill: BRAND.lavender,
    borderColor: BRAND.purple,
    borderWidth: 0,
    borderRadius: 2,
    borderStyle: "solid",
  },
  circle: {
    w: 20,
    h: 20,
    fill: BRAND.lavender,
    borderColor: BRAND.purple,
    borderWidth: 0,
    borderStyle: "solid",
  },
  line: {
    w: 60,
    h: 2,
    stroke: BRAND.purple,
    strokeWidth: 0.4,
    borderStyle: "solid", // solid | dashed | dotted | double
  },
  divider: {
    w: 186,
    h: 2,
    stroke: BRAND.purple,
    stroke2: "#C9B8F0",
    strokeWidth: 0.6,
    variant: "gradient", // gradient | double | dots | accent
  },
  bgShape: {
    w: 210,
    h: 30,
    shape: "waveTop", // waveTop | waveBottom | blob | diagonal | corner | arc
    fill: BRAND.purple,
    fill2: "#9B7FE0",
  },
  qr: {
    w: 20,
    h: 20,
    content: "{{report.verificationCode}} {{patient.id}}",
    color: "#000000",
  },
  barcode: {
    w: 40,
    h: 10,
    content: "{{report.number}}",
    color: "#000000",
    showText: false,
  },
  badge: {
    w: 22,
    h: 22,
    title: "ISO 15189",
    subtitle: "ACCREDITED",
    color: BRAND.purple,
  },
  signature: {
    w: 50,
    h: 22,
    ...TEXT_DEFAULTS,
    fontSize: 8,
    align: "center",
    label: "Lab Director Signature",
    signer: "",
    src: "",
    lineColor: BRAND.ink,
    kind: "signature", // signature | stamp
  },
  pageNumber: {
    w: 30,
    h: 6,
    ...TEXT_DEFAULTS,
    fontSize: 8,
    color: BRAND.muted,
    content: "Page {{page.number}} of {{page.total}}",
  },
  resultsTable: {
    w: 186,
    h: 120,
    fontFamily: "Frutiger",
    fontSize: 8.5,
    direction: "ltr", // table column direction
    headerLanguage: "en", // en | ar | both
    columns: RESULT_COLUMNS.map((c) => ({ ...c })),
    headerBg: BRAND.lavender,
    headerColor: BRAND.purpleDeep,
    headerAccent: BRAND.purple,
    rowColor: BRAND.ink,
    stripe: true,
    stripeColor: "#FAF8FE",
    borderColor: BRAND.line,
    borderWidth: 0.2,
    categoryBg: "#EFEAF9",
    categoryColor: BRAND.purpleDeep,
    showCategories: true,
    showComments: true,
    statusStyle: "pill", // pill | text | arrow | none
    colorResults: true,
    statusColors: JSON.parse(JSON.stringify(DEFAULT_STATUS_COLORS)),
    rowPadding: 1.4, // mm vertical
  },
};

const ELEMENT_LABELS = {
  text: "Text",
  field: "Data field",
  patientInfo: "Patient info block",
  image: "Image",
  svg: "Illustration",
  rect: "Rectangle",
  circle: "Circle",
  line: "Line",
  divider: "Divider",
  bgShape: "Background shape",
  qr: "QR code",
  barcode: "Barcode",
  badge: "Accreditation badge",
  signature: "Signature / stamp",
  pageNumber: "Page number",
  resultsTable: "Results table",
};

const TEXT_TYPES = new Set(["text", "field", "patientInfo", "pageNumber", "signature"]);

function createElement(type, overrides = {}) {
  const base = ELEMENT_DEFAULTS[type];
  if (!base) throw new Error(`Unknown element type: ${type}`);
  return {
    id: uid(),
    type,
    name: overrides.name || ELEMENT_LABELS[type] || type,
    zone: "body",
    x: 12,
    y: 12,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    ...JSON.parse(JSON.stringify(base)),
    ...overrides,
  };
}

function resolvePageSize(page) {
  if (page.size === "Custom") {
    const w = Number(page.customWidth) || 210;
    const h = Number(page.customHeight) || 297;
    return page.orientation === "landscape"
      ? { width: Math.max(w, h), height: Math.min(w, h) }
      : { width: w, height: h };
  }
  const s = PAGE_SIZES[page.size] || PAGE_SIZES.A4;
  return page.orientation === "landscape"
    ? { width: s.height, height: s.width }
    : { width: s.width, height: s.height };
}

function defaultPage() {
  return {
    size: "A4",
    orientation: "portrait",
    customWidth: 210,
    customHeight: 297,
    margins: { top: 10, right: 12, bottom: 10, left: 12 },
    headerHeight: 42,
    footerHeight: 24,
    background: "#FFFFFF",
    contentGap: 4, // mm kept clear between header/footer and flowing content
  };
}

function createTemplate(info = {}) {
  const now = new Date().toISOString();
  return {
    id: null,
    uuid: uid("tpl"),
    name: info.name || "Untitled template",
    description: info.description || "",
    category: info.category || "General",
    language: info.language || "en", // en | ar | bilingual
    isDefault: !!info.isDefault,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    page: { ...defaultPage(), ...(info.page || {}) },
    content: {
      watermarkText: "",
      // Per-template lab details. Empty fields fall back to the account's
      // lab profile (name/phone/address) when a report is generated.
      laboratory: { name: "", subtitle: "", phone: "", address: "", website: "", email: "" },
    },
    elements: [],
  };
}

// Tolerant loader: fills anything missing (older schema, hand-edited JSON,
// partial imports) so the editor and engine can assume a complete shape.
function normalizeTemplate(raw) {
  const base = createTemplate();
  const t = { ...base, ...(raw || {}) };
  t.page = { ...defaultPage(), ...(raw?.page || {}) };
  t.page.margins = { ...defaultPage().margins, ...(raw?.page?.margins || {}) };
  t.content = { ...base.content, ...(raw?.content || {}) };
  t.content.laboratory = { ...base.content.laboratory, ...(raw?.content?.laboratory || {}) };
  t.elements = Array.isArray(raw?.elements)
    ? raw.elements
        .filter((e) => e && ELEMENT_DEFAULTS[e.type])
        .map((e) => {
          const merged = { ...createElement(e.type), ...e };
          if (!ZONES.includes(merged.zone)) merged.zone = "body";
          if (e.type === "resultsTable") {
            merged.columns = Array.isArray(e.columns) && e.columns.length
              ? e.columns
              : RESULT_COLUMNS.map((c) => ({ ...c }));
            merged.statusColors = { ...DEFAULT_STATUS_COLORS, ...(e.statusColors || {}) };
          }
          return merged;
        })
    : [];
  t.schemaVersion = SCHEMA_VERSION;
  return t;
}

function validateTemplate(t) {
  const errors = [];
  if (!t || typeof t !== "object") return ["Template is empty"];
  if (!String(t.name || "").trim()) errors.push("Template name is required");
  const { width, height } = resolvePageSize(t.page || {});
  if (!(width >= 50 && width <= 1000 && height >= 50 && height <= 1000))
    errors.push("Page size must be between 50mm and 1000mm");
  const hh = Number(t.page?.headerHeight) || 0;
  const fh = Number(t.page?.footerHeight) || 0;
  if (hh < 0 || fh < 0) errors.push("Header/footer height can't be negative");
  if (hh + fh > height - 40)
    errors.push("Header and footer leave less than 40mm for report content");
  const tables = (t.elements || []).filter((e) => e.type === "resultsTable");
  if (tables.length > 1) errors.push("Only one results table is allowed per template");
  return errors;
}

// Template-level lab details win over the account profile, field by field.
function mergeLabInfo(template, accountLab = {}) {
  const own = template?.content?.laboratory || {};
  const keys = ["name", "subtitle", "phone", "address", "website", "email"];
  return Object.fromEntries(keys.map((k) => [k, (own[k] || "").trim() || accountLab?.[k] || ""]));
}

// Geometry of the region flowing content may occupy on every page.
function getBodyBounds(page) {
  const { width, height } = resolvePageSize(page);
  const m = page.margins || {};
  const gap = Number(page.contentGap ?? 4);
  const top = Math.max(Number(m.top) || 0, (Number(page.headerHeight) || 0) + gap);
  const bottom = Math.min(
    height - (Number(m.bottom) || 0),
    height - (Number(page.footerHeight) || 0) - gap
  );
  return {
    top,
    bottom,
    left: Number(m.left) || 0,
    right: width - (Number(m.right) || 0),
    width,
    height,
  };
}

module.exports = {
  SCHEMA_VERSION,
  PAGE_SIZES,
  ZONES,
  FONTS,
  PLACEHOLDERS,
  PLACEHOLDER_KEYS,
  RESULT_COLUMNS,
  DEFAULT_STATUS_COLORS,
  BRAND,
  ELEMENT_DEFAULTS,
  ELEMENT_LABELS,
  TEXT_TYPES,
  uid,
  createElement,
  createTemplate,
  normalizeTemplate,
  validateTemplate,
  resolvePageSize,
  getBodyBounds,
  defaultPage,
  mergeLabInfo,
};
