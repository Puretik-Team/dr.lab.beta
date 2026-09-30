// Starting designs offered by the creation wizard. Each preset lays its
// elements out relative to the chosen page size/header/footer heights, so
// A5/Letter/landscape templates start correctly placed instead of assuming A4.
const { createElement, resolvePageSize, getBodyBounds, BRAND } = require("./schema");

const PRESETS = [
  { id: "minimal", name: "Minimal Medical", description: "Clean logo header, thin rules, lots of white space." },
  { id: "modernPurple", name: "Modern Purple", description: "Brand-purple wave header and footer with DNA accents." },
  { id: "clinical", name: "Professional Clinical", description: "Bilingual lavender band, accreditation badge, signature." },
  { id: "corporate", name: "Corporate Laboratory", description: "Bold dark band, contact column and verification barcode." },
  { id: "headerFooter", name: "Minimal Header & Footer", description: "Just text header/footer — ideal over pre-printed paper." },
  { id: "elegant", name: "Elegant", description: "Thin page frame, centred logo and name." },
  { id: "ribbon", name: "Ribbon", description: "Colored ribbon down the side of every page." },
  { id: "gradient", name: "Gradient", description: "Bold diagonal gradient header." },
  { id: "soft", name: "Soft", description: "Soft circles and a molecule accent." },
  { id: "science", name: "Science", description: "Lab illustrations and a DNA footer." },
  { id: "split", name: "Split", description: "Color block for the logo, details beside it." },
  { id: "blank", name: "Blank Canvas", description: "Start from an empty page." },
];

function langOpts(language) {
  const ar = language === "ar";
  const both = language === "bilingual";
  return {
    tableLang: ar ? "ar" : both ? "both" : "en",
    tableDir: ar ? "rtl" : "ltr",
    labelLang: ar ? "ar" : both ? "both" : "en",
    ar,
    both,
  };
}

// Content shared by every non-blank preset: patient block, results table,
// and a signature that follows the table on the last page.
function bodyBlocks(t, accent = {}) {
  const { width } = resolvePageSize(t.page);
  const b = getBodyBounds(t.page);
  const L = langOpts(t.language);
  const left = b.left;
  const w = b.right - b.left;
  const infoY = b.top;
  const infoH = 19;
  const tableY = infoY + infoH + 4;
  const tableH = Math.max(40, b.bottom - tableY - 34);
  const afterY = tableY + tableH + 3;
  void width;
  return [
    createElement("patientInfo", {
      name: "Patient information",
      x: left,
      y: infoY,
      w,
      h: infoH,
      labelLanguage: L.labelLang,
      direction: L.ar ? "rtl" : "auto",
      borderColor: accent.line || BRAND.line,
    }),
    createElement("resultsTable", {
      name: "Results table",
      x: left,
      y: tableY,
      w,
      h: tableH,
      headerLanguage: L.tableLang,
      direction: L.tableDir,
      headerBg: accent.headBg || BRAND.lavender,
      headerColor: accent.headText || BRAND.purpleDeep,
      headerAccent: accent.primary || BRAND.purple,
      categoryBg: accent.catBg || "#EFEAF9",
      categoryColor: accent.headText || BRAND.purpleDeep,
      ...(accent.table || {}),
    }),
    createElement("signature", {
      name: "Signature",
      x: left + w - 52,
      y: afterY,
      w: 52,
      h: 22,
      label: L.ar ? "توقيع مدير المختبر" : "Laboratory Director",
    }),
  ];
}

function labName(t, props) {
  return createElement("text", {
    name: "Laboratory name",
    content: "{{laboratory.name}}",
    fontSize: 16,
    fontWeight: 700,
    color: BRAND.purpleDeep,
    ...props,
  });
}

// Flips every header/footer/background element horizontally, so a design
// built logo-left/name-follows becomes logo-right/name-follows — used when
// the report is meant to be read right-to-left (Arabic/Kurdish UI).
function mirrorZones(els, W) {
  return els.map((e) => {
    if (e.zone !== "header" && e.zone !== "footer" && e.zone !== "background") return e;
    const out = { ...e };
    if (typeof out.x === "number" && typeof out.w === "number") out.x = W - out.x - out.w;
    if (out.align === "start") out.align = "end";
    else if (out.align === "end") out.align = "start";
    return out;
  });
}

