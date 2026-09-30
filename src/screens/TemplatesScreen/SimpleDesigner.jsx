import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, InputNumber, Popover, Slider, Spin, message, theme } from "antd";
import { CheckOutlined, CrownOutlined } from "@ant-design/icons";
import { LuFileText, LuBan, LuUpload } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import { resolvePageSize } from "../../templates/schema";
import { renderStaticPage } from "../../templates/engine";
import { SIMPLE_COLORS, SIMPLE_DESIGNS, LOGO_ICONS, buildSimpleTemplate, defaultSimpleSettings, resolveLogo } from "../../templates/simple";
import drLabLogo from "../../assets/light-logo.png";
import drLabBadge from "../../assets/light-name.png";
import { usePlan } from "../../hooks/usePlan";
import { getAccountLab, listTemplates, previewData, saveTemplate, setDefaultTemplate, showExample } from "./api";
import { readImage } from "./readImage";
import { useAppStore } from "../../libs/appStore";
import PageView from "./components/PageView";
import StepWizard from "./components/StepWizard";
import { PDFSettings } from "./theme/pdfSettings";
import PDFPreviewCard from "./theme/PDFPreviewCard";
import PopOverContent from "../SettingScreen/PopOverContent";

const MIN_HEIGHT = 5;
const MAX_HEIGHT = 120;

// Just the reserved-space slider, no "Leave Empty" switch — picking this
// design tile already means the header/footer stays empty.
function HeightOnly({ label, height, onHeightChange }) {
  const { t } = useTranslation();
  const effectiveHeight = height ?? 30;
  return (
    <div className="flex items-center gap-2">
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
  );
}

// "Create your own design": pick a look, add a logo, pick a color, save.
// The last tile in step one isn't a schema-based design at all — it's for
// labs that already print on pre-printed letterhead paper: no image upload,
// just reserved blank space at the top/bottom so nothing overlaps it.
const PRE_PRINTED_DESIGN = "prePrintedHeaderFooter";
// Free-plan accounts can use the plain "Simple" design and the pre-printed
// letterhead option; every other design needs a subscription.
const FREE_DESIGNS = new Set(["minimal", PRE_PRINTED_DESIGN]);
// "minimal" (the "Simple" design) already puts the logo on the left and
// the lab's own details on the right in presets.js — no design needs the
// generic left/right mirror anymore.
const mirrorFor = () => false;

// The Dr. Lab logo/wordmark ship as bundled asset URLs; templates embed
// images as data URLs (they must print without the app's asset server), so
// convert once.
async function assetToDataUrl(url, name) {
  const blob = await (await fetch(url)).blob();
  return readImage(new File([blob], name, { type: blob.type || "image/png" }));
}
const drLabLogoDataUrl = () => assetToDataUrl(drLabLogo, "drlab.png");
// The free-plan co-brand badge uses the wordmark (name + logo side by side),
// not the square icon used when a lab picks Dr. Lab as their own logo.
const drLabBadgeDataUrl = () => assetToDataUrl(drLabBadge, "drlab-badge.png");

function LogoTile({ selected, onClick, children, label, locked }) {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const tile = (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      className="sd-logo-tile"
      title={label}
      style={{
        borderColor: selected ? token.colorPrimary : token.colorBorderSecondary,
        boxShadow: selected ? `0 0 0 3px ${token.colorPrimaryBg}` : "none",
        background: token.colorBgContainer,
        color: token.colorTextSecondary,
        cursor: locked ? "not-allowed" : "pointer",
        position: "relative",
      }}
    >
      <div className="sd-logo-tile-art">{children}</div>
      <span style={{ color: selected ? token.colorPrimary : token.colorText }}>{label}</span>
      {locked && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F5A623",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          }}
        >
          <CrownOutlined style={{ fontSize: 10, color: "#FFFFFF" }} />
        </div>
      )}
    </button>
  );
  if (!locked) return tile;
  return (
    <Popover
      placement="top"
      content={<PopOverContent website={"https://www.puretik.com/ar"} email={"puretik@gmail.com"} phone={"07710553120"} limitExceededMessage={t("SD_LockedDesign")} />}
    >
      {tile}
    </Popover>
  );
}

