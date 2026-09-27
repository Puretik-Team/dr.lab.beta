// Report template rendering engine.
//
// One implementation serves every consumer so the editor, the live preview
// and the exported PDF can't drift apart:
//   - the React editor canvas calls elementInnerHTML() per element,
//   - the preview calls renderPages() and mounts the page HTML,
//   - the main process loads this same file in a hidden BrowserWindow and
//     calls renderForPrint(), then Chromium's printToPDF produces the PDF
//     (which is what gives correct Arabic shaping, mixed RTL/LTR text, SVG and
//     embedded fonts — none of which jsPDF handles reliably).
//
// Safety: templates can be imported from JSON files, so nothing from a
// template is ever injected as raw HTML. All text is escaped, colors/fonts
// are validated, images must be data:image URLs, and SVGs (built-in or
// uploaded) are only ever rendered through <img>, which can't run script.

const {
  resolvePageSize,
  getBodyBounds,
  PLACEHOLDERS,
  DEFAULT_STATUS_COLORS,
} = require("./schema");
const { renderLibrarySvg, svgToDataUrl, mix } = require("./svgLibrary");

const PX_PER_MM = 96 / 25.4;

// ---------------------------------------------------------------- sanitizing

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function color(c, fallback = "transparent") {
  const v = String(c ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^rgba?\(\s*[\d.\s,%]+\)$/i.test(v)) return v;
  if (v === "transparent") return v;
  return fallback;
}

function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function fontFamily(f) {
  const name = String(f || "Frutiger").replace(/[^a-zA-Z0-9 \-]/g, "").trim() || "Frutiger";
  return `'${name}', 'Frutiger', Tahoma, Arial, sans-serif`;
}

const IMG_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;
function imgSrc(src) {
  return typeof src === "string" && IMG_RE.test(src) ? src : "";
}

function pick(v, allowed, def) {
  return allowed.includes(v) ? v : def;
}

// ---------------------------------------------------------------- data binding

const FIELD_LABELS_AR = {
  "patient.name": "اسم المريض",
  "patient.id": "رقم المريض",
  "patient.age": "العمر",
  "patient.gender": "الجنس",
  "patient.phone": "رقم الهاتف",
  "patient.birth": "تاريخ الميلاد",
  "report.number": "رقم التقرير",
  "report.date": "تاريخ التقرير",
  "report.collectionDate": "تاريخ سحب العينة",
  "report.doctor": "الطبيب المُحيل",
  "report.notes": "ملاحظات",
  "report.verificationCode": "رمز التحقق",
  "laboratory.name": "اسم المختبر",
  "laboratory.phone": "هاتف المختبر",
  "laboratory.address": "العنوان",
  "laboratory.website": "الموقع",
  "laboratory.email": "البريد الإلكتروني",
};

const FIELD_LABELS_EN = Object.fromEntries(
  PLACEHOLDERS.flatMap((g) => g.items.map((i) => [i.key, i.label]))
);

function fieldLabel(key, lang) {
  const en = FIELD_LABELS_EN[key] || key;
  const ar = FIELD_LABELS_AR[key] || en;
  if (lang === "ar") return ar;
  if (lang === "both") return `${en} · ${ar}`;
  return en;
}

function lookup(data, path) {
  return String(path)
    .split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), data);
}

// Replaces {{a.b}} tokens. In the editor (`showTokens`) tokens stay visible so
// the designer can see what's bound where.
function resolveText(str, ctx) {
  return String(str ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    if (ctx.showTokens) return m;
    if (key === "page.number") return String(ctx.page?.number ?? 1);
    if (key === "page.total") return String(ctx.page?.total ?? 1);
    const v = lookup(ctx.data || {}, key);
    return v == null || v === "" ? (ctx.mode === "design" ? "—" : "") : String(v);
  });
}

// Escapes after resolving so bound values are escaped too; keeps line breaks.
function textHTML(str, ctx) {
  return esc(resolveText(str, ctx)).replace(/\n/g, "<br/>");
}

// ---------------------------------------------------------------- styles

const ALIGN = { start: "start", center: "center", end: "end", justify: "justify", left: "left", right: "right" };

// "start"/"end" follow the text's own direction, so an Arabic value in an
// English layout would jump to the opposite side of its box. Pin them to the
// layout's side instead (only an explicitly RTL element uses right-to-left).
function physicalAlign(align, rtl) {
  if (align === "start") return rtl ? "right" : "left";
  if (align === "end") return rtl ? "left" : "right";
  return ALIGN[align] || (rtl ? "right" : "left");
}

