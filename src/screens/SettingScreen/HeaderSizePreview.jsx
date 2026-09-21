import React from "react";
import { Modal, Slider, InputNumber, Typography } from "antd";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

// A4 page proportions (mm), scaled down for an on-screen mock-up
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const PREVIEW_W = 150; // px
const PREVIEW_H = Math.round((PREVIEW_W * PAGE_H_MM) / PAGE_W_MM);
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 120;

// kind: "Header" (zone at the top of the page) or "Footer" (zone at the bottom).
// Drives the i18n keys (e.g. HeaderSizeTip1 / FooterSizeTip1) and the layout.
const HeaderSizePreview = ({
  open,
  onClose,
  kind = "Header",
  headerEmpty,
  headerHeight,
  onChangeHeight,
}) => {
  const { t } = useTranslation();
  const isFooter = kind === "Footer";

  const effectiveHeight = headerHeight ?? 30; // illustrate "Auto" with a sane default
  const headerPx = Math.min(
    PREVIEW_H,
    Math.round((effectiveHeight / PAGE_H_MM) * PREVIEW_H),
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      title={t(`${kind}SizePreviewTitle`)}
      okText={t("Done")}
      cancelButtonProps={{ style: { display: "none" } }}
      width={420}
    >
      <Text type="secondary" className="text-[13px]">
        {t(`${kind}SizePreviewDesc`)}
      </Text>

      <div className="flex justify-center my-4">
        <div
          style={{
            width: PREVIEW_W,
            height: PREVIEW_H,
            position: "relative",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            overflow: "hidden",
            background: "#fff",
            display: "flex",
            flexDirection: isFooter ? "column-reverse" : "column",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          {/* Header / footer zone */}
          <div
            style={{
              height: headerPx,
              flexShrink: 0,
              background: headerEmpty
                ? "repeating-linear-gradient(45deg, #f5f5f5, #f5f5f5 4px, #eaeaea 4px, #eaeaea 8px)"
                : "#7c5cff",
              opacity: headerEmpty ? 1 : 0.75,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "height 150ms ease",
            }}
          >
            {!headerEmpty && (
              <span style={{ color: "#fff", fontSize: 9 }}>
                {t(isFooter ? "FooterImageLabel" : "HeaderImage")}
              </span>
            )}
          </div>

          {/* Content zone */}
          <div style={{ padding: "4px 6px", flex: 1 }}>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                style={{
                  height: 5,
                  marginBottom: 4,
                  borderRadius: 2,
                  background: "#eee",
                  width: i % 2 === 0 ? "90%" : "70%",
                }}
              />
            ))}
          </div>

          {/* mm ruler marks on the right edge */}
          <div
            style={{
              position: "absolute",
              ...(isFooter ? { bottom: 0 } : { top: 0 }),
              right: 2,
              fontSize: 8,
              color: "#999",
            }}
          >
            {headerPx > 12 ? `${effectiveHeight}mm` : ""}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Slider
          min={MIN_HEIGHT}
          max={MAX_HEIGHT}
          value={effectiveHeight}
          onChange={onChangeHeight}
          style={{ flex: 1 }}
          tooltip={{ formatter: (v) => `${v}mm` }}
        />
        <InputNumber
          value={effectiveHeight}
          onChange={onChangeHeight}
          min={MIN_HEIGHT}
          max={MAX_HEIGHT}
          size="small"
          addonAfter="mm"
          style={{ width: 100 }}
        />
      </div>

      <ul className="text-[12px] mt-3 pl-4" style={{ color: "#888" }}>
        <li>{t(`${kind}SizeTip1`)}</li>
        <li>{t(`${kind}SizeTip2`)}</li>
        <li>{t(`${kind}SizeTip3`)}</li>
      </ul>
    </Modal>
  );
};

export default HeaderSizePreview;
