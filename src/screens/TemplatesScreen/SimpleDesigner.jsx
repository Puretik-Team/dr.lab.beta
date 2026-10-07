import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Popover, Spin, message, theme } from "antd";
import { CheckOutlined, CrownOutlined, LoadingOutlined, LockFilled } from "@ant-design/icons";
import { LuFileText, LuBan, LuUpload, LuImage } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import { resolvePageSize } from "../../templates/schema";
import { renderStaticPage } from "../../templates/engine";
import { SIMPLE_COLORS, LOGO_ICONS, buildSimpleTemplate, defaultSimpleSettings, forcesDrLabLogo, resolveLogo } from "../../templates/simple";
import drLabLogo from "../../assets/light-logo.png";
import { drLabBadgeDataUrl, drLabLogoDataUrl } from "./drlabAssets";
import { usePlan } from "../../hooks/usePlan";
import { downloadCatalogTemplate, getAccountLab, markDesignChosen, listCachedCatalog, listCatalog, listTemplates, previewData, saveTemplate, setDefaultTemplate, showExample } from "./api";
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
// The only option that ships with the app, so it works with no download. Every
// other design comes from the server's template catalog, where each entry says
// whether it is free or needs a paid/subscription plan.
// Only "modernPurple" ("Modern") mirrors — logo/name/DNA accent/wave all
// move to the right. Every other design (including "minimal", which has
// its own fixed logo-left/name-right layout in presets.js) is untouched.
const mirrorFor = (design) => design === "modernPurple";

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

function DesignCard({ design, settings, selected, onClick, label, mirror, freeBadge, drLabBadgeData, drLabLogoData, locked, paid, busy }) {
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
      // A locked design must not read as clickable: no hover lift (see
      // .sd-locked), a dimmed preview, a lock on the label, not-allowed cursor.
      className={locked ? "sd-design sd-locked" : "sd-design"}
      aria-disabled={locked || undefined}
      style={{
        borderColor: selected ? token.colorPrimary : paid ? "transparent" : token.colorBorderSecondary,
        boxShadow: selected ? `0 0 0 3px ${token.colorPrimaryBg}` : "none",
        // Paid, not selected: a thin metallic gold border (gradient border-box).
        background:
          paid && !selected
            ? `linear-gradient(${token.colorBgContainer}, ${token.colorBgContainer}) padding-box, linear-gradient(135deg, #F3DDA0, #BF9640 52%, #F3DDA0) border-box`
            : token.colorBgContainer,
        cursor: locked ? "not-allowed" : "pointer",
        position: "relative",
      }}
    >
      {paid && (
        <span className="sd-pro">
          {locked && <LockFilled style={{ fontSize: 9, marginInlineEnd: 4 }} />}
          {tr("SD_Premium")}
        </span>
      )}
      <div style={{ position: "relative", opacity: locked ? 0.5 : 1, filter: locked ? "grayscale(0.4)" : undefined }}>
        <PageView html={html} widthMm={size.width} heightMm={size.height} width={104} shadow={false} style={{ border: "1px solid #eee" }} />
        {busy && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.65)",
              borderRadius: 4,
            }}
          >
            <LoadingOutlined style={{ fontSize: 26, color: token.colorPrimary }} />
          </div>
        )}
      </div>
      <div
        className="sd-design-label"
        style={{ color: selected ? token.colorPrimary : locked ? token.colorTextSecondary : token.colorText }}
      >
        {selected && <CheckOutlined />} {label}
      </div>
    </button>
  );
  if (locked) {
    return (
      <Popover
        placement="top"
        content={<PopOverContent website={"https://www.puretik.com/ar"} email={"puretik@gmail.com"} phone={"07710553120"} limitExceededMessage={tr("SD_LockedDesign")} />}
      >
        {card}
      </Popover>
    );
  }
  return card;
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