function textStyle(el) {
  return [
    `font-family:${fontFamily(el.fontFamily)} !important`,
    `font-size:${num(el.fontSize, 10)}pt`,
    `font-weight:${num(el.fontWeight, 400)}`,
    `font-style:${el.fontStyle === "italic" ? "italic" : "normal"}`,
    `color:${color(el.color, "#1E1B37")}`,
    `text-align:${physicalAlign(el.align, el.direction === "rtl")}`,
    `line-height:${num(el.lineHeight, 1.3)}`,
    `letter-spacing:${num(el.letterSpacing, 0)}pt`,
    el.textDecoration === "underline" ? "text-decoration:underline" : "",
    el.textTransform === "uppercase" ? "text-transform:uppercase" : "",
  ]
    .filter(Boolean)
    .join(";");
}

function dirAttr(el) {
  return el.direction === "rtl" || el.direction === "ltr" ? `dir="${el.direction}"` : `dir="auto"`;
}

const VALIGN = { top: "flex-start", middle: "center", bottom: "flex-end" };

function textBox(el, inner) {
  return `<div class="tpl-text" ${dirAttr(el)} style="${textStyle(el)};justify-content:${
    VALIGN[el.verticalAlign] || "flex-start"
  };padding:${num(el.padding)}mm;background:${color(el.background)};border-radius:${num(
    el.borderRadius
  )}mm">${inner}</div>`;
}

function placeholderBox(label, ctx) {
  if (ctx.mode !== "design") return "";
  return `<div class="tpl-ph"><span>${esc(label)}</span></div>`;
}

// ---------------------------------------------------------------- barcode / QR

let bwipCache;
function getBwip() {
  if (bwipCache === undefined) {
    try {
      bwipCache = require("bwip-js");
    } catch (e) {
      bwipCache = null;
    }
  }
  return bwipCache;
}

function barcodeImg(bcid, text, el, ctx) {
  const value = resolveText(text, { ...ctx, showTokens: false }).trim();
  const bwip = getBwip();
  if (!value || !bwip || typeof bwip.toSVG !== "function")
    return placeholderBox(bcid === "qrcode" ? "QR" : "Barcode", ctx);
  try {
    const svgText = bwip.toSVG({
      bcid,
      text: value,
      scale: 3,
      includetext: bcid !== "qrcode" && !!el.showText,
      textxalign: "center",
      barcolor: color(el.color, "#000000").replace("#", "").slice(0, 6),
      ...(bcid === "qrcode" ? { eclevel: "M" } : { height: 10 }),
    });
    return `<img class="tpl-img" style="object-fit:${bcid === "qrcode" ? "contain" : "fill"}" src="${esc(
      svgToDataUrl(svgText)
    )}"/>`;
  } catch (e) {
    return placeholderBox(bcid === "qrcode" ? "QR" : "Barcode", ctx);
  }
}

// ---------------------------------------------------------------- shapes

function bgShapeSvg(el) {
  const f1 = color(el.fill, "#6A48B8");
  const f2 = color(el.fill2, f1);
  const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${f1}"/><stop offset="1" stop-color="${f2}"/></linearGradient></defs>`;
  const shapes = {
    waveTop: `<path d="M0 0H400V62C340 92 280 40 200 58S70 104 0 70Z" fill="url(#g)"/><path d="M0 76C80 104 130 60 210 72S340 104 400 72V84C330 110 270 76 205 86S70 120 0 88Z" fill="${f2}" opacity=".35"/>`,
    waveBottom: `<path d="M0 100H400V38C340 8 280 60 200 42S70 -4 0 30Z" fill="url(#g)"/><path d="M0 24C80 -4 130 40 210 28S340 -4 400 28V16C330 -10 270 24 205 14S70 -20 0 12Z" fill="${f2}" opacity=".35"/>`,
    blob: `<path d="M320 14C380 30 396 80 360 94S250 90 170 96 18 88 8 58 60 6 140 10 270 0 320 14Z" fill="url(#g)"/>`,
    diagonal: `<path d="M0 0H400V30L0 100Z" fill="url(#g)"/>`,
    corner: `<path d="M400 0V100C400 45 330 0 250 0Z" fill="url(#g)"/><path d="M400 0V60C400 28 360 0 320 0Z" fill="${f2}" opacity=".45"/>`,
    arc: `<path d="M0 100C80 20 320 20 400 100Z" fill="url(#g)"/>`,
  };
  const body = shapes[el.shape] || shapes.waveTop;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" preserveAspectRatio="none">${grad}${body}</svg>`;
}

