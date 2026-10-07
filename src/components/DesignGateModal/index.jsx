import React from "react";
import { Button, Modal } from "antd";
import { LuLayoutTemplate } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useDesignGate } from "../../screens/TemplatesScreen/designGate";

// Shown when the lab tries to print without a selected report design (see
// designGate.js). "Choose a design" opens the Templates page with nothing
// selected; "Not now" just closes it. Nothing is printed either way.
export default function DesignGateModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { open, close } = useDesignGate();

  const choose = () => {
    close();
    navigate("/templates", { state: { noSelection: true } });
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      centered
      width={440}
      title={
        <span className="flex items-center gap-3">
          <LuLayoutTemplate size={22} aria-hidden="true" />
          {t("DG_Title")}
        </span>
      }
      footer={[
        <Button key="later" size="large" onClick={close}>
          {t("DG_NotNow")}
        </Button>,
        <Button key="choose" type="primary" size="large" onClick={choose} autoFocus>
          {t("DG_Choose")}
        </Button>,
      ]}
    >
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{t("DG_Body")}</p>
    </Modal>
  );
}
