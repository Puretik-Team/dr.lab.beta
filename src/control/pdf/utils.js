const { PDF_CFG } = require("./config");

// ---- helpers ----
async function getImageDimensionsFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.src = dataUrl;
  });
}

function addFontIfNeeded(doc, fontSize = 10) {
  doc.setFont(PDF_CFG.font.family);
  doc.setFontSize(fontSize);
}

function fmtNum(n) {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("en") : String(n);
}

function formatRef(ref_text, fallbackUnit = "") {
  if (!ref_text) return "";
  try {
    const parsed = JSON.parse(ref_text);
    if (Array.isArray(parsed)) {
      return parsed.map(objToLine).join(" | ");
    }
    if (parsed && typeof parsed === "object") {
      return objToLine(parsed);
    }
  } catch {}
  return String(ref_text).trim();

  function objToLine(o = {}) {
    const parts = [];
    if (o.sex) parts.push(`Sex:${String(o.sex).toUpperCase()}`);
    if (o.age_min || o.age_max) {
      parts.push(`Age:${o.age_min ?? "—"}–${o.age_max ?? "—"}y`);
    }
    let val = "";
    if (o.low != null && o.high != null) val = `${o.low}–${o.high}`;
    else if (o.op && o.value != null) val = `${o.op}${o.value}`;
    else if (o.value != null) val = `${o.value}`;
    const unit = o.unit || fallbackUnit || "";
    return (
      (parts.length ? `[${parts.join(", ")}] ` : "") +
      (val ? `${val}${unit ? " " + unit : ""}` : "")
    );
  }
}

// Reference ranges in this app are almost always typed by the lab as a plain
// string in a free-text "Reference (ref_text)" field (see Tests/Modal), e.g.
// "70-110", "<200", "<=40", "M: 9-48 / F: 8-40" — not the {low,high} JSON
// object this originally only handled. This turns that raw string into
// {low, high}, or null when it's not a numeric range at all (e.g. "Negative").
function parseBoundsFromText(text) {
  if (!text) return null;
  const t = String(text).trim();

  let m = t.match(/^<=?\s*(-?[\d.]+)/);
  if (m) return { low: null, high: Number(m[1]) };

  m = t.match(/^>=?\s*(-?[\d.]+)/);
  if (m) return { low: Number(m[1]), high: null };

  m = t.match(/(-?[\d.]+)\s*[-–]\s*(-?[\d.]+)/);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };

  return null;
}

// Picks the segment of a gender-split ref_text ("M: 9-48 / F: 8-40",
// "3.5-7.2 M / 2.6-6.0 F") matching the patient's gender. Returns null
// (rather than guessing) when the patient's gender is unknown or no segment
// names a gender at all.
function pickGenderSegment(text, genderCode) {
  const segments = text.split("/").map((s) => s.trim());
  if (segments.length < 2) return text;
  if (!genderCode) return null;

  for (const seg of segments) {
    const leading = seg.match(/^([MF])\s*[:.]?\s*/i);
    const trailing = seg.match(/\s*([MF])\s*$/i);
    const marker = (leading || trailing)?.[1]?.toUpperCase();
    if (!marker) continue;
    if (marker === genderCode) {
      return seg.replace(/^([MF])\s*[:.]?\s*/i, "").replace(/\s*([MF])\s*$/i, "");
    }
  }
  return null;
}

/**
 * Pulls {low, high, critLow, critHigh} out of a ref_text — a JSON
 * object/array (optionally gender-split via a `sex` field) or, far more
 * commonly in this app, a plain string like "70-110" or "M: 9-48 / F: 8-40".
 * `genderCode` ("M"/"F"/null) resolves gender-split ranges; without it (or
 * without a matching segment) a gender-split range is left unclassified
 * rather than guessing the wrong half.
 */
function parseRefBounds(ref_text, genderCode = null) {
  if (!ref_text) return null;

  try {
    const parsed = JSON.parse(ref_text);
    let obj = parsed;
    if (Array.isArray(parsed)) {
      obj =
        (genderCode &&
          parsed.find((o) => String(o?.sex || "").toUpperCase().startsWith(genderCode))) ||
        parsed.find((o) => !o?.sex) ||
        (parsed.length === 1 ? parsed[0] : null);
    }
    if (!obj || typeof obj !== "object") return null;
    const low = obj.low ?? null;
    const high = obj.high ?? null;
    if (low == null && high == null) return null;
    return {
      low: low != null ? Number(low) : null,
      high: high != null ? Number(high) : null,
      critLow: obj.critLow != null ? Number(obj.critLow) : null,
      critHigh: obj.critHigh != null ? Number(obj.critHigh) : null,
    };
  } catch {
    // Not JSON — the common case: a plain, possibly gender-split, string.
  }

  const segment = pickGenderSegment(String(ref_text).trim(), genderCode);
  if (segment == null) return null;
  const bounds = parseBoundsFromText(segment);
  return bounds ? { ...bounds, critLow: null, critHigh: null } : null;
}

/**
 * Classifies a result against ref_text's numeric bounds.
 * Returns null when there's nothing to classify against (no numeric range,
 * a gender-split range with no known/matching gender, or a non-numeric
 * result) — callers fall back to a plain row in that case.
 */
function getResultStatus(ref_text, resultValue, genderCode = null) {
  const bounds = parseRefBounds(ref_text, genderCode);
  if (!bounds) return null;
  const value = Number(resultValue);
  if (!Number.isFinite(value)) return null;

  if (bounds.critHigh != null && value > bounds.critHigh) return "critical";
  if (bounds.critLow != null && value < bounds.critLow) return "critical";
  if (bounds.high != null && value > bounds.high) return "high";
  if (bounds.low != null && value < bounds.low) return "low";
  return "normal";
}

// Normalizes the many ways gender shows up in this app's data (English
// words/letters, Arabic words) into "M"/"F" for matching gender-split ranges.
function normalizeGenderCode(g) {
  const v = String(g || "").trim().toLowerCase();
  if (v === "male" || v === "m" || v === "ذكر") return "M";
  if (v === "female" || v === "f" || v === "أنثى") return "F";
  return null;
}

function getSingleResultRJ(rj) {
  if (rj && typeof rj === "object") return rj.result ?? "";
  return "";
}
function getPanelResultRJ(rj, code) {
  if (!rj || typeof rj !== "object") return "";
  return rj.items?.[code]?.result ?? "";
}
function getCompositeResultRJ(rj, sectCode, fieldCode) {
  if (!rj || typeof rj !== "object") return "";
  return rj.sections?.[sectCode]?.[fieldCode] ?? "";
}

module.exports = {
  getImageDimensionsFromDataUrl,
  addFontIfNeeded,
  fmtNum,
  formatRef,
  getResultStatus,
  normalizeGenderCode,
  getSingleResultRJ,
  getPanelResultRJ,
  getCompositeResultRJ,
};