function badgeSvg(el) {
  const c = color(el.color, "#6A48B8");
  const light = mix(c, "#FFFFFF", 0.85);
  const title = esc(String(el.title || "").slice(0, 24));
  const sub = esc(String(el.subtitle || "").slice(0, 24));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="47" fill="${light}" stroke="${c}" stroke-width="3"/>
    <circle cx="50" cy="50" r="39" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="2 2.4"/>
    <path d="M33 30l17-9 17 9" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="56" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="${
      title.length > 10 ? 10 : 13
    }" fill="${c}">${title}</text>
    <text x="50" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-size="7.5" letter-spacing="1" fill="${c}">${sub}</text>
  </svg>`;
}

// ---------------------------------------------------------------- results table

const STATUS_TEXT = {
  en: { normal: "Normal", high: "High", low: "Low", critical: "Critical" },
  ar: { normal: "طبيعي", high: "مرتفع", low: "منخفض", critical: "حرج" },
};
const STATUS_ARROW = { high: "▲", low: "▼", critical: "‼" };

function visibleColumns(el) {
  const cols = (Array.isArray(el.columns) ? el.columns : []).filter((c) => c.visible !== false);
  const total = cols.reduce((s, c) => s + Math.max(1, num(c.width, 10)), 0) || 1;
  return cols.map((c) => ({ ...c, pct: (Math.max(1, num(c.width, 10)) / total) * 100 }));
}

function headLabel(col, lang) {
  if (lang === "ar") return esc(col.labelAr || col.label);
  if (lang === "both")
    return `${esc(col.label)}<div class="tpl-sub">${esc(col.labelAr || "")}</div>`;
  return esc(col.label);
}

function statusColors(el, status) {
  const c = { ...DEFAULT_STATUS_COLORS, ...(el.statusColors || {}) }[status] || {};
  return { text: color(c.text, "#000"), fill: color(c.fill, "transparent") };
}

function statusCell(el, status, lang) {
  if (!status) return "";
  const labels = STATUS_TEXT[lang === "ar" ? "ar" : "en"];
  const c = statusColors(el, status);
  switch (el.statusStyle) {
    case "none":
      return "";
    case "text":
      return `<span style="color:${status === "critical" ? c.fill : c.text};font-weight:700">${labels[status]}</span>`;
    case "arrow":
      return `<span style="color:${status === "critical" ? c.fill : c.text};font-weight:700">${
        STATUS_ARROW[status] || "●"
      }</span>`;
    default:
      return `<span class="tpl-pill" style="background:${c.fill};color:${c.text}"><i style="background:${c.text}"></i>${labels[status]}</span>`;
  }
}

function tableHeadHTML(el, cols) {
  const lang = el.headerLanguage || "en";
  return `<thead><tr>${cols
    .map(
      (c) =>
        `<th style="width:${c.pct}%;text-align:${physicalAlign(c.align, el.direction === "rtl")};background:${color(
          el.headerBg,
          "#F5F1FC"
        )};color:${color(el.headerColor, "#4E3894")};border-top:0.5mm solid ${color(
          el.headerAccent,
          "#6A48B8"
        )}">${headLabel(c, lang)}</th>`
    )
    .join("")}</tr></thead>`;
}

// Builds every body row as a standalone <tr> so the paginator can measure
// and split between any two rows.
function tableRows(el, results) {
  const cols = visibleColumns(el);
  const lang = el.headerLanguage || "en";
  const pad = `${num(el.rowPadding, 1.4)}mm 1.6mm`;
  const border = `${num(el.borderWidth, 0.2)}mm solid ${color(el.borderColor, "#E4E2EA")}`;
  const statusShown = cols.some((c) => c.key === "status");
  const rows = [];
  let stripe = 0;

  (results || []).forEach((group, gi) => {
    const catLabel =
      lang === "ar" && group.categoryAr
        ? group.categoryAr
        : lang === "both" && group.categoryAr
        ? `${group.category} · ${group.categoryAr}`
        : group.category;
    const catHTML = (suffix = "") =>
      `<tr class="tpl-cat"><td colspan="${cols.length}" style="background:${color(
        el.categoryBg,
        "#EFEAF9"
      )};color:${color(el.categoryColor, "#4E3894")};padding:${pad};border:${border}">${esc(
        catLabel
      )}${suffix}</td></tr>`;
    if (el.showCategories !== false && catLabel) {
      rows.push({ kind: "cat", group: gi, html: catHTML(), contHTML: catHTML(lang === "ar" ? " (تابع)" : " (cont.)") });
    }
    stripe = 0;
    (group.tests || []).forEach((test) => {
      const bg = el.stripe && stripe++ % 2 === 1 ? color(el.stripeColor, "#FAF8FE") : "#FFFFFF";
      const sc = test.status ? statusColors(el, test.status) : null;
      const cells = cols.map((c) => {
        let inner = "";
        let extra = "";
        if (c.key === "name") {
          const primary = lang === "ar" && test.nameAr ? test.nameAr : test.name;
          inner = `<b>${esc(primary)}</b>${
            lang === "both" && test.nameAr ? `<div class="tpl-sub">${esc(test.nameAr)}</div>` : ""
          }`;
        } else if (c.key === "result") {
          const arrow = !statusShown && test.status && STATUS_ARROW[test.status] ? ` ${STATUS_ARROW[test.status]}` : "";
          inner = `<b>${esc(test.result)}${arrow}</b>`;
          if (el.colorResults !== false && sc && test.status !== "normal")
            extra = `color:${test.status === "critical" ? sc.fill : sc.text};`;
        } else if (c.key === "status") {
          inner = statusCell(el, test.status, lang);
        } else {
          inner = esc(test[c.key] ?? "");
        }
        return `<td dir="auto" style="text-align:${physicalAlign(c.align, el.direction === "rtl")};padding:${pad};border:${border};${extra}">${inner}</td>`;
      });
      rows.push({
        kind: "test",
        group: gi,
        html: `<tr style="background:${bg};color:${color(el.rowColor, "#1E1B37")}">${cells.join("")}</tr>`,
      });
      if (el.showComments !== false && test.comment) {
        rows.push({
          kind: "comment",
          group: gi,
          html: `<tr class="tpl-comment" style="background:${bg}"><td colspan="${cols.length}" dir="auto" style="padding:0.6mm 1.6mm ${num(
            el.rowPadding,
            1.4
          )}mm;border:${border}">${esc(test.comment)}</td></tr>`,
        });
      }
    });
    if (el.showComments !== false && group.comment) {
      rows.push({
        kind: "comment",
        group: gi,
        html: `<tr class="tpl-comment"><td colspan="${cols.length}" dir="auto" style="padding:${pad};border:${border}">${esc(
          group.comment
        )}</td></tr>`,
      });
    }
  });
  return rows;
}

