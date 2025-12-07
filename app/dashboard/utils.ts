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

export const POSITION_ORDER = [
  "Pielęgniarka / Pielęgniarz",
  "Opiekun Medyczny",
  "Sanitariusz",
  "Salowa"
];

export type DayCell = {
  dayNumber: number;
  weekday: number;
  label: string;
  tone: string;
  isSaturday: boolean;
  isSundayOrHoliday: boolean;
  isCustomHoliday: boolean;
};

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

export type SimpleEmployee = { id: string; firstName: string; lastName: string; position: string; employmentRate?: string };

export function sortEmployees(employees: SimpleEmployee[]): SimpleEmployee[] {
  const positionRank = (position: string) => {
    const idx = POSITION_ORDER.findIndex((name) => name === position);
    return idx === -1 ? POSITION_ORDER.length : idx;
  };

  return [...employees].sort((a, b) => {
    const positionDiff = positionRank(a.position) - positionRank(b.position);
    if (positionDiff !== 0) return positionDiff;

    const lastNameDiff = a.lastName.localeCompare(b.lastName, "pl");
    if (lastNameDiff !== 0) return lastNameDiff;

    return a.firstName.localeCompare(b.firstName, "pl");
  });
}

export function groupEmployeesByPosition(employees: SimpleEmployee[]) {
  const sorted = sortEmployees(employees);
  const groups: { position: string; items: SimpleEmployee[] }[] = [];

  sorted.forEach((employee) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.position === employee.position) {
      lastGroup.items.push(employee);
      return;
    }

    groups.push({ position: employee.position, items: [employee] });
  });

  return groups;
}

export function getPositionTheme(position: string) {
  const normalized = position.toLowerCase();

  if (normalized.includes("pielęgniarka")) {
    return {
      containerBg: "bg-sky-900/40",
      containerBorder: "border-sky-200/40",
      labelText: "text-sky-50",
      labelPill: "bg-sky-300/20 text-sky-100",
      accentDot: "bg-sky-200",
      accentBorder: "border-l-4 border-l-sky-300/80",
      rowBg: "bg-sky-950/50",
      rowBorder: "border-sky-200/30"
    };
  }

  if (normalized.includes("opiekun")) {
    return {
      containerBg: "bg-violet-900/40",
      containerBorder: "border-violet-200/40",
      labelText: "text-violet-50",
      labelPill: "bg-violet-300/20 text-violet-100",
      accentDot: "bg-violet-200",
      accentBorder: "border-l-4 border-l-violet-200/70",
      rowBg: "bg-violet-950/50",
      rowBorder: "border-violet-200/30"
    };
  }

  if (normalized.includes("sanitariusz")) {
    return {
      containerBg: "bg-gradient-to-r from-rose-950 via-red-950 to-slate-950",
      containerBorder: "border-red-500/50",
      labelText: "text-red-50",
      labelPill: "bg-red-700/30 text-red-50",
      accentDot: "bg-red-300",
      accentBorder: "border-l-4 border-l-red-400/80",
      rowBg: "bg-gradient-to-r from-rose-950/80 via-red-950/60 to-slate-950/80",
      rowBorder: "border-red-500/40"
    };
  }

  if (normalized.includes("salowa")) {
    return {
      containerBg: "bg-orange-900/30",
      containerBorder: "border-orange-200/40",
      labelText: "text-orange-50",
      labelPill: "bg-orange-300/20 text-orange-100",
      accentDot: "bg-orange-200",
      accentBorder: "border-l-4 border-l-orange-200/70",
      rowBg: "bg-orange-950/40",
      rowBorder: "border-orange-200/30"
    };
  }

  return {
    containerBg: "bg-slate-900/40",
    containerBorder: "border-slate-300/30",
    labelText: "text-slate-100",
    labelPill: "bg-slate-200/20 text-slate-50",
    accentDot: "bg-slate-100",
    accentBorder: "border-l-4 border-l-slate-200/70",
    rowBg: "bg-slate-950/50",
    rowBorder: "border-slate-200/30"
  };
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
