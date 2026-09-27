import React, { useEffect, useState } from "react";
import { Card, InputNumber, Modal, Slider, Switch } from "antd";
import { ExpandOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../libs/appStore";

// Same page proportions the report itself uses (src/control/pdf/config.js's
// page format), so every mm value below maps the same way it does in
// header.js/footer.js.
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 120;

/**
 * Loads `url` off-screen and reports the height (in mm, at the report's full
 * page width) it would print at with NO explicit height override — the same
 * `pageWidth * naturalHeight/naturalWidth` header.js/footer.js use for
 * "Auto". Returns null until it's known (no url, or still loading).
 */
function useAutoHeightMM(url) {
  const [mm, setMm] = useState(null);

  useEffect(() => {
    setMm(null);
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth) setMm((PAGE_W_MM * img.naturalHeight) / img.naturalWidth);
    };
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [url]);

  return mm;
}

// Mirrors what the PDF actually does, including the two ways it can differ
// from a naive "always show a placeholder" preview:
//  - "empty" reserves blank space on purpose — real report, no image.
//  - a header with NO image reserves NO space at all (header.js only applies
//    a height override once an image exists); a footer WITH a height set
//    still reserves that blank space even with no image (footer.js applies
//    it unconditionally) — so the two are deliberately not symmetric here.
//  - when a height is set, the real report *stretches* the image to fill it
//    exactly (jsPDF's addImage has no "cover" mode) — so this preview
//    stretches too, rather than cropping, to show the real distortion.
function Zone({ empty, heightMm, imagePath, emptyLabel, noImageLabel, previewH, scale }) {
  const heightPx = Math.round(((heightMm || 0) / PAGE_H_MM) * previewH);

  if (imagePath) {
    return (
      <div style={{ height: heightPx, flexShrink: 0, overflow: "hidden" }}>
        <img
          src={imagePath}
          style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
        />
      </div>
    );
  }
  if (heightPx <= 0) return null;
  return (
    <div
      style={{
        height: heightPx,
        flexShrink: 0,
        background: empty
          ? "repeating-linear-gradient(45deg, #f5f5f5, #f5f5f5 4px, #eaeaea 4px, #eaeaea 8px)"
          : "#fff",
        borderTop: empty ? "none" : "1px dashed #e2e2e2",
        borderBottom: empty ? "none" : "1px dashed #e2e2e2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {heightPx > 10 * scale && (
        <span style={{ color: "#bbb", fontSize: 8 * scale }}>
          {empty ? emptyLabel : noImageLabel}
        </span>
      )}
    </div>
  );
}

// The mock A4 page itself — used both inline (small) and, at a larger scale,
// inside the click-to-enlarge modal, so the two never drift apart. Takes
// already-resolved {headerMm, footerMm, headerImagePath, footerImagePath} —
// see resolveHeaderMm/resolveFooterMm for how those match header.js/footer.js.
function PageMockup({
  previewW,
  scale,
  headerImagePath,
  headerMm,
  headerEmpty,
  footerImagePath,
  footerMm,
  footerEmpty,
  emptyLabel,
  noHeaderImageLabel,
  noFooterImageLabel,
}) {
  const previewH = Math.round((previewW * PAGE_H_MM) / PAGE_W_MM);

  return (
    <div
      style={{
        width: previewW,
        height: previewH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        border: "1px solid #d9d9d9",
        borderRadius: 4 * scale,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <Zone
        empty={headerEmpty}
        heightMm={headerMm}
        imagePath={headerImagePath}
        emptyLabel={emptyLabel}
        noImageLabel={noHeaderImageLabel}
        previewH={previewH}
        scale={scale}
      />

      <div style={{ padding: `${5 * scale}px ${7 * scale}px`, flex: 1 }}>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              height: 5 * scale,
              marginBottom: 5 * scale,
              borderRadius: 2,
              background: "#eee",
              width: i % 2 === 0 ? "90%" : "70%",
            }}
          />
        ))}
      </div>

      <Zone
        empty={footerEmpty}
        heightMm={footerMm}
        imagePath={footerImagePath}
        emptyLabel={emptyLabel}
        noImageLabel={noFooterImageLabel}
        previewH={previewH}
        scale={scale}
      />
    </div>
  );
}

// Mirrors header.js exactly: an override height only ever applies once an
// image exists; with no image, the header reserves nothing at all.
function resolveHeaderMm({ headerEmpty, headerHeight, hasImage, autoMm }) {
  if (headerEmpty) return headerHeight || 0;
  if (!hasImage) return 0;
  return headerHeight ?? autoMm ?? 0;
}

// Mirrors footer.js exactly: unlike the header, a height override still
// reserves blank space even with no footer image uploaded.
function resolveFooterMm({ footerEmpty, footerHeight, hasImage, autoMm }) {
  if (footerEmpty) return footerHeight || 0;
  if (!hasImage) return footerHeight || 0;
  return footerHeight ?? autoMm ?? 0;
}