function tableHTML(el, headHTML, rowsHTML) {
  return `<table class="tpl-table" dir="${el.direction === "rtl" ? "rtl" : "ltr"}" style="font-family:${fontFamily(
    el.fontFamily
  )} !important;font-size:${num(el.fontSize, 8.5)}pt">${headHTML}<tbody>${rowsHTML}</tbody></table>`;
}

// ---------------------------------------------------------------- elements

function elementInnerHTML(el, ctx) {
  switch (el.type) {
    case "text":
    case "pageNumber":
      return textBox(el, textHTML(el.content, ctx));

    case "field": {
      const label = esc(resolveText(el.label, ctx));
      const value = textHTML(`{{${el.binding}}}`, ctx);
      const labelSpan = `<span style="color:${color(el.labelColor, "#6B6880")};font-size:${num(
        el.labelSize,
        7
      )}pt;font-weight:400">${label}</span>`;
      return textBox(
        el,
        el.layout === "inline"
          ? `<div>${labelSpan}<span style="color:${color(el.labelColor, "#6B6880")}">: </span>${value}</div>`
          : `<div>${labelSpan}</div><div>${value}</div>`
      );
    }

    case "patientInfo": {
      const fields = Array.isArray(el.fields) ? el.fields : [];
      const cols = Math.max(1, Math.min(6, num(el.columns, 4)));
      const lang = el.labelLanguage || "en";
      const cells = fields
        .map(
          (key) => `<div class="tpl-pi-cell" style="border-color:${color(el.borderColor, "#E4E2EA")};border-width:${num(
            el.borderWidth,
            0.25
          )}mm">
            <div style="color:${color(el.labelColor, "#6B6880")};font-size:${num(el.labelSize, 6.5)}pt">${esc(
            fieldLabel(key, lang)
          )}</div>
            <div dir="auto" style="font-weight:700">${textHTML(`{{${key}}}`, ctx)}</div></div>`
        )
        .join("");
      return `<div class="tpl-pi" ${dirAttr(el)} style="${textStyle(el)};grid-template-columns:repeat(${cols},1fr);background:${color(
        el.background,
        "transparent"
      )};border:${num(el.borderWidth, 0.25)}mm solid ${color(el.borderColor, "#E4E2EA")};border-radius:${num(
        el.borderRadius
      )}mm">${cells}</div>`;
    }

    case "image": {
      const src = imgSrc(el.src);
      if (!src) return placeholderBox(el.role === "logo" ? "Logo" : "Image", ctx);
      return `<img class="tpl-img" src="${esc(src)}" style="object-fit:${pick(
        el.fit,
        ["contain", "cover", "fill"],
        "contain"
      )};border-radius:${num(el.borderRadius)}mm"/>`;
    }

    case "svg": {
      const src = imgSrc(el.src) || svgToDataUrl(renderLibrarySvg(el.libraryId, el.palette, color(el.color, "#6A48B8")));
      return `<img class="tpl-img" src="${esc(src)}" style="object-fit:${pick(el.fit, ["contain", "cover", "fill"], "contain")}"/>`;
    }

    case "rect":
    case "circle":
      return `<div style="width:100%;height:100%;background:${color(el.fill)};border:${num(
        el.borderWidth
      )}mm ${pick(el.borderStyle, ["solid", "dashed", "dotted", "double"], "solid")} ${color(
        el.borderColor
      )};border-radius:${el.type === "circle" ? "50%" : `${num(el.borderRadius)}mm`}"></div>`;

    case "line":
      return `<div class="tpl-center"><div style="width:100%;border-top:${Math.max(0.1, num(el.strokeWidth, 0.4))}mm ${pick(
        el.borderStyle,
        ["solid", "dashed", "dotted", "double"],
        "solid"
      )} ${color(el.stroke, "#6A48B8")}"></div></div>`;

    case "divider": {
      const w = Math.max(0.1, num(el.strokeWidth, 0.6));
      const s1 = color(el.stroke, "#6A48B8");
      const s2 = color(el.stroke2, "#C9B8F0");
      let inner;
      if (el.variant === "double")
        inner = `<div style="width:100%;border-top:${w}mm solid ${s1};border-bottom:${w / 2}mm solid ${s2};height:${w * 2.5}mm"></div>`;
      else if (el.variant === "dots")
        inner = `<div style="width:100%;border-top:${w * 1.5}mm dotted ${s1}"></div>`;
      else if (el.variant === "accent")
        inner = `<div style="width:100%;display:flex;align-items:center"><div style="width:18%;height:${w * 2.5}mm;background:${s1};border-radius:${w}mm"></div><div style="flex:1;height:${w / 2}mm;background:${s2}"></div></div>`;
      else
        inner = `<div style="width:100%;height:${w}mm;background:linear-gradient(90deg, ${s1}, ${s2} 70%, transparent)"></div>`;
      return `<div class="tpl-center">${inner}</div>`;
    }

    case "bgShape":
      return `<img class="tpl-img" style="object-fit:fill" src="${esc(svgToDataUrl(bgShapeSvg(el)))}"/>`;

    case "badge":
      return `<img class="tpl-img" src="${esc(svgToDataUrl(badgeSvg(el)))}"/>`;

    case "qr":
      return barcodeImg("qrcode", el.content, el, ctx);

    case "barcode":
      return barcodeImg("code128", el.content, el, ctx);

    case "signature": {
      const src = imgSrc(el.src);
      const lineColor = color(el.lineColor, "#1E1B37");
      const art = src
        ? `<img src="${esc(src)}" style="max-width:100%;max-height:100%;object-fit:contain"/>`
        : el.kind === "stamp"
        ? `<div style="width:60%;aspect-ratio:1;max-height:100%;border:0.4mm dashed ${lineColor};border-radius:50%;opacity:.35"></div>`
        : "";
      return `<div class="tpl-sig" ${dirAttr(el)} style="${textStyle(el)}">
        <div class="tpl-sig-art">${art}</div>
        ${el.kind === "stamp" ? "" : `<div style="border-top:0.3mm solid ${lineColor};width:100%"></div>`}
        <div>${textHTML(el.label, ctx)}</div>
        ${el.signer ? `<div style="font-weight:700">${textHTML(el.signer, ctx)}</div>` : ""}
      </div>`;
    }

    case "resultsTable": {
      // Static preview for the editor canvas — real output paginates via renderPages().
      const cols = visibleColumns(el);
      const rows = tableRows(el, ctx.data?.results || []);
      return `<div style="width:100%;height:100%;overflow:hidden">${tableHTML(
        el,
        tableHeadHTML(el, cols),
        rows.map((r) => r.html).join("")
      )}</div>`;
    }
    default:
      return "";
  }
}

