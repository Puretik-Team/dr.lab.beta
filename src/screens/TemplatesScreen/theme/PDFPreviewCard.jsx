import React, { useEffect, useRef, useState } from "react";
import { InputNumber, Modal, Slider, Spin, Switch } from "antd";
import { ExpandOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../../libs/appStore";
import { usePlan } from "../../../hooks/usePlan";
import { send } from "../../../control/renderer";

const MIN_HEIGHT = 5;
const MAX_HEIGHT = 120;
const A4_RATIO = 297 / 210;

// Shared control row for header and footer: the "Leave ... Empty" switch plus
// a Slider+InputNumber pair for the reserved height.
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

// The preview is the REAL classic report: main renders a sample visit through
// the same createPDFForVisit the print button uses, and returns page 1 as an
// image (see "renderThemePreview" in src/control/main.js). Re-rendered shortly
// after any setting changes, so what you see is exactly what prints.
function useRealPreview(settings) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const latest = useRef(settings);
  const busy = useRef(false);
  const pending = useRef(false);
  const key = JSON.stringify(settings);
  latest.current = settings;

  // One render at a time: send() resolves every pending request on the same
  // reply channel, so overlapping renders could show a stale image. Changes
  // made while a render is running trigger one more render with the latest
  // settings afterwards.
  const run = async () => {
    if (busy.current) {
      pending.current = true;
      return;
    }
    busy.current = true;
    const resp = await send({ query: "renderThemePreview", data: { ...latest.current, width: 900 } });
    if (resp?.success) {
      setImage(resp.image);
      setError(null);
    } else {
      setError(resp?.error || "Preview failed");
    }
    busy.current = false;
    if (pending.current) {
      pending.current = false;
      run();
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(run, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { image, loading, error };
}

function PageImage({ image, loading, error, width }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        width,
        height: Math.round(width * A4_RATIO),
        background: "#fff",
        border: "1px solid #d9d9d9",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        position: "relative",
      }}
    >
      {image && <img src={image} alt="" style={{ width: "100%", display: "block" }} />}
      {error && !image && (
        <div className="flex items-center justify-center h-full text-[12px] text-[#aaa] p-3 text-center">{t("SD_Error")}</div>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.45)" }}>
          <Spin />
        </div>
      )}
    </div>
  );
}

// controls: "header" | "footer" | "none" — which size controls to show next
// to the page preview.
export default function PDFPreviewCard({ controls = "none", previewW = 150 }) {
  const { t } = useTranslation();
  const [zoomOpen, setZoomOpen] = useState(false);
  const { planType } = usePlan();
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
    tableHeaderColor,
    tableHeaderTextColor,
    printFontSize,
  } = useAppStore();

  const setLocal = (key, val, setter) => {
    if (val === null || val === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
    setter(val ?? null);
  };

  // imagePath/footImagePath change (cache-busted URL) whenever an image is
  // uploaded or removed, which re-renders the preview with the new file.
  const preview = useRealPreview({
    planType,
    fontSize: printFontSize,
    headerEmpty,
    headerHeight,
    footerEmpty,
    footerHeight,
    tableHeaderColor,
    tableHeaderTextColor,
    imagePath,
    footImagePath,
  });

  return (
    <div>
      <div className="flex gap-6 items-start flex-wrap">
        <div className="relative group cursor-pointer" onClick={() => setZoomOpen(true)} title={t("ClickToEnlarge")}>
          <PageImage {...preview} width={previewW} />
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.15)" }}
          >
            <ExpandOutlined style={{ color: "#fff", fontSize: 20 }} />
          </div>
        </div>

        {controls !== "none" && (
          <div className="flex-1 min-w-[220px] flex flex-col gap-4">
            {controls === "header" && (
              <SizeControls
                label={t("HeaderHeight")}
                emptyLabel={t("EmptyHeader")}
                empty={headerEmpty}
                onEmptyChange={(v) => setLocal("lab-header-empty", v ? "true" : "false", () => setHeaderEmpty(v))}
                height={headerHeight}
                onHeightChange={(v) => setLocal("lab-header-height", v, setHeaderHeight)}
              />
            )}
            {controls === "footer" && (
              <SizeControls
                label={t("FooterHeight")}
                emptyLabel={t("EmptyFooter")}
                empty={footerEmpty}
                onEmptyChange={(v) => setLocal("lab-footer-empty", v ? "true" : "false", () => setFooterEmpty(v))}
                height={footerHeight}
                onHeightChange={(v) => setLocal("lab-footer-height", v, setFooterHeight)}
              />
            )}
          </div>
        )}
      </div>

      <Modal open={zoomOpen} onCancel={() => setZoomOpen(false)} footer={null} centered width="fit-content" title={t("PDFPreview")}>
        <div className="flex justify-center py-2">
          <PageImage {...preview} width={560} />
        </div>
      </Modal>
    </div>
  );
}
