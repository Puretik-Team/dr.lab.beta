import React, { useState } from "react";
import { Button, message, theme } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { setDefaultTemplate } from "./api";
import StepWizard from "./components/StepWizard";
import { PDFSettings } from "./theme/pdfSettings";
import PDFPreviewCard from "./theme/PDFPreviewCard";

// "Add your theme": the lab's own header/footer images (the classic report
// layout, formerly under Settings), set up one step at a time.
export default function ThemeTab({ active, onActivated }) {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const useTheme = async () => {
    setSaving(true);
    try {
      // No default design → printing falls back to this header/footer theme.
      await setDefaultTemplate(null);
      message.success(t("TH_Saved"));
      onActivated?.();
    } catch (e) {
      message.error(t("SD_Error"));
    } finally {
      setSaving(false);
    }
  };

  const controls = step === 0 ? "header" : step === 1 ? "footer" : "none";
  const steps = [
    { title: t("TH_Step1"), hint: t("TH_Hint1"), content: <PDFSettings section="header" /> },
    { title: t("TH_Step2"), hint: t("TH_Hint2"), content: <PDFSettings section="footer" /> },
    { title: t("TH_Step3"), hint: t("TH_Hint3"), content: <PDFSettings section="options" /> },
    { title: t("SW_Finish"), hint: t("TH_Hint4"), content: null },
  ];

  return (
    <StepWizard
      steps={steps}
      current={step}
      onChange={setStep}
      finish={
        <Button type="primary" size="large" loading={saving} onClick={useTheme} icon={<CheckOutlined />} className="sd-save">
          {t("TH_Use")}
        </Button>
      }
      preview={
        <>
          <div className="sd-status" style={{ color: active ? token.colorSuccess : token.colorTextSecondary }}>
            {active ? `✓ ${t("TH_InUse")}` : t("TH_NotInUse")}
          </div>
          <PDFPreviewCard controls={controls} previewW={300} />
        </>
      }
    />
  );
}