function boxStyle(el, dy = 0, heightOverride) {
  const h = heightOverride != null ? heightOverride : el.h;
  return [
    `left:${num(el.x)}mm`,
    `top:${num(el.y) + dy}mm`,
    `width:${Math.max(0.1, num(el.w, 10))}mm`,
    `height:${Math.max(0.1, num(h, 10))}mm`,
    `opacity:${Math.max(0, Math.min(1, num(el.opacity, 1)))}`,
    num(el.rotation) ? `transform:rotate(${num(el.rotation)}deg)` : "",
  ]
    .filter(Boolean)
    .join(";");
}

function elementOuterHTML(el, ctx, dy = 0, heightOverride) {
  if (el.visible === false) return "";
  return `<div class="tpl-el tpl-${el.type}" style="${boxStyle(el, dy, heightOverride)}">${elementInnerHTML(el, ctx)}</div>`;
}

// ---------------------------------------------------------------- CSS

const ENGINE_CSS = `
.tpl-root, .tpl-root * { box-sizing: border-box; }
.tpl-root * { font-family: inherit !important; }
.tpl-page { position: relative; overflow: hidden; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.tpl-el { position: absolute; transform-origin: center center; }
.tpl-text { width: 100%; height: 100%; display: flex; flex-direction: column; white-space: pre-wrap; overflow-wrap: anywhere; unicode-bidi: plaintext; }
.tpl-img { width: 100%; height: 100%; display: block; }
.tpl-center { width: 100%; height: 100%; display: flex; align-items: center; }
.tpl-ph { width: 100%; height: 100%; border: 1px dashed #B9A8E6; background: repeating-linear-gradient(45deg,#F7F4FD,#F7F4FD 6px,#FFFFFF 6px,#FFFFFF 12px); display: flex; align-items: center; justify-content: center; color: #8A74C9; font-size: 8pt; border-radius: 1.5mm; }
.tpl-pi { width: 100%; height: 100%; display: grid; grid-auto-rows: 1fr; overflow: hidden; line-height: 1.2 !important; }
.tpl-pi-cell { padding: 0.5mm 1.8mm; border-style: solid; border-top: 0 !important; border-inline-start: 0 !important; display: flex; flex-direction: column; justify-content: center; min-width: 0; overflow-wrap: anywhere; }
.tpl-sig { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: stretch; justify-content: flex-end; gap: 0.6mm; }
.tpl-sig-art { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.tpl-table { width: 100%; border-collapse: collapse; table-layout: fixed; line-height: 1.25; }
.tpl-table th { font-weight: 700; padding: 1.6mm 1.6mm; font-size: 0.95em; vertical-align: middle; }
.tpl-table td { vertical-align: middle; overflow-wrap: anywhere; }
.tpl-table .tpl-cat td { font-weight: 700; font-size: 1em; }
.tpl-table .tpl-comment td { font-style: italic; color: #6B6880; font-size: 0.88em; }
.tpl-sub { font-size: 0.82em; font-weight: 400; opacity: .75; }
.tpl-pill { line-height: 1.2; display: inline-flex; align-items: center; gap: 1.2mm; padding: 0.5mm 2.2mm; border-radius: 99px; font-size: 0.85em; font-weight: 700; white-space: nowrap; }
.tpl-pill i { width: 1.4mm; height: 1.4mm; border-radius: 50%; display: inline-block; }
.tpl-watermark-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 64pt; font-weight: 700; color: #6A48B8; opacity: .06; transform: rotate(-35deg); white-space: nowrap; pointer-events: none; }
`;

