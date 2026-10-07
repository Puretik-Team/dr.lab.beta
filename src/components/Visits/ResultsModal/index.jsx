import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Tabs,
  Space,
  Input,
  InputNumber,
  Select,
  Typography,
  Divider,
  Tag,
  message,
  Button,
  Popover,
  AutoComplete,
} from "antd";
import { formatRefText } from "../../../helper/refTextFormatter";
import { PrinterOutlined, SaveOutlined } from "@ant-design/icons";
import { send } from "../../../control/renderer";
import { usePlan } from "../../../hooks/usePlan";
import { ensureReportDesign } from "../../../screens/TemplatesScreen/designGate";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

/**
 * Result entry modal for visit_v2
 * props:
 *  - open: boolean
 *  - visit: {
 *      id, visitNumber, patient{...}, doctor{...},
 *      tests: [{ visit_item_id, type, code, name_en, name_ar, unit, ref_text, result_json, ... }]
 *    }
 *  - onCancel: fn
 *  - onSubmit: async (changesArray) => void  // [{visit_item_id, result_json, item_status}]
 */
export function ResultsModal({ open, visit, onCancel, onSubmit }) {
  const [activeKey, setActiveKey] = useState("0");
  const [drafts, setDrafts] = useState({}); // visit_item_id -> result_json object
  const tests = Array.isArray(visit?.tests) ? visit.tests : [];
  const { planType } = usePlan();
  const { t } = useTranslation();

  // init from visit
  useEffect(() => {
    if (!open) return;
    const next = {};
    tests.forEach((t) => {
      next[t.visit_item_id] = normalizeInitialResult(t);
    });
    setDrafts(next);
    setActiveKey("0");
  }, [open, visit?.id]); // re-init when visit changes

  // Tabs items
  const items = useMemo(() => {
    return tests.map((test, idx) => ({
      key: String(idx),
      label: (
        <span>
          <b>{test.name_en || test.name_ar || test.code}</b>{" "}
          <Tag style={{ marginInlineStart: 6 }}>{test.type}</Tag>
        </span>
      ),
      children: (
        <TestEditor
          test={test}
          value={drafts[test.visit_item_id]}
          onChange={(val) =>
            setDrafts((prev) => ({ ...prev, [test.visit_item_id]: val }))
          }
          t={t}
        />
      ),
    }));
  }, [tests, drafts, t]);

  const handleSave = async () => {
    try {
      // Build changes
      const changes = tests.map((t) => ({
        visit_item_id: t.visit_item_id,
        result_json: drafts[t.visit_item_id] ?? null,
      }));
      await Promise.resolve(onSubmit?.(changes));
    } catch (e) {
      message.error(e?.message || "Failed to save results");
    }
  };

  const handlPrint = async (withQR = false) => {
    if (!(await ensureReportDesign(planType))) return;
    try {
      // Get print settings from localStorage or use defaults
      const fontSize =
        parseInt(localStorage.getItem("lab-print-size"), 10) || 10;
      const headerEmpty = localStorage.getItem("lab-header-empty") === "true";
      const headerHeight = localStorage.getItem("lab-header-height")
        ? parseInt(localStorage.getItem("lab-header-height"), 10)
        : null;
      const footerEmpty = localStorage.getItem("lab-footer-empty") === "true";
      const footerHeight = localStorage.getItem("lab-footer-height")
        ? parseInt(localStorage.getItem("lab-footer-height"), 10)
        : null;
      const tableHeaderColor = localStorage.getItem("lab-table-header-color") || null;
      const tableHeaderTextColor = localStorage.getItem("lab-table-header-text-color") || null;
      let labInfo = null;
      try {
        const labUser = JSON.parse(localStorage.getItem("lab-user"));
        if (labUser) {
          labInfo = {
            name: labUser.labName,
            phone: labUser.phone,
            address: labUser.address,
          };
        }
      } catch {}

      const resp = await send({
        query: "printVisit",
        data: {
          isView: true,
          visit,
          fontSize,
          planType,
          withQR,
          headerEmpty,
          headerHeight,
          footerEmpty,
          footerHeight,
          labInfo,
          tableHeaderColor,
          tableHeaderTextColor,
        },
      });

      console.log(resp);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      //onOk={handleOk}
      footer={
        <div className="flex items-center justify-between w-full">
          <Typography.Text type="secondary">
            {t("SaveResultsBeforePrint")}
          </Typography.Text>
          <Space>
            <Button onClick={() => onCancel(false)}>{t("Cancel")}</Button>
            <Divider type="vertical" />
            <Button
              onClick={() => handlPrint(false)}
              disabled={visit?.status !== "COMPLETED"}
              icon={<PrinterOutlined />}
            >
              {t("Print")}
            </Button>
            <Button
              onClick={() => handlPrint(true)}
              disabled={visit?.status !== "COMPLETED"}
              icon={<PrinterOutlined />}
            >
              {t("PrintWithQR")}
            </Button>
            <Button onClick={handleSave} type="primary" icon={<SaveOutlined />}>
              {t("Save")}
            </Button>
          </Space>
        </div>
      }
      width={1000}
      title={
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <span>{t("EnterResults")}</span>
          {visit?.visitNumber && (
            <Tag color="geekblue">#{visit.visitNumber}</Tag>
          )}
          {visit?.patient?.name && (
            <Text type="secondary">— {visit.patient.name}</Text>
          )}
        </div>
      }
      okText="Save"
      destroyOnClose
    >
      {tests.length === 0 ? (
        <EmptyNote text={t("NoTestsForThisVisit")} />
      ) : (
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={items}
          tabPosition="top"
        />
      )}
      <div className="pt-10"></div>
    </Modal>
  );
}

/* ---------------------- Per-test editor ---------------------- */
function TestEditor({ test, value, onChange, t }) {
  const meta = safeParse(test?.meta_json);
  const type = test?.type;

  if (type === "single") {
    return (
      <SingleEditor
        unit={test?.unit}
        refText={test?.ref_text}
        value={value}
        onChange={onChange}
        t={t}
      />
    );
  }

  if (type === "panel") {
    const rows = Array.isArray(meta?.items) ? meta.items : [];
    return <PanelEditor rows={rows} value={value} onChange={onChange} t={t} />;
  }

  if (type === "composite") {
    const sections = Array.isArray(meta?.sections) ? meta.sections : [];
    return (
      <CompositeEditor sections={sections} value={value} onChange={onChange} t={t} />
    );
  }

  return <EmptyNote text={t("UnsupportedTestType")} />;
}

/* ---------------------- Single ---------------------- */
function SingleEditor({ unit, refText, value, onChange, t }) {
  // value shape: { result: string|number }
  const current = value && typeof value === "object" ? value : {};
  const set = (val) => onChange({ ...(current || {}), result: val });

  return (
    <div>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space align="baseline" wrap>
          <Text strong>{t("Result")}:</Text>
          <Input
            style={{ width: 240 }}
            value={current.result ?? ""}
            onChange={(e) => set(e.target.value)}
            placeholder={t("EnterResult")}
          />
          {unit ? <Tag>{unit}</Tag> : null}
        </Space>

        {(unit || refText) && <Divider style={{ margin: "10px 0" }} />}

        {unit ? (
          <Text type="secondary">
            <b>{t("Unit")}:</b> {unit}
          </Text>
        ) : null}
        {refText ? (
          <Text type="secondary">
            <b>{t("Ref")}:</b> {formatRefText(refText)}
          </Text>
        ) : null}
      </Space>
    </div>
  );
}

/* ---------------------- Panel ---------------------- */
function PanelEditor({ rows, value, onChange, t }) {
  const current = value && typeof value === "object" ? value : { items: {} };

  const setCell = (code, val) => {
    onChange({
      items: {
        ...(current.items || {}),
        [code]: { result: val },
      },
    });
  };

  const inferChoices = (r) => {
    if (Array.isArray(r?.choices) && r.choices.length) return r.choices;
    // fallback بسيط: إذا الـ ref يحتوي Negative/Positive اعتبرها choices
    const ref = (r?.ref || "").toLowerCase();
    const hasNeg = ref.includes("negative");
    const hasPos = ref.includes("positive");
    if (hasNeg || hasPos) return ["Negative", "Positive"];
    return null;
  };

  return (
    <div>
      {rows.length === 0 ? (
        <EmptyNote text={t("NoItemsInPanel")} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr 2fr",
            gap: 8,
          }}
        >
          <HeaderCell>{t("Name")}</HeaderCell>
          <HeaderCell>{t("Result")}</HeaderCell>
          <HeaderCell>{t("RefUnit")}</HeaderCell>

          {rows
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((r, idx) => {
              const cellVal = current.items?.[r.code]?.result ?? "";
              const choices = inferChoices(r);

              return (
                <RowFragment key={`${r.code}-${idx}`}>
                  <Cell>{r.name_en || r.code}</Cell>
                  <Cell>
                    {Array.isArray(choices) ? (
                      // <Select
                      //   style={{ width: "100%" }}
                      //   value={cellVal || undefined}
                      //   onChange={(v) => setCell(r.code, v)}
                      //   allowClear
                      //   options={choices.map((c) => ({ value: c, label: c }))}
                      //   placeholder="Select"
                      // />
                      <WritableSelect
                        style={{ width: "100%" }}
                        value={cellVal || undefined}
                        onChange={(v) => setCell(r.code, v)}
                        allowClear
                        options={choices.map((c) => ({ value: c, label: c }))}
                        placeholder={t("SelectOrWrite")}
                      />
                    ) : (
                      <Input
                        value={cellVal}
                        onChange={(e) => setCell(r.code, e.target.value)}
                        placeholder={t("Result")}
                      />
                    )}
                  </Cell>
                  <Cell dim>
                    <Popover content={formatRefText(r.ref)}>
                      {formatRefText(r.ref)} {r.unit ? ` ${r.unit}` : ""}
                    </Popover>
                  </Cell>
                </RowFragment>
              );
            })}
        </div>
      )}
    </div>
  );
}