function buildPreset(presetId, t, mirror = false, freeBadge = false) {
  const { width: W, height: H } = resolvePageSize(t.page);
  const hh = Number(t.page.headerHeight) || 0;
  const fh = Number(t.page.footerHeight) || 0;
  const m = t.page.margins;
  const L = langOpts(t.language);
  const inner = W - m.left - m.right;
  const fy = H - fh; // footer top
  let els = [];
  const H_ = (type, props) => els.push(createElement(type, { zone: "header", ...props }));
  const F_ = (type, props) => els.push(createElement(type, { zone: "footer", ...props }));

  switch (presetId) {
    case "minimal": {
      H_("image", { name: "Laboratory logo", role: "logo", x: m.left, y: 8, w: 26, h: Math.min(24, hh - 12) });
      if (freeBadge) {
        // Free-plan co-branding: a small Dr. Lab badge sits right beside the
        // lab's own logo, and the lab's details move to the far right so the
        // two logos read as a pair on the left.
        // light-name.png is the wide Dr. Lab wordmark (~3.16:1), not the
        // square icon — sized to that ratio and vertically centered on the
        // lab's own logo (which spans y:8 to y:8+24).
        H_("image", { name: "Dr. Lab badge", role: "drlabBadge", x: m.left + 30, y: 16, w: 26, h: 8.2 });
        H_("text", {
          name: "Dr. Lab tagline",
          content: "All things that your lab needs",
          x: m.left + 30,
          y: 25,
          w: 40,
          h: 5,
          fontSize: 5.5,
          fontWeight: 700,
          color: BRAND.ink,
        });
        const infoW = Math.min(90, inner - 58);
        const infoX = W - m.right - infoW;
        els.push(labName(t, { zone: "header", x: infoX, y: 10, w: infoW, h: 9, align: "end" }));
        H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: infoX, y: 19, w: infoW, h: 6, fontSize: 9, color: BRAND.muted, align: "end" });
        H_("text", { name: "Contact", content: "{{laboratory.phone}} · {{laboratory.address}}", x: infoX, y: 25, w: infoW, h: 6, fontSize: 8, color: BRAND.muted, align: "end" });
      } else {
        // Logo stays on the left; the lab's own details sit at the far
        // right of the header instead of following right next to the logo.
        const infoW = Math.min(120, inner - 34);
        const infoX = W - m.right - infoW;
        els.push(labName(t, { zone: "header", x: infoX, y: 10, w: infoW, h: 9, align: "end" }));
        H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: infoX, y: 19, w: infoW, h: 6, fontSize: 9, color: BRAND.muted, align: "end" });
        H_("text", { name: "Contact", content: "{{laboratory.phone}} · {{laboratory.address}}", x: infoX, y: 25, w: infoW, h: 6, fontSize: 8, color: BRAND.muted, align: "end" });
      }
      H_("line", { x: m.left, y: hh - 3, w: inner, h: 2, stroke: BRAND.ink, strokeWidth: 0.4 });
      F_("line", { x: m.left, y: fy + 2, w: inner, h: 2, stroke: BRAND.line, strokeWidth: 0.3 });
      F_("text", { name: "Footer contact", content: "{{laboratory.website}} · {{laboratory.email}}", x: m.left, y: fy + 6, w: inner * 0.7, h: 6, fontSize: 7.5, color: BRAND.muted });
      F_("pageNumber", { x: W - m.right - 35, y: fy + 6, w: 35, h: 6, align: "end" });
      els.push(...bodyBlocks(t));
      break;
    }

    case "modernPurple": {
      // flip: the wave dips lower on one side — flipped so the deeper dip
      // sits under the DNA accent (now on the left) instead of under the
      // name/logo (now on the right). Unlike gradient's diagonal, the name
      // and subtitle sit in the wave's solid top band either way, so this
      // is purely cosmetic, not a contrast risk.
      H_("bgShape", { name: "Header wave", shape: "waveTop", x: 0, y: 0, w: W, h: hh, fill: BRAND.purpleDeep, fill2: "#9B7FE0", flip: true });
      H_("svg", { name: "DNA accent", libraryId: "dnaBand", palette: "lavender", x: W * 0.52, y: 3, w: W * 0.45, h: 11, opacity: 0.55 });
      H_("rect", { name: "Logo plate", x: m.left, y: 6, w: 24, h: 24, fill: "#FFFFFF", borderRadius: 4 });
      H_("image", { name: "Laboratory logo", role: "logo", x: m.left + 2, y: 8, w: 20, h: 20 });
      els.push(labName(t, { zone: "header", x: m.left + 28, y: 9, w: inner - 30, h: 9, color: "#FFFFFF", fontSize: 17 }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: m.left + 28, y: 18.5, w: inner - 30, h: 6, fontSize: 9, color: "#EDE7FA" });
      if (L.ar || L.both)
        H_("text", { name: "Arabic title", content: "تقرير الفحوصات المختبرية", x: W - m.right - 70, y: 26, w: 70, h: 7, fontSize: 10, color: "#FFFFFF", align: "end", direction: "rtl" });
      F_("bgShape", { name: "Footer wave", shape: "waveBottom", x: 0, y: fy, w: W, h: fh, fill: BRAND.purple, fill2: BRAND.purpleDeep });
      F_("qr", { x: m.left, y: fy + fh - 19, w: 15, h: 15, color: "#FFFFFF" });
      F_("text", { name: "Footer contact", content: "{{laboratory.phone}}  ·  {{laboratory.address}}  ·  {{laboratory.website}}", x: m.left + 19, y: fy + fh - 13, w: inner - 60, h: 6, fontSize: 8, color: "#FFFFFF" });
      F_("pageNumber", { x: W - m.right - 35, y: fy + fh - 13, w: 35, h: 6, align: "end", color: "#FFFFFF" });
      els.push(...bodyBlocks(t));
      break;
    }

    case "clinical": {
      H_("rect", { name: "Header band", x: 0, y: 0, w: W, h: hh - 4, fill: BRAND.lavender, borderRadius: 0 });
      H_("image", { name: "Laboratory logo", role: "logo", x: m.left, y: 6, w: 24, h: Math.min(24, hh - 14) });
      els.push(labName(t, { zone: "header", x: W / 2 - 55, y: 8, w: 110, h: 9, align: "center", fontSize: 15 }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: W / 2 - 55, y: 17, w: 110, h: 6, align: "center", fontSize: 8.5, color: BRAND.muted });
      if (L.ar || L.both)
        H_("text", { name: "Arabic title", content: "تقرير نتائج الفحوصات المختبرية", x: W / 2 - 55, y: 23, w: 110, h: 7, align: "center", fontSize: 10, color: BRAND.purpleDeep, direction: "rtl" });
      H_("badge", { x: W - m.right - 22, y: 6, w: 22, h: 22 });
      H_("divider", { x: 0, y: hh - 4, w: W, h: 3, variant: "double", strokeWidth: 0.7 });
      F_("divider", { x: m.left, y: fy + 1, w: inner, h: 2, variant: "accent" });
      F_("text", { name: "Address", content: "{{laboratory.address}}", x: m.left, y: fy + 5, w: inner / 3, h: 6, fontSize: 7.5, color: BRAND.muted });
      F_("text", { name: "Phone", content: "Tel: {{laboratory.phone}}", x: m.left + inner / 3, y: fy + 5, w: inner / 3, h: 6, fontSize: 7.5, align: "center", color: BRAND.muted });
      F_("text", { name: "Website", content: "{{laboratory.website}}", x: m.left + (inner * 2) / 3, y: fy + 5, w: inner / 3, h: 6, fontSize: 7.5, align: "end", color: BRAND.muted });
      F_("text", { name: "Verification", content: "Verification code: {{report.verificationCode}} · Report {{report.number}}", x: m.left, y: fy + 12, w: inner - 36, h: 5, fontSize: 6.5, color: BRAND.muted });
      F_("pageNumber", { x: W - m.right - 35, y: fy + 12, w: 35, h: 5, align: "end", fontSize: 7 });
      els.push(...bodyBlocks(t));
      break;
    }

    case "corporate": {
      H_("rect", { name: "Top band", x: 0, y: 0, w: W, h: 7, fill: BRAND.purpleDeep, borderRadius: 0 });
      H_("image", { name: "Laboratory logo", role: "logo", x: m.left, y: 11, w: 22, h: Math.min(22, hh - 16) });
      els.push(labName(t, { zone: "header", x: m.left + 26, y: 12, w: inner * 0.5, h: 9, fontSize: 16, textTransform: "uppercase", letterSpacing: 0.5 }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: m.left + 26, y: 21, w: inner * 0.5, h: 6, fontSize: 8.5, color: BRAND.muted });
      H_("text", {
        name: "Contact column",
        content: "{{laboratory.phone}}\n{{laboratory.email}}\n{{laboratory.address}}",
        x: W - m.right - 55, y: 11, w: 55, h: 18, fontSize: 7.5, align: "end", color: BRAND.ink, lineHeight: 1.5,
      });
      H_("line", { x: m.left, y: hh - 3, w: inner, h: 2, stroke: BRAND.purpleDeep, strokeWidth: 0.6 });
      F_("rect", { name: "Footer band", x: 0, y: fy + 4, w: W, h: fh - 4, fill: BRAND.purpleDeep, borderRadius: 0 });
      F_("barcode", { x: m.left, y: fy + 7, w: 34, h: fh - 10, color: "#FFFFFF" });
      F_("text", { name: "Disclaimer", content: "This report is electronically verified. Results relate only to the sample tested.", x: m.left + 38, y: fy + 7, w: inner - 76, h: fh - 10, fontSize: 7, color: "#EDE7FA", verticalAlign: "middle" });
      F_("pageNumber", { x: W - m.right - 35, y: fy + 7, w: 35, h: fh - 10, align: "end", color: "#FFFFFF", verticalAlign: "middle" });
      els.push(...bodyBlocks(t, { headBg: BRAND.purpleDeep, headText: "#FFFFFF", catBg: "#F1ECFB", primary: BRAND.purpleDeep }));
      // The corporate header row is dark — category text stays purple for contrast.
      const table = els.find((e) => e.type === "resultsTable");
      table.categoryColor = BRAND.purpleDeep;
      break;
    }

    case "elegant": {
      els.push(createElement("rect", { name: "Page frame", zone: "background", x: 5, y: 5, w: W - 10, h: H - 10, fill: "", borderColor: BRAND.purple, borderWidth: 0.35, borderRadius: 2 }));
      els.push(createElement("rect", { name: "Inner frame", zone: "background", x: 6.6, y: 6.6, w: W - 13.2, h: H - 13.2, fill: "", borderColor: "#C9B8F0", borderWidth: 0.2, borderRadius: 1.5 }));
      H_("image", { name: "Laboratory logo", role: "logo", x: W / 2 - 10, y: 8, w: 20, h: 14 });
      els.push(labName(t, { zone: "header", x: m.left, y: 22.5, w: inner, h: 8, align: "center", fontSize: 15, letterSpacing: 1.2, textTransform: "uppercase" }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: m.left, y: 30.5, w: inner, h: 5, align: "center", fontSize: 8.5, color: BRAND.muted, letterSpacing: 0.4 });
      H_("divider", { x: W / 2 - 30, y: hh - 5, w: 60, h: 2, variant: "double", strokeWidth: 0.4 });
      F_("divider", { x: W / 2 - 20, y: fy + 3, w: 40, h: 2, variant: "dots", strokeWidth: 0.35 });
      F_("text", { name: "Footer contact", content: "{{laboratory.address}}  ·  {{laboratory.phone}}", x: m.left, y: fy + 7, w: inner, h: 5, fontSize: 7.5, align: "center", color: BRAND.muted });
      F_("pageNumber", { x: m.left, y: fy + 12.5, w: inner, h: 5, align: "center", fontSize: 7 });
      els.push(...bodyBlocks(t, { table: { headerBg: "#FFFFFF", stripe: false, borderColor: "#EFEAF9" } }));
      break;
    }

    case "ribbon": {
      els.push(createElement("rect", { name: "Side ribbon", zone: "background", x: 0, y: 0, w: 6, h: H, fill: BRAND.purpleDeep, borderRadius: 0 }));
      els.push(createElement("rect", { name: "Ribbon accent", zone: "background", x: 6, y: 0, w: 1.6, h: H, fill: "#9B7FE0", borderRadius: 0 }));
      els.push(labName(t, { zone: "header", x: m.left + 2, y: 11, w: inner - 34, h: 9, fontSize: 18 }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: m.left + 2, y: 20.5, w: inner - 34, h: 5, fontSize: 8.5, color: BRAND.muted });
      H_("text", { name: "Contact", content: "{{laboratory.phone}}   |   {{laboratory.address}}", x: m.left + 2, y: 27, w: inner - 34, h: 5, fontSize: 8, color: BRAND.purple });
      H_("image", { name: "Laboratory logo", role: "logo", x: W - m.right - 26, y: 8, w: 26, h: 26 });
      H_("line", { x: m.left + 2, y: hh - 3, w: inner - 2, h: 2, stroke: "#C9B8F0", strokeWidth: 0.35 });
      F_("line", { x: m.left + 2, y: fy + 3, w: inner - 2, h: 2, stroke: "#C9B8F0", strokeWidth: 0.35 });
      F_("text", { name: "Footer text", content: "{{laboratory.name}}  ·  {{laboratory.website}}", x: m.left + 2, y: fy + 7, w: inner * 0.7, h: 5, fontSize: 7.5, color: BRAND.muted });
      F_("pageNumber", { x: W - m.right - 35, y: fy + 7, w: 35, h: 5, align: "end", fontSize: 7.5, color: BRAND.purple });
      els.push(...bodyBlocks(t, { headBg: BRAND.purpleDeep, headText: "#FFFFFF", primary: BRAND.purpleDeep, table: { categoryColor: BRAND.purpleDeep } }));
      break;
    }

    case "gradient": {
      // Not flipped: the diagonal is tall on the left, under the lab name,
      // and shallow on the right, under the logo — flipping it moves the
      // tall/colored part under the logo instead and leaves the name's
      // subtitle sitting on plain white (unreadable, low-contrast text).
      H_("bgShape", { name: "Header gradient", shape: "diagonal", x: 0, y: 0, w: W, h: hh - 2, fill: BRAND.purpleDeep, fill2: "#9B7FE0" });
      els.push(labName(t, { zone: "header", x: m.left, y: 9, w: inner - 40, h: 9, fontSize: 18, color: "#FFFFFF" }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: m.left, y: 18.5, w: inner - 40, h: 5, fontSize: 9, color: "#EDE7FA" });
      H_("text", { name: "Contact", content: "{{laboratory.phone}}  ·  {{laboratory.address}}", x: m.left, y: 24.5, w: inner - 60, h: 5, fontSize: 8, color: "#FFFFFF" });
      H_("rect", { name: "Logo plate", x: W - m.right - 28, y: 5, w: 28, h: 28, fill: "#FFFFFF", borderRadius: 14 });
      H_("image", { name: "Laboratory logo", role: "logo", x: W - m.right - 24, y: 9, w: 20, h: 20 });
      F_("rect", { name: "Footer band", x: 0, y: H - 10, w: W, h: 10, fill: BRAND.purpleDeep, borderRadius: 0 });
      F_("rect", { name: "Footer accent", x: 0, y: H - 11.2, w: W, h: 1.2, fill: "#9B7FE0", borderRadius: 0 });
      F_("text", { name: "Footer contact", content: "{{laboratory.website}}  ·  {{laboratory.email}}", x: m.left, y: H - 8, w: inner * 0.7, h: 6, fontSize: 7.5, color: "#FFFFFF", verticalAlign: "middle" });
      F_("pageNumber", { x: W - m.right - 35, y: H - 8, w: 35, h: 6, align: "end", fontSize: 7.5, color: "#FFFFFF", verticalAlign: "middle" });
      F_("text", { name: "Verification", content: "Verification code: {{report.verificationCode}}", x: m.left, y: fy + 4, w: inner, h: 5, fontSize: 7, color: BRAND.muted });
      els.push(...bodyBlocks(t));
      break;
    }

    case "soft": {
      els.push(createElement("circle", { name: "Soft circle", zone: "background", x: W - 48, y: -26, w: 72, h: 72, fill: BRAND.lavender }));
      els.push(createElement("circle", { name: "Soft circle small", zone: "background", x: W - 30, y: 30, w: 16, h: 16, fill: "#EDE7FA" }));
      els.push(createElement("circle", { name: "Soft circle bottom", zone: "background", x: -24, y: H - 40, w: 56, h: 56, fill: BRAND.lavender }));
      H_("svg", { name: "Molecule", libraryId: "molecule", palette: "lavender", x: W - 40, y: 4, w: 26, h: 26 });
      H_("rect", { name: "Logo plate", x: m.left, y: 8, w: 24, h: 24, fill: "#FFFFFF", borderColor: "#EDE7FA", borderWidth: 0.4, borderRadius: 6 });
      H_("image", { name: "Laboratory logo", role: "logo", x: m.left + 2, y: 10, w: 20, h: 20 });
      els.push(labName(t, { zone: "header", x: m.left + 29, y: 11, w: inner - 70, h: 9, fontSize: 17 }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: m.left + 29, y: 20, w: inner - 70, h: 5, fontSize: 8.5, color: BRAND.muted });
      H_("text", { name: "Contact", content: "{{laboratory.phone}}  ·  {{laboratory.address}}", x: m.left + 29, y: 26, w: inner - 70, h: 5, fontSize: 8, color: BRAND.purple });
      H_("divider", { x: m.left, y: hh - 4, w: inner, h: 2, variant: "gradient", strokeWidth: 0.5 });
      F_("text", { name: "Footer contact", content: "{{laboratory.website}}  ·  {{laboratory.email}}", x: m.left + 20, y: fy + 8, w: inner * 0.6, h: 5, fontSize: 7.5, color: BRAND.muted });
      F_("pageNumber", { x: W - m.right - 35, y: fy + 8, w: 35, h: 5, align: "end", fontSize: 7.5 });
      els.push(...bodyBlocks(t, { table: { borderColor: "#EFEAF9" } }));
      break;
    }

    case "science": {
      els.push(labName(t, { zone: "header", x: m.left + 26, y: 9, w: inner - 90, h: 9, fontSize: 17 }));
      H_("image", { name: "Laboratory logo", role: "logo", x: m.left, y: 8, w: 22, h: 22 });
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: m.left + 26, y: 18, w: inner - 90, h: 5, fontSize: 8.5, color: BRAND.muted });
      H_("text", { name: "Contact", content: "{{laboratory.phone}}  ·  {{laboratory.address}}", x: m.left + 26, y: 24, w: inner - 90, h: 5, fontSize: 8, color: BRAND.purple });
      H_("svg", { name: "Flask", libraryId: "flask", palette: "purple", x: W - m.right - 62, y: 7, w: 18, h: 22 });
      H_("svg", { name: "Microscope", libraryId: "microscope", palette: "purple", x: W - m.right - 42, y: 5, w: 22, h: 25 });
      H_("svg", { name: "Test tubes", libraryId: "testTubeRack", palette: "lavender", x: W - m.right - 19, y: 8, w: 19, h: 21 });
      H_("divider", { x: m.left, y: hh - 4, w: inner, h: 2, variant: "gradient", strokeWidth: 0.6 });
      F_("svg", { name: "DNA band", libraryId: "dnaBand", palette: "lavender", x: W / 2 - 40, y: fy + 2, w: 80, h: 10, opacity: 0.6 });
      F_("text", { name: "Footer contact", content: "{{laboratory.website}}  ·  {{laboratory.email}}", x: m.left, y: fy + 13, w: inner * 0.7, h: 5, fontSize: 7.5, color: BRAND.muted });
      F_("pageNumber", { x: W - m.right - 35, y: fy + 13, w: 35, h: 5, align: "end", fontSize: 7.5 });
      els.push(...bodyBlocks(t));
      break;
    }

    case "split": {
      const bw = Math.min(62, W * 0.3);
      H_("rect", { name: "Logo block", x: 0, y: 0, w: bw, h: hh - 4, fill: BRAND.purpleDeep, borderRadius: 0 });
      H_("rect", { name: "Logo plate", x: bw / 2 - 14, y: (hh - 4) / 2 - 14, w: 28, h: 28, fill: "#FFFFFF", borderRadius: 14 });
      H_("image", { name: "Laboratory logo", role: "logo", x: bw / 2 - 10, y: (hh - 4) / 2 - 10, w: 20, h: 20 });
      H_("svg", { name: "Block icon", libraryId: "microscopeLine", palette: "mono", role: "logoFallback", x: bw / 2 - 11, y: (hh - 4) / 2 - 11, w: 22, h: 22, opacity: 0 });
      H_("rect", { name: "Header accent", x: 0, y: hh - 4, w: W, h: 1.2, fill: BRAND.purple, borderRadius: 0 });
      els.push(labName(t, { zone: "header", x: bw + 8, y: 9, w: W - bw - 8 - m.right, h: 9, fontSize: 17 }));
      H_("text", { name: "Laboratory subtitle", content: "{{laboratory.subtitle}}", x: bw + 8, y: 18.5, w: W - bw - 8 - m.right, h: 5, fontSize: 8.5, color: BRAND.muted });
      H_("text", { name: "Contact", content: "{{laboratory.phone}}\n{{laboratory.address}}", x: bw + 8, y: 24.5, w: W - bw - 8 - m.right, h: 10, fontSize: 8, color: BRAND.purple, lineHeight: 1.4 });
      F_("rect", { name: "Footer block", x: 0, y: H - 12, w: bw, h: 12, fill: BRAND.purpleDeep, borderRadius: 0 });
      F_("pageNumber", { x: 4, y: H - 10, w: bw - 8, h: 8, align: "center", fontSize: 8, color: "#FFFFFF", verticalAlign: "middle" });
      F_("text", { name: "Footer contact", content: "{{laboratory.website}}  ·  {{laboratory.email}}", x: bw + 8, y: H - 10, w: W - bw - 8 - m.right, h: 8, fontSize: 7.5, color: BRAND.muted, verticalAlign: "middle" });
      els.push(...bodyBlocks(t, { table: { headerAccent: BRAND.purpleDeep } }));
      break;
    }

    case "headerFooter": {
      els.push(labName(t, { zone: "header", x: m.left, y: 10, w: inner, h: 9, align: "center", fontSize: 15 }));
      H_("text", { name: "Header contact", content: "{{laboratory.address}} · {{laboratory.phone}}", x: m.left, y: 19, w: inner, h: 6, fontSize: 8.5, align: "center", color: BRAND.muted });
      H_("line", { x: m.left, y: hh - 3, w: inner, h: 2, stroke: BRAND.ink, strokeWidth: 0.3 });
      F_("line", { x: m.left, y: fy + 2, w: inner, h: 2, stroke: BRAND.ink, strokeWidth: 0.3 });
      F_("text", { name: "Footer text", content: "{{laboratory.website}}", x: m.left, y: fy + 6, w: inner / 2, h: 6, fontSize: 8, color: BRAND.muted });
      F_("pageNumber", { x: W - m.right - 35, y: fy + 6, w: 35, h: 6, align: "end" });
      els.push(...bodyBlocks(t));
      break;
    }

    default:
      break;
  }

  // Header/footer designs assume RTL-friendly text for Arabic-only templates.
  if (L.ar) {
    els.forEach((e) => {
      if (e.type === "text" && e.direction === "auto") e.direction = "rtl";
    });
  }
  if (mirror) els = mirrorZones(els, W);
  return els;
}

module.exports = { PRESETS, buildPreset };