// noSelection: opened from the "choose a design" prompt — nothing is selected
// and the lab has to pick a design before it can continue.
export default function SimpleDesigner({ activeKind, onActivated, noSelection = false }) {
  const { token } = theme.useToken();
  const { t, i18n } = useTranslation();
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
  // Designs published from the admin dashboard (empty when none/offline).
  const [catalog, setCatalog] = useState([]);
  const [downloading, setDownloading] = useState(null);
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
      const base = simple ? simple.content.simple : { ...defaultSimpleSettings(getAccountLab()), design: UPLOAD_DESIGN };
      setSettings(noSelection ? { ...base, design: "", catalog: undefined } : !def ? { ...base, design: UPLOAD_DESIGN } : base);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Downloaded designs show up immediately (works offline); the server
    // list then replaces them when it arrives.
    listCachedCatalog()
      .then((l) => setCatalog((cur) => (cur.length ? cur : l)))
      .catch(() => {});
    listCatalog()
      .then((list) => {
        setCatalog(list);
        // The picked design may have been updated on the server since it was
        // saved; use the newer layout so a Save here can't revert it.
        setSettings((cur) => {
          const m = /^catalog:(\d+)$/.exec(cur?.design || "");
          const e = m && list.find((c) => c.id === Number(m[1]));
          return e && (e.version || 1) > (cur.catalogVersion || 0)
            ? { ...cur, catalog: e.configJson, catalogVersion: e.version }
            : cur;
        });
      })
      .catch(() => {});
  }, []);

  // Picking a catalog design downloads it into the local database first, so
  // it keeps working (and listing) offline, then makes it the selected design.
  const pickCatalog = async (entry) => {
    setDownloading(entry.id);
    try {
      await downloadCatalogTemplate(entry);
      set({ design: `catalog:${entry.id}`, catalog: entry.configJson, catalogVersion: entry.version });
    } catch (e) {
      message.error(t("SD_Error"));
    } finally {
      setDownloading(null);
    }
  };

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
  const isMinimal = forcesDrLabLogo(settings);


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
      markDesignChosen();
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
      markDesignChosen();
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

  // Free designs first, then the dashboard's order.
  const sortedCatalog = [...catalog].sort(
    (a, b) => Number(!!b.isFree) - Number(!!a.isFree) || (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id
  );
  // The old built-in designs keep their translated names; anything added
  // later shows the name it was given in the dashboard.
  const catalogLabel = (c) =>
    c.legacyKey && i18n.exists(`SD_D_${c.legacyKey}`) ? t(`SD_D_${c.legacyKey}`) : c.name;

  const steps = [
    {
      title: t("SD_Step1"),
      hint: t("SD_Hint1"),
      content: (
        <div className="sd-designs">
          {/* Local, always available: the pre-printed paper option. Everything
              after it comes from the catalog. */}
          <UploadDesignCard
            selected={isUploadDesign}
            onClick={() => set({ design: UPLOAD_DESIGN, catalog: undefined })}
            label={t("SD_D_uploadHeaderFooter")}
          />
          {sortedCatalog.map((c) => (
            <DesignCard
              key={`catalog:${c.id}`}
              design={`catalog:${c.id}`}
              settings={{ ...settings, catalog: c.configJson }}
              mirror={false}
              freeBadge={showDrLabBadge}
              drLabBadgeData={drLabBadgeData}
              drLabLogoData={drLabLogoData}
              selected={settings.design === `catalog:${c.id}`}
              onClick={() => (downloading ? null : pickCatalog(c))}
              label={catalogLabel(c)}
              locked={freeBadge && !c.isFree}
              // The premium look only shows to free labs, as the cue for what
              // an upgrade unlocks; paid/subscription labs see plain tiles.
              paid={freeBadge && !c.isFree}
              busy={downloading === c.id}
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
      // Nothing picked yet: stay on step one.
      onChange={(n) => (!settings.design && n > 0 ? null : setStep(n))}
      nextDisabled={!settings.design}
      finish={
        <Button
          type="primary"
          size="large"
          loading={saving}
          disabled={!settings.design}
          onClick={isUploadDesign ? useTheme : save}
          icon={<CheckOutlined />}
          className="sd-save"
        >
          {isUploadDesign ? t("TH_Use") : t("SD_Save")}
        </Button>
      }
      preview={
        !settings.design ? (
          <div className="sd-status" style={{ color: token.colorTextSecondary, padding: "80px 16px", textAlign: "center" }}>
            {t("DG_PickPreview")}
          </div>
        ) : (
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
        )
      }
    />
  );
}
