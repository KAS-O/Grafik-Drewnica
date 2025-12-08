import { POLISH_HOLIDAYS } from "../utils";

export type BaseRole =
  | "PIELEGNIARKA"
  | "SANITARIUSZ"
  | "SALOWA"
  | "OPIEKUN"
  | "MAGAZYNIERKA"
  | "SEKRETARKA"
  | "TERAPEUTKA";

export type ExtraRole = "ODDZIALOWA" | "ZABIEGOWA" | "NONE";

export type ExperienceLevel = "NOWY" | "DOSWIADCZONY" | "STANDARD";
export type EducationLevel = "LICENCJAT" | "MAGISTER" | "BRAK";

export type FteType = "1_etat_12h" | "1_etat_8h" | "0_5_etatu" | "0_75_etatu";

export type GeneratorEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  baseRole: BaseRole;
  extraRole?: ExtraRole;
  fteType: FteType;
  canWorkNights?: boolean;
  experienceLevel?: ExperienceLevel;
  educationLevel?: EducationLevel;
};

export type WorkTimeNorm = {
  hours: number;
  minutes: number;
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
  | "REST_VIOLATION_WEEKLY"
  | "NEW_NURSE_CONSTRAINT"
  | "COORDINATOR_NOT_ASSIGNED"
  | "UNSUPPORTED_NIGHT_COMBINATION";

export type WarningEntry = {
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  dayType: DayType;
  code: WarningCode;
  employees: string[];
  description: string;
};

export type DailySummary = {
  date: string;
  dayShift: {
    nurses: {
      total: number;
      experienced: number;
      new: number;
      magister: number;
      licencjat: number;
      coordinatorK?: string | null;
    };
    sanitariusze: number;
    salowe: number;
    opiekunowie: number;
    oddzialowa?: string | null;
    zabiegowa?: string | null;
    sekretarki: number;
    terapeuci: number;
    magazynierzy: number;
  };
  nightShift: {
    nurses: {
      total: number;
      experienced: number;
      new: number;
      magister: number;
      licencjat: number;
      coordinatorK?: string | null;
    };
    sanitariusze: number;
    salowe: number;
    opiekunowie: number;
    oddzialowa?: string | null;
    zabiegowa?: string | null;
    sekretarki: number;
    terapeuci: number;
    magazynierzy: number;
  };
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
  dailySummaries: DailySummary[];
};

type StaffRequirement = {
  headNurse: number;
  zabiegowa: number;
  nurses: { min: number; max?: number; regularOnly?: boolean };
  sanitariusz: { min: number; max?: number };
  salowa: { min: number; max?: number };
  opiekun: { min: number; max: number };
  magazynier?: { min: number; max?: number };
  sekretarka?: { min: number; max?: number };
  terapeuta?: { min: number; max?: number };
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
      nurses: { min: 2, max: 4, regularOnly: true },
      sanitariusz: { min: 1, max: 1 },
      salowa: { min: 2, max: 2 },
      opiekun: { min: 0, max: 1 },
      magazynier: { min: 1, max: 1 },
      sekretarka: { min: 1, max: 1 },
      terapeuta: { min: 1, max: 1 },
      supportAtNight: 0
    },
    NIGHT: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2, max: 2 },
      sanitariusz: { min: 0, max: 1 },
      salowa: { min: 0, max: 1 },
      opiekun: { min: 0, max: 1 },
      supportAtNight: 1
    }
  },
  WEEKEND: {
    DAY: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2, max: 3, regularOnly: true },
      sanitariusz: { min: 1, max: 1 },
      salowa: { min: 2, max: 2 },
      opiekun: { min: 0, max: 1 },
      magazynier: { min: 0, max: 0 },
      sekretarka: { min: 0, max: 0 },
      terapeuta: { min: 0, max: 0 },
      supportAtNight: 0
    },
    NIGHT: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2, max: 2 },
      sanitariusz: { min: 0, max: 1 },
      salowa: { min: 0, max: 1 },
      opiekun: { min: 0, max: 1 },
      supportAtNight: 1
    }
  },
  HOLIDAY: {
    DAY: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2, max: 3, regularOnly: true },
      sanitariusz: { min: 1, max: 1 },
      salowa: { min: 2, max: 2 },
      opiekun: { min: 0, max: 1 },
      magazynier: { min: 0, max: 0 },
      sekretarka: { min: 0, max: 0 },
      terapeuta: { min: 0, max: 0 },
      supportAtNight: 0
    },
    NIGHT: {
      headNurse: 0,
      zabiegowa: 0,
      nurses: { min: 2, max: 2 },
      sanitariusz: { min: 0, max: 1 },
      salowa: { min: 0, max: 1 },
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
  holidays: POLISH_HOLIDAYS,
  customMonthlyNorm: null as WorkTimeNorm | null
};

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type ShiftInterval = { start: number; end: number };

