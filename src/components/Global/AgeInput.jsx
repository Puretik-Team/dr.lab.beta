import React, { useEffect, useState } from "react";
import { Input, Select } from "antd";
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(72px, 1fr) minmax(104px, 1fr)",
        gap: 8,
        width: "100%",
        minWidth: 190,
      }}
    >
      <style>{`.age-input-number::-webkit-outer-spin-button,.age-input-number::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.age-input-number{-moz-appearance:textfield}`}</style>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => update(e.target.value, unit)}
        placeholder="0"
        aria-label={placeholder}
        className="age-input-number"
        style={{ width: "100%", minWidth: 72 }}
      />
      <Select
        value={unit}
        onChange={(u) => update(value, u)}
        style={{ width: "100%", minWidth: 104 }}
        popupMatchSelectWidth={false}
        options={[
          { value: "year", label: t("AgeYears") },
          { value: "month", label: t("AgeMonths") },
          { value: "day", label: t("AgeDays") },
        ]}
      />
    </div>
  );
}
