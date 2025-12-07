export const POLISH_HOLIDAYS = new Set([
  "01-01",
  "01-06",
  "05-01",
  "05-03",
  "08-15",
  "11-01",
  "11-11",
  "12-25",
  "12-26"
]);

export type DayCell = {
  dayNumber: number;
  weekday: number;
  label: string;
  tone: string;
  isSaturday: boolean;
  isSundayOrHoliday: boolean;
  isCustomHoliday: boolean;
};

export type WardSide = "" | "o" | "r";

export type ParsedShift = {
  baseLabel: string;
  wardSide: WardSide;
  coordinator: boolean;
};

export const POSITIONS = [
  "Pielęgniarka / Pielęgniarz",
  "Opiekun Medyczny",
  "Sanitariusz",
  "Salowa"
] as const;

const WEEKDAYS = [
  "Niedziela",
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota"
];

export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

export function buildDays(date: Date, customHolidaySet: Set<number> = new Set()): DayCell[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const total = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: total }, (_, index) => {
    const dayNumber = index + 1;
    const current = new Date(year, month, dayNumber);
    const weekday = current.getDay();
    const monthKey = `${`${month + 1}`.padStart(2, "0")}-${`${dayNumber}`.padStart(2, "0")}`;
    const isSundayOrHoliday = weekday === 0 || POLISH_HOLIDAYS.has(monthKey);
    const isSaturday = weekday === 6;
    const isCustomHoliday = customHolidaySet.has(dayNumber);

    let tone = "bg-sky-50 text-slate-900 border-sky-100";
    if (isSaturday) {
      tone = "bg-emerald-100 text-emerald-900 border-emerald-200";
    }
    if (isSundayOrHoliday || isCustomHoliday) {
      tone = "bg-red-100 text-red-900 border-red-200";
    }

    return {
      dayNumber,
      weekday,
      label: WEEKDAYS[weekday],
      tone,
      isSaturday,
      isSundayOrHoliday,
      isCustomHoliday
    };
  });
}

export function mergeEntriesWithEmployees(
  entries: Record<string, { shifts: Record<number, string>; fullName: string; position: string }> = {},
  employees: { id: string; firstName: string; lastName: string; position: string }[]
) {
  const combined: typeof entries = {};

  employees.forEach((employee) => {
    const key = employee.id;
    const existing = entries[key] || { shifts: {} };
    combined[key] = {
      shifts: existing.shifts || {},
      fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      position: employee.position || ""
    };
  });

  return combined;
}

export function getDayCellClasses(day: DayCell, isEditable = false): string {
  const padding = isEditable ? "px-1.5 py-1" : "px-2 py-2";

  if (day.isSundayOrHoliday || day.isCustomHoliday) {
    return `${padding} bg-rose-900/40 text-rose-50 border border-rose-500/30`;
  }

  if (day.isSaturday) {
    return `${padding} bg-amber-900/30 text-amber-50 border border-amber-400/30`;
  }

  return `${padding} bg-slate-900/40 text-sky-50 border border-sky-200/20`;
}

export function deriveShiftTone(value: string): string {
  if (!value) return "bg-slate-900/50 text-sky-100/70";
  if (value.startsWith("N")) return "bg-sky-300/90 text-slate-950";
  if (value.startsWith("D")) return "bg-amber-300/90 text-slate-950";
  if (value.startsWith("1")) return "bg-emerald-200/90 text-emerald-950";
  if (/^\d/.test(value) || value.includes(":")) return "bg-amber-200/90 text-slate-950";
  return "bg-slate-200/90 text-slate-900";
}

export function parseShiftValue(value: string): ParsedShift {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  let wardSide: WardSide = "";
  let coordinator = false;
  const labelParts: string[] = [];

  parts.forEach((part) => {
    const lower = part.toLowerCase();
    if (lower === "o") {
      wardSide = "o";
      return;
    }
    if (lower === "r") {
      wardSide = "r";
      return;
    }
    if (lower === "k") {
      coordinator = true;
      return;
    }
    labelParts.push(part);
  });

  return {
    baseLabel: labelParts.join(" "),
    wardSide,
    coordinator
  };
}

export function sortEmployeesByPosition<
  T extends { id: string; firstName: string; lastName: string; position: string }
>(employees: T[]): T[] {
  const order = new Map<string, number>(POSITIONS.map((pos, index) => [pos, index]));

  return [...employees].sort((a, b) => {
    const orderA = order.has(a.position) ? order.get(a.position)! : POSITIONS.length + 1;
    const orderB = order.has(b.position) ? order.get(b.position)! : POSITIONS.length + 1;

    if (orderA !== orderB) return orderA - orderB;

    const lastCmp = a.lastName.localeCompare(b.lastName, "pl", { sensitivity: "base" });
    if (lastCmp !== 0) return lastCmp;
    return a.firstName.localeCompare(b.firstName, "pl", { sensitivity: "base" });
  });
}
