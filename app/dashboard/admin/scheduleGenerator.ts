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
      nurses: { min: 2 },
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
      nurses: { min: 2 },
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
  if (employee.baseRole === "SEKRETARKA" || employee.baseRole === "TERAPEUTA" || employee.baseRole === "MAGAZYNIER") {
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
  return value === "D" || value === "N" || value === "1";
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
    const nextHours = worked + getHoursForShift(shiftValue);
    if (nextHours - targets[candidate.id] > 0.1) return false;
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
    acc[employee.id] = getTargetHours(employee.fteType, monthlyNormMinutes);
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

    const nurseCandidates = pool.filter(
      (e) =>
        e.baseRole === "PIELEGNIARKA" &&
        (!requirement.nurses.regularOnly || (e.extraRole ?? "NONE") === "NONE")
    );

    const assignedDayNurses: GeneratorEmployee[] = [];
    const maxNurses = requirement.nurses.max ?? nurseCandidates.length;

    const computeTargetNurses = () => {
      const newCount = assignedDayNurses.filter((n) => n.experienceLevel === "NOWY").length;
      const experiencedCount = assignedDayNurses.filter((n) => n.experienceLevel === "DOSWIADCZONY").length;
      let target = requirement.nurses.min + newCount;
      if (newCount > 0 && experiencedCount === 0) {
        target += 1;
      }
      return Math.min(Math.max(target, requirement.nurses.min), maxNurses);
    };

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

    while (assignedDayNurses.length < computeTargetNurses()) {
      const candidate = selectDayNurse();
      if (!candidate) break;
      assignShift(candidate, "D");
      assignedDayNurses.push(candidate);
    }

    const hasNewDay = assignedDayNurses.some((n) => n.experienceLevel === "NOWY");
    const hasExperiencedDay = assignedDayNurses.some((n) => n.experienceLevel === "DOSWIADCZONY");
    if (hasNewDay && !hasExperiencedDay) {
      const experiencedCandidate = selectDayNurse((emp) => emp.experienceLevel === "DOSWIADCZONY");
      if (experiencedCandidate) {
        assignShift(experiencedCandidate, "D");
        assignedDayNurses.push(experiencedCandidate);
      } else {
        assignedDayNurses
          .filter((nurse) => nurse.experienceLevel === "NOWY")
          .forEach((nurse) => {
            delete schedule[nurse.id][day];
          });
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "NEW_NURSE_CONSTRAINT",
          employees: assignedDayNurses.map((n) => employeeNames[n.id]),
          description: `${formatDate(year, monthIndex, day)} (dzień): nie można przydzielić nowej pielęgniarki bez osoby doświadczonej.`
        });
      }
    }

    while (assignedDayNurses.length < maxNurses) {
      const candidate = selectDayNurse();
      if (!candidate) break;
      assignShift(candidate, "D");
      assignedDayNurses.push(candidate);
    }

    const fillRole = (baseRole: BaseRole, needed: number, max?: number, regularOnly?: boolean) => {
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
    fillRole("OPIEKUN", requirement.opiekun.min, requirement.opiekun.max);

    // Night shift staffing with new nurse and support constraints
    const nightRequirement = mergedConfig.staffRequirements[dayType].NIGHT;
    const nightPool = pool.filter((employee) => employee.canWorkNights !== false && !schedule[employee.id][day]);

    const nightNurseCandidates = nightPool.filter((emp) => emp.baseRole === "PIELEGNIARKA");
    const assignedNightNurses: GeneratorEmployee[] = [];

    const computeNightTarget = () => {
      const newCount = assignedNightNurses.filter((n) => n.experienceLevel === "NOWY").length;
      const experiencedCount = assignedNightNurses.filter((n) => n.experienceLevel === "DOSWIADCZONY").length;
      let target = Math.max(nightRequirement.nurses.min, newCount > 0 ? 3 : nightRequirement.nurses.min);
      if (newCount > 0 && experiencedCount === 0) {
        target += 1;
      }
      return Math.min(target, nightNurseCandidates.length);
    };

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

    while (assignedNightNurses.length < computeNightTarget()) {
      const candidate = selectNightNurse();
      if (!candidate) break;
      assignShift(candidate, "N");
      assignedNightNurses.push(candidate);
    }

    const nightHasNew = assignedNightNurses.some((n) => n.experienceLevel === "NOWY");
    const nightHasExperienced = assignedNightNurses.some((n) => n.experienceLevel === "DOSWIADCZONY");
    if (nightHasNew && !nightHasExperienced) {
      const experiencedCandidate = selectNightNurse((emp) => emp.experienceLevel === "DOSWIADCZONY");
      if (experiencedCandidate) {
        assignShift(experiencedCandidate, "N");
        assignedNightNurses.push(experiencedCandidate);
      } else {
        assignedNightNurses
          .filter((nurse) => nurse.experienceLevel === "NOWY")
          .forEach((nurse) => {
            delete schedule[nurse.id][day];
          });
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "NIGHT",
          dayType,
          code: "NEW_NURSE_CONSTRAINT",
          employees: assignedNightNurses.map((n) => employeeNames[n.id]),
          description: `${formatDate(year, monthIndex, day)} (noc): nowa pielęgniarka wymaga obecności osoby doświadczonej i dodatkowych etatów.`
        });
      }
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

  const dailySummaries: DailySummary[] = [];

  // Staffing validation per day + side assignment & summary
  for (let day = 1; day <= daysInMonth; day++) {
    const dayType = getDayType(year, monthIndex, day, holidays);
    const requirement = mergedConfig.staffRequirements[dayType].DAY;
    const nightRequirement = mergedConfig.staffRequirements[dayType].NIGHT;
    const headForDay: string | null = headNurseByDay[day] ?? null;

    const dayAssignments = employees
      .map((employee) => ({ employee, shift: schedule[employee.id]?.[day] }))
      .filter((item): item is { employee: GeneratorEmployee; shift: string } => Boolean(item.shift && item.shift !== "N"));
    const nightAssignments = employees
      .map((employee) => ({ employee, shift: schedule[employee.id]?.[day] }))
      .filter((item): item is { employee: GeneratorEmployee; shift: string } => item.shift === "N");

    const dayNurses = dayAssignments.filter((item) => item.employee.baseRole === "PIELEGNIARKA");
    const nightNurses = nightAssignments.filter((item) => item.employee.baseRole === "PIELEGNIARKA");

    const selectCoordinator = (list: typeof dayNurses | typeof nightNurses, shiftType: ShiftType) => {
      const fullShiftCandidates = list.filter((entry) => isFullShift(parseShift(entry.shift).base));
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

    const requiredDayNurses = requirement.nurses.min + dayNewCount;
    if (requirement.nurses.regularOnly) {
      if (counters.pielegniarkaRegular < requiredDayNurses) {
        warnings.push({
          date: formatDate(year, monthIndex, day),
          shift: "DAY",
          dayType,
          code: "MISSING_ROLE",
          employees: [],
          description: `${formatDate(year, monthIndex, day)} (dzień): za mało pielęgniarek bez funkcji (${counters.pielegniarkaRegular}/${requiredDayNurses}).`
        });
      }
    } else if (counters.pielegniarka < requiredDayNurses) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "DAY",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (dzień): za mało pielęgniarek (${counters.pielegniarka}/${requiredDayNurses}).`
      });
    }

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

    const nightMinNurses = Math.max(nightRequirement.nurses.min, nightNewCount > 0 ? 3 : nightRequirement.nurses.min);
    if (counters.nursesNight < nightMinNurses) {
      warnings.push({
        date: formatDate(year, monthIndex, day),
        shift: "NIGHT",
        dayType,
        code: "MISSING_ROLE",
        employees: [],
        description: `${formatDate(year, monthIndex, day)} (noc): za mało pielęgniarek (${counters.nursesNight}/${nightMinNurses}).`
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
        terapeuci: dayAssignments.filter((item) => item.employee.baseRole === "TERAPEUTA").length,
        magazynierzy: dayAssignments.filter((item) => item.employee.baseRole === "MAGAZYNIER").length
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
        terapeuci: nightAssignments.filter((item) => item.employee.baseRole === "TERAPEUTA").length,
        magazynierzy: nightAssignments.filter((item) => item.employee.baseRole === "MAGAZYNIER").length
      }
    });
  }

  return { schedule, headNurseByDay, hoursSummary, warnings, dailySummaries };
}
