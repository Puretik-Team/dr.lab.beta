import React, { useEffect, useState } from "react";
import { Alert, theme } from "antd";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import "./style.css";
import { listTemplates } from "./api";
import SimpleDesigner from "./SimpleDesigner";

// Report Design: pick a look (or upload your own header/footer as the last
// option) and it becomes what every report prints with.
export default function TemplatesScreen() {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const [activeKind, setActiveKind] = useState(null); // "design" | "theme"
  // Arrived from the "choose a design" prompt: nothing selected until one is saved.
  const location = useLocation();
  const [noSelection, setNoSelection] = useState(!!location.state?.noSelection);

  const refresh = async () => {
    try {
      const list = await listTemplates();
      setActiveKind(list.some((x) => x.isDefault) ? "design" : "theme");
    } catch (e) {
      setActiveKind("theme");
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  if (!activeKind) return null;

  return (
    <div className="rd-root page">
      <div className="rd-head">
        <h1 className="text-[24px] font-bold" style={{ color: token.colorText }}>{t("SD_Title")}</h1>
        {noSelection ? (
          <Alert type="warning" showIcon className="rd-active" message={t("DG_Banner")} />
        ) : (
          <Alert
            type="success"
            showIcon
            className="rd-active"
            message={`${t("RD_Active")}: ${activeKind === "design" ? t("RD_Design") : t("RD_Theme")}`}
          />
        )}
      </div>
      <SimpleDesigner
        activeKind={activeKind}
        noSelection={noSelection}
        onActivated={() => {
          setNoSelection(false);
          refresh();
        }}
      />
    </div>
  );
}