function pageCss(template) {
  const { width, height } = resolvePageSize(template.page);
  return `${ENGINE_CSS}
.tpl-page { width: ${width}mm; height: ${height}mm; background: ${color(template.page.background, "#FFFFFF")}; }`;
}

function printCss(template) {
  const { width, height } = resolvePageSize(template.page);
  return `@page { size: ${width}mm ${height}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.tpl-page { break-after: page; page-break-after: always; }
.tpl-page:last-child { break-after: auto; page-break-after: auto; }`;
}

// Bundled fonts, passed in by the main process as data URLs so the print
// window doesn't depend on file:// origin rules inside an asar archive.
function fontFaceCss(fonts = []) {
  return fonts
    .filter((f) => f && f.family && typeof f.url === "string" && /^data:font\//.test(f.url))
    .map(
      (f) =>
        `@font-face{font-family:'${String(f.family).replace(/[^a-zA-Z0-9 ]/g, "")}';src:url(${f.url});font-weight:${num(
          f.weight,
          400
        )};}`
    )
    .join("\n");
}

// ---------------------------------------------------------------- pagination

function ensureEngineStyles(doc) {
  if (!doc || doc.getElementById("tpl-engine-css")) return;
  const style = doc.createElement("style");
  style.id = "tpl-engine-css";
  style.textContent = ENGINE_CSS;
  (doc.head || doc.body).appendChild(style);
}

function measureHTML(doc, widthMm, html) {
  const box = doc.createElement("div");
  box.className = "tpl-root";
  box.style.cssText = `position:absolute;left:-100000px;top:0;width:${widthMm}mm;visibility:hidden;`;
  box.innerHTML = html;
  doc.body.appendChild(box);
  return box;
}

// Measures table header + every row at the table's real width, in mm.
function measureTable(doc, el, rows) {
  const cols = visibleColumns(el);
  const head = tableHeadHTML(el, cols);
  const rowsHTML = rows
    .map((r) => r.html + (r.contHTML ? r.contHTML.replace('<tr class="tpl-cat"', '<tr class="tpl-cat" data-cont="1"') : ""))
    .join("");
  const box = measureHTML(doc, num(el.w, 186), tableHTML(el, head, rowsHTML));
  const table = box.querySelector("table");
  const headH = table.tHead.getBoundingClientRect().height / PX_PER_MM;
  const trs = Array.from(table.tBodies[0].rows);
  let i = 0;
  for (const r of rows) {
    r.h = trs[i++].getBoundingClientRect().height / PX_PER_MM;
    if (r.contHTML) r.contH = trs[i++].getBoundingClientRect().height / PX_PER_MM;
  }
  box.remove();
  return { head, headH };
}

function measureElementHeight(doc, el, ctx) {
  const box = measureHTML(doc, num(el.w, 10), `<div>${elementInnerHTML(el, ctx)}</div>`);
  const inner = box.firstChild.firstElementChild;
  if (inner) inner.style.height = "auto";
  const h = (inner ? inner.getBoundingClientRect().height : 0) / PX_PER_MM;
  box.remove();
  return Math.max(num(el.h, 0), h);
}

// Splits the results table (and whatever follows it) across pages.
// Returns [{ tableChunk: {y, html} | null, after: [{el, dy, h}] }] per page.
function paginateBody(doc, template, data, ctx) {
  const bounds = getBodyBounds(template.page);
  const body = template.elements.filter((e) => e.zone === "body" && e.visible !== false);
  const table = body.find((e) => e.type === "resultsTable");

  if (!table) return { pages: [{ statics: body, chunk: null, after: [] }] };

  const tableBottom = num(table.y) + num(table.h);
  const after = body.filter((e) => e !== table && num(e.y) >= tableBottom - 0.5);
  const statics = body.filter((e) => e !== table && !after.includes(e));

  const rows = tableRows(table, data.results || []);
  const { head, headH } = measureTable(doc, table, rows);

  const pages = [];
  const firstY = Math.min(Math.max(num(table.y), bounds.top), bounds.bottom);
  let page = { statics, chunk: { y: firstY, rows: [] }, after: [] };
  let cursor = firstY + headH;
  const pageBottom = bounds.bottom;

  const newPage = (groupIndex) => {
    pages.push(page);
    page = { statics: [], chunk: { y: bounds.top, rows: [] }, after: [] };
    cursor = bounds.top + headH;
    // A category split across pages gets its heading repeated as "(cont.)".
    const cat = rows.find((r) => r.kind === "cat" && r.group === groupIndex);
    if (cat && groupIndex != null) {
      page.chunk.rows.push(cat.contHTML);
      cursor += cat.contH || cat.h;
    }
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Keep a category heading together with its first row.
    const need = r.kind === "cat" && rows[i + 1] ? r.h + rows[i + 1].h : r.h;
    const pageHasRows = page.chunk.rows.length > 0;
    if (cursor + need > pageBottom + 0.01) {
      if (!pageHasRows && pages.length === 0) {
        // Table can't even start on page 1 (placed too low) — start on page 2.
        page.chunk = null;
        newPage(null);
      } else if (pageHasRows) {
        newPage(r.kind === "cat" ? null : r.group);
      }
      // else: a fresh page and the row is still taller than the body — place
      // it anyway rather than looping forever.
    }
    page.chunk.rows.push(r.html);
    cursor += r.h;
  }

  // Elements designed below the table follow it, keeping their spacing.
  if (after.length) {
    const offsets = after.map((el) => ({
      el,
      off: num(el.y) - tableBottom,
      h: el.autoHeight ? measureElementHeight(doc, el, ctx) : num(el.h),
    }));
    const groupH = Math.max(...offsets.map((o) => o.off + o.h));
    let start = cursor + 2;
    if (start + groupH > pageBottom + 0.01) {
      pages.push(page);
      page = { statics: [], chunk: null, after: [] };
      start = bounds.top;
    }
    page.after = offsets.map((o) => ({ el: o.el, y: start + o.off, h: o.h }));
  }
  pages.push(page);

  for (const p of pages) {
    if (p.chunk) p.chunk.html = tableHTML(table, head, p.chunk.rows.join(""));
  }
  return { pages, table };
}

function repeatedZones(template) {
  const els = template.elements.filter((e) => e.visible !== false);
  return {
    background: els.filter((e) => e.zone === "background"),
    frame: els.filter((e) => e.zone === "header" || e.zone === "footer"),
  };
}

/**
 * Renders a template into an array of page HTML strings.
 * opts.mode: "preview" (data-filled report) | "blank" (only background,
 *            header and footer — the reusable letterhead)
 * opts.watermark: { src, opacity } optional image drawn on every page
 * Requires a DOM `doc` for measuring text/table heights.
 */
function renderPages(template, data, opts = {}) {
  const doc = opts.doc || (typeof document !== "undefined" ? document : null);
  const mode = opts.mode || "preview";
  const ctx = { data: data || {}, mode, page: { number: 1, total: 1 } };
  ensureEngineStyles(doc);
  const { background, frame } = repeatedZones(template);

  let bodyPages;
  let table = null;
  if (mode === "blank") {
    bodyPages = [{ statics: [], chunk: null, after: [] }];
  } else {
    const res = paginateBody(doc, template, ctx.data, ctx);
    bodyPages = res.pages;
    table = res.table;
  }

  const total = bodyPages.length;
  const wm = opts.watermark && imgSrc(opts.watermark.src);
  const wmText = mode !== "blank" && template.content?.watermarkText;

  const size = resolvePageSize(template.page);
  const pageStyle = `width:${size.width}mm;height:${size.height}mm;background:${color(template.page.background, "#FFFFFF")}`;
  const pages = bodyPages.map((bp, i) => {
    const pctx = { ...ctx, page: { number: i + 1, total } };
    const parts = [];
    background.forEach((el) => parts.push(elementOuterHTML(el, pctx)));
    if (wmText) parts.push(`<div class="tpl-watermark-text">${esc(wmText)}</div>`);
    if (wm)
      parts.push(
        `<img src="${esc(wm)}" style="position:absolute;left:15%;top:30%;width:70%;height:40%;object-fit:contain;opacity:${num(
          opts.watermark.opacity,
          0.06
        )}"/>`
      );
    bp.statics.forEach((el) => parts.push(elementOuterHTML(el, pctx)));
    if (bp.chunk && table) {
      parts.push(
        `<div class="tpl-el" style="left:${num(table.x)}mm;top:${bp.chunk.y}mm;width:${num(table.w)}mm;opacity:${num(
          table.opacity,
          1
        )}">${bp.chunk.html}</div>`
      );
    }
    bp.after.forEach((a) => parts.push(elementOuterHTML(a.el, pctx, a.y - num(a.el.y), a.h)));
    frame.forEach((el) => parts.push(elementOuterHTML(el, pctx)));
    return `<div class="tpl-page" style="${pageStyle}">${parts.join("")}</div>`;
  });

  return { pages, css: pageCss(template), pageCount: total, size: resolvePageSize(template.page) };
}

// Unpaginated first page (results table clipped to its box) — cheap enough
// for dashboard thumbnails and wizard preset cards.
function renderStaticPage(template, data, opts = {}) {
  const ctx = { data: data || {}, mode: opts.mode || "preview", page: { number: 1, total: 1 } };
  const inner = template.elements
    .filter((e) => e.visible !== false)
    .sort((a, b) => ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone])
    .map((el) => elementOuterHTML(el, ctx))
    .join("");
  const { width, height } = resolvePageSize(template.page);
  return `<div class="tpl-page" style="width:${width}mm;height:${height}mm;background:${color(
    template.page.background,
    "#FFFFFF"
  )}">${inner}</div>`;
}

