import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Popover, Spin, message, theme } from "antd";
import { CheckOutlined, CrownOutlined } from "@ant-design/icons";
import { LuFileText, LuBan, LuUpload, LuImage } from "react-icons/lu";
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
import PDFPreviewCard, { SizeControls } from "./theme/PDFPreviewCard";
import PopOverContent from "../SettingScreen/PopOverContent";

// "Create your own design": pick a look, add a logo, pick a color, save.
// The last tile in step one isn't a schema-based design at all — it's the
// classic report (your own header/footer images), folded in here so there's
// only one place to set up how reports look.
const UPLOAD_DESIGN = "uploadHeaderFooter";
// Free-plan accounts can use the plain "Simple" design and the header/footer
// upload option; every other design needs a subscription.
const FREE_DESIGNS = new Set(["minimal", UPLOAD_DESIGN]);
// Only "modernPurple" ("Modern") mirrors — logo/name/DNA accent/wave all
// move to the right. Every other design (including "minimal", which has
// its own fixed logo-left/name-right layout in presets.js) is untouched.
const mirrorFor = (design) => design === "modernPurple";

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

// The upload tile can't render a live schema preview — it just shows a
// placeholder header/footer illustration, same size as the other tiles.
function UploadDesignCard({ selected, onClick, label }) {
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
          border: `1px dashed ${token.colorBorderSecondary}`,
          borderRadius: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: token.colorTextSecondary,
        }}
      >
        <LuImage size={22} />
        <LuUpload size={16} />
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
  // freeBadge still gates the free-plan UI restrictions below (locked paid
  // designs/logos/colors). The Dr. Lab co-brand badge itself now shows on
  // every plan, not just free — see showDrLabBadge.
  const freeBadge = planType === "FREE";
  const {
    headerEmpty,
    setHeaderEmpty,
    headerHeight,
    setHeaderHeight,
    footerEmpty,
    setFooterEmpty,
    footerHeight,
    setFooterHeight,
  } = useAppStore();
  // Always show the small Dr. Lab co-brand badge next to the lab's own logo
  // on the "Simple" design, regardless of plan.
  const showDrLabBadge = true;
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
      // what's actually printing — start on that tile instead of a design,
      // even when an older saved design exists (it's just not the active one).
      const base = simple ? simple.content.simple : defaultSimpleSettings(getAccountLab());
      setSettings(!def ? { ...base, design: UPLOAD_DESIGN } : base);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preload the Dr. Lab badge image so every design preview (and the saved
  // template) can embed it as a data URL.
  useEffect(() => {
    if (drLabBadgeData) return;
    drLabBadgeDataUrl()
      .then(setDrLabBadgeData)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    () => (settings ? buildSimpleTemplate(settings, existing, mirror, showDrLabBadge, drLabBadgeData, drLabLogoData) : null),
    [settings, existing, mirror, showDrLabBadge, drLabBadgeData, drLabLogoData]
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
  const isUploadDesign = settings.design === UPLOAD_DESIGN;
  // "Simple" always shows the Dr. Lab logo (see buildSimpleTemplate) — the
  // logo picker doesn't apply to it.
  const isMinimal = settings.design === "minimal";

  // Persists a header/footer size choice the same way PDFPreviewCard's own
  // controls do, so this screen and the Settings screen never disagree.
  const setLocal = (key, val, setter) => {
    if (val === null || val === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
    setter(val ?? null);
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
  const inUse = (isUploadDesign ? activeKind === "theme" : activeKind === "design") && !dirty;

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
              freeBadge={showDrLabBadge}
              drLabBadgeData={drLabBadgeData}
              drLabLogoData={drLabLogoData}
              selected={settings.design === d}
              onClick={() => set({ design: d })}
              label={t(`SD_D_${d}`)}
            />
          ))}
          <UploadDesignCard
            selected={isUploadDesign}
            onClick={() => set({ design: UPLOAD_DESIGN })}
            label={t("SD_D_uploadHeaderFooter")}
          />
          {SIMPLE_DESIGNS.filter((d) => !FREE_DESIGNS.has(d)).map((d) => (
            <DesignCard
              key={d}
              design={d}
              settings={settings}
              mirror={mirrorFor(d)}
              freeBadge={showDrLabBadge}
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
      hint: isUploadDesign ? t("SD_HintUpload") : t("SD_Hint2"),
      content: isUploadDesign ? (
        <div className="flex flex-col gap-6">
          <PDFSettings section="header" />
          <SizeControls
            label={t("HeaderHeight")}
            emptyLabel={t("EmptyHeader")}
            empty={headerEmpty}
            onEmptyChange={(v) => setLocal("lab-header-empty", v ? "true" : "false", () => setHeaderEmpty(v))}
            height={headerHeight}
            onHeightChange={(v) => setLocal("lab-header-height", v, setHeaderHeight)}
          />
          <PDFSettings section="footer" />
          <SizeControls
            label={t("FooterHeight")}
            emptyLabel={t("EmptyFooter")}
            empty={footerEmpty}
            onEmptyChange={(v) => setLocal("lab-footer-empty", v ? "true" : "false", () => setFooterEmpty(v))}
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
      hint: isUploadDesign ? t("TH_Hint4") : t("SD_Hint4"),
      content: isUploadDesign ? null : (
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
          onClick={isUploadDesign ? useTheme : save}
          icon={<CheckOutlined />}
          className="sd-save"
        >
          {isUploadDesign ? t("TH_Use") : t("SD_Save")}
        </Button>
      }
      preview={
        <>
          <div className="sd-status" style={{ color: inUse ? token.colorSuccess : token.colorTextSecondary }}>
            {inUse ? `✓ ${t(isUploadDesign ? "TH_InUse" : "SD_InUse")}` : t(isUploadDesign ? "TH_NotInUse" : "SD_NotInUse")}
          </div>
          {isUploadDesign ? (
            <PDFPreviewCard controls="none" previewW={360} />
          ) : (
            <PageView html={previewHtml} widthMm={size.width} heightMm={size.height} width={360} />
          )}
        </>
      }
    />
  );
}