/* ---------------------- Composite ---------------------- */
function CompositeEditor({ sections, value, onChange, t }) {
  // value: { sections: { [sectionCode]: { [fieldCode]: any } } }
  const current = value && typeof value === "object" ? value : { sections: {} };

  const setField = (sCode, fCode, val) => {
    onChange({
      sections: {
        ...(current.sections || {}),
        [sCode]: {
          ...(current.sections?.[sCode] || {}),
          [fCode]: val,
        },
      },
    });
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {sections.length === 0 ? (
        <EmptyNote text={t("NoSectionsDefined")} />
      ) : (
        sections
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((sec, sIdx) => (
            <div
              key={`${sec.code}-${sIdx}`}
              style={{
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 8,
                // marginBottom: 12,
                background:
                  "linear-gradient(135deg, rgba(163,67,201,0.08), rgba(67,170,201,0.08))",
              }}
            >
              <Text strong>
                {sec.name_en} {sec.name_ar ? ` / ${sec.name_ar}` : ""}{" "}
                <Tag style={{ marginInlineStart: 6 }}>{sec.code}</Tag>
              </Text>
              <Divider style={{ margin: "8px 0 12px" }} />

              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {(sec.fields || [])
                  .slice()
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((f, fIdx) => {
                    const fieldVal =
                      current.sections?.[sec.code]?.[f.code] ?? "";

                    if (f.type === "choice") {
                      const choices = Array.isArray(f.choices) ? f.choices : [];
                      return (
                        <Space
                          key={`${sec.code}-${f.code}-${fIdx}`}
                          align="baseline"
                          wrap
                          style={{ width: "100%" }}
                        >
                          <Text style={{ width: 220 }}>
                            {f.label_en} {f.label_ar ? ` / ${f.label_ar}` : ""}
                          </Text>
                          {/* <Select
                            style={{ minWidth: 220 }}
                            value={fieldVal || undefined}
                            onChange={(v) => setField(sec.code, f.code, v)}
                            allowClear
                            options={choices.map((c) => ({
                              value: c,
                              label: c,
                            }))}
                          /> */}
                          <WritableSelect
                            style={{ minWidth: 220 }}
                            value={fieldVal || ""}
                            onChange={(v) => setField(sec.code, f.code, v)}
                            options={Array.isArray(f.choices) ? f.choices : []}
                          />
                        </Space>
                      );
                    }

                    if (f.type === "presence") {
                      const opts = f.choices || ["Present", "Absent"];
                      return (
                        <Space
                          key={`${sec.code}-${f.code}-${fIdx}`}
                          align="baseline"
                          wrap
                          style={{ width: "100%" }}
                        >
                          <Text style={{ width: 220 }}>
                            {f.label_en} {f.label_ar ? ` / ${f.label_ar}` : ""}
                          </Text>
                          {/* <Select
                            style={{ minWidth: 220 }}
                            value={fieldVal || undefined}
                            onChange={(v) => setField(sec.code, f.code, v)}
                            allowClear
                            options={opts.map((c) => ({
                              value: c,
                              label: c,
                            }))}
                          /> */}
                          <WritableSelect
                            style={{ minWidth: 220 }}
                            value={fieldVal || ""}
                            onChange={(v) => setField(sec.code, f.code, v)}
                            options={
                              Array.isArray(f.choices) && f.choices.length
                                ? f.choices
                                : ["Present", "Absent"]
                            }
                          />
                        </Space>
                      );
                    }

                    // default: text
                    return (
                      <Space
                        key={`${sec.code}-${f.code}-${fIdx}`}
                        align="baseline"
                        wrap
                        style={{ width: "100%" }}
                      >
                        <Text style={{ width: 220 }}>
                          {f.label_en} {f.label_ar ? ` / ${f.label_ar}` : ""}
                        </Text>
                        <Input
                          style={{ minWidth: 220 }}
                          value={fieldVal}
                          onChange={(e) =>
                            setField(sec.code, f.code, e.target.value)
                          }
                          placeholder={t("EnterValue")}
                        />
                      </Space>
                    );
                  })}
              </Space>
            </div>
          ))
      )}
    </div>
  );
}

