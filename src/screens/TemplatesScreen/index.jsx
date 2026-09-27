import React, { useEffect, useState } from "react";
import { Alert, Tabs, theme } from "antd";
import { LuPalette, LuImage } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import "./style.css";
import { listTemplates } from "./api";
import SimpleDesigner from "./SimpleDesigner";
import ThemeTab from "./ThemeTab";

// Report Design: either build a design here, or use your own header/footer
// images. Whichever was chosen last is what reports print with.
export default function TemplatesScreen() {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const [active, setActive] = useState(null); // "design" | "theme"
  const [tab, setTab] = useState(null);

  const refresh = async () => {
    try {
      const list = await listTemplates();
      const kind = list.some((x) => x.isDefault) ? "design" : "theme";
      setActive(kind);
      setTab((cur) => cur || kind);
    } catch (e) {
      setActive("theme");
      setTab((cur) => cur || "design");
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  if (!active) return null;

  return (
    <div className="rd-root page">
      <div className="rd-head">
        <h1 className="text-[24px] font-bold" style={{ color: token.colorText }}>{t("SD_Title")}</h1>
        <Alert
          type="success"
          showIcon
          className="rd-active"
          message={`${t("RD_Active")}: ${active === "design" ? t("RD_Design") : t("RD_Theme")}`}
        />
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        size="large"
        items={[
          {
            key: "design",
            label: <span className="rd-tab"><LuPalette /> {t("RD_Design")}</span>,
            children: <SimpleDesigner active={active === "design"} onActivated={refresh} />,
          },
          {
            key: "theme",
            label: <span className="rd-tab"><LuImage /> {t("RD_Theme")}</span>,
            children: <ThemeTab active={active === "theme"} onActivated={refresh} />,
          },
        ]}
      />
    </div>
  );
}
