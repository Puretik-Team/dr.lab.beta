import dayjs from "dayjs";

// Patients store a birth date; age is entered/shown as years, or — for
// babies under one year — months, or days under one month.
export function splitAge(birth) {
  if (!birth) return { value: null, unit: "year" };
  const b = dayjs(birth);
  if (!b.isValid()) return { value: null, unit: "year" };
  const years = dayjs().diff(b, "year");
  if (years >= 1) return { value: years, unit: "year" };
  const months = dayjs().diff(b, "month");
  if (months >= 1) return { value: months, unit: "month" };
  return { value: Math.max(0, dayjs().diff(b, "day")), unit: "day" };
}

export function birthFromAge(value, unit) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 0) return null;
  // Whole years keep the app's existing "start of year" convention.
  if (unit === "year") return dayjs().subtract(n, "year").startOf("year");
  return dayjs().subtract(n, unit).startOf("day");
}