// Shared control row for both header and footer: the "Leave ... Empty"
// switch plus a Slider+InputNumber pair for the reserved height — moved here
// (off the PDF Setting card) so they sit right next to the preview they
// affect.
function SizeControls({ label, emptyLabel, empty, onEmptyChange, height, onHeightChange }) {
  const { t } = useTranslation();
  const effectiveHeight = height ?? 30; // illustrate "Auto" with a sane default

  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-center">
        <b className="text-[12px]">{emptyLabel}</b>
        <Switch size="small" checked={empty} onChange={onEmptyChange} />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <b className="text-[12px] whitespace-nowrap">{label}</b>
        <Slider
          min={MIN_HEIGHT}
          max={MAX_HEIGHT}
          value={effectiveHeight}
          onChange={onHeightChange}
          style={{ flex: 1 }}
          tooltip={{ formatter: (v) => `${v}mm` }}
        />
        <InputNumber
          value={height}
          onChange={onHeightChange}
          placeholder={t("Auto")}
          min={MIN_HEIGHT}
          max={MAX_HEIGHT}
          size="small"
          style={{ width: 90 }}
          addonAfter="mm"
        />
      </div>
    </div>
  );
}

export default function PDFPreviewCard() {
  const { t } = useTranslation();
  const [zoomOpen, setZoomOpen] = useState(false);
  const {
    imagePath,
    footImagePath,
    headerEmpty,
    setHeaderEmpty,
    headerHeight,
    setHeaderHeight,
    footerEmpty,
    setFooterEmpty,
    footerHeight,
    setFooterHeight,
  } = useAppStore();

  const handleHeaderEmptyChange = (checked) => {
    localStorage.setItem("lab-header-empty", checked ? "true" : "false");
    setHeaderEmpty(checked);
  };

  const handleHeaderHeightChange = (val) => {
    if (val === null || val === undefined) {
      localStorage.removeItem("lab-header-height");
      setHeaderHeight(null);
    } else {
      localStorage.setItem("lab-header-height", val);
      setHeaderHeight(val);
    }
  };

  const handleFooterEmptyChange = (checked) => {
    localStorage.setItem("lab-footer-empty", checked ? "true" : "false");
    setFooterEmpty(checked);
  };

  const handleFooterHeightChange = (val) => {
    if (val === null || val === undefined) {
      localStorage.removeItem("lab-footer-height");
      setFooterHeight(null);
    } else {
      localStorage.setItem("lab-footer-height", val);
      setFooterHeight(val);
    }
  };

  // "Auto" (no height set) prints at the real image's own aspect ratio, not
  // a guessed size — so measure the actual files, same as header.js/footer.js do.
  const headerAutoMm = useAutoHeightMM(headerEmpty ? null : imagePath);
  const footerAutoMm = useAutoHeightMM(footerEmpty ? null : footImagePath);

  const headerMm = resolveHeaderMm({
    headerEmpty,
    headerHeight,
    hasImage: !!imagePath,
    autoMm: headerAutoMm,
  });
  const footerMm = resolveFooterMm({
    footerEmpty,
    footerHeight,
    hasImage: !!footImagePath,
    autoMm: footerAutoMm,
  });

  const mockupProps = {
    headerImagePath: headerEmpty ? null : imagePath,
    headerMm,
    headerEmpty,
    footerImagePath: footerEmpty ? null : footImagePath,
    footerMm,
    footerEmpty,
    emptyLabel: t("Empty"),
    noHeaderImageLabel: t("NoHeaderImage"),
    noFooterImageLabel: t("NoFooterImage"),
  };

  return (
    <div>
      <p className="pl-[4px] opacity-60">{t("PDFPreview")}</p>
      <Card className="mt-[6px]">
        <div className="flex gap-5 items-start flex-wrap">
          <div
            className="relative group cursor-pointer"
            onClick={() => setZoomOpen(true)}
            title={t("ClickToEnlarge")}
          >
            <PageMockup previewW={150} scale={1} {...mockupProps} />
            <div
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(0,0,0,0.15)" }}
            >
              <ExpandOutlined style={{ color: "#fff", fontSize: 20 }} />
            </div>
          </div>

          <div className="flex-1 min-w-[220px] flex flex-col gap-4">
            <SizeControls
              label={t("HeaderHeight")}
              emptyLabel={t("EmptyHeader")}
              empty={headerEmpty}
              onEmptyChange={handleHeaderEmptyChange}
              height={headerHeight}
              onHeightChange={handleHeaderHeightChange}
            />
            <SizeControls
              label={t("FooterHeight")}
              emptyLabel={t("EmptyFooter")}
              empty={footerEmpty}
              onEmptyChange={handleFooterEmptyChange}
              height={footerHeight}
              onHeightChange={handleFooterHeightChange}
            />
          </div>
        </div>
      </Card>

      <Modal
        open={zoomOpen}
        onCancel={() => setZoomOpen(false)}
        footer={null}
        centered
        width="fit-content"
        title={t("PDFPreview")}
      >
        <div className="flex justify-center py-2">
          <PageMockup previewW={400} scale={2.6} {...mockupProps} />
        </div>
      </Modal>
    </div>
  );
}
