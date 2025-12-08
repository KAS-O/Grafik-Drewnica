import { POLISH_HOLIDAYS } from "../utils";

export type BaseRole =
  | "PIELEGNIARKA"
  | "SANITARIUSZ"
  | "SALOWA"
  | "OPIEKUN"
  | "MAGAZYNIER"
  | "SEKRETARKA"
  | "TERAPEUTA";

export type ExtraRole = "ODDZIALOWA" | "ZABIEGOWA" | "NONE";

export type FteType = "1_etat_12h" | "1_etat_8h" | "0_5_etatu" | "0_75_etatu";

export type GeneratorEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  baseRole: BaseRole;
  extraRole?: ExtraRole;
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

export type DayType = "WEEKDAY" | "WEEKEND" | "HOLIDAY";
export type ShiftType = "DAY" | "NIGHT";

export type WarningCode =
  | "MISSING_ROLE"
  | "INSUFFICIENT_STAFF"
  | "MISSING_HEAD_NURSE"
  | "HOURS_UNDER_NORM"
  | "HOURS_OVER_NORM"
  | "REST_VIOLATION_DAILY"
  | "REST_VIOLATION_WEEKLY";

export type WarningEntry = {
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  dayType: DayType;
  code: WarningCode;
  employees: string[];
  description: string;
};

export type ScheduleResult = {
  schedule: Record<string, Record<number, string>>;
  headNurseByDay: Record<number, string | null>;
  hoursSummary: Record<
    string,
    {
      targetHours: number;
      workedHours: number;
      difference: number;
    }
  >;
  warnings: WarningEntry[];
};

type StaffRequirement = {
  headNurse: number;
  zabiegowa: number;
  nurses: { min: number; max?: number; regularOnly?: boolean };
  sanitariusz: number;
  salowa: number;
  opiekun: { min: number; max: number };
  supportAtNight?: number; // sanitariusz OR salowa OR opiekun
};

export type StaffRequirements = Record<
  DayType,
  {
    DAY: StaffRequirement;
    NIGHT: StaffRequirement;
  }
>;

const DEFAULT_STAFF_REQUIREMENTS: StaffRequirements = {
  WEEKDAY: {
    DAY: {
      headNurse: 1,
      zabiegowa: 1,
      nurses: { min: 2, regularOnly: true },
      sanitariusz: 1,
      salowa: 2,
      opiekun: { min: 0, max: 1 },
      supportAtNight: 0
    },
    NIGHT: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2 },
      sanitariusz: 0,
      salowa: 0,
      opiekun: { min: 0, max: 1 },
      supportAtNight: 1
    }
  },
  WEEKEND: {
    DAY: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2, max: 3 },
      sanitariusz: 1,
      salowa: 2,
      opiekun: { min: 0, max: 1 },
      supportAtNight: 0
    },
    NIGHT: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2 },
      sanitariusz: 0,
      salowa: 0,
      opiekun: { min: 0, max: 1 },
      supportAtNight: 1
    }
  },
  HOLIDAY: {
    DAY: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2, max: 3 },
      sanitariusz: 1,
      salowa: 2,
      opiekun: { min: 0, max: 1 },
      supportAtNight: 0
    },
    NIGHT: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2 },
      sanitariusz: 0,
      salowa: 0,
      opiekun: { min: 0, max: 1 },
      supportAtNight: 1
    }
  }
};

const DEFAULT_CONFIG = {
  minRestHoursDaily: 11,
  minRestHoursWeekly: 35,
  maxDailyHours: 13,
  minShiftLength: 6,
  baseWorkingDayHours: 8,
  staffRequirements: DEFAULT_STAFF_REQUIREMENTS,
  holidays: POLISH_HOLIDAYS
};

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

