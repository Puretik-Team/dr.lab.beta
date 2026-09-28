// "Simple mode": turns a handful of choices (design, color, logo,
// lab details) into a full template. The choices are stored on the template
// (content.simple) so the simple screen can reopen them later.
const { createTemplate, BRAND } = require("./schema");
const { buildPreset } = require("./presets");
const { mix, renderLibrarySvg, svgToDataUrl } = require("./svgLibrary");

const SIMPLE_COLORS = [
  { id: "purple", hex: "#6A48B8" },
  { id: "blue", hex: "#1F57C3" },
  { id: "teal", hex: "#0F8A7E" },
  { id: "green", hex: "#2E7D32" },
  { id: "red", hex: "#A61E4D" },
  { id: "dark", hex: "#2B2D42" },
];

const SIMPLE_DESIGNS = [
  "modernPurple", "gradient", "split", "science", "soft", "ribbon",
  "clinical", "elegant", "minimal", "corporate", "headerFooter",
];

// Ready-made logos for labs without one: a library illustration inside a
// round badge, drawn in the report's color. Stored in settings as
// "icon:<libraryId>" so the badge follows later color changes.
const LOGO_ICONS = ["microscope", "testTube", "flask", "dnaHelix", "medicalCross", "bloodDrop", "molecule", "heartbeat"];

function logoBadgeSvg(id, color) {
  const inner = renderLibrarySvg(id, "custom", color).replace("<svg ", '<svg x="17" y="17" width="66" height="66" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="${mix(
    color,
    "#FFFFFF",
    0.9
  )}" stroke="${color}" stroke-width="3"/>${inner}</svg>`;
}

function resolveLogo(logo, color) {
  if (typeof logo === "string" && logo.startsWith("icon:")) return svgToDataUrl(logoBadgeSvg(logo.slice(5), color));
  return logo || "";
}

// Every brand shade the presets use, mapped to the same role in the new color.
function colorMap(hex) {
  const white = (a) => mix(hex, "#FFFFFF", a);
  const dark = mix(hex, "#000000", 0.25);
  return {
    [BRAND.purple]: hex,
    [BRAND.purpleDeep]: dark,
    [BRAND.lavender]: white(0.93),
    "#9B7FE0": white(0.35),
    "#EFEAF9": white(0.88),
    "#EDE7FA": white(0.85),
    "#C9B8F0": white(0.6),
    "#F1ECFB": white(0.9),
    "#FAF8FE": white(0.97),
  };
}

function recolor(elements, hex) {
  if (!hex || hex.toLowerCase() === BRAND.purple.toLowerCase()) return elements;
  const map = Object.fromEntries(Object.entries(colorMap(hex)).map(([k, v]) => [k.toLowerCase(), v]));
  return elements.map((el) => {
    const out = { ...el };
    for (const [k, v] of Object.entries(el)) {
      if (k === "statusColors") continue; // high/low/critical colors keep their meaning
      if (typeof v === "string" && map[v.toLowerCase()]) out[k] = map[v.toLowerCase()];
    }
    // Built-in illustrations follow the chosen color too.
    if (el.type === "svg" && !el.src && el.palette === "white") {
      out.palette = "custom";
      out.color = "#FFFFFF";
    } else if (el.type === "svg" && !el.src) {
      out.color = el.palette === "lavender" ? mix(hex, "#FFFFFF", 0.35) : hex;
      out.palette = el.palette === "mono" ? "mono" : "custom";
    }
    return out;
  });
}

function defaultSimpleSettings(accountLab = {}) {
  return {
    design: "modernPurple",
    color: SIMPLE_COLORS[0].hex,
    logo: "",
    lab: {
      name: accountLab.name || "",
      subtitle: "",
      phone: accountLab.phone || "",
      address: accountLab.address || "",
      website: "",
      email: accountLab.email || "",
    },
  };
}

function buildSimpleTemplate(settings, existing = null) {
  const t = createTemplate({
    name: existing?.name || "My report design",
    description: "Made with the simple report designer",
    // Labels are always English; the data filled in (names, notes) is often
    // Arabic, which the engine lays out with per-value text direction.
    language: "en",
    isDefault: true,
  });
  let els = buildPreset(settings.design, t);
  const logo = resolveLogo(settings.logo, settings.color);
  if (logo) {
    els = els.map((e) => (e.role === "logo" ? { ...e, src: logo } : e));
  } else {
    // No logo: drop the empty logo slot (and its backing plate) instead of
    // leaving a blank box on every report.
    els = els.filter((e) => e.role !== "logo" && e.name !== "Logo plate");
    // Designs with a logo block show a simple white icon in it instead.
    els = els.map((e) => (e.role === "logoFallback" ? { ...e, opacity: 1, palette: "white" } : e));
  }
  els = els.filter((e) => !(e.role === "logoFallback" && e.opacity === 0));
  els = recolor(els, settings.color);
  // Nobody should accidentally drag the pieces of a simple design around.
  els = els.map((e) => ({ ...e, locked: true }));
  return {
    ...t,
    id: existing?.id || null,
    uuid: existing?.uuid || t.uuid,
    elements: els,
    content: { ...t.content, laboratory: { ...t.content.laboratory, ...settings.lab }, simple: settings },
  };
}

module.exports = { SIMPLE_COLORS, SIMPLE_DESIGNS, LOGO_ICONS, buildSimpleTemplate, defaultSimpleSettings, resolveLogo };