function getShiftIntervals(value: string): ShiftInterval[] {
  const { base } = parseShift(value);
  const normalize = base.trim().toLowerCase();

  if (!normalize) return [];
  if (normalize === "d") return [{ start: 7, end: 19 }];
  if (normalize === "n") return [{ start: 19, end: 31 }];
  if (normalize === "1") return [{ start: 7, end: 15 }];

  const numericMatch = normalize.match(/^(\d+)([hp]?)$/);
  if (numericMatch) {
    const length = Number.parseInt(numericMatch[1], 10);
    const suffix = numericMatch[2];
    let start = 7;
    if (suffix === "p") {
      start = length >= 10 ? 19 : 13;
    }
    return [{ start, end: start + length }];
  }

  const durationMatch = normalize.match(/^(\d{1,2})(:(\d{2}))?$/);
  if (durationMatch) {
    const hours = Number.parseInt(durationMatch[1], 10);
    const minutes = durationMatch[3] ? Number.parseInt(durationMatch[3], 10) : 0;
    const length = hours + minutes / 60;
    return [{ start: 7, end: 7 + length }];
  }

  return [];
}

function getHoursForShift(value: string): number {
  return getShiftIntervals(value).reduce((sum, interval) => sum + (interval.end - interval.start), 0);
}

function buildSegments(assignments: { intervals: ShiftInterval[] }[], windowStart: number, windowEnd: number) {
  const points = new Set<number>([windowStart, windowEnd]);
  assignments.forEach((assignment) => {
    assignment.intervals.forEach((interval) => {
      const start = Math.max(interval.start, windowStart);
      const end = Math.min(interval.end, windowEnd);
      if (end > start) {
        points.add(start);
        points.add(end);
      }
    });
  });
  const sorted = Array.from(points).sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, idx) => ({ start, end: sorted[idx + 1] }));
}

function isActiveInSegment(intervals: ShiftInterval[], segmentStart: number, segmentEnd: number) {
  return intervals.some((interval) => {
    const start = Math.max(interval.start, segmentStart);
    const end = Math.min(interval.end, segmentEnd);
    return end > start;
  });
}

export function calculateMonthlyNormHours(
  year: number,
  monthIndex: number,
  holidays: Set<string>,
  baseWorkingDayHours = DEFAULT_CONFIG.baseWorkingDayHours
) {
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

  return workingDays * baseWorkingDayHours;
}

function normToMinutes(norm: WorkTimeNorm) {
  return norm.hours * 60 + norm.minutes;
}

function getTargetHours(fte: FteType, monthlyNormMinutes: number) {
  const multipliers: Record<FteType, number> = {
    "1_etat_12h": 1,
    "1_etat_8h": 1,
    "0_75_etatu": 0.75,
    "0_5_etatu": 0.5
  };

  const multiplier = multipliers[fte] ?? 1;
  const minutes = Math.round(monthlyNormMinutes * multiplier);
  return Math.round((minutes / 60) * 100) / 100;
}

export function setMonthlyNorm(norm: WorkTimeNorm) {
  return norm;
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
  if (employee.baseRole === "SEKRETARKA" || employee.baseRole === "TERAPEUTKA" || employee.baseRole === "MAGAZYNIERKA") {
    return true;
  }
  return false;
}

function workedHoursForEmployee(schedule: Record<string, Record<number, string>>, employeeId: string) {
  const employeeSchedule = schedule[employeeId] || {};
  return Object.values(employeeSchedule).reduce((sum, shift) => sum + getHoursForShift(shift), 0);
}

function getEducationScore(level: EducationLevel | undefined) {
  switch (level) {
    case "MAGISTER":
      return 3;
    case "LICENCJAT":
      return 2;
    default:
      return 1;
  }
}

function getExperienceScore(level: ExperienceLevel | undefined) {
  switch (level) {
    case "DOSWIADCZONY":
      return 3;
    case "STANDARD":
      return 2;
    case "NOWY":
      return 1;
    default:
      return 2;
  }
}

function getSeniorityScore(employee: GeneratorEmployee) {
  const educationScore = getEducationScore(employee.educationLevel);
  const experienceScore = getExperienceScore(employee.experienceLevel);
  return educationScore * 10 + experienceScore;
}

function parseShift(value: string) {
  const [base, ...rest] = value.split(" ").filter(Boolean);
  const extras = new Set(rest.map((item) => item.trim().toUpperCase()));
  return { base: base || "", extras };
}

function formatShift(base: string, extras: Set<string>) {
  const orderedExtras = ["O", "R", "K"].filter((mark) => extras.has(mark));
  return [base, ...orderedExtras].filter(Boolean).join(" ").trim();
}

function markShiftExtra(schedule: Record<string, Record<number, string>>, employeeId: string, day: number, extra: "O" | "R" | "K") {
  const current = schedule[employeeId]?.[day];
  if (!current) return;
  const { base, extras } = parseShift(current);
  extras.add(extra);
  schedule[employeeId][day] = formatShift(base, extras);
}

function isFullShift(value: string) {
  return value === "D" || value === "N";
}

function isFixedScheduleEmployee(employee: GeneratorEmployee) {
  const fixedBaseRoles: BaseRole[] = ["MAGAZYNIERKA", "SEKRETARKA", "TERAPEUTKA"];
  const fixedExtraRoles: ExtraRole[] = ["ODDZIALOWA", "ZABIEGOWA"];
  return fixedBaseRoles.includes(employee.baseRole) || fixedExtraRoles.includes(employee.extraRole ?? "NONE");
}

function isNormTracked(employee: GeneratorEmployee) {
  return !isFixedScheduleEmployee(employee);
}

