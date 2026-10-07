import React from "react";
import { Button, Steps, theme } from "antd";
import { useTranslation } from "react-i18next";

// One step at a time with big Back / Next buttons and a preview that stays
// visible on the side — the layout both Report Design tabs share.
export default function StepWizard({ steps, current, onChange, preview, finish, nextDisabled = false }) {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const last = current === steps.length - 1;

  return (
    <div className="sw-root">
      <div className="sw-left">
        <Steps
          current={current}
          onChange={onChange}
          items={steps.map((s) => ({ title: s.title }))}
          className="sw-steps"
        />
        <div className="sw-body">
          {steps[current].hint && (
            <p className="sw-hint" style={{ color: token.colorTextSecondary }}>
              {steps[current].hint}
            </p>
          )}
          {steps[current].content}
        </div>
        <div className="sw-nav" style={{ borderColor: token.colorBorderSecondary }}>
          <Button size="large" disabled={current === 0} onClick={() => onChange(current - 1)} className="sw-btn">
            {t("SW_Back")}
          </Button>
          {last ? (
            finish
          ) : (
            <Button type="primary" size="large" disabled={nextDisabled} onClick={() => onChange(current + 1)} className="sw-btn">
              {t("SW_Next")}
            </Button>
          )}
        </div>
      </div>
      <div className="sw-right" style={{ background: token.colorFillQuaternary }}>
        {preview}
      </div>
    </div>
  );
}
