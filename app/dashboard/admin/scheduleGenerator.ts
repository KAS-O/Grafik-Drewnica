import { POLISH_HOLIDAYS } from "../utils";

export type Role =
  | "pielegniarka"
  | "sanitariusz"
  | "salowa"
  | "opiekun"
  | "magazynierka"
  | "sekretarka"
  | "terapeuta_zajeciowy";

export type FteType = "1_etat_12h" | "1_etat_8h" | "0_5_etatu" | "0_75_etatu";

export type GeneratorEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  fteType: FteType;
  canWorkNights?: boolean;
};

export type TimeOffRequest = {
  id: string;
  employeeId: string;
  kind: "vacation" | "unavailable" | "preferDuty";
  startDay: number;
  endDay: number;
};

export type ScheduleResult = {
  schedule: Record<string, Record<number, string>>;
  hoursSummary: Record<
    string,
    {
      targetHours: number;
      workedHours: number;
      difference: number;
    }
  >;
  warnings: string[];
};

export type StaffRequirements = {
  dayShift: {
    pielegniarka: number;
    sanitariusz: number;
    salowa: number;
    opiekun: { min: number; max: number };
    magazynierka: number;
    sekretarka: number;
    terapeuta_zajeciowy: number;
  };
  nightShift: {
    pielegniarka: number;
    sanitariusz: number;
    salowa: number;
    opiekun: { min: number; max: number };
    magazynierka: number;
    sekretarka: number;
    terapeuta_zajeciowy: number;
  };
};

const DEFAULT_CONFIG = {
  minRestHoursDaily: 11,
  minRestHoursWeekly: 35,
  maxDailyHours: 13,
  minShiftLength: 6,
  baseWorkingDayHours: 8,
  staffRequirements: {
    dayShift: {
      pielegniarka: 3,
      sanitariusz: 1,
      salowa: 2,
      opiekun: { min: 0, max: 1 },
      magazynierka: 0,
      sekretarka: 0,
      terapeuta_zajeciowy: 0
    },
    nightShift: {
      pielegniarka: 1,
      sanitariusz: 0,
      salowa: 0,
      opiekun: { min: 0, max: 1 },
      magazynierka: 0,
      sekretarka: 0,
      terapeuta_zajeciowy: 0
    }
  } satisfies StaffRequirements,
  holidays: POLISH_HOLIDAYS
};

function getHoursForShift(value: string): number {
  if (!value) return 0;
  if (value === "D" || value === "N") return 12;
  if (value === "1") return 8;
  if (/^\d{1,2}(:\d{2})?$/.test(value)) {
    const [h, m] = value.split(":");
    const hours = Number.parseInt(h || "0", 10);
    const minutes = m ? Number.parseInt(m, 10) : 0;
    return hours + minutes / 60;
  }
  return 0;
}

function calculateMonthlyNorm(year: number, monthIndex: number, holidays: Set<string>) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const current = new Date(year, monthIndex, day);
    const weekday = current.getDay();
    const key = `${`${monthIndex + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
    const isWeekend = weekday === 0 || weekday === 6;
    const isHoliday = holidays.has(key);
    if (!isWeekend && !isHoliday) {
      workingDays += 1;
    }
  }

  return workingDays * DEFAULT_CONFIG.baseWorkingDayHours;
}

function getTargetHours(fte: FteType, monthlyNorm: number) {
  switch (fte) {
    case "1_etat_12h":
    case "1_etat_8h":
      return monthlyNorm;
    case "0_75_etatu":
      return Math.round(monthlyNorm * 0.75);
    case "0_5_etatu":
      return Math.round(monthlyNorm * 0.5);
    default:
      return monthlyNorm;
  }
}

function hasDailyRestConflict(previousShift: string | undefined, nextShift: string): boolean {
  if (!previousShift) return false;
  if (previousShift === "N" && nextShift !== "N") {
    return true;
  }
  return false;
}

function ensureWeeklyRest(schedule: Record<number, string>, totalDays: number): boolean {
  for (let start = 1; start <= totalDays - 6; start++) {
    let worked = 0;
    for (let offset = 0; offset < 7; offset++) {
      if (schedule[start + offset]) worked += 1;
    }
    if (worked === 7) return false;
  }
  return true;
}