function selectCandidate(
  candidates: GeneratorEmployee[],
  schedule: Record<string, Record<number, string>>,
  day: number,
  shiftValue: string,
  preferDays: Map<string, Set<number>>,
  dayType: DayType,
  targets: Record<string, number>,
  scoreFn?: (emp: GeneratorEmployee) => number,
  canAssign?: (emp: GeneratorEmployee) => boolean
) {
  const shuffled = shuffleArray(candidates);
  const prioritized = shuffled.sort((a, b) => {
    const prefersA = preferDays.get(a.id)?.has(day) ? -1 : 0;
    const prefersB = preferDays.get(b.id)?.has(day) ? -1 : 0;
    if (prefersA !== prefersB) return prefersA - prefersB;
    if (scoreFn) {
      const diff = (scoreFn(b) ?? 0) - (scoreFn(a) ?? 0);
      if (diff !== 0) return diff;
    }
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
    if (isNormTracked(candidate)) {
      const nextHours = worked + getHoursForShift(shiftValue);
      if (nextHours - targets[candidate.id] > 0.1) return false;
    }
    if (canAssign && !canAssign(candidate)) return false;
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
  const monthlyNormMinutes = mergedConfig.customMonthlyNorm
    ? normToMinutes(mergedConfig.customMonthlyNorm)
    : Math.round(calculateMonthlyNormHours(year, monthIndex, holidays, mergedConfig.baseWorkingDayHours) * 60);
  const targets = employees.reduce<Record<string, number>>((acc, employee) => {
    acc[employee.id] = isNormTracked(employee) ? getTargetHours(employee.fteType, monthlyNormMinutes) : 0;
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
      if (isNormTracked(employee) && worked + getHoursForShift(value) - targets[employee.id] > 0.1) return false;
      if (hasDailyRestConflict(employeeSchedule[day - 1], value)) return false;
      assignShift(employee, value);
      return true;
    };

    headNurseByDay[day] = headNurseByDay[day] ?? null;

    // Pre-plan fixed weekday staff (no norm tracking)
    if (isWeekday) {
      employees
        .filter((emp) => isFixedScheduleEmployee(emp))
        .forEach((emp) => {
          if (dayBlocked.has(emp.id) || schedule[emp.id][day]) return;
          assignShift(emp, "1");
          if (emp.extraRole === "ODDZIALOWA") {
            headNurseByDay[day] = emp.id;
          }
        });
    }

    // Head nurse placement with substitution logic
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

      const headPlaced =
        Boolean(headNurseByDay[day]) || tryAssignHead(officialHeads) || tryAssignHead(zabiegowaCandidates) || tryAssignHead(regularNurses);

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
      const assignEightHour = (baseRole: BaseRole, req?: { min: number; max?: number }, predicate?: (emp: GeneratorEmployee) => boolean) => {
        if (!req) return;
        const candidates = shuffleArray(
          eightHourWorkers.filter(
            (employee) =>
              employee.baseRole === baseRole &&
              !dayBlocked.has(employee.id) &&
              !schedule[employee.id][day] &&
              (!predicate || predicate(employee))
          )
        );
        let assigned = employees.filter(
          (emp) => emp.baseRole === baseRole && schedule[emp.id]?.[day] === "1" && (!predicate || predicate(emp))
        ).length;

        for (const candidate of candidates) {
          if (assigned >= req.min) break;
          const worked = workedHoursForEmployee(schedule, candidate.id);
          if (worked + 8 - targets[candidate.id] > 0.1) continue;
          if (tryAssign(candidate, "1")) {
            assigned += 1;
          }
        }

        if (assigned < req.min) {
          warnings.push({
            date: formatDate(year, monthIndex, day),
            shift: "DAY",
            dayType,
            code: "MISSING_ROLE",
            employees: candidates.map((c) => employeeNames[c.id]),
            description: `${formatDate(year, monthIndex, day)} (dzień): brak wymaganej obsady 8h dla roli ${baseRole.toLowerCase()} (brakuje ${req.min - assigned}).`
          });
        }
        if (req.max !== undefined && assigned > req.max) {
          warnings.push({
            date: formatDate(year, monthIndex, day),
            shift: "DAY",
            dayType,
            code: "INSUFFICIENT_STAFF",
            employees: candidates.map((c) => employeeNames[c.id]),
            description: `${formatDate(year, monthIndex, day)} (dzień): przekroczono maksymalną obsadę 8h dla roli ${baseRole.toLowerCase()}.`
          });
        }
      };

      assignEightHour("MAGAZYNIERKA", requirement.magazynier);
      assignEightHour("SEKRETARKA", requirement.sekretarka);
      assignEightHour("TERAPEUTKA", requirement.terapeuta);
      assignEightHour(
        "PIELEGNIARKA",
        { min: 0, max: requirement.nurses.max },
        (emp) => (emp.extraRole ?? "NONE") === "NONE"
      );
    }

    // Day shift staffing (12h roles)
    const pool = shiftWorkers.filter((employee) => !dayBlocked.has(employee.id));

    const nurseCandidates = pool.filter(
      (e) =>
        e.baseRole === "PIELEGNIARKA" &&
        (!requirement.nurses.regularOnly || (e.extraRole ?? "NONE") === "NONE")
    );

    const assignedDayNurses: GeneratorEmployee[] = [];
    const countedDayNurses = () => assignedDayNurses.filter((n) => n.experienceLevel !== "NOWY").length;
    const regularEightHourCount = employees.filter(
      (emp) =>
        emp.baseRole === "PIELEGNIARKA" &&
        (emp.extraRole ?? "NONE") === "NONE" &&
        schedule[emp.id]?.[day] === "1" &&
        emp.experienceLevel !== "NOWY"
    ).length;
    const maxNurses = Math.max(0, (requirement.nurses.max ?? nurseCandidates.length) - regularEightHourCount);
    const minNurses = Math.max(0, requirement.nurses.min - regularEightHourCount);

    const selectDayNurse = (predicate?: (emp: GeneratorEmployee) => boolean) =>
      selectCandidate(
        nurseCandidates,
        schedule,
        day,
        "D",
        preferDays,
        dayType,
        targets,
        getSeniorityScore,
        (emp) => {
          if (assignedDayNurses.find((item) => item.id === emp.id)) return false;
          if (predicate && !predicate(emp)) return false;
          if (emp.experienceLevel === "NOWY") {
            const remainingSlots = maxNurses - assignedDayNurses.length - 1;
            const experiencedLeft = nurseCandidates.some(
              (candidate) =>
                candidate.experienceLevel === "DOSWIADCZONY" &&
                !assignedDayNurses.find((n) => n.id === candidate.id) &&
                !schedule[candidate.id]?.[day]
            );
            if (!experiencedLeft && assignedDayNurses.every((n) => n.experienceLevel !== "DOSWIADCZONY")) {
              if (remainingSlots <= 0) return false;
            }
          }
          return true;
        }
      );

    while (countedDayNurses() < minNurses) {
      const candidate = selectDayNurse((emp) => emp.experienceLevel !== "NOWY");
      if (!candidate) break;
      assignShift(candidate, "D");
      assignedDayNurses.push(candidate);
    }

    while (countedDayNurses() < maxNurses) {
      const candidate = selectDayNurse((emp) => emp.experienceLevel !== "NOWY");
      if (!candidate) break;
      assignShift(candidate, "D");
      assignedDayNurses.push(candidate);
    }

    const hasExperiencedDay = assignedDayNurses.some((n) => n.experienceLevel === "DOSWIADCZONY");
    if (hasExperiencedDay) {
      while (true) {
        const candidate = selectDayNurse((emp) => emp.experienceLevel === "NOWY");
        if (!candidate) break;
        assignShift(candidate, "D");
        assignedDayNurses.push(candidate);
      }
    }

    const hasNewDay = assignedDayNurses.some((n) => n.experienceLevel === "NOWY");
    if (hasNewDay && !hasExperiencedDay) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "NEW_NURSE_CONSTRAINT",
        employees: assignedDayNurses.map((n) => employeeNames[n.id]),
        description: `${formatDate(year, monthIndex, day)} (dzień): nowa pielęgniarka wymaga obecności osoby doświadczonej.`
      });
    }

    const fillRole = (baseRole: BaseRole, req: { min: number; max?: number }, regularOnly?: boolean) => {
      const needed = req.min;
      const max = req.max ?? Infinity;
      let assigned = 0;
      const candidates = pool.filter((e) => e.baseRole === baseRole && (!regularOnly || (e.extraRole ?? "NONE") === "NONE"));
      while (assigned < needed) {
        const candidate = selectCandidate(
          candidates,
          schedule,
          day,
          "D",
          preferDays,
          dayType,
          targets,
          getSeniorityScore
        );
        if (!candidate) break;
        if (schedule[candidate.id]?.[day]) {
          if (candidate.experienceLevel !== "NOWY") assigned += 1;
          break;
        }
        assignShift(candidate, "D");
        if (candidate.experienceLevel !== "NOWY") assigned += 1;
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
      if (assigned > max) {
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
    fillRole("OPIEKUN", requirement.opiekun);
    if (requirement.magazynier) fillRole("MAGAZYNIERKA", requirement.magazynier);
    if (requirement.sekretarka) fillRole("SEKRETARKA", requirement.sekretarka);
    if (requirement.terapeuta) fillRole("TERAPEUTKA", requirement.terapeuta);

    // Night shift staffing with new nurse and support constraints
    const nightRequirement = mergedConfig.staffRequirements[dayType].NIGHT;
    const nightPool = pool.filter((employee) => employee.canWorkNights !== false && !schedule[employee.id][day]);

    const nightNurseCandidates = nightPool.filter((emp) => emp.baseRole === "PIELEGNIARKA");
    const assignedNightNurses: GeneratorEmployee[] = [];
    const countedNightNurses = () => assignedNightNurses.filter((n) => n.experienceLevel !== "NOWY").length;

    const selectNightNurse = (predicate?: (emp: GeneratorEmployee) => boolean) =>
      selectCandidate(
        nightNurseCandidates,
        schedule,
        day,
        "N",
        preferDays,
        dayType,
        targets,
        getSeniorityScore,
        (emp) => {
          if (assignedNightNurses.find((item) => item.id === emp.id)) return false;
          if (predicate && !predicate(emp)) return false;
          if (emp.experienceLevel === "NOWY") {
            const experiencedLeft = nightNurseCandidates.some(
              (candidate) =>
                candidate.experienceLevel === "DOSWIADCZONY" &&
                !assignedNightNurses.find((n) => n.id === candidate.id) &&
                !schedule[candidate.id]?.[day]
            );
            if (!experiencedLeft && assignedNightNurses.every((n) => n.experienceLevel !== "DOSWIADCZONY")) return false;
          }
          return true;
        }
      );

    while (countedNightNurses() < nightRequirement.nurses.min) {
      const candidate = selectNightNurse((emp) => emp.experienceLevel !== "NOWY");
      if (!candidate) break;
      assignShift(candidate, "N");
      assignedNightNurses.push(candidate);
    }

    const nightHasNew = assignedNightNurses.some((n) => n.experienceLevel === "NOWY");
    const nightHasExperienced = assignedNightNurses.some((n) => n.experienceLevel === "DOSWIADCZONY");
    if (countedNightNurses() < (nightRequirement.nurses.max ?? nightRequirement.nurses.min)) {
      while (countedNightNurses() < (nightRequirement.nurses.max ?? nightRequirement.nurses.min)) {
        const candidate = selectNightNurse((emp) => emp.experienceLevel !== "NOWY");
        if (!candidate) break;
        assignShift(candidate, "N");
        assignedNightNurses.push(candidate);
      }
    }

    if (nightHasExperienced) {
      while (true) {
        const candidate = selectNightNurse((emp) => emp.experienceLevel === "NOWY");
        if (!candidate) break;
        assignShift(candidate, "N");
        assignedNightNurses.push(candidate);
      }
    }

    if (nightHasNew && !nightHasExperienced) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "NIGHT",
        dayType,
        code: "NEW_NURSE_CONSTRAINT",
        employees: assignedNightNurses.map((n) => employeeNames[n.id]),
        description: `${formatDate(year, monthIndex, day)} (noc): nowa pielęgniarka wymaga obecności osoby doświadczonej i nie można przekroczyć limitu etatów.`
      });
    }

    const supportNeeded = nightRequirement.supportAtNight ?? 0;
    const nightSupportCandidates = nightPool.filter(
      (emp) => emp.baseRole === "SANITARIUSZ" || emp.baseRole === "SALOWA" || emp.baseRole === "OPIEKUN"
    );
    const assignedSupport: GeneratorEmployee[] = [];

    const selectSupport = (predicate?: (emp: GeneratorEmployee) => boolean) =>
      selectCandidate(
        nightSupportCandidates,
        schedule,
        day,
        "N",
        preferDays,
        dayType,
        targets,
        getSeniorityScore,
        (emp) => {
          if (assignedSupport.find((item) => item.id === emp.id)) return false;
          if (predicate && !predicate(emp)) return false;
          return true;
        }
      );

    if (supportNeeded > 0) {
      const combos: Array<[BaseRole, BaseRole]> = [
        ["SANITARIUSZ", "SALOWA"],
        ["OPIEKUN", "SALOWA"],
        ["SANITARIUSZ", "OPIEKUN"]
      ];

      if (supportNeeded === 1) {
        const supportCandidate = selectSupport();
        if (supportCandidate) {
          assignShift(supportCandidate, "N");
          assignedSupport.push(supportCandidate);
        } else {
          warnings.push({
            date: formatDate(year, monthIndex, day),
            shift: "NIGHT",
            dayType,
            code: "MISSING_ROLE",
            employees: nightSupportCandidates.map((c) => employeeNames[c.id]),
            description: `${formatDate(year, monthIndex, day)} (noc): brak wymaganej osoby z grupy sanitariusz/salowa/opiekun.`
          });
        }
      } else {
        let paired = false;
        for (const [firstRole, secondRole] of combos) {
          const first = selectSupport((emp) => emp.baseRole === firstRole);
          const second = selectSupport((emp) => emp.baseRole === secondRole && (!first || emp.id !== first.id));
          if (first && second) {
            assignShift(first, "N");
            assignShift(second, "N");
            assignedSupport.push(first, second);
            paired = true;
            break;
          }
        }
        if (!paired) {
          warnings.push({
            date: formatDate(year, monthIndex, day),
            shift: "NIGHT",
            dayType,
            code: "UNSUPPORTED_NIGHT_COMBINATION",
            employees: nightSupportCandidates.map((c) => employeeNames[c.id]),
            description: `${formatDate(year, monthIndex, day)} (noc): nie udało się zestawić dozwolonej pary sanitariusz/salowa/opiekun.`
          });
        }
      }
    }
  }

  // Short shifts to close gaps
  employees.forEach((employee) => {
    if (!isNormTracked(employee)) return;
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
        employeeSchedule[day] = `${length}h`;
        break;
      }
    }
  });

  // Build summaries & warnings
  const hoursSummary: ScheduleResult["hoursSummary"] = {};

  employees.forEach((employee) => {
    const employeeSchedule = schedule[employee.id];
    const workedHours = workedHoursForEmployee(schedule, employee.id);
    const targetHours = isNormTracked(employee) ? targets[employee.id] : workedHours;
    const diff = Math.round((workedHours - targetHours) * 100) / 100;
    hoursSummary[employee.id] = {
      targetHours,
      workedHours: Math.round(workedHours * 100) / 100,
      difference: diff
    };

    if (isNormTracked(employee) && diff < 0) {
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

  const dailySummaries: DailySummary[] = [];
  const DAY_WINDOW = { start: 7, end: 19 };
  const NIGHT_WINDOW = { start: 19, end: 31 };

  // Staffing validation per day + side assignment & summary
  for (let day = 1; day <= daysInMonth; day++) {
    const dayType = getDayType(year, monthIndex, day, holidays);
    const requirement = mergedConfig.staffRequirements[dayType].DAY;
    const nightRequirement = mergedConfig.staffRequirements[dayType].NIGHT;
    const headForDay: string | null = headNurseByDay[day] ?? null;

    const allAssignments = employees
      .map((employee) => ({ employee, shift: schedule[employee.id]?.[day] }))
      .filter((item): item is { employee: GeneratorEmployee; shift: string } => Boolean(item.shift))
      .map((item) => ({ ...item, intervals: getShiftIntervals(item.shift) }));

    const overlapsWindow = (intervals: ShiftInterval[], windowStart: number, windowEnd: number) =>
      intervals.some((interval) => interval.end > windowStart && interval.start < windowEnd);

    const dayAssignments = allAssignments.filter((item) => overlapsWindow(item.intervals, DAY_WINDOW.start, DAY_WINDOW.end));
    const nightAssignments = allAssignments.filter((item) => overlapsWindow(item.intervals, NIGHT_WINDOW.start, NIGHT_WINDOW.end));

    const daySegments = buildSegments(dayAssignments, DAY_WINDOW.start, DAY_WINDOW.end);
    const nightSegments = buildSegments(nightAssignments, NIGHT_WINDOW.start, NIGHT_WINDOW.end);

    const formatHour = (value: number) => {
      const normalized = ((value % 24) + 24) % 24;
      const hour = Math.floor(normalized);
      const minutes = Math.round((normalized - hour) * 60);
      return `${`${hour}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
    };

    const formatRange = (start: number, end: number) => `${formatHour(start)}-${formatHour(end)}`;

    const checkCoverage = (
      label: string,
      predicate: (emp: GeneratorEmployee) => boolean,
      segments: { start: number; end: number }[],
      assignments: typeof dayAssignments,
      min: number,
      max: number | undefined,
      shiftLabel: ShiftType
    ) => {
      segments.forEach((segment) => {
        const count = assignments.filter(
          (item) =>
            predicate(item.employee) &&
            item.employee.experienceLevel !== "NOWY" &&
            isActiveInSegment(item.intervals, segment.start, segment.end)
        ).length;
        if (count < min) {
          warnings.push({
            date: formatDate(year, monthIndex, day),
            shift: shiftLabel,
            dayType,
            code: "MISSING_ROLE",
            employees: [],
            description: `${formatDate(year, monthIndex, day)} (${shiftLabel === "DAY" ? "dzień" : "noc"} ${formatRange(
              segment.start,
              segment.end
            )}): pokrycie roli ${label.toLowerCase()} spada poniżej minimum (${count}/${min}).`
          });
        }
        if (max !== undefined && count > max) {
          warnings.push({
            date: formatDate(year, monthIndex, day),
            shift: shiftLabel,
            dayType,
            code: "INSUFFICIENT_STAFF",
            employees: [],
            description: `${formatDate(year, monthIndex, day)} (${shiftLabel === "DAY" ? "dzień" : "noc"} ${formatRange(
              segment.start,
              segment.end
            )}): przekroczono maksymalną obsadę dla roli ${label.toLowerCase()} (${count}/${max}).`
          });
        }
      });
    };

    const dayNurses = dayAssignments.filter((item) => item.employee.baseRole === "PIELEGNIARKA");
    const nightNurses = nightAssignments.filter((item) => item.employee.baseRole === "PIELEGNIARKA");

    const selectCoordinator = (list: typeof dayNurses | typeof nightNurses, shiftType: ShiftType) => {
      const fullShiftCandidates = list.filter(
        (entry) =>
          isFullShift(parseShift(entry.shift).base) && (entry.employee.experienceLevel ?? "STANDARD") !== "NOWY"
      );
      const chooseBy = (predicate: (entry: (typeof list)[number]) => boolean) =>
        fullShiftCandidates
          .filter(predicate)
          .sort((a, b) => getEducationScore(b.employee.educationLevel) - getEducationScore(a.employee.educationLevel))[0];

      const magister = chooseBy((entry) => entry.employee.educationLevel === "MAGISTER");
      if (magister) return magister;
      const experienced = chooseBy((entry) => entry.employee.experienceLevel === "DOSWIADCZONY");
      if (experienced) return experienced;
      return fullShiftCandidates.sort((a, b) => getSeniorityScore(b.employee) - getSeniorityScore(a.employee))[0];
    };

    const dayCoordinator = selectCoordinator(dayNurses, "DAY");
    const nightCoordinator = selectCoordinator(nightNurses, "NIGHT");

    if (dayCoordinator) {
      markShiftExtra(schedule, dayCoordinator.employee.id, day, "K");
      markShiftExtra(schedule, dayCoordinator.employee.id, day, "O");
    } else if (dayNurses.length) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "COORDINATOR_NOT_ASSIGNED",
        employees: dayNurses.map((n) => employeeNames[n.employee.id]),
        description: `${formatDate(year, monthIndex, day)} (dzień): brak pielęgniarki koordynującej z pełnym dyżurem.`
      });
    }

    if (nightCoordinator) {
      markShiftExtra(schedule, nightCoordinator.employee.id, day, "K");
      markShiftExtra(schedule, nightCoordinator.employee.id, day, "O");
    } else if (nightNurses.length) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "NIGHT",
        dayType,
        code: "COORDINATOR_NOT_ASSIGNED",
        employees: nightNurses.map((n) => employeeNames[n.employee.id]),
        description: `${formatDate(year, monthIndex, day)} (noc): brak pielęgniarki koordynującej z pełnym dyżurem.`
      });
    }

    const assignNurseSides = (list: typeof dayNurses, shiftLabel: ShiftType) => {
      const sorted = [...list].sort((a, b) => getSeniorityScore(b.employee) - getSeniorityScore(a.employee));
      sorted.forEach((entry, index) => {
        const extra = index === 0 ? "O" : "R";
        if (shiftLabel === "DAY" && dayCoordinator && entry.employee.id === dayCoordinator.employee.id) {
          markShiftExtra(schedule, entry.employee.id, day, "O");
          return;
        }
        if (shiftLabel === "NIGHT" && nightCoordinator && entry.employee.id === nightCoordinator.employee.id) {
          markShiftExtra(schedule, entry.employee.id, day, "O");
          return;
        }
        markShiftExtra(schedule, entry.employee.id, day, extra);
      });
    };

    assignNurseSides(dayNurses, "DAY");
    assignNurseSides(nightNurses, "NIGHT");

    // Support staff sides
    const daySalowe = dayAssignments.filter((item) => item.employee.baseRole === "SALOWA");
    if (daySalowe[0]) markShiftExtra(schedule, daySalowe[0].employee.id, day, "O");
    if (daySalowe[1]) markShiftExtra(schedule, daySalowe[1].employee.id, day, "R");
    if (daySalowe.length < 2 && daySalowe.length > 0) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "MISSING_ROLE",
        employees: daySalowe.map((s) => employeeNames[s.employee.id]),
        description: `${formatDate(year, monthIndex, day)} (dzień): salowe nie pokrywają obu stron oddziału.`
      });
    }

    const daySanitariusze = dayAssignments.filter((item) => item.employee.baseRole === "SANITARIUSZ");
    daySanitariusze.forEach((item) => markShiftExtra(schedule, item.employee.id, day, "O"));

    const nightSanitariusze = nightAssignments.filter((item) => item.employee.baseRole === "SANITARIUSZ");
    nightSanitariusze.forEach((item) => markShiftExtra(schedule, item.employee.id, day, "O"));

    const nightSalowe = nightAssignments.filter((item) => item.employee.baseRole === "SALOWA");
    nightSalowe.forEach((item) => {
      markShiftExtra(schedule, item.employee.id, day, "O");
      markShiftExtra(schedule, item.employee.id, day, "R");
    });

    const nightOpiekunowie = nightAssignments.filter((item) => item.employee.baseRole === "OPIEKUN");
    nightOpiekunowie.forEach((item, idx) => {
      const extra = nightSanitariusze.length > 0 && idx === 0 ? "R" : "O";
      markShiftExtra(schedule, item.employee.id, day, extra);
    });

    const counters = {
      pielegniarka: dayNurses.length,
      pielegniarkaRegular: dayNurses.filter((item) => (item.employee.extraRole ?? "NONE") === "NONE").length,
      zabiegowa: dayAssignments.filter((item) => item.employee.extraRole === "ZABIEGOWA").length,
      sanitariusz: daySanitariusze.length,
      salowa: daySalowe.length,
      opiekun: dayAssignments.filter((item) => item.employee.baseRole === "OPIEKUN").length,
      supportNight: nightAssignments.filter(
        (item) => item.employee.baseRole === "SANITARIUSZ" || item.employee.baseRole === "SALOWA" || item.employee.baseRole === "OPIEKUN"
      ).length,
      nursesNight: nightNurses.length
    };

    const dayNewCount = dayNurses.filter((item) => item.employee.experienceLevel === "NOWY").length;
    const nightNewCount = nightNurses.filter((item) => item.employee.experienceLevel === "NOWY").length;

    const nursePredicate = (emp: GeneratorEmployee) =>
      emp.baseRole === "PIELEGNIARKA" && (!requirement.nurses.regularOnly || (emp.extraRole ?? "NONE") === "NONE");
    const nightNursePredicate = (emp: GeneratorEmployee) =>
      emp.baseRole === "PIELEGNIARKA" && (!nightRequirement.nurses.regularOnly || (emp.extraRole ?? "NONE") === "NONE");
    checkCoverage(
      "Pielęgniarka",
      nursePredicate,
      daySegments,
      dayAssignments,
      requirement.nurses.min,
      requirement.nurses.max,
      "DAY"
    );

    checkCoverage(
      "Pielęgniarka",
      nightNursePredicate,
      nightSegments,
      nightAssignments,
      nightRequirement.nurses.min,
      nightRequirement.nurses.max,
      "NIGHT"
    );

    if (dayNewCount > 0 && !dayNurses.some((item) => item.employee.experienceLevel === "DOSWIADCZONY")) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "NEW_NURSE_CONSTRAINT",
        employees: dayNurses.map((n) => employeeNames[n.employee.id]),
        description: `${formatDate(year, monthIndex, day)} (dzień): nowa pielęgniarka wymaga obecności osoby doświadczonej.`
      });
    }

    if (nightNewCount > 0 && !nightNurses.some((item) => item.employee.experienceLevel === "DOSWIADCZONY")) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "NIGHT",
        dayType,
        code: "NEW_NURSE_CONSTRAINT",
        employees: nightNurses.map((n) => employeeNames[n.employee.id]),
        description: `${formatDate(year, monthIndex, day)} (noc): nowa pielęgniarka wymaga towarzystwa osoby doświadczonej.`
      });
    }

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

    checkCoverage(
      "Sanitariusz",
      (emp) => emp.baseRole === "SANITARIUSZ",
      daySegments,
      dayAssignments,
      requirement.sanitariusz.min,
      requirement.sanitariusz.max,
      "DAY"
    );
    checkCoverage(
      "Salowa",
      (emp) => emp.baseRole === "SALOWA",
      daySegments,
      dayAssignments,
      requirement.salowa.min,
      requirement.salowa.max,
      "DAY"
    );
    checkCoverage(
      "Opiekun",
      (emp) => emp.baseRole === "OPIEKUN",
      daySegments,
      dayAssignments,
      requirement.opiekun.min,
      requirement.opiekun.max,
      "DAY"
    );
    if (requirement.magazynier) {
      checkCoverage(
        "Magazynier",
        (emp) => emp.baseRole === "MAGAZYNIERKA",
        daySegments,
        dayAssignments,
        requirement.magazynier.min,
        requirement.magazynier.max,
        "DAY"
      );
    }
    if (requirement.sekretarka) {
      checkCoverage(
        "Sekretarka",
        (emp) => emp.baseRole === "SEKRETARKA",
        daySegments,
        dayAssignments,
        requirement.sekretarka.min,
        requirement.sekretarka.max,
        "DAY"
      );
    }
    if (requirement.terapeuta) {
      checkCoverage(
        "Terapeuta",
        (emp) => emp.baseRole === "TERAPEUTKA",
        daySegments,
        dayAssignments,
        requirement.terapeuta.min,
        requirement.terapeuta.max,
        "DAY"
      );
    }

    const supportNeeded = nightRequirement.supportAtNight ?? 0;
    if (supportNeeded > 0) {
      nightSegments.forEach((segment) => {
        const sanitariuszCount = nightAssignments.filter(
          (item) => item.employee.baseRole === "SANITARIUSZ" && isActiveInSegment(item.intervals, segment.start, segment.end)
        ).length;
        const salowaCount = nightAssignments.filter(
          (item) => item.employee.baseRole === "SALOWA" && isActiveInSegment(item.intervals, segment.start, segment.end)
        ).length;
        const opiekunCount = nightAssignments.filter(
          (item) => item.employee.baseRole === "OPIEKUN" && isActiveInSegment(item.intervals, segment.start, segment.end)
        ).length;
        const totalSupport = sanitariuszCount + salowaCount + opiekunCount;
        const validPair =
          (sanitariuszCount === 1 && salowaCount === 1) ||
          (sanitariuszCount === 1 && opiekunCount === 1) ||
          (salowaCount === 1 && opiekunCount === 1);
        const validSingle =
          totalSupport === 1 && (sanitariuszCount === 1 || salowaCount === 1 || opiekunCount === 1);
        const isValid = totalSupport === 0 ? false : validSingle || validPair;
        if (!isValid) {
          warnings.push({
            date: formatDate(year, monthIndex, day),
            shift: "NIGHT",
            dayType,
            code: "MISSING_ROLE",
            employees: [],
            description: `${formatDate(year, monthIndex, day)} (noc ${formatRange(segment.start, segment.end)}): brak wymaganej kombinacji wsparcia (sanitariusz/salowa/opiekun).`
          });
        }
      });
    }

    dailySummaries.push({
      date: formatDate(year, monthIndex, day),
      dayShift: {
        nurses: {
          total: dayNurses.length,
          experienced: dayNurses.filter((n) => n.employee.experienceLevel === "DOSWIADCZONY").length,
          new: dayNewCount,
          magister: dayNurses.filter((n) => n.employee.educationLevel === "MAGISTER").length,
          licencjat: dayNurses.filter((n) => n.employee.educationLevel === "LICENCJAT").length,
          coordinatorK: dayCoordinator?.employee.id ?? null
        },
        sanitariusze: daySanitariusze.length,
        salowe: daySalowe.length,
        opiekunowie: counters.opiekun,
        oddzialowa: headForDay,
        zabiegowa: dayAssignments.find((item) => item.employee.extraRole === "ZABIEGOWA")?.employee.id ?? null,
        sekretarki: dayAssignments.filter((item) => item.employee.baseRole === "SEKRETARKA").length,
        terapeuci: dayAssignments.filter((item) => item.employee.baseRole === "TERAPEUTKA").length,
        magazynierzy: dayAssignments.filter((item) => item.employee.baseRole === "MAGAZYNIERKA").length
      },
      nightShift: {
        nurses: {
          total: nightNurses.length,
          experienced: nightNurses.filter((n) => n.employee.experienceLevel === "DOSWIADCZONY").length,
          new: nightNewCount,
          magister: nightNurses.filter((n) => n.employee.educationLevel === "MAGISTER").length,
          licencjat: nightNurses.filter((n) => n.employee.educationLevel === "LICENCJAT").length,
          coordinatorK: nightCoordinator?.employee.id ?? null
        },
        sanitariusze: nightSanitariusze.length,
        salowe: nightSalowe.length,
        opiekunowie: nightOpiekunowie.length,
        oddzialowa: null,
        zabiegowa: null,
        sekretarki: nightAssignments.filter((item) => item.employee.baseRole === "SEKRETARKA").length,
        terapeuci: nightAssignments.filter((item) => item.employee.baseRole === "TERAPEUTKA").length,
        magazynierzy: nightAssignments.filter((item) => item.employee.baseRole === "MAGAZYNIERKA").length
      }
    });
  }

  return { schedule, headNurseByDay, hoursSummary, warnings, dailySummaries };
}