function getDayType(year: number, monthIndex: number, day: number, holidays: Set<string>): DayType {
  const current = new Date(year, monthIndex, day);
  const weekday = current.getDay();
  const key = `${`${monthIndex + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
  if (holidays.has(key)) return "HOLIDAY";
  if (weekday === 0 || weekday === 6) return "WEEKEND";
  return "WEEKDAY";
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

function formatDate(year: number, monthIndex: number, day: number) {
  const month = `${monthIndex + 1}`.padStart(2, "0");
  const dayStr = `${day}`.padStart(2, "0");
  return `${year}-${month}-${dayStr}`;
}

function isEightHourWorker(employee: GeneratorEmployee) {
  if (employee.extraRole === "ODDZIALOWA" || employee.extraRole === "ZABIEGOWA") return true;
  if (employee.fteType === "1_etat_8h") return true;
  if (employee.baseRole === "SEKRETARKA" || employee.baseRole === "TERAPEUTA" || employee.baseRole === "MAGAZYNIER") {
    return true;
  }
  return false;
}

function workedHoursForEmployee(schedule: Record<string, Record<number, string>>, employeeId: string) {
  const employeeSchedule = schedule[employeeId] || {};
  return Object.values(employeeSchedule).reduce((sum, shift) => sum + getHoursForShift(shift), 0);
}

function selectCandidate(
  candidates: GeneratorEmployee[],
  schedule: Record<string, Record<number, string>>,
  day: number,
  shiftValue: string,
  preferDays: Map<string, Set<number>>,
  dayType: DayType,
  targets: Record<string, number>
) {
  const shuffled = shuffleArray(candidates);
  const prioritized = shuffled.sort((a, b) => {
    const prefersA = preferDays.get(a.id)?.has(day) ? -1 : 0;
    const prefersB = preferDays.get(b.id)?.has(day) ? -1 : 0;
    if (prefersA !== prefersB) return prefersA - prefersB;
    const hoursA = workedHoursForEmployee(schedule, a.id);
    const hoursB = workedHoursForEmployee(schedule, b.id);
    if (hoursA !== hoursB) return hoursA - hoursB;
    return a.lastName.localeCompare(b.lastName, "pl");
  });

  return prioritized.find((candidate) => {
    if (shiftValue === "N" && candidate.canWorkNights === false) return false;
    const employeeSchedule = schedule[candidate.id] || {};
    if (employeeSchedule[day]) return false;
    if (isEightHourWorker(candidate) && dayType !== "WEEKDAY") return false;
    const previousShift = employeeSchedule[day - 1];
    if (hasDailyRestConflict(previousShift, shiftValue)) return false;
    const worked = workedHoursForEmployee(schedule, candidate.id);
    const nextHours = worked + getHoursForShift(shiftValue);
    if (nextHours - targets[candidate.id] > 0.1) return false;
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
  const warnings: WarningEntry[] = [];
  const holidays = mergedConfig.holidays;
  const monthlyNorm = calculateMonthlyNorm(year, monthIndex, holidays);
  const targets = employees.reduce<Record<string, number>>((acc, employee) => {
    acc[employee.id] = getTargetHours(employee.fteType, monthlyNorm);
    return acc;
  }, {});
  const { blockedDays, preferDays } = expandRequests(requests);
  const headNurseByDay: Record<number, string | null> = {};
  const employeeNames = employees.reduce<Record<string, string>>((acc, employee) => {
    acc[employee.id] = `${employee.firstName} ${employee.lastName}`.trim();
    return acc;
  }, {});

  employees.forEach((employee) => {
    schedule[employee.id] = {};
  });

  const eightHourWorkers = employees.filter((employee) => isEightHourWorker(employee));
  const shiftWorkers = employees.filter((employee) => !isEightHourWorker(employee));

  const dayOrder = shuffleArray(Array.from({ length: daysInMonth }, (_, idx) => idx + 1));

  for (const day of dayOrder) {
    const dayType = getDayType(year, monthIndex, day, holidays);
    const isWeekday = dayType === "WEEKDAY";
    const requirement = mergedConfig.staffRequirements[dayType].DAY;

    const dayBlocked = new Set<string>();
    blockedDays.forEach((daysSet, employeeId) => {
      if (daysSet.has(day)) dayBlocked.add(employeeId);
    });

    const assignShift = (employee: GeneratorEmployee, value: string) => {
      schedule[employee.id][day] = value;
    };

    const tryAssign = (employee: GeneratorEmployee, value: string) => {
      if (dayBlocked.has(employee.id)) return false;
      const employeeSchedule = schedule[employee.id];
      if (employeeSchedule[day]) return false;
      if (isEightHourWorker(employee) && !isWeekday) return false;
      const worked = workedHoursForEmployee(schedule, employee.id);
      if (worked + getHoursForShift(value) - targets[employee.id] > 0.1) return false;
      if (hasDailyRestConflict(employeeSchedule[day - 1], value)) return false;
      assignShift(employee, value);
      return true;
    };

    // Head nurse placement with substitution logic
    headNurseByDay[day] = null;
    if (requirement.headNurse > 0) {
      const officialHeads = eightHourWorkers.filter((e) => e.extraRole === "ODDZIALOWA" && !dayBlocked.has(e.id));
      const zabiegowaCandidates = eightHourWorkers.filter((e) => e.extraRole === "ZABIEGOWA" && !dayBlocked.has(e.id));
      const regularNurses = employees.filter(
        (e) => e.baseRole === "PIELEGNIARKA" && (e.extraRole ?? "NONE") === "NONE" && !dayBlocked.has(e.id)
      );

      const tryAssignHead = (candidates: GeneratorEmployee[]) => {
        for (const candidate of shuffleArray(candidates)) {
          if (tryAssign(candidate, "1")) {
            headNurseByDay[day] = candidate.id;
            return true;
          }
        }
        return false;
      };

      const headPlaced = tryAssignHead(officialHeads) || tryAssignHead(zabiegowaCandidates) || tryAssignHead(regularNurses);

      if (!headPlaced) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "MISSING_HEAD_NURSE",
          employees: [],
          description: `${formatDate(year, monthIndex, day)} (dzień): brak możliwości obsadzenia funkcji oddziałowej.`
        });
      }
    }

    // Zabiegowa requirement (can overlap with head nurse)
    if (requirement.zabiegowa > 0) {
      const alreadyZab = Object.entries(schedule).find(([empId, shifts]) => {
        const shiftValue = shifts[day];
        if (!shiftValue || shiftValue === "N") return false;
        return employees.find((e) => e.id === empId && e.extraRole === "ZABIEGOWA");
      });
      let zabCount = alreadyZab ? 1 : 0;
      const zabiegowePool = eightHourWorkers.filter((e) => e.extraRole === "ZABIEGOWA" && !dayBlocked.has(e.id));
      while (zabCount < requirement.zabiegowa) {
        const candidate = selectCandidate(zabiegowePool, schedule, day, "1", preferDays, dayType, targets);
        if (!candidate) break;
        if (schedule[candidate.id]?.[day]) {
          zabCount += 1;
          break;
        }
        assignShift(candidate, "1");
        zabCount += 1;
      }
      if (zabCount < requirement.zabiegowa) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "MISSING_ROLE",
          employees: [],
          description: `${formatDate(year, monthIndex, day)} (dzień): brak osoby w roli Zabiegowa (brakuje ${requirement.zabiegowa - zabCount}).`
        });
      }
    }

    // Remaining 8h weekday staff
    if (isWeekday) {
      const poolEight = shuffleArray(
        eightHourWorkers.filter((employee) => !dayBlocked.has(employee.id) && !schedule[employee.id][day])
      );
      poolEight.forEach((employee) => {
        const worked = workedHoursForEmployee(schedule, employee.id);
        if (worked + 8 - targets[employee.id] > 0.1) return;
        tryAssign(employee, "1");
      });
    }

    // Day shift staffing (12h roles)
    const pool = shiftWorkers.filter((employee) => !dayBlocked.has(employee.id));

    const fillRole = (baseRole: BaseRole, needed: number, max?: number, regularOnly?: boolean) => {
      let assigned = 0;
      const candidates = pool.filter((e) => e.baseRole === baseRole && (!regularOnly || (e.extraRole ?? "NONE") === "NONE"));
      while (assigned < needed) {
        const candidate = selectCandidate(candidates, schedule, day, "D", preferDays, dayType, targets);
        if (!candidate) break;
        if (schedule[candidate.id]?.[day]) {
          assigned += 1;
          break;
        }
        assignShift(candidate, "D");
        assigned += 1;
      }
      if (assigned < needed) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "MISSING_ROLE",
          employees: candidates.map((c) => employeeNames[c.id]),
          description: `${formatDate(year, monthIndex, day)} (dzień): brak wymaganej obsady dla roli ${baseRole.toLowerCase()} (brakuje ${needed - assigned}).`
        });
      }
      if (typeof max === "number" && assigned > max) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "INSUFFICIENT_STAFF",
          employees: candidates.map((c) => employeeNames[c.id]),
          description: `${formatDate(year, monthIndex, day)} (dzień): przekroczono maksymalną liczbę dla roli ${baseRole.toLowerCase()}.`
        });
      }
    };

    fillRole("SANITARIUSZ", requirement.sanitariusz);
    fillRole("SALOWA", requirement.salowa);
    fillRole("PIELEGNIARKA", requirement.nurses.min, requirement.nurses.max, requirement.nurses.regularOnly);
    fillRole("OPIEKUN", requirement.opiekun.min, requirement.opiekun.max);

    // Night shift staffing
    const nightRequirement = mergedConfig.staffRequirements[dayType].NIGHT;
    const nightPool = pool.filter((employee) => employee.canWorkNights !== false && !schedule[employee.id][day]);

    const assignNightRole = (predicate: (emp: GeneratorEmployee) => boolean, needed: number, label: string) => {
      let assigned = 0;
      const candidates = nightPool.filter(predicate);
      while (assigned < needed) {
        const candidate = selectCandidate(candidates, schedule, day, "N", preferDays, dayType, targets);
        if (!candidate) break;
        assignShift(candidate, "N");
        assigned += 1;
      }
      if (assigned < needed) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "NIGHT",
          dayType,
          code: "MISSING_ROLE",
          employees: candidates.map((c) => employeeNames[c.id]),
          description: `${formatDate(year, monthIndex, day)} (noc): brak wymaganej obsady dla roli ${label} (brakuje ${needed - assigned}).`
        });
      }
    };

    assignNightRole((emp) => emp.baseRole === "PIELEGNIARKA", nightRequirement.nurses.min, "pielęgniarka");
    const supportNeeded = nightRequirement.supportAtNight ?? 0;
    if (supportNeeded > 0) {
      assignNightRole(
        (emp) => emp.baseRole === "SANITARIUSZ" || emp.baseRole === "SALOWA" || emp.baseRole === "OPIEKUN",
        supportNeeded,
        "sanitariusz/salowa/opiekun"
      );
    }
  }

  // Short shifts to close gaps
  employees.forEach((employee) => {
    const target = targets[employee.id];
    const employeeSchedule = schedule[employee.id];
    const workedHours = workedHoursForEmployee(schedule, employee.id);
    const deficit = target - workedHours;
    if (deficit >= mergedConfig.minShiftLength) {
      const dayCandidates = shuffleArray(Array.from({ length: daysInMonth }, (_, idx) => idx + 1));
      for (const day of dayCandidates) {
        if (employeeSchedule[day]) continue;
        const dayType = getDayType(year, monthIndex, day, holidays);
        if (isEightHourWorker(employee) && dayType !== "WEEKDAY") continue;
        if (blockedDays.get(employee.id)?.has(day)) continue;
        const prevShift = employeeSchedule[day - 1];
        if (hasDailyRestConflict(prevShift, `${mergedConfig.minShiftLength}`)) continue;
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
    const workedHours = workedHoursForEmployee(schedule, employee.id);
    const diff = Math.round((workedHours - targets[employee.id]) * 100) / 100;
    hoursSummary[employee.id] = {
      targetHours: targets[employee.id],
      workedHours: Math.round(workedHours * 100) / 100,
      difference: diff
    };

    if (diff < 0) {
      warnings.push({
        date: "",
        shift: "DAY",
        dayType: "WEEKDAY",
        code: "HOURS_UNDER_NORM",
        employees: [employeeNames[employee.id]],
        description: `Pracownik ${employeeNames[employee.id]} ma niedobór godzin względem normy (${Math.abs(diff)}h).`
      });
    }

    if (!ensureWeeklyRest(employeeSchedule, daysInMonth)) {
      warnings.push({
        date: "",
        shift: "DAY",
        dayType: "WEEKDAY",
        code: "REST_VIOLATION_WEEKLY",
        employees: [employeeNames[employee.id]],
        description: `Pracownik ${employeeNames[employee.id]} nie ma zapewnionego 35h odpoczynku w każdym tygodniu.`
      });
    }
  });

  // Staffing validation per day
  for (let day = 1; day <= daysInMonth; day++) {
    const dayType = getDayType(year, monthIndex, day, holidays);
    const requirement = mergedConfig.staffRequirements[dayType].DAY;
    const nightRequirement = mergedConfig.staffRequirements[dayType].NIGHT;
    const counters = {
      pielegniarka: 0,
      pielegniarkaRegular: 0,
      zabiegowa: 0,
      sanitariusz: 0,
      salowa: 0,
      opiekun: 0,
      supportNight: 0,
      nursesNight: 0
    };

    const headForDay: string | null = headNurseByDay[day] ?? null;

    employees.forEach((employee) => {
      const shift = schedule[employee.id]?.[day];
      if (!shift) return;
      const isNight = shift === "N";
      const isDaytime = shift !== "N";

      if (isDaytime) {
        if (employee.extraRole === "ZABIEGOWA") counters.zabiegowa += 1;
        if (employee.baseRole === "PIELEGNIARKA") counters.pielegniarka += 1;
        if (employee.baseRole === "PIELEGNIARKA" && (employee.extraRole ?? "NONE") === "NONE") {
          counters.pielegniarkaRegular += 1;
        }
        if (employee.baseRole === "SANITARIUSZ") counters.sanitariusz += 1;
        if (employee.baseRole === "SALOWA") counters.salowa += 1;
        if (employee.baseRole === "OPIEKUN") counters.opiekun += 1;
      }

      if (isNight) {
        if (employee.baseRole === "PIELEGNIARKA") counters.nursesNight += 1;
        if (employee.baseRole === "SANITARIUSZ" || employee.baseRole === "SALOWA" || employee.baseRole === "OPIEKUN") {
          counters.supportNight += 1;
        }
      }
    });

    if (requirement.headNurse > 0 && !headForDay) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "MISSING_HEAD_NURSE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (dzień): brak osoby pełniącej funkcję oddziałowej.`
      });
    }

    if (requirement.zabiegowa > 0 && counters.zabiegowa < requirement.zabiegowa) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (dzień): brak osoby w funkcji zabiegowej (brakuje ${requirement.zabiegowa - counters.zabiegowa}).`
      });
    }

    if (requirement.nurses.regularOnly) {
      if (counters.pielegniarkaRegular < requirement.nurses.min) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "MISSING_ROLE",
          employees: [],
          description: `${formatDate(year, monthIndex, day)} (dzień): za mało pielęgniarek bez funkcji (${counters.pielegniarkaRegular}/${requirement.nurses.min}).`
        });
      }
    } else {
      if (counters.pielegniarka < requirement.nurses.min) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "MISSING_ROLE",
          employees: [],
          description: `${formatDate(year, monthIndex, day)} (dzień): za mało pielęgniarek (${counters.pielegniarka}/${requirement.nurses.min}).`
        });
      }
      if (requirement.nurses.max && counters.pielegniarka > requirement.nurses.max) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "INSUFFICIENT_STAFF",
          employees: [],
          description: `${formatDate(year, monthIndex, day)} (dzień): przekroczono maksymalną liczbę pielęgniarek (${counters.pielegniarka}/${requirement.nurses.max}).`
        });
      }
    }

    if (counters.sanitariusz < requirement.sanitariusz) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (dzień): brak sanitariusza (brakuje ${requirement.sanitariusz - counters.sanitariusz}).`
      });
    }
    if (counters.salowa < requirement.salowa) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (dzień): brak salowych (brakuje ${requirement.salowa - counters.salowa}).`
      });
    }
    if (counters.opiekun < requirement.opiekun.min || counters.opiekun > requirement.opiekun.max) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (dzień): liczba opiekunów poza zakresem (${counters.opiekun}, dozwolone ${requirement.opiekun.min}-${requirement.opiekun.max}).`
      });
    }

    if (nightRequirement.nurses.min > 0 && counters.nursesNight < nightRequirement.nurses.min) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "NIGHT",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (noc): za mało pielęgniarek (${counters.nursesNight}/${nightRequirement.nurses.min}).`
      });
    }
    const supportNeeded = nightRequirement.supportAtNight ?? 0;
    if (supportNeeded > 0 && counters.supportNight < supportNeeded) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "NIGHT",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (noc): brak wymaganej osoby z grupy sanitariusz/salowa/opiekun (${counters.supportNight}/${supportNeeded}).`
      });
    }
  }

  return { schedule, headNurseByDay, hoursSummary, warnings };
}