function DesignCard({ design, settings, selected, onClick, label, mirror, freeBadge, drLabBadgeData, drLabLogoData, locked }) {
  const { token } = theme.useToken();
  const { t: tr } = useTranslation();
  const t = useMemo(
    () => buildSimpleTemplate({ ...settings, design }, null, mirror, freeBadge, drLabBadgeData, drLabLogoData),
    [design, settings, mirror, freeBadge, drLabBadgeData, drLabLogoData]
  );
  const html = useMemo(() => renderStaticPage(t, previewData(t, "short")), [t]);
  const size = resolvePageSize(t.page);
  const card = (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      className="sd-design"
      style={{
        borderColor: selected ? token.colorPrimary : token.colorBorderSecondary,
        boxShadow: selected ? `0 0 0 3px ${token.colorPrimaryBg}` : "none",
        background: token.colorBgContainer,
        cursor: locked ? "not-allowed" : "pointer",
        position: "relative",
      }}
    >
      <div style={{ position: "relative" }}>
        <PageView html={html} widthMm={size.width} heightMm={size.height} width={104} shadow={false} style={{ border: "1px solid #eee" }} />
        {locked && (
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#F5A623",
              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            }}
          >
            <CrownOutlined style={{ fontSize: 12, color: "#FFFFFF" }} />
          </div>
        )}
      </div>
      <div className="sd-design-label" style={{ color: selected ? token.colorPrimary : token.colorText }}>
        {selected && <CheckOutlined />} {label}
      </div>
    </button>
  );
  if (!locked) return card;
  return (
    <Popover
      placement="top"
      content={<PopOverContent website={"https://www.puretik.com/ar"} email={"puretik@gmail.com"} phone={"07710553120"} limitExceededMessage={tr("SD_LockedDesign")} />}
    >
      {card}
    </Popover>
  );
}

// This tile can't render a live schema preview — it illustrates the idea
// instead: a page with dashed reserved bands at the top and bottom (where
// the lab's pre-printed letterhead already has its own header/footer) and
// nothing but the results table in between.
function PrePrintedDesignCard({ selected, onClick, label }) {
  const { token } = theme.useToken();
  return (
    <button
      type="button"
      onClick={onClick}
      className="sd-design"
      style={{
        borderColor: selected ? token.colorPrimary : token.colorBorderSecondary,
        boxShadow: selected ? `0 0 0 3px ${token.colorPrimaryBg}` : "none",
        background: token.colorBgContainer,
      }}
    >
      <div
        style={{
          width: 104,
          height: 147,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 4,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ height: 28, borderBottom: `1px dashed ${token.colorBorderSecondary}`, background: token.colorFillTertiary }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "8px 6px" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 4, borderRadius: 2, background: token.colorFillSecondary }} />
          ))}
        </div>
        <div style={{ height: 20, borderTop: `1px dashed ${token.colorBorderSecondary}`, background: token.colorFillTertiary }} />
      </div>
      <div className="sd-design-label" style={{ color: selected ? token.colorPrimary : token.colorText }}>
        {selected && <CheckOutlined />} {label}
      </div>
    </button>
  );
}

