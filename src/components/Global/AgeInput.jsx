import React, { useEffect, useState } from "react";
import { Input, Select, Space } from "antd";
import { useTranslation } from "react-i18next";
import { splitAge, birthFromAge } from "../../helper/age";

// Age as a number + unit (years / months / days) so babies under a year can
// be entered. Reads and writes a birth date, like the plain age field did.
export default function AgeInput({ birth, onChange, placeholder }) {
  const { t } = useTranslation();
  const initial = splitAge(birth);
  const [unit, setUnit] = useState(initial.unit);
  const [value, setValue] = useState(initial.value ?? "");

  // Sync when another patient is loaded into the form.
  useEffect(() => {
    const next = splitAge(birth);
    const current = birthFromAge(value, unit);
    if (!birth) {
      if (value !== "" && current) setValue("");
      return;
    }
    if (!current || !current.isSame(birth, "day")) {
      setValue(next.value ?? "");
      setUnit(next.unit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birth ? String(birth) : ""]);

  const update = (v, u) => {
    setValue(v);
    setUnit(u);
    onChange(v === "" ? null : birthFromAge(v, u));
  };

  return (
    <Space.Compact style={{ width: "100%", display: "flex" }}>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => update(e.target.value, unit)}
        placeholder="0"
        aria-label={placeholder}
        style={{ flex: 1, minWidth: 0 }}
      />
      <Select
        value={unit}
        onChange={(u) => update(value, u)}
        style={{ width: 108, flexShrink: 0 }}
        popupMatchSelectWidth={false}
        options={[
          { value: "year", label: t("AgeYears") },
          { value: "month", label: t("AgeMonths") },
          { value: "day", label: t("AgeDays") },
        ]}
      />
    </Space.Compact>
  );
}
