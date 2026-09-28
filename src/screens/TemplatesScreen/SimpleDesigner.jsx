import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Spin, message, theme } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { LuFileText, LuBan, LuUpload } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import { resolvePageSize } from "../../templates/schema";
import { renderStaticPage } from "../../templates/engine";
import { SIMPLE_COLORS, SIMPLE_DESIGNS, LOGO_ICONS, buildSimpleTemplate, defaultSimpleSettings, resolveLogo } from "../../templates/simple";
import drLabLogo from "../../assets/light-logo.png";
import { getAccountLab, listTemplates, previewData, saveTemplate, showExample } from "./api";
import { readImage } from "./readImage";
import PageView from "./components/PageView";
import StepWizard from "./components/StepWizard";

// "Create your own design": pick a look, add a logo, pick a color, save.

// The Dr. Lab logo ships as a bundled asset URL; templates embed images as
// data URLs (they must print without the app's asset server), so convert once.
async function drLabLogoDataUrl() {
  const blob = await (await fetch(drLabLogo)).blob();
  return readImage(new File([blob], "drlab.png", { type: blob.type || "image/png" }));
}

function LogoTile({ selected, onClick, children, label }) {
  const { token } = theme.useToken();
  return (
    <button
      type="button"
      onClick={onClick}
      className="sd-logo-tile"
      title={label}
      style={{
        borderColor: selected ? token.colorPrimary : token.colorBorderSecondary,
        boxShadow: selected ? `0 0 0 3px ${token.colorPrimaryBg}` : "none",
        background: token.colorBgContainer,
        color: token.colorTextSecondary,
      }}
    >
      <div className="sd-logo-tile-art">{children}</div>
      <span style={{ color: selected ? token.colorPrimary : token.colorText }}>{label}</span>
    </button>
  );
}

function DesignCard({ design, settings, selected, onClick, label }) {
  const { token } = theme.useToken();
  const t = useMemo(() => buildSimpleTemplate({ ...settings, design }), [design, settings]);
  const html = useMemo(() => renderStaticPage(t, previewData(t, "short")), [t]);
  const size = resolvePageSize(t.page);
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
      <PageView html={html} widthMm={size.width} heightMm={size.height} width={104} shadow={false} style={{ border: "1px solid #eee" }} />
      <div className="sd-design-label" style={{ color: selected ? token.colorPrimary : token.colorText }}>
        {selected && <CheckOutlined />} {label}
      </div>
    </button>
  );
}

export default function SimpleDesigner({ active, onActivated }) {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState(null);
  const [customDefault, setCustomDefault] = useState(null);
  const [settings, setSettings] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [drLabLogoData, setDrLabLogoData] = useState(null);

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
      setSettings(simple ? simple.content.simple : defaultSimpleSettings(getAccountLab()));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = useMemo(() => (settings ? buildSimpleTemplate(settings, existing) : null), [settings, existing]);
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
  const inUse = active && !dirty;

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
          {SIMPLE_DESIGNS.map((d) => (
            <DesignCard key={d} design={d} settings={settings} selected={settings.design === d} onClick={() => set({ design: d })} label={t(`SD_D_${d}`)} />
          ))}
        </div>
      ),
    },
    {
      title: t("SD_Step2"),
      hint: t("SD_Hint2"),
      content: (
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
              <LogoTile key={id} label={t(`SD_Icon_${id}`)} selected={settings.logo === `icon:${id}`} onClick={() => set({ logo: `icon:${id}`, logoChoice: "icon" })}>
                <img src={resolveLogo(`icon:${id}`, settings.color)} alt="" />
              </LogoTile>
            ))}
            <LogoTile label={t("SD_UploadLogo")} selected={isUploaded} onClick={() => fileRef.current?.click()}>
              {isUploaded ? <img src={settings.logo} alt="" /> : <LuUpload size={26} />}
            </LogoTile>
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
      title: t("SD_Step3"),
      hint: t("SD_Hint3"),
      content: (
        <div className="flex gap-4 flex-wrap">
          {SIMPLE_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.id}
              className="sd-color"
              style={{ background: c.hex, boxShadow: settings.color === c.hex ? `0 0 0 3px #fff, 0 0 0 6px ${c.hex}` : "none" }}
              onClick={() => set({ color: c.hex })}
            >
              {settings.color === c.hex && <CheckOutlined />}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: t("SW_Finish"),
      hint: t("SD_Hint4"),
      content: (
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
        <Button type="primary" size="large" loading={saving} onClick={save} icon={<CheckOutlined />} className="sd-save">
          {t("SD_Save")}
        </Button>
      }
      preview={
        <>
          <div className="sd-status" style={{ color: inUse ? token.colorSuccess : token.colorTextSecondary }}>
            {inUse ? `✓ ${t("SD_InUse")}` : t("SD_NotInUse")}
          </div>
          <PageView html={previewHtml} widthMm={size.width} heightMm={size.height} width={360} />
        </>
      }
    />
  );
}