export default function SimpleDesigner({ activeKind, onActivated }) {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const { planType } = usePlan();
  // Free-plan accounts get a small Dr. Lab co-brand badge next to their own
  // logo on the "Simple" design — the same free-tier branding the classic
  // theme already shows as a watermark (see main.js getWatermarkBase64).
  const freeBadge = planType === "FREE";
  const { setHeaderEmpty, headerHeight, setHeaderHeight, setFooterEmpty, footerHeight, setFooterHeight } = useAppStore();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState(null);
  const [customDefault, setCustomDefault] = useState(null);
  const [settings, setSettings] = useState(null);
  // Mirror the header layout (logo on the right, name following it) on
  // every design — virtually every lab name typed in is Arabic, so this is
  // always on now rather than only following the app's own UI language.
  // mirrorFor() keeps "gradient"/"ribbon" (already logo-right) from
  // flipping back to logo-left.
  const mirror = mirrorFor(settings?.design);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [drLabLogoData, setDrLabLogoData] = useState(null);
  const [drLabBadgeData, setDrLabBadgeData] = useState(null);

  useEffect(() => {
    (async () => {
      let list = [];
      try {
        list = await listTemplates();
      } catch (e) {
        message.error(t("SD_Error"));
      }
      const simple = list.find((x) => x.content?.simple && x.isDefault) || list.find((x) => x.content?.simple);
      const def = list.find((x) => x.isDefault);
      setExisting(simple || null);
      setCustomDefault(def && !def.content?.simple ? def : null);
      // No default template at all means the classic header/footer theme is
      // what's actually printing — start on that tile instead of a design.
      const base = simple ? simple.content.simple : defaultSimpleSettings(getAccountLab());
      setSettings(!simple && !def ? { ...base, design: PRE_PRINTED_DESIGN } : base);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preload the Dr. Lab badge image for free-plan accounts so every design
  // preview (and the saved template) can embed it as a data URL.
  useEffect(() => {
    if (!freeBadge || drLabBadgeData) return;
    drLabBadgeDataUrl()
      .then(setDrLabBadgeData)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeBadge]);

  // Preloaded unconditionally (not just when a lab picks the "Dr. Lab" logo
  // tile) — the "Simple" design always shows it regardless of the logo
  // choice, so it has to be ready before that design is even selected.
  useEffect(() => {
    if (drLabLogoData) return;
    drLabLogoDataUrl()
      .then(setDrLabLogoData)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = useMemo(
    () => (settings ? buildSimpleTemplate(settings, existing, mirror, freeBadge, drLabBadgeData, drLabLogoData) : null),
    [settings, existing, mirror, freeBadge, drLabBadgeData, drLabLogoData]
  );
  const previewHtml = useMemo(() => (template ? renderStaticPage(template, previewData(template, "short")) : ""), [template]);

  if (loading || !settings) return <Spin size="large" className="block mx-auto mt-24" />;

  const set = (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
  };
  const setLab = (k, v) => set({ lab: { ...settings.lab, [k]: v } });
  // logoChoice records which kind of logo was picked, so a saved Dr. Lab logo
  // isn't mistaken for an uploaded one when the screen is reopened.
  const isDrLab = settings.logoChoice === "drlab";
  const isUploaded = !!settings.logo && !settings.logo.startsWith("icon:") && !isDrLab;
  const isPrePrinted = settings.design === PRE_PRINTED_DESIGN;
  // "Simple" always shows the Dr. Lab logo (see buildSimpleTemplate) — the
  // logo picker doesn't apply to it.
  const isMinimal = settings.design === "minimal";

  // Persists a header/footer size choice the same way PDFPreviewCard's own
  // controls do, so this tile and the Settings screen never disagree.
  const setLocal = (key, val, setter) => {
    if (val === null || val === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
    setter(val ?? null);
  };

  // Picking this tile means "leave it empty" — no separate toggle needed.
  const pickPrePrinted = () => {
    set({ design: PRE_PRINTED_DESIGN });
    setLocal("lab-header-empty", "true", () => setHeaderEmpty(true));
    setLocal("lab-footer-empty", "true", () => setFooterEmpty(true));
  };

  const pickDrLab = async () => {
    try {
      const data = drLabLogoData || (await drLabLogoDataUrl());
      setDrLabLogoData(data);
      set({ logo: data, logoChoice: "drlab" });
    } catch (err) {
      message.error(t("SD_Error"));
    }
  };
  const size = resolvePageSize(template.page);
  const inUse = (isPrePrinted ? activeKind === "theme" : activeKind === "design") && !dirty;

  const pickLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      set({ logo: await readImage(f), logoChoice: "upload" });
    } catch (err) {
      message.error(err.message);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveTemplate(template);
      setExisting(saved);
      setCustomDefault(null);
      setDirty(false);
      message.success(t("SD_Saved"));
      onActivated?.();
    } catch (e) {
      message.error(t("SD_Error"));
    } finally {
      setSaving(false);
    }
  };

  // The pre-printed tile doesn't save a template at all — it just makes the
  // classic header/footer theme (with the reserved blank space set above)
  // the one that prints, same as the old "Add your theme" tab's Finish button.
  const useTheme = async () => {
    setSaving(true);
    try {
      await setDefaultTemplate(null);
      setDirty(false);
      message.success(t("TH_Saved"));
      onActivated?.();
    } catch (e) {
      message.error(t("SD_Error"));
    } finally {
      setSaving(false);
    }
  };

  const example = async () => {
    setOpening(true);
    try {
      await showExample(template);
    } catch (e) {
      message.error(t("SD_Error"));
    } finally {
      setOpening(false);
    }
  };

  const bigInput = (k, label) => (
    <label className="sd-field">
      <span style={{ color: token.colorTextSecondary }}>{label}</span>
      <Input size="large" dir="auto" value={settings.lab[k]} onChange={(e) => setLab(k, e.target.value)} />
    </label>
  );

  const steps = [
    {
      title: t("SD_Step1"),
      hint: t("SD_Hint1"),
      content: (
        <div className="sd-designs">
          {/* Free tiles first: the plain design, then the pre-printed-paper
              option, then every paid design after. */}
          {SIMPLE_DESIGNS.filter((d) => FREE_DESIGNS.has(d)).map((d) => (
            <DesignCard
              key={d}
              design={d}
              settings={settings}
              mirror={mirrorFor(d)}
              freeBadge={freeBadge}
              drLabBadgeData={drLabBadgeData}
              drLabLogoData={drLabLogoData}
              selected={settings.design === d}
              onClick={() => set({ design: d })}
              label={t(`SD_D_${d}`)}
            />
          ))}
          <PrePrintedDesignCard
            selected={isPrePrinted}
            onClick={pickPrePrinted}
            label={t("SD_D_prePrinted")}
          />
          {SIMPLE_DESIGNS.filter((d) => !FREE_DESIGNS.has(d)).map((d) => (
            <DesignCard
              key={d}
              design={d}
              settings={settings}
              mirror={mirrorFor(d)}
              freeBadge={freeBadge}
              drLabBadgeData={drLabBadgeData}
              drLabLogoData={drLabLogoData}
              selected={settings.design === d}
              onClick={() => set({ design: d })}
              label={t(`SD_D_${d}`)}
              locked={freeBadge}
            />
          ))}
        </div>
      ),
    },
    {
      title: t("SD_Step2"),
      hint: isPrePrinted ? t("SD_HintPrePrinted") : t("SD_Hint2"),
      content: isPrePrinted ? (
        <div className="flex flex-col gap-6">
          <HeightOnly
            label={t("HeaderHeight")}
            height={headerHeight}
            onHeightChange={(v) => setLocal("lab-header-height", v, setHeaderHeight)}
          />
          <HeightOnly
            label={t("FooterHeight")}
            height={footerHeight}
            onHeightChange={(v) => setLocal("lab-footer-height", v, setFooterHeight)}
          />
          <PDFSettings section="options" />
        </div>
      ) : (
        <>
          {isMinimal ? (
            <Alert type="info" showIcon message={t("SD_MinimalLogoNote")} />
          ) : (
            <>
              <div className="sd-sub" style={{ color: token.colorText }}>{t("SD_ChooseLogo")}</div>
              <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={pickLogo} />
              <div className="sd-logo-grid">
                <LogoTile label={t("SD_NoLogo")} selected={!settings.logo} onClick={() => set({ logo: "", logoChoice: "" })}>
                  <LuBan size={26} />
                </LogoTile>
                <LogoTile label="Dr. Lab" selected={isDrLab} onClick={pickDrLab}>
                  <img src={drLabLogo} alt="" />
                </LogoTile>
                {LOGO_ICONS.map((id) => (
                  <LogoTile
                    key={id}
                    label={t(`SD_Icon_${id}`)}
                    selected={settings.logo === `icon:${id}`}
                    onClick={() => set({ logo: `icon:${id}`, logoChoice: "icon" })}
                    locked={freeBadge}
                  >
                    <img src={resolveLogo(`icon:${id}`, settings.color)} alt="" />
                  </LogoTile>
                ))}
                <LogoTile label={t("SD_UploadLogo")} selected={isUploaded} onClick={() => fileRef.current?.click()} locked={freeBadge}>
                  {isUploaded ? <img src={settings.logo} alt="" /> : <LuUpload size={26} />}
                </LogoTile>
              </div>
            </>
          )}

          <div className="sd-sub mt-6" style={{ color: token.colorText }}>{t("SD_Color")}</div>
          <div className="flex gap-4 flex-wrap">
            {SIMPLE_COLORS.map((c) => {
              const colorLocked = freeBadge && c.id !== "dark";
              const swatch = (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.id}
                  className="sd-color"
                  style={{
                    background: c.hex,
                    boxShadow: settings.color === c.hex ? `0 0 0 3px #fff, 0 0 0 6px ${c.hex}` : "none",
                    cursor: colorLocked ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                  onClick={colorLocked ? undefined : () => set({ color: c.hex })}
                >
                  {settings.color === c.hex && <CheckOutlined />}
                  {colorLocked && (
                    <div
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        width: 15,
                        height: 15,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#F5A623",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                      }}
                    >
                      <CrownOutlined style={{ fontSize: 8, color: "#FFFFFF" }} />
                    </div>
                  )}
                </button>
              );
              if (!colorLocked) return swatch;
              return (
                <Popover
                  key={c.id}
                  placement="top"
                  content={<PopOverContent website={"https://www.puretik.com/ar"} email={"puretik@gmail.com"} phone={"07710553120"} limitExceededMessage={t("SD_LockedDesign")} />}
                >
                  {swatch}
                </Popover>
              );
            })}
          </div>

          <div className="sd-sub mt-6" style={{ color: token.colorText }}>{t("SD_LabDetails")}</div>
          <div className="sd-lab-fields">
            {bigInput("name", t("SD_LabName"))}
            {bigInput("subtitle", t("SD_LabSubtitle"))}
            {bigInput("phone", t("SD_Phone"))}
            {bigInput("address", t("SD_Address"))}
          </div>
        </>
      ),
    },
    {
      title: t("SW_Finish"),
      hint: isPrePrinted ? t("TH_Hint4") : t("SD_Hint4"),
      content: isPrePrinted ? null : (
        <div className="flex flex-col gap-3 items-start">
          {customDefault && <Alert type="info" showIcon message={t("SD_CustomActive")} />}
          <Button size="large" loading={opening} onClick={example} icon={<LuFileText />}>
            {t("SD_Example")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <StepWizard
      steps={steps}
      current={step}
      onChange={setStep}
      finish={
        <Button
          type="primary"
          size="large"
          loading={saving}
          onClick={isPrePrinted ? useTheme : save}
          icon={<CheckOutlined />}
          className="sd-save"
        >
          {isPrePrinted ? t("TH_Use") : t("SD_Save")}
        </Button>
      }
      preview={
        <>
          <div className="sd-status" style={{ color: inUse ? token.colorSuccess : token.colorTextSecondary }}>
            {inUse ? `✓ ${t(isPrePrinted ? "TH_InUse" : "SD_InUse")}` : t(isPrePrinted ? "TH_NotInUse" : "SD_NotInUse")}
          </div>
          {isPrePrinted ? (
            <PDFPreviewCard controls="none" previewW={360} />
          ) : (
            <PageView html={previewHtml} widthMm={size.width} heightMm={size.height} width={360} />
          )}
        </>
      }
    />
  );
}