function isWeekendOrHoliday(year: number, monthIndex: number, day: number, holidays: Set<string>) {
  const current = new Date(year, monthIndex, day);
  const weekday = current.getDay();
  const key = `${`${monthIndex + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
  return weekday === 0 || weekday === 6 || holidays.has(key);
}

function expandRequests(requests: TimeOffRequest[]) {
  const map = new Map<string, Set<number>>();
  const preferMap = new Map<string, Set<number>>();

  requests.forEach((request) => {
    const targetMap = request.kind === "preferDuty" ? preferMap : map;
    const range = targetMap.get(request.employeeId) ?? new Set<number>();
    for (let day = request.startDay; day <= request.endDay; day++) {
      range.add(day);
    }
    targetMap.set(request.employeeId, range);
  });

  return { blockedDays: map, preferDays: preferMap };
}

function selectCandidate(
  candidates: GeneratorEmployee[],
  schedule: Record<string, Record<number, string>>,
  day: number,
  shiftValue: string,
  preferDays: Map<string, Set<number>>
) {
  const sorted = [...candidates].sort((a, b) => {
    const hoursA = Object.values(schedule[a.id] || {}).reduce((sum, shift) => sum + getHoursForShift(shift), 0);
    const hoursB = Object.values(schedule[b.id] || {}).reduce((sum, shift) => sum + getHoursForShift(shift), 0);
    const prefersA = preferDays.get(a.id)?.has(day) ? -1 : 0;
    const prefersB = preferDays.get(b.id)?.has(day) ? -1 : 0;
    if (prefersA !== prefersB) return prefersA - prefersB;
    if (hoursA !== hoursB) return hoursA - hoursB;
    return a.lastName.localeCompare(b.lastName, "pl");
  });

  return sorted.find((candidate) => {
    const employeeSchedule = schedule[candidate.id] || {};
    const previousShift = employeeSchedule[day - 1];
    if (hasDailyRestConflict(previousShift, shiftValue)) return false;
    if (shiftValue !== "N" && employeeSchedule[day] === "N") return false;
    return true;
  });
}

export function generateSchedule(
  employees: GeneratorEmployee[],
  year: number,
  monthIndex: number,
  requests: TimeOffRequest[] = [],
  config: Partial<typeof DEFAULT_CONFIG> = {}
): ScheduleResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const schedule: Record<string, Record<number, string>> = {};
  const warnings: string[] = [];
  const holidays = mergedConfig.holidays;
  const monthlyNorm = calculateMonthlyNorm(year, monthIndex, holidays);
  const targets = employees.reduce<Record<string, number>>((acc, employee) => {
    acc[employee.id] = getTargetHours(employee.fteType, monthlyNorm);
    return acc;
  }, {});
  const { blockedDays, preferDays } = expandRequests(requests);

  employees.forEach((employee) => {
    schedule[employee.id] = {};
  });

  const eightHourWorkers = employees.filter((employee) => employee.fteType === "1_etat_8h");
  const shiftWorkers = employees.filter((employee) => employee.fteType !== "1_etat_8h");

  for (let day = 1; day <= daysInMonth; day++) {
    const isHolidayOrWeekend = isWeekendOrHoliday(year, monthIndex, day, holidays);

    const dayBlocked = new Set<string>();
    blockedDays.forEach((daysSet, employeeId) => {
      if (daysSet.has(day)) dayBlocked.add(employeeId);
    });

    // 8h workers work only in business days
    if (!isHolidayOrWeekend) {
      eightHourWorkers.forEach((employee) => {
        if (dayBlocked.has(employee.id)) return;
        const employeeSchedule = schedule[employee.id];
        const currentHours = Object.values(employeeSchedule).reduce(
          (sum, value) => sum + getHoursForShift(value),
          0
        );
        if (currentHours + 8 > targets[employee.id] + 4) return;
        const prevShift = employeeSchedule[day - 1];
        if (hasDailyRestConflict(prevShift, "1")) return;
        employeeSchedule[day] = "1";
      });
    }

    // Day shift staffing
    const requirement = mergedConfig.staffRequirements.dayShift;
    const pool = shiftWorkers.filter((employee) => !dayBlocked.has(employee.id));

    const roleGroups: Record<Role, GeneratorEmployee[]> = {
      pielegniarka: pool.filter((e) => e.role === "pielegniarka"),
      sanitariusz: pool.filter((e) => e.role === "sanitariusz"),
      salowa: pool.filter((e) => e.role === "salowa"),
      opiekun: pool.filter((e) => e.role === "opiekun"),
      magazynierka: pool.filter((e) => e.role === "magazynierka"),
      sekretarka: pool.filter((e) => e.role === "sekretarka"),
      terapeuta_zajeciowy: pool.filter((e) => e.role === "terapeuta_zajeciowy")
    };

    const dayAssignments: GeneratorEmployee[] = [];

    const fillRole = (role: Role, needed: number, max?: number) => {
      let assigned = 0;
      while (assigned < needed) {
        const candidate = selectCandidate(roleGroups[role], schedule, day, "D", preferDays);
        if (!candidate) break;
        schedule[candidate.id][day] = "D";
        dayAssignments.push(candidate);
        const index = roleGroups[role].findIndex((e) => e.id === candidate.id);
        if (index !== -1) roleGroups[role].splice(index, 1);
        assigned += 1;
      }
      if (assigned < needed) {
        warnings.push(
          `Dzień ${day}: brak wymaganej obsady na dzień dla roli ${role} (brakuje ${needed - assigned}).`
        );
      }
      if (typeof max === "number") {
        while (assigned > max) {
          const removed = dayAssignments.findIndex((emp) => emp.role === role);
          if (removed === -1) break;
          delete schedule[dayAssignments[removed].id][day];
          dayAssignments.splice(removed, 1);
          assigned -= 1;
        }
      }
    };

    fillRole("sanitariusz", requirement.sanitariusz);
    fillRole("salowa", requirement.salowa);
    fillRole("pielegniarka", requirement.pielegniarka);
    fillRole("opiekun", requirement.opiekun.min, requirement.opiekun.max);
    fillRole("magazynierka", requirement.magazynierka);
    fillRole("sekretarka", requirement.sekretarka);
    fillRole("terapeuta_zajeciowy", requirement.terapeuta_zajeciowy);

    // Night shift rotation (optional but helps norm)
    const nightPool = pool.filter((employee) => employee.canWorkNights !== false);
    const nightCandidate = selectCandidate(nightPool, schedule, day, "N", preferDays);
    if (nightCandidate) {
      const hours = Object.values(schedule[nightCandidate.id]).reduce((sum, value) => sum + getHoursForShift(value), 0);
      if (hours + 12 <= targets[nightCandidate.id] + 6) {
        schedule[nightCandidate.id][day] = "N";
      }
    }
  }

  // Short shifts to close gaps
  employees.forEach((employee) => {
    const target = targets[employee.id];
    const employeeSchedule = schedule[employee.id];
    const workedHours = Object.values(employeeSchedule).reduce((sum, value) => sum + getHoursForShift(value), 0);
    const deficit = target - workedHours;
    if (deficit >= mergedConfig.minShiftLength) {
      for (let day = 1; day <= daysInMonth; day++) {
        if (employeeSchedule[day]) continue;
        const isHolidayOrWeekend = isWeekendOrHoliday(year, monthIndex, day, holidays);
        const blocked = blockedDays.get(employee.id)?.has(day);
        if (blocked) continue;
        if (employee.fteType === "1_etat_8h" && isHolidayOrWeekend) continue;
        const length = Math.min(deficit, 11);
        if (length < mergedConfig.minShiftLength) break;
        employeeSchedule[day] = `${length}`;
        break;
      }
    }
  });

  // Build summaries & warnings
  const hoursSummary: ScheduleResult["hoursSummary"] = {};

  employees.forEach((employee) => {
    const employeeSchedule = schedule[employee.id];
    const workedHours = Object.values(employeeSchedule).reduce((sum, value) => sum + getHoursForShift(value), 0);
    hoursSummary[employee.id] = {
      targetHours: targets[employee.id],
      workedHours: Math.round(workedHours * 100) / 100,
      difference: Math.round((workedHours - targets[employee.id]) * 100) / 100
    };

    if (!ensureWeeklyRest(employeeSchedule, daysInMonth)) {
      warnings.push(`Pracownik ${employee.firstName} ${employee.lastName} nie ma 35h odpoczynku w każdym tygodniu.`);
    }
  });

  // Staffing validation
  for (let day = 1; day <= daysInMonth; day++) {
    const counters = {
      pielegniarka: 0,
      sanitariusz: 0,
      salowa: 0,
      opiekun: 0,
      magazynierka: 0,
      sekretarka: 0,
      terapeuta_zajeciowy: 0
    };
    employees.forEach((employee) => {
      const shift = schedule[employee.id]?.[day];
      if (!shift) return;
      if (shift === "D" || /^\d/.test(shift)) {
        counters[employee.role] += 1;
      }
    });

    if (counters.pielegniarka < mergedConfig.staffRequirements.dayShift.pielegniarka) {
      warnings.push(`Dzień ${day}: za mało pielęgniarek na dziennej zmianie.`);
    }
    if (counters.sanitariusz < mergedConfig.staffRequirements.dayShift.sanitariusz) {
      warnings.push(`Dzień ${day}: za mało sanitariuszy na dziennej zmianie.`);
    }
    if (counters.salowa < mergedConfig.staffRequirements.dayShift.salowa) {
      warnings.push(`Dzień ${day}: za mało salowych na dziennej zmianie.`);
    }
    if (
      counters.opiekun < mergedConfig.staffRequirements.dayShift.opiekun.min ||
      counters.opiekun > mergedConfig.staffRequirements.dayShift.opiekun.max
    ) {
      warnings.push(`Dzień ${day}: liczba opiekunów medycznych poza dozwolonym zakresem.`);
    }
    if (counters.magazynierka < mergedConfig.staffRequirements.dayShift.magazynierka) {
      warnings.push(`Dzień ${day}: za mało magazynierek na dziennej zmianie.`);
    }
    if (counters.sekretarka < mergedConfig.staffRequirements.dayShift.sekretarka) {
      warnings.push(`Dzień ${day}: za mało sekretarek na dziennej zmianie.`);
    }
    if (counters.terapeuta_zajeciowy < mergedConfig.staffRequirements.dayShift.terapeuta_zajeciowy) {
      warnings.push(`Dzień ${day}: za mało terapeutów zajęciowych na dziennej zmianie.`);
    }
  }

  return { schedule, hoursSummary, warnings };
}