/* tiny helper: single-value, writable select with suggestions */
function WritableSelect({ value, options = [], onChange, placeholder = "Select or write result", ...props }) {
  const opts = (options || []).map((c) =>
    typeof c === "string" ? { value: c, label: c } : c
  );
  return (
    <AutoComplete
      value={value ?? ""}
      options={opts}
      placeholder={placeholder}
      onChange={(val) => onChange?.(val)}
      filterOption={(input, option) =>
        (option?.value || "")
          .toString()
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      allowClear
      {...props}
    />
  );
}

/* ---------------------- UI helpers ---------------------- */
function HeaderCell({ children }) {
  return <div style={{ fontWeight: 600, color: "#555" }}>{children}</div>;
}
function RowFragment({ children }) {
  return <>{children}</>;
}
function Cell({ children, mono = false, dim = false }) {
  return (
    <div
      style={{
        padding: "6px 4px",
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : undefined,
        color: dim ? "#777" : undefined,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={typeof children === "string" ? children : undefined}
    >
      {children}
    </div>
  );
}
function EmptyNote({ text = "Nothing to show." }) {
  return (
    <div
      style={{
        padding: 12,
        background:
          "linear-gradient(135deg, rgba(163,67,201,0.06), rgba(67,170,201,0.06))",
        border: "1px dashed #ddd",
        borderRadius: 8,
        color: "#666",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

/* ---------------------- logic helpers ---------------------- */
function safeParse(val) {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  if (typeof val === "object") return val;
  return null;
}

function normalizeInitialResult(test) {
  // لو موجود result_json من الداتا رجعه كما هو
  if (test?.result_json && typeof test.result_json === "object") {
    return test.result_json;
  }
  // تهيئة أولية لكل نوع
  if (test?.type === "single") {
    return { result: "" };
  }
  if (test?.type === "panel") {
    const meta = safeParse(test?.meta_json);
    const items = {};
    (meta?.items || []).forEach((it) => {
      items[it.code] = { result: "" };
    });
    return { items };
  }
  if (test?.type === "composite") {
    const meta = safeParse(test?.meta_json);
    const sections = {};
    (meta?.sections || []).forEach((sec) => {
      const fvals = {};
      (sec.fields || []).forEach((f) => {
        fvals[f.code] = "";
      });
      sections[sec.code] = fvals;
    });
    return { sections };
  }
  return {};
}

function compactRef(ref) {
  if (!ref) return "";
  const s = String(ref).trim();
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}