const ZONE_ORDER = { background: 0, body: 1, header: 2, footer: 2 };

async function waitForAssets(doc, root) {
  try {
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
  } catch (e) {}
  const imgs = Array.from((root || doc).querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? null
        : new Promise((res) => {
            img.onload = img.onerror = res;
          })
    )
  );
}

// Entry point for the hidden print window (main process → executeJavaScript).
async function renderForPrint(doc, { template, data, mode, watermark, fonts }) {
  const style = doc.createElement("style");
  style.textContent = fontFaceCss(fonts);
  doc.head.appendChild(style);
  // Load fonts before measuring so pagination uses the final glyph metrics.
  try {
    await Promise.all(
      Array.from(doc.fonts || []).map((f) => f.load().catch(() => null))
    );
  } catch (e) {}
  await waitForAssets(doc);
  const out = renderPages(template, data, { doc, mode, watermark });
  const css = doc.createElement("style");
  css.textContent = `.tpl-page { width: ${out.size.width}mm; height: ${out.size.height}mm; background: ${color(
    template.page.background,
    "#FFFFFF"
  )}; }\n${printCss(template)}`;
  doc.head.appendChild(css);
  const root = doc.createElement("div");
  root.className = "tpl-root";
  root.innerHTML = out.pages.join("");
  doc.body.appendChild(root);
  await waitForAssets(doc, root);
  return { pageCount: out.pageCount, size: out.size };
}

module.exports = {
  PX_PER_MM,
  ENGINE_CSS,
  esc,
  resolveText,
  elementInnerHTML,
  elementOuterHTML,
  renderPages,
  renderStaticPage,
  renderForPrint,
  pageCss,
  waitForAssets,
  ensureEngineStyles,
  fieldLabel,
};
