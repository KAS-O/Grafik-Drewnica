"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Firestore
} from "firebase/firestore";
import { auth, db as firestore } from "../../../lib/firebase";
import { useAuth } from "../../../context/AuthContext";
import {
  buildDays,
  getDayCellClasses,
  getMonthKey,
  getMonthLabel,
  getPositionTheme,
  groupEmployeesByPosition,
  mergeEntriesWithEmployees,
  normalizeScheduleEntries,
  POLISH_HOLIDAYS,
  sortEmployees,
  type DayCell,
  type SimpleEmployee
} from "../utils";
import { DaySummaryModal, type DayAssignment } from "../DaySummaryModal";
import {
  generateSchedule,
  calculateMonthlyNormHours,
  type EducationLevel,
  type ExperienceLevel,
  type GeneratorEmployee,
  type ScheduleResult,
  type TimeOffRequest,
  type WorkTimeNorm
} from "./scheduleGenerator";

export const dynamic = "force-dynamic";

type ShiftValue = string;

type Position =
  | "Pielęgniarka / Pielęgniarz"
  | "Opiekun Medyczny"
  | "Sanitariusz"
  | "Salowa"
  | "Magazynierka"
  | "Sekretarka"
  | "Terapeuta zajęciowy"
  | string;

type ExtraRoleOption = "Brak" | "Oddziałowa" | "Zabiegowa";

type ExperienceLevelOption = "NOWY" | "DOSWIADCZONY" | "STANDARD";
type EducationLevelOption = "LICENCJAT" | "MAGISTER" | "BRAK";

type EmploymentRate = "1 etat 12h" | "1 etat 8h" | "1/2 etatu" | "3/4 etatu";

type AdminSection = "schedule" | "employees" | "generator";

type GeneratorRequestKind = "vacation" | "unavailable" | "preferDuty";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  extraRole?: ExtraRoleOption;
  employmentRate?: EmploymentRate;
  experienceLevel?: ExperienceLevelOption;
  educationLevel?: EducationLevelOption;
  createdAt?: unknown;
};

type ScheduleEntry = {
  shifts: Record<number, ShiftValue>;
  fullName: string;
  position: string;
};

type ScheduleEntries = Record<string, ScheduleEntry>;

type StatusState = {
  type: "error" | "success" | "";
  text: string;
};

type ScheduleDocument = {
  entries?: ScheduleEntries;
  customHolidays?: number[];
};

const POSITIONS = [
  "Pielęgniarka / Pielęgniarz",
  "Opiekun Medyczny",
  "Sanitariusz",
  "Salowa",
  "Magazynierka",
  "Sekretarka",
  "Terapeuta zajęciowy"
];

const EXTRA_ROLES: ExtraRoleOption[] = ["Brak", "Oddziałowa", "Zabiegowa"];
const EXPERIENCE_LEVELS: ExperienceLevelOption[] = ["STANDARD", "DOSWIADCZONY", "NOWY"];
const EDUCATION_LEVELS: EducationLevelOption[] = ["BRAK", "LICENCJAT", "MAGISTER"];

const EMPLOYMENT_RATES: EmploymentRate[] = ["1 etat 12h", "1 etat 8h", "1/2 etatu", "3/4 etatu"];

const ADMIN_SECTIONS: { key: AdminSection; label: string }[] = [
  { key: "schedule", label: "Edycja grafiku" },
  { key: "employees", label: "Zarządzanie pracownikami" },
  { key: "generator", label: "Generator grafików" }
];

type ShiftTemplate = "D" | "N" | "1" | "hours" | "clear";

type ShiftAction = ShiftTemplate | "o" | "r" | "k";

function deriveShiftTone(value: string): string {
  if (!value) return "bg-slate-900/50 text-sky-100/70";
  if (value.startsWith("N")) return "bg-sky-300/90 text-slate-950";
  if (value.startsWith("D")) return "bg-amber-300/90 text-slate-950";
  if (value.startsWith("1")) return "bg-emerald-200/90 text-emerald-950";
  if (/^\d/.test(value) || value.includes(":")) return "bg-amber-200/90 text-slate-950";
  return "bg-slate-200/90 text-slate-900";
}

function extractShiftBadges(value: string) {
  const [base, ...rest] = value.split(" ").filter(Boolean);
  const extras = rest.map((item) => item.trim().toUpperCase());

  return {
    base: base || "-",
    hasO: extras.includes("O"),
    hasR: extras.includes("R"),
    hasK: extras.includes("K")
  };
}

function normalizeHours(raw: string): string | null {
  const trimmed = raw.trim();
  const pureNumber = trimmed.match(/^\d{1,2}$/);
  if (pureNumber) {
    const hours = Number.parseInt(pureNumber[0] ?? "", 10);
    if (Number.isNaN(hours) || hours > 23) return null;
    return `${hours}:00`;
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = match[2];

  if (Number.isNaN(hours) || hours > 23) return null;
  if (Number.parseInt(minutes, 10) > 59) return null;

  return `${hours}:${minutes}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading, isAdmin, role } = useAuth();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntries>({});
  const [customHolidays, setCustomHolidays] = useState<number[]>([]);
  const [customHolidayInput, setCustomHolidayInput] = useState<string>("");
  const [loadingData, setLoadingData] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const scheduleDirtyRef = useRef(false);
  const [summaryDay, setSummaryDay] = useState<DayCell | null>(null);
  const [status, setStatus] = useState<StatusState>({ type: "", text: "" });
  const [activeSection, setActiveSection] = useState<AdminSection>("schedule");
  const [employeeForm, setEmployeeForm] = useState<Pick<
    Employee,
    "firstName" | "lastName" | "position" | "employmentRate" | "extraRole" | "experienceLevel" | "educationLevel"
  >>({
    firstName: "",
    lastName: "",
    position: POSITIONS[0],
    employmentRate: EMPLOYMENT_RATES[0],
    extraRole: "Brak",
    experienceLevel: "STANDARD",
    educationLevel: "BRAK"
  });
  const [formPending, setFormPending] = useState(false);
  const [activeAction, setActiveAction] = useState<ShiftAction>("D");
  const [hoursValue, setHoursValue] = useState("6:10");
  const [hoursSegment, setHoursSegment] = useState<"RA" | "PO">("RA");
  const db: Firestore = firestore;

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }

    if (!loading && user && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [user, loading, router, isAdmin]);

  const monthId = useMemo(() => getMonthKey(currentMonth), [currentMonth]);
  const customHolidaySet = useMemo(() => new Set(customHolidays), [customHolidays]);
  const days: DayCell[] = useMemo(() => buildDays(currentMonth, customHolidaySet), [currentMonth, customHolidaySet]);
  const monthLabel = useMemo(() => getMonthLabel(currentMonth), [currentMonth]);
  const generatorHolidaySet = useMemo(() => {
    const set = new Set(POLISH_HOLIDAYS);
    const monthKey = `${`${currentMonth.getMonth() + 1}`.padStart(2, "0")}-`;
    customHolidays.forEach((day) => {
      set.add(`${monthKey}${`${day}`.padStart(2, "0")}`);
    });
    return set;
  }, [customHolidays, currentMonth]);
  const defaultMonthlyNorm = useMemo(
    () => calculateMonthlyNormHours(currentMonth.getFullYear(), currentMonth.getMonth(), generatorHolidaySet),
    [currentMonth, generatorHolidaySet]
  );
  const groupedEmployees = useMemo(() => groupEmployeesByPosition(employees), [employees]);
  const sortedEmployees = useMemo(() => sortEmployees(employees), [employees]);
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Pick<
    Employee,
    "firstName" | "lastName" | "position" | "employmentRate" | "extraRole" | "experienceLevel" | "educationLevel"
  >>({
    firstName: "",
    lastName: "",
    position: POSITIONS[0],
    employmentRate: EMPLOYMENT_RATES[0],
    extraRole: "Brak",
    experienceLevel: "STANDARD",
    educationLevel: "BRAK"
  });
  const [generatorRequests, setGeneratorRequests] = useState<TimeOffRequest[]>([]);
  const [generatorForm, setGeneratorForm] = useState<{
    employeeId: string;
    kind: GeneratorRequestKind;
  }>({
    employeeId: "",
    kind: "vacation"
  });
  const [generatorResult, setGeneratorResult] = useState<ScheduleResult | null>(null);
  const [generatorPending, setGeneratorPending] = useState(false);
  const [generatorStatus, setGeneratorStatus] = useState<string>("");
  const [selectedRequestDays, setSelectedRequestDays] = useState<Set<number>>(new Set());
  const [monthlyNormInput, setMonthlyNormInput] = useState<WorkTimeNorm>({ hours: 0, minutes: 0 });

  useEffect(() => {
    scheduleDirtyRef.current = scheduleDirty;
  }, [scheduleDirty]);

  useEffect(() => {
    const hours = Math.floor(defaultMonthlyNorm);
    const minutes = Math.round((defaultMonthlyNorm - hours) * 60);
    setMonthlyNormInput({ hours, minutes });
  }, [defaultMonthlyNorm]);

  const buildPersistableEntries = useCallback((): ScheduleEntries => {
    const normalized = normalizeScheduleEntries(scheduleEntries);
    const merged = mergeEntriesWithEmployees(normalized, employees);
    const prepared: ScheduleEntries = {};

    Object.entries(merged).forEach(([employeeId, entry]) => {
      prepared[employeeId] = {
        fullName: (entry.fullName || "").trim(),
        position: entry.position || "",
        shifts: Object.fromEntries(
          Object.entries(entry.shifts || {}).map(([dayKey, value]) => [Number(dayKey), String(value || "")]).filter(([_, v]) =>
            Boolean(v)
          )
        )
      };
    });

    return prepared;
  }, [employees, scheduleEntries]);

  const loadData = useCallback(
    async ({ preserveStatus, skipIfDirty }: { preserveStatus?: boolean; skipIfDirty?: boolean } = {}) => {
      if (!user || !isAdmin) return;
      if (skipIfDirty && scheduleDirtyRef.current) return;

      setLoadingData(true);
      if (!preserveStatus) {
        setStatus({ type: "", text: "" });
      }

      try {
        const employeesSnap = await getDocs(collection(db, "employees"));
        const employeeList: Employee[] = employeesSnap.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<Employee, "id">;
          return {
            id: docSnap.id,
            ...data,
            extraRole: (data.extraRole as ExtraRoleOption | undefined) ?? "Brak",
            employmentRate: (data.employmentRate as EmploymentRate | undefined) ?? EMPLOYMENT_RATES[0],
            experienceLevel: (data.experienceLevel as ExperienceLevelOption | undefined) ?? "STANDARD",
            educationLevel: (data.educationLevel as EducationLevelOption | undefined) ?? "BRAK"
          };
        });
        setEmployees(employeeList);
        setSelectedEmployeeIds([]);

        const scheduleRef = doc(db, "schedules", monthId);
        const scheduleSnap = await getDoc(scheduleRef);
        const scheduleData = (scheduleSnap.exists() ? scheduleSnap.data() : {}) as ScheduleDocument;
        const loadedEntries = normalizeScheduleEntries((scheduleData.entries as ScheduleEntries) || {});

        setCustomHolidays(scheduleData.customHolidays || []);
        setScheduleEntries(mergeEntriesWithEmployees(loadedEntries, employeeList));
        setScheduleDirty(false);
      } catch (error) {
        console.error("Nie udało się pobrać danych:", error);
        setStatus({ type: "error", text: "Nie udało się pobrać danych z Firestore." });
        setEmployees([]);
        setScheduleEntries({});
        setCustomHolidays([]);
      } finally {
        setLoadingData(false);
      }
    },
    [db, isAdmin, monthId, user]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {
      console.error("Błąd wylogowania:", error);
    }
  };

  const handleMonthChange = (direction: number) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + direction);
      return next;
    });
  };

  useEffect(() => {
    if (!generatorForm.employeeId && employees[0]) {
      setGeneratorForm((prev) => ({ ...prev, employeeId: employees[0].id }));
    }
  }, [employees, generatorForm.employeeId]);

  const generatorEmployees = useMemo<GeneratorEmployee[]>(() => {
    const mapBaseRole = (position: string): GeneratorEmployee["baseRole"] => {
      const normalized = (position || "").toLowerCase();
      if (normalized.includes("magazynier")) return "MAGAZYNIERKA";
      if (normalized.includes("sekret")) return "SEKRETARKA";
      if (normalized.includes("terapeuta") && normalized.includes("zaj")) return "TERAPEUTKA";
      if (normalized.includes("sanitariusz")) return "SANITARIUSZ";
      if (normalized.includes("salow")) return "SALOWA";
      if (normalized.includes("opiekun")) return "OPIEKUN";
      return "PIELEGNIARKA";
    };

    const mapExtraRole = (extraRole?: string, fallback?: string): GeneratorEmployee["extraRole"] => {
      const source = (extraRole || fallback || "").toLowerCase();
      const normalized = source.replace("ł", "l");
      if (normalized.includes("oddzial")) return "ODDZIALOWA";
      if (normalized.includes("zabieg")) return "ZABIEGOWA";
      return "NONE";
    };

    const mapFte = (employmentRate?: string): GeneratorEmployee["fteType"] => {
      switch (employmentRate) {
        case "1 etat 8h":
          return "1_etat_8h";
        case "1/2 etatu":
          return "0_5_etatu";
        case "3/4 etatu":
          return "0_75_etatu";
        default:
          return "1_etat_12h";
      }
    };

    return employees.map((employee) => {
      const baseRole = mapBaseRole(employee.position);
      const extraRole = mapExtraRole(employee.extraRole, employee.position);
      const fte = mapFte(employee.employmentRate);
      const isEightHour =
        fte === "1_etat_8h" ||
        extraRole !== "NONE" ||
        baseRole === "SEKRETARKA" ||
        baseRole === "TERAPEUTKA" ||
        baseRole === "MAGAZYNIERKA" ||
        baseRole === "OPIEKUN";
      const experienceLevel: ExperienceLevel = (employee.experienceLevel as ExperienceLevelOption | undefined) ?? "STANDARD";
      const educationLevel: EducationLevel =
        baseRole === "PIELEGNIARKA"
          ? ((employee.educationLevel as EducationLevelOption | undefined) ?? "BRAK")
          : "BRAK";

      return {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        baseRole,
        extraRole,
        fteType: fte,
        canWorkNights: !isEightHour,
        experienceLevel,
        educationLevel
      };
    });
  }, [employees]);

  const handleGeneratorFormChange = (key: keyof typeof generatorForm, value: string) => {
    setGeneratorForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearSchedule = () => {
    const cleared = mergeEntriesWithEmployees({}, employees);
    setScheduleEntries(cleared);
    setScheduleDirty(true);
    scheduleDirtyRef.current = true;
    setGeneratorResult(null);
    setGeneratorStatus("");
    setStatus({ type: "success", text: "Wyczyszczono grafik – możesz rozpocząć od pustego układu." });
  };

  const handleAddGeneratorRequest = () => {
    if (!generatorForm.employeeId || selectedRequestDays.size === 0) {
      setGeneratorStatus("Wybierz pracownika i zaznacz co najmniej jeden dzień na mapie miesiąca.");
      return;
    }

    const newRequests: TimeOffRequest[] = Array.from(selectedRequestDays).map((dayNumber) => ({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${dayNumber}`,
      employeeId: generatorForm.employeeId,
      kind: generatorForm.kind,
      startDay: dayNumber,
      endDay: dayNumber
    }));

    setGeneratorRequests((prev) => [...prev, ...newRequests]);
    setSelectedRequestDays(new Set());
    setGeneratorStatus("Dodano wybrane dni do listy próśb.");
  };

  const handleRemoveGeneratorRequest = (id: string) => {
    setGeneratorRequests((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleRequestDay = (dayNumber: number) => {
    setSelectedRequestDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) {
        next.delete(dayNumber);
      } else {
        next.add(dayNumber);
      }
      return next;
    });
  };

  const handleGenerateSchedule = async () => {
    if (!generatorEmployees.length) {
      setGeneratorStatus("Brak pracowników do ułożenia grafiku.");
      return;
    }

    setGeneratorPending(true);
    setGeneratorStatus("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const sanitizedNorm: WorkTimeNorm = {
        hours: Number.isFinite(monthlyNormInput.hours) ? Math.max(0, monthlyNormInput.hours) : 0,
        minutes: Number.isFinite(monthlyNormInput.minutes) ? Math.max(0, monthlyNormInput.minutes % 60) : 0
      };
      const result = await generateSchedule(
        generatorEmployees,
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        generatorRequests,
        { customMonthlyNorm: sanitizedNorm, holidays: generatorHolidaySet, previousSchedule: generatorResult?.schedule }
      );
      setGeneratorResult(result);
      setGeneratorStatus("Wygenerowano grafik na wybrany miesiąc.");
    } catch (error) {
      console.error(error);
      setGeneratorStatus("Nie udało się wygenerować grafiku.");
    } finally {
      setGeneratorPending(false);
    }
  };

  const handleApplyGenerated = () => {
    if (!generatorResult) return;

    setScheduleEntries((prev) => {
      const merged = mergeEntriesWithEmployees(prev, employees);
      const updated: ScheduleEntries = { ...merged };

      Object.entries(generatorResult.schedule).forEach(([employeeId, shifts]) => {
        const entry = updated[employeeId] || { fullName: "", position: "", shifts: {} };
        updated[employeeId] = {
          fullName: entry.fullName,
          position: entry.position,
          shifts: { ...entry.shifts, ...shifts }
        };
      });

      return updated;
    });

    setScheduleDirty(true);
    scheduleDirtyRef.current = true;
    setStatus({ type: "success", text: "Wstawiono wygenerowany grafik do edytora." });
  };

  const handleAddEmployee = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ type: "", text: "" });

    if (!isAdmin) {
      setStatus({ type: "error", text: "Tylko administrator może dodawać pracowników." });
      return;
    }

    if (formPending) return;

    const trimmedFirst = employeeForm.firstName.trim();
    const trimmedLast = employeeForm.lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setStatus({ type: "error", text: "Uzupełnij imię i nazwisko." });
      return;
    }

    try {
      setFormPending(true);
      const payload = {
        firstName: trimmedFirst,
        lastName: trimmedLast,
        position: employeeForm.position,
        employmentRate: employeeForm.employmentRate,
        extraRole: employeeForm.extraRole,
        experienceLevel: employeeForm.experienceLevel,
        educationLevel: employeeForm.educationLevel,
        createdAt: serverTimestamp()
      };

      const ref = await addDoc(collection(db, "employees"), payload);
      const newEmployee: Employee = { id: ref.id, ...payload };

      setEmployees((prev) => [...prev, newEmployee]);
      setScheduleEntries((prev) => ({
        ...prev,
        [ref.id]: {
          shifts: {},
          fullName: `${trimmedFirst} ${trimmedLast}`.trim(),
          position: employeeForm.position
        }
      }));
      setEmployeeForm({
        firstName: "",
        lastName: "",
        position: POSITIONS[0],
        employmentRate: EMPLOYMENT_RATES[0],
        extraRole: "Brak"
      });
      setStatus({ type: "success", text: "Dodano pracownika." });
    } catch (error) {
      console.error("Nie udało się dodać pracownika:", error);
      setStatus({ type: "error", text: "Nie udało się dodać pracownika. Sprawdź uprawnienia." });
    } finally {
      setFormPending(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!isAdmin) return;
    if (deletingEmployeeId) return;

    try {
      setDeletingEmployeeId(employeeId);
      setStatus({ type: "", text: "" });

      const { [employeeId]: _, ...remainingEntries } = scheduleEntries;

      await deleteDoc(doc(db, "employees", employeeId));
      await setDoc(
        doc(db, "schedules", monthId),
        {
          entries: remainingEntries,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      setEmployees((prev) => prev.filter((emp) => emp.id !== employeeId));
      setScheduleEntries(remainingEntries);
      setSelectedEmployeeIds((prev) => prev.filter((id) => id !== employeeId));
      setScheduleDirty(true);
      setStatus({ type: "success", text: "Usunięto pracownika i zaktualizowano grafik." });
    } catch (error) {
      console.error("Nie udało się usunąć pracownika:", error);
      setStatus({ type: "error", text: "Nie udało się usunąć pracownika." });
    } finally {
      setDeletingEmployeeId(null);
    }
  };

  const handleSelectEmployee = (employeeId: string, checked: boolean) => {
    setSelectedEmployeeIds((prev) => {
      if (checked) {
        return prev.includes(employeeId) ? prev : [...prev, employeeId];
      }
      return prev.filter((id) => id !== employeeId);
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedEmployeeIds(checked ? employees.map((emp) => emp.id) : []);
  };

  const handleStartEdit = (employee: Employee | SimpleEmployee) => {
    setEditingEmployeeId(employee.id);
    setEditForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
      employmentRate: (employee.employmentRate as EmploymentRate | undefined) ?? EMPLOYMENT_RATES[0],
      extraRole: (employee.extraRole as ExtraRoleOption | undefined) ?? "Brak",
      experienceLevel: (employee as Employee).experienceLevel ?? "STANDARD",
      educationLevel: (employee as Employee).educationLevel ?? "BRAK"
    });
  };

  const handleCancelEdit = () => {
    setEditingEmployeeId(null);
    setEditForm({
      firstName: "",
      lastName: "",
      position: POSITIONS[0],
      employmentRate: EMPLOYMENT_RATES[0],
      extraRole: "Brak",
      experienceLevel: "STANDARD",
      educationLevel: "BRAK"
    });
  };

  const handleUpdateEmployee = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setStatus({ type: "", text: "" });

    if (!editingEmployeeId) return;
    if (!isAdmin) {
      setStatus({ type: "error", text: "Tylko administrator może edytować pracowników." });
      return;
    }

    const trimmedFirst = editForm.firstName.trim();
    const trimmedLast = editForm.lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setStatus({ type: "error", text: "Uzupełnij imię i nazwisko." });
      return;
    }

    try {
      setFormPending(true);
      await setDoc(
        doc(db, "employees", editingEmployeeId),
        {
          firstName: trimmedFirst,
          lastName: trimmedLast,
          position: editForm.position,
          employmentRate: editForm.employmentRate,
          extraRole: editForm.extraRole,
          experienceLevel: editForm.experienceLevel,
          educationLevel: editForm.educationLevel
        },
        { merge: true }
      );

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingEmployeeId
            ? {
                ...emp,
                firstName: trimmedFirst,
                lastName: trimmedLast,
                position: editForm.position,
                employmentRate: editForm.employmentRate,
                extraRole: editForm.extraRole,
                experienceLevel: editForm.experienceLevel,
                educationLevel: editForm.educationLevel
              }
            : emp
        )
      );

      setScheduleEntries((prev) => ({
        ...prev,
        [editingEmployeeId]: {
          ...(prev[editingEmployeeId] || { shifts: {} }),
          fullName: `${trimmedFirst} ${trimmedLast}`.trim(),
          position: editForm.position
        }
      }));

      setStatus({ type: "success", text: "Zaktualizowano dane pracownika." });
      handleCancelEdit();
      await loadData({ preserveStatus: true, skipIfDirty: true });
    } catch (error) {
      console.error("Nie udało się zaktualizować pracownika:", error);
      setStatus({ type: "error", text: "Nie udało się zaktualizować pracownika." });
    } finally {
      setFormPending(false);
    }
  };

  const handleApplyEmploymentRate = async (rate: EmploymentRate) => {
    if (!isAdmin) {
      setStatus({ type: "error", text: "Tylko administrator może edytować pracowników." });
      return;
    }

    if (!selectedEmployeeIds.length) {
      setStatus({ type: "error", text: "Zaznacz co najmniej jedną osobę, aby ustawić etat." });
      return;
    }

    try {
      setFormPending(true);
      setStatus({ type: "", text: "" });
      await Promise.all(
        selectedEmployeeIds.map((employeeId) =>
          setDoc(doc(db, "employees", employeeId), { employmentRate: rate }, { merge: true })
        )
      );

      setEmployees((prev) => prev.map((emp) => (selectedEmployeeIds.includes(emp.id) ? { ...emp, employmentRate: rate } : emp)));
      setStatus({ type: "success", text: "Zaktualizowano etaty zaznaczonych pracowników." });
      await loadData({ preserveStatus: true, skipIfDirty: true });
    } catch (error) {
      console.error("Nie udało się zaktualizować etatów:", error);
      setStatus({ type: "error", text: "Nie udało się zaktualizować etatów." });
    } finally {
      setFormPending(false);
    }
  };

  const handleSelectAction = (action: ShiftAction) => {
    setActiveAction(action);
  };

  const parseShiftValue = (value: string) => {
    const [base = "", ...rest] = value.split(" ").filter(Boolean);
    const extras = new Set(rest.map((item) => item.trim().toUpperCase()));

    return { base, extras };
  };

  const formatShiftValue = (base: string, extras: Set<string>) => {
    const segments: string[] = [];
    if (extras.has("RA")) segments.push("RA");
    if (extras.has("PO")) segments.push("PO");
    const orderedExtras = ["O", "R", "K"].filter((mark) => extras.has(mark));
    return [base, ...segments, ...orderedExtras].filter(Boolean).join(" ").trim();
  };

  const handleApplyShift = (employeeId: string, dayNumber: number) => {
    if (!isAdmin) return;

    const currentValue = scheduleEntries[employeeId]?.shifts?.[dayNumber] || "";
    const { base, extras } = parseShiftValue(currentValue);
    const nextExtras = new Set(extras);
    let nextBase = base;

    if (activeAction === "clear") {
      nextBase = "";
      nextExtras.clear();
    }

    if (activeAction === "D" || activeAction === "N" || activeAction === "1") {
      nextBase = activeAction;
      nextExtras.clear();
    }

    if (activeAction === "hours") {
      const normalized = normalizeHours(hoursValue);
      if (!normalized) {
        setStatus({ type: "error", text: "Podaj poprawny czas w formacie GG:MM (np. 6:10)." });
        return;
      }
      nextBase = normalized;
      nextExtras.clear();
      nextExtras.add(hoursSegment);
    }

    if (activeAction === "o") {
      nextExtras.delete("R");
      nextExtras.add("O");
    }

    if (activeAction === "r") {
      nextExtras.delete("O");
      nextExtras.add("R");
    }

    if (activeAction === "k") {
      if (nextExtras.has("K")) {
        nextExtras.delete("K");
      } else {
        nextExtras.add("K");
      }
    }

    const nextValue = formatShiftValue(nextBase, nextExtras);

    setScheduleEntries((prev) => {
      const current = prev[employeeId] || { shifts: {} };
      const updatedShifts = { ...current.shifts };

      if (nextValue) {
        updatedShifts[dayNumber] = nextValue;
      } else {
        delete updatedShifts[dayNumber];
      }

      setScheduleDirty(true);
      return {
        ...prev,
        [employeeId]: {
          ...current,
          shifts: updatedShifts
        }
      };
    });
  };

  const handleToggleHoliday = (dayNumber: number) => {
    setCustomHolidays((prev) => {
      const exists = prev.includes(dayNumber);
      const next = exists ? prev.filter((num) => num !== dayNumber) : [...prev, dayNumber];
      setScheduleDirty(true);
      return next;
    });
  };

  const handleCustomHolidaySubmit = () => {
    const parsed = Number.parseInt(customHolidayInput, 10);

    if (Number.isNaN(parsed) || parsed < 1 || parsed > days.length) {
      setStatus({ type: "error", text: `Podaj dzień od 1 do ${days.length}.` });
      return;
    }

    const existed = customHolidaySet.has(parsed);
    handleToggleHoliday(parsed);
    setCustomHolidayInput("");
    setStatus({
      type: "success",
      text: existed ? "Usunięto dodatkowe święto." : "Dodano dodatkowe święto."
    });
  };

  const handleSaveSchedule = async () => {
    setStatus({ type: "", text: "" });

    if (!isAdmin) {
      setStatus({ type: "error", text: "Tylko administrator może zapisać grafik." });
      return;
    }

    setScheduleSaving(true);

    try {
      const sanitizedEntries = buildPersistableEntries();
      const uniqueHolidays = Array.from(new Set(customHolidays)).sort((a, b) => a - b);

      await setDoc(
        doc(db, "schedules", monthId),
        {
          month: monthId,
          entries: sanitizedEntries,
          customHolidays: uniqueHolidays,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      const syncedEntries = mergeEntriesWithEmployees(sanitizedEntries, employees);
      setScheduleEntries(syncedEntries);
      setCustomHolidays(uniqueHolidays);
      setScheduleDirty(false);
      scheduleDirtyRef.current = false;
      setStatus({ type: "success", text: "Grafik zapisany." });
      await loadData({ preserveStatus: true, skipIfDirty: true });
    } catch (error) {
      console.error("Nie udało się zapisać grafiku:", error);
      setStatus({ type: "error", text: "Nie udało się zapisać grafiku." });
    } finally {
      setScheduleSaving(false);
    }
  };

  const visibleEmployees = sortedEmployees;

  const buildDayAssignments = useCallback(
    (dayNumber: number): DayAssignment[] => {
      return visibleEmployees
        .map((employee) => {
          const entry = scheduleEntries[employee.id];
          const value = entry?.shifts?.[dayNumber] || "";
          if (!value) return null;

          const badges = extractShiftBadges(value);
          const parts: string[] = [];
          if (badges.base && badges.base !== "-") parts.push(badges.base);
          if (badges.hasO) parts.push("O");
          if (badges.hasR) parts.push("R");
          if (badges.hasK) parts.push("K");

          const shiftLabel = parts.join(" · ") || badges.base || "-";

          return {
            id: employee.id,
            name: `${employee.firstName} ${employee.lastName}`.trim(),
            position: employee.position,
            shiftLabel,
            hasO: badges.hasO,
            hasR: badges.hasR,
            hasK: badges.hasK,
            employmentRate: employee.employmentRate
          } satisfies DayAssignment;
        })
        .filter(Boolean) as DayAssignment[];
    },
    [scheduleEntries, visibleEmployees]
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-3 py-6 text-sky-50">
      {generatorPending && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-sky-200/40 bg-slate-900/90 px-6 py-5 shadow-2xl">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-200/70 border-t-transparent" />
            <p className="text-lg font-semibold text-sky-50">Generowanie grafiku...</p>
            <p className="text-xs text-sky-100/70">Proces trwa co najmniej 10 sekund i maksymalnie 60 sekund.</p>
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex w-full flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-rose-200/30 bg-rose-950/60 p-4 shadow-lg">
          <div>
            <p className="text-xs uppercase tracking-wide text-rose-200">Panel administracji</p>
            <h1 className="text-2xl font-semibold">Zarządzanie grafikiem</h1>
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <a
              href="/dashboard"
              className="rounded-full border border-sky-400/60 bg-sky-900/60 px-3 py-1.5 text-xs font-semibold text-sky-50 shadow-inner transition hover:bg-sky-700/60"
            >
              Podgląd grafiku
            </a>
            <span className="rounded-full border border-rose-400/60 bg-rose-400/10 px-3 py-1 text-rose-50">{role || "--"}</span>
            <button
              onClick={handleLogout}
              className="rounded-full border border-rose-400/50 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-rose-50 transition hover:bg-rose-500/20"
            >
              Wyloguj
            </button>
          </div>
        </header>

        <div className="rounded-2xl border border-sky-200/30 bg-slate-900/60 p-4 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-sky-200">Sekcje panelu</p>
              <p className="text-xs text-sky-100/80">Wybierz obszar administracji.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {ADMIN_SECTIONS.map((section) => {
                const isActive = activeSection === section.key;

                return (
                  <button
                    key={section.key}
                    onClick={() => setActiveSection(section.key)}
                    className={`rounded-full px-4 py-1 transition ${
                      isActive
                        ? "border border-sky-300/60 bg-sky-400/20 text-sky-50 shadow"
                        : "border border-sky-200/40 bg-slate-950/60 text-sky-100 hover:border-sky-300/60 hover:text-sky-50"
                    }`}
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {status.text && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              status.type === "error"
                ? "border-red-300/60 bg-red-900/40 text-red-100"
                : status.type === "success"
                  ? "border-emerald-300/60 bg-emerald-900/40 text-emerald-50"
                  : "border-sky-200/60 bg-slate-900/60 text-sky-100"
            }`}
          >
            {status.text}
          </div>
        )}

        {activeSection === "employees" && (
          <>
            <section className="rounded-3xl border border-rose-400/30 bg-gradient-to-r from-rose-950 via-rose-900/60 to-slate-950 p-5 text-rose-50 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/40 bg-rose-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-100">
                    <span className="h-2 w-2 rounded-full bg-rose-400 shadow-neon" />
                    Panel Administracji
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-rose-50">Dodawanie i usuwanie pracowników</h2>
                    <p className="max-w-3xl text-sm text-rose-100/80">
                      Dodawaj i usuwaj osoby z listy pracowników. Zmiany od razu dostępne w grafiku.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                    {isAdmin ? "Administrator" : "Podgląd"}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-rose-300/30 bg-rose-900/40 p-4 shadow-inner">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-100">Dodawanie pracowników</h3>
                  {isAdmin ? (
                    <form onSubmit={handleAddEmployee} className="mt-3 space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs uppercase tracking-wide text-rose-100">Imię</label>
                          <input
                            type="text"
                            value={employeeForm.firstName}
                            onChange={(e) => setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))}
                            className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs uppercase tracking-wide text-rose-100">Nazwisko</label>
                          <input
                            type="text"
                            value={employeeForm.lastName}
                            onChange={(e) => setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))}
                            className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wide text-rose-100">Stanowisko</label>
                        <select
                          value={employeeForm.position}
                          onChange={(e) => setEmployeeForm((prev) => ({ ...prev, position: e.target.value as Position }))}
                          className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70"
                        >
                          {POSITIONS.map((pos) => (
                            <option key={pos} value={pos} className="bg-slate-900">
                              {pos}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wide text-rose-100">Dodatkowa funkcja</label>
                        <select
                          value={employeeForm.extraRole}
                          onChange={(e) => setEmployeeForm((prev) => ({ ...prev, extraRole: e.target.value as ExtraRoleOption }))}
                          className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70"
                        >
                          {EXTRA_ROLES.map((roleOption) => (
                            <option key={roleOption} value={roleOption} className="bg-slate-900">
                              {roleOption}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wide text-rose-100">Doświadczenie</label>
                        <select
                          value={employeeForm.experienceLevel}
                          onChange={(e) =>
                            setEmployeeForm((prev) => ({ ...prev, experienceLevel: e.target.value as ExperienceLevelOption }))
                          }
                          className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70"
                        >
                          {EXPERIENCE_LEVELS.map((level) => (
                            <option key={level} value={level} className="bg-slate-900">
                              {level === "NOWY" ? "NOWY / NOWA" : level === "DOSWIADCZONY" ? "DOŚWIADCZONY/A" : "STANDARD"}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wide text-rose-100">Wykształcenie (pielęgniarki)</label>
                        <select
                          value={employeeForm.educationLevel}
                          onChange={(e) =>
                            setEmployeeForm((prev) => ({ ...prev, educationLevel: e.target.value as EducationLevelOption }))
                          }
                          className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70"
                        >
                          {EDUCATION_LEVELS.map((level) => (
                            <option key={level} value={level} className="bg-slate-900">
                              {level}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wide text-rose-100">Etat</label>
                        <select
                          value={employeeForm.employmentRate}
                          onChange={(e) =>
                            setEmployeeForm((prev) => ({ ...prev, employmentRate: e.target.value as EmploymentRate }))
                          }
                          className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70"
                        >
                          {EMPLOYMENT_RATES.map((rate) => (
                            <option key={rate} value={rate} className="bg-slate-900">
                              {rate}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={formPending}
                        className="w-full rounded-2xl bg-gradient-to-r from-rose-400 via-rose-500 to-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {formPending ? "Dodawanie..." : "Dodaj pracownika"}
                      </button>
                    </form>
                  ) : (
                    <p className="mt-2 text-sm text-rose-100/80">
                      Panel administracyjny jest dostępny tylko dla administratorów. Poproś o dostęp, aby dodawać pracowników i edytować grafik.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-rose-300/30 bg-rose-900/40 p-4 shadow-inner">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-100">Lista pracowników</h3>
                    <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-200">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!employees.length && selectedEmployeeIds.length === employees.length}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="h-4 w-4 rounded border-rose-200 bg-rose-950/40 text-rose-400 focus:ring-rose-300"
                        />
                        <span>Wybierz wszystkich</span>
                      </label>
                      <span className="rounded-full border border-rose-200/40 bg-rose-900/60 px-2 py-0.5 text-[10px]">
                        Wybrano {selectedEmployeeIds.length}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                    {EMPLOYMENT_RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleApplyEmploymentRate(rate)}
                        disabled={formPending}
                        className="rounded-full border border-rose-200/40 bg-rose-800/60 px-3 py-1 font-semibold text-rose-50 transition hover:brightness-110 disabled:opacity-60"
                      >
                        Ustaw {rate}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 max-h-[28rem] space-y-4 overflow-y-auto pr-1">
                    {groupedEmployees.map((group, groupIndex) => {
                      const theme = getPositionTheme(group.position);

                      return (
                        <div
                          key={group.position}
                          className={`space-y-3 rounded-2xl border p-3 ${
                            groupIndex ? "border-rose-200/10" : ""
                          } ${theme.containerBg} ${theme.containerBorder}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${theme.accentDot}`} />
                            <p className={`text-[11px] uppercase tracking-[0.2em] ${theme.labelText}`}>{group.position}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.labelPill}`}>
                              {group.items.length} os.
                            </span>
                          </div>
                          <div className="space-y-2">
                            {group.items.map((employee) => (
                              <div
                                key={employee.id}
                                className={`flex w-full flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm shadow-inner transition ${theme.rowBg} ${theme.rowBorder}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedEmployeeIds.includes(employee.id)}
                                  onChange={(e) => handleSelectEmployee(employee.id, e.target.checked)}
                                  className="h-4 w-4 rounded border-rose-200 bg-rose-950/50 text-rose-300 focus:ring-rose-300"
                                />
                                <div className="min-w-[12rem] flex-1">
                                  <div className="font-semibold text-rose-50">{employee.firstName} {employee.lastName}</div>
                                  <div className="text-[12px] uppercase tracking-wide text-rose-100/70">{employee.position}</div>
                                  <div className="text-[11px] text-rose-100/70">{employee.employmentRate || "brak danych"}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(employee)}
                                    className="rounded-full border border-rose-200/50 bg-rose-50/10 px-3 py-1 text-[11px] font-semibold text-rose-50 transition hover:brightness-110"
                                  >
                                    Edytuj
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEmployee(employee.id)}
                                    disabled={deletingEmployeeId === employee.id}
                                    className="rounded-full border border-red-300/60 bg-red-500/20 px-3 py-1 text-[11px] font-semibold text-red-50 transition hover:bg-red-500/30 disabled:opacity-70"
                                  >
                                    {deletingEmployeeId === employee.id ? "Usuwanie..." : "Usuń"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {!employees.length && (
                      <p className="text-sm text-rose-100/80">Brak pracowników do wyświetlenia.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-rose-300/30 bg-rose-900/30 p-5 shadow-inner">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-100">Edycja pracownika</h3>
                  <p className="text-xs text-rose-100/80">Wybierz osobę z listy i zaktualizuj jej dane.</p>
                </div>
                <span className="rounded-full border border-rose-200/50 bg-rose-800/50 px-3 py-1 text-[11px] font-semibold text-rose-100">
                  {editingEmployeeId ? "Tryb edycji" : "Brak wybranej osoby"}
                </span>
              </div>

              <form onSubmit={handleUpdateEmployee} className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-rose-100">Imię</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    disabled={!editingEmployeeId}
                    className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-rose-100">Nazwisko</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    disabled={!editingEmployeeId}
                    className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-rose-100">Stanowisko</label>
                  <select
                    value={editForm.position}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, position: e.target.value as Position }))}
                    disabled={!editingEmployeeId}
                    className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos} className="bg-slate-900">
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-rose-100">Dodatkowa funkcja</label>
                  <select
                    value={editForm.extraRole}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, extraRole: e.target.value as ExtraRoleOption }))}
                    disabled={!editingEmployeeId}
                    className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {EXTRA_ROLES.map((roleOption) => (
                      <option key={roleOption} value={roleOption} className="bg-slate-900">
                        {roleOption}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-rose-100">Doświadczenie</label>
                  <select
                    value={editForm.experienceLevel}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, experienceLevel: e.target.value as ExperienceLevelOption }))}
                    disabled={!editingEmployeeId}
                    className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {EXPERIENCE_LEVELS.map((level) => (
                      <option key={level} value={level} className="bg-slate-900">
                        {level === "NOWY" ? "NOWY / NOWA" : level === "DOSWIADCZONY" ? "DOŚWIADCZONY/A" : "STANDARD"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-rose-100">Wykształcenie (pielęgniarki)</label>
                  <select
                    value={editForm.educationLevel}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, educationLevel: e.target.value as EducationLevelOption }))}
                    disabled={!editingEmployeeId}
                    className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {EDUCATION_LEVELS.map((level) => (
                      <option key={level} value={level} className="bg-slate-900">
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-rose-100">Etat</label>
                  <select
                    value={editForm.employmentRate}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, employmentRate: e.target.value as EmploymentRate }))}
                    disabled={!editingEmployeeId}
                    className="w-full rounded-xl border border-rose-200/50 bg-rose-950/50 px-3 py-2 text-sm text-rose-50 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {EMPLOYMENT_RATES.map((rate) => (
                      <option key={rate} value={rate} className="bg-slate-900">
                        {rate}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                  <button
                    type="submit"
                    disabled={!editingEmployeeId || formPending}
                    className="rounded-full bg-gradient-to-r from-rose-400 via-rose-500 to-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {formPending ? "Zapisywanie..." : "Zapisz zmiany"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-full border border-rose-200/50 bg-rose-50/5 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:brightness-110"
                  >
                    Anuluj
                  </button>
                  <p className="text-xs text-rose-100/70">Edycja zapisuje dane bezpośrednio w bazie i aktualizuje grafik.</p>
                </div>
              </form>
            </section>
          </>
        )}

        {activeSection === "schedule" && (
          <section className="min-w-0">
            <div className="glass-panel min-w-0 rounded-3xl border border-sky-200/20 bg-slate-900/60 p-5 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Edycja grafiku</h2>
                  <p className="text-xs text-sky-100/80">
                    Wybierz tryb wstawiania (D/N/1 lub godziny), dodaj opcje O/R, K i kliknij w pole grafiku, aby ustawić dyżur.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-sky-100">
                  <span className="rounded-full bg-sky-400/10 px-3 py-1">{days.length} dni</span>
                  <span className="rounded-full bg-sky-400/10 px-3 py-1">{visibleEmployees.length} prac.</span>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200/30 bg-slate-950/60 px-4 py-3 text-[12px] font-semibold">
                <span className="text-sky-100">Tryb wstawiania:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAction("D")}
                    className={`rounded-full px-3 py-1 ${activeAction === "D" ? "bg-amber-400 text-slate-900 shadow" : "border border-sky-200/40 text-sky-100"}`}
                  >
                    D (Dzień)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAction("N")}
                    className={`rounded-full px-3 py-1 ${activeAction === "N" ? "bg-sky-300 text-slate-900 shadow" : "border border-sky-200/40 text-sky-100"}`}
                  >
                    N (Noc)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAction("1")}
                    className={`rounded-full px-3 py-1 ${activeAction === "1" ? "bg-emerald-300 text-emerald-950 shadow" : "border border-sky-200/40 text-sky-100"}`}
                  >
                    1 (8h / Pn-Pt)
                  </button>
                  <div className="flex flex-wrap items-center gap-2 rounded-full border border-sky-200/40 px-3 py-1">
                    <label className="text-sky-100">Godziny</label>
                    <input
                      value={hoursValue}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setHoursValue(e.target.value)}
                      onFocus={() => handleSelectAction("hours")}
                      className="w-20 rounded-lg border border-sky-200/40 bg-slate-900 px-2 py-1 text-xs text-sky-50 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-300/60"
                      placeholder="6:10"
                    />
                    <button
                      type="button"
                      onClick={() => handleSelectAction("hours")}
                      className={`rounded-full px-2 py-1 text-[11px] ${activeAction === "hours" ? "bg-sky-200 text-slate-900" : "bg-slate-800 text-sky-100"}`}
                    >
                      Ustaw
                    </button>
                    <div className="flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-1">
                      <button
                        type="button"
                        onClick={() => setHoursSegment("RA")}
                        className={`rounded-full px-2 py-1 text-[11px] ${hoursSegment === "RA" ? "bg-amber-300 text-amber-950" : "border border-sky-200/40 text-sky-100"}`}
                      >
                        RA
                      </button>
                      <button
                        type="button"
                        onClick={() => setHoursSegment("PO")}
                        className={`rounded-full px-2 py-1 text-[11px] ${hoursSegment === "PO" ? "bg-sky-300 text-slate-950" : "border border-sky-200/40 text-sky-100"}`}
                      >
                        PO
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectAction("clear")}
                    className={`rounded-full px-3 py-1 ${activeAction === "clear" ? "bg-slate-200 text-slate-900 shadow" : "border border-sky-200/40 text-sky-100"}`}
                  >
                    Wyczyść pole
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200/30 bg-slate-950/60 px-4 py-3 text-[12px] font-semibold">
                <span className="text-sky-100">Dodatki do dyżuru:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAction("o")}
                    className={`rounded-full px-3 py-1 ${activeAction === "o" ? "bg-emerald-300 text-emerald-950" : "border border-sky-200/40 text-sky-100"}`}
                  >
                    o (ostra)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAction("r")}
                    className={`rounded-full px-3 py-1 ${activeAction === "r" ? "bg-purple-300 text-purple-950" : "border border-sky-200/40 text-sky-100"}`}
                  >
                    r (rehabilitacja)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAction("k")}
                    className={`rounded-full px-3 py-1 ${activeAction === "k" ? "bg-amber-300 text-amber-950" : "border border-sky-200/40 text-sky-100"}`}
                  >
                    K (koordynujący)
                  </button>
                </div>
                <span className="text-[11px] text-sky-200/80">
                  Krótkie godziny (np. 6:10) można wstawiać jako blok RA (rano) lub PO (popołudnie/noc), co wpływa na godziny startu dyżuru.
                </span>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200/30 bg-slate-950/60 px-4 py-3 text-[12px] font-semibold">
                <div className="flex flex-col gap-1">
                  <span className="text-sky-100">Święta własne:</span>
                  <p className="text-[11px] font-normal text-sky-100/80">Zaznacz dzień na czerwono lub odznacz go z grafiku.</p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <input
                    type="number"
                    min={1}
                    max={days.length}
                    value={customHolidayInput}
                    onChange={(e) => setCustomHolidayInput(e.target.value)}
                    className="w-20 rounded-lg border border-sky-200/40 bg-slate-900 px-2 py-1 text-xs text-sky-50 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-300/60"
                    placeholder="np. 15"
                  />
                  <button
                    type="button"
                    onClick={handleCustomHolidaySubmit}
                    className="rounded-full border border-sky-200/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-50 transition hover:bg-sky-400/20"
                  >
                    Dodaj / usuń
                  </button>
                </div>
              </div>

              <div id="grafik" className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleMonthChange(-1)}
                    className="rounded-full border border-sky-200/40 px-3 py-1 text-xs font-semibold text-sky-50 transition hover:bg-sky-400/10"
                  >
                    Poprzedni
                  </button>
                  <button
                    onClick={() => setCurrentMonth(new Date())}
                    className="rounded-full border border-sky-200/40 px-3 py-1 text-xs font-semibold text-sky-50 transition hover:bg-sky-400/10"
                  >
                    Dzisiaj
                  </button>
                  <button
                    onClick={() => handleMonthChange(1)}
                    className="rounded-full border border-sky-200/40 px-3 py-1 text-xs font-semibold text-sky-50 transition hover:bg-sky-400/10"
                  >
                    Następny
                  </button>
                </div>
                <p className="text-sm font-semibold text-sky-50">{getMonthLabel(currentMonth)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearSchedule}
                    className="rounded-full border border-rose-200/50 bg-rose-900/60 px-3 py-1 text-xs font-semibold text-rose-50 shadow-inner transition hover:bg-rose-800/70"
                  >
                    Wyczyść grafik
                  </button>
                </div>
              </div>

              <div className="relative w-full overflow-hidden rounded-2xl border border-sky-200/30">
                <div className="w-full overflow-x-auto overscroll-x-contain">
                  <table className="min-w-[1200px] text-[11px] text-sky-50">
                    <thead className="bg-slate-900/60">
                      <tr>
                        <th className="sticky left-0 z-20 bg-slate-900/60 px-4 py-3 text-left text-xs font-semibold">Pracownik</th>
                      {days.map((day) => (
                        <th
                          key={`day-header-${day.dayNumber}`}
                          className={`${getDayCellClasses(day, true)} relative text-center text-[10px] font-semibold`}
                        >
                          <button
                            type="button"
                            onClick={() => setSummaryDay(day)}
                            className="mx-auto flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition hover:bg-sky-200/10 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                            title="Podsumowanie dnia"
                          >
                            <span className="text-xs">{day.dayNumber}</span>
                            <span className="text-[10px] uppercase tracking-wide opacity-80">{day.label.slice(0, 3)}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleHoliday(day.dayNumber)}
                            className={`absolute right-1 top-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              customHolidaySet.has(day.dayNumber)
                                ? "bg-rose-400 text-rose-950"
                                : "border border-sky-200/40 text-sky-100"
                            }`}
                            title="Zaznacz / odznacz święto"
                          >
                            Ś
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedEmployees.map((group, groupIndex) => (
                      <Fragment key={`group-${group.position}`}>
                        {groupIndex > 0 && (
                          <tr>
                            <td colSpan={days.length + 1} className="h-2 bg-slate-950/60" />
                          </tr>
                        )}
                        {group.items.map((employee) => (
                          <tr key={`row-${employee.id}`} className="odd:bg-slate-900/40 even:bg-slate-900/20">
                            <td className="sticky left-0 z-10 bg-slate-950/80 px-4 py-3 text-left">
                              <div className="font-semibold">{employee.firstName} {employee.lastName}</div>
                              <div className="text-[10px] uppercase tracking-wide text-sky-100/70">{employee.position}</div>
                            </td>
                            {days.map((day) => {
                              const entry = scheduleEntries[employee.id];
                              const value = entry?.shifts?.[day.dayNumber] || "";
                              const tone = deriveShiftTone(value);
                              const badges = extractShiftBadges(value);
                              return (
                                <td
                                  key={`${employee.id}-day-${day.dayNumber}`}
                                  className={`${getDayCellClasses(day, true)} text-center align-middle`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleApplyShift(employee.id, day.dayNumber)}
                                    className={`relative mx-auto flex h-12 w-16 items-center justify-center rounded-md border border-sky-200/30 px-2 text-[11px] font-semibold transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sky-300/60 ${tone}`}
                                    title="Kliknij, aby ustawić dyżur zgodnie z wybranym trybem"
                                  >
                                    {badges.hasK && (
                                      <span className="absolute left-1 top-1 rounded-sm bg-red-700 px-1 text-[10px] font-bold text-red-50 shadow-lg">
                                        K
                                      </span>
                                    )}
                                    <div className="absolute right-1 top-1 flex flex-col gap-1">
                                      {badges.hasO && (
                                        <span className="rounded-sm bg-emerald-400 px-1 text-[10px] font-bold text-emerald-950 shadow">
                                          O
                                        </span>
                                      )}
                                      {badges.hasR && (
                                        <span className="rounded-sm bg-sky-300 px-1 text-[10px] font-bold text-sky-950 shadow">
                                          R
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-sm font-bold tracking-wide">{badges.base}</span>
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}

                    {!visibleEmployees.length && (
                      <tr>
                        <td
                          colSpan={days.length + 1}
                          className="px-4 py-6 text-center text-sm text-sky-100/80"
                        >
                          Brak pracowników. Dodaj pracownika w panelu powyżej.
                        </td>
                      </tr>
                    )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-sky-200/30 bg-slate-950/60 p-4 text-xs text-sky-100/80">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
                  <p>
                    Krótkie dyżury wpisuj w formacie <strong>6:10</strong>. Litera <strong>o</strong> lub <strong>r</strong> oznacza stronę oddziału, a
                    <strong> K</strong> wyróżnia pielęgniarkę/pielęgniarza koordynującego. <strong>1</strong> to etat 8h (Pn–Pt).
                  </p>
                  <button
                    onClick={handleSaveSchedule}
                    disabled={scheduleSaving || loadingData || !scheduleDirty}
                    className="w-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
                  >
                    {scheduleSaving ? "Zapisywanie..." : scheduleDirty ? "Zapisz grafik" : "Grafik zapisany"}
                  </button>
                </div>
              </div>
            </div>
            {loadingData && <p className="mt-4 text-xs text-sky-100/70">Trwa pobieranie danych...</p>}
          </section>
        )}

        {activeSection === "generator" && (
          <section className="rounded-3xl border border-sky-200/30 bg-slate-900/50 p-5 shadow-inner">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Generator grafików</h2>
                <p className="mt-1 text-sm text-sky-100/80">
                  Wybierz miesiąc, dodaj urlopy i prośby dyżurowe, a następnie wygeneruj grafik zgodny z normami.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-slate-800/80 px-2 py-1 text-sm font-semibold text-sky-50 shadow">
                <button
                  onClick={() => handleMonthChange(-1)}
                  className="rounded-full bg-slate-700 px-3 py-1 text-xs uppercase tracking-wide transition hover:bg-slate-600"
                >
                  Poprzedni
                </button>
                <span className="px-3 py-1 text-sm">{monthLabel}</span>
                <button
                  onClick={() => handleMonthChange(1)}
                  className="rounded-full bg-slate-700 px-3 py-1 text-xs uppercase tracking-wide transition hover:bg-slate-600"
                >
                  Następny
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-sky-200/20 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-sky-300/80">Urlopy i prośby</p>
                    <h3 className="text-lg font-semibold text-sky-50">Ograniczenia pracowników</h3>
                  </div>
                  <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-100">{generatorRequests.length} pozycji</span>
                </div>

                <div className="mt-3 space-y-3 text-sm text-sky-50">
                  <label className="block text-xs uppercase tracking-wide text-sky-200">Pracownik</label>
                  <select
                    value={generatorForm.employeeId}
                    onChange={(e) => handleGeneratorFormChange("employeeId", e.target.value)}
                    className="w-full rounded-xl border border-sky-200/30 bg-slate-900/80 px-3 py-2 text-sky-50 shadow focus:border-sky-400 focus:outline-none"
                  >
                    {!employees.length && <option value="">Brak pracowników</option>}
                    {sortedEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName} — {employee.position}
                      </option>
                    ))}
                  </select>

                  <label className="block text-xs uppercase tracking-wide text-sky-200">Typ prośby</label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(
                      [
                        { key: "vacation", label: "Urlop" },
                        { key: "unavailable", label: "Nieobecność" },
                        { key: "preferDuty", label: "Preferuje dyżur" }
                      ] satisfies { key: GeneratorRequestKind; label: string }[]
                    ).map((option) => (
                      <button
                        key={option.key}
                        onClick={() => handleGeneratorFormChange("kind", option.key)}
                        className={`rounded-xl border px-3 py-2 font-semibold transition ${
                          generatorForm.kind === option.key
                            ? "border-sky-400 bg-sky-500/20 text-sky-50"
                            : "border-sky-200/30 bg-slate-800/60 text-sky-100/80 hover:border-sky-300/40"
                        }`}
                        type="button"
                      >
                        {option.label}
                      </button>
                      ))}
                  </div>

                  <div className="mt-3 rounded-2xl border border-sky-200/30 bg-slate-900/60 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-sky-100">
                      <span>Mapa miesiąca</span>
                      <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-50">
                        Zaznaczono {selectedRequestDays.size} dni
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-1 text-xs">
                      {days.map((day) => {
                        const isSelected = selectedRequestDays.has(day.dayNumber);
                        const tone = isSelected
                          ? "bg-emerald-400 text-emerald-950 border-emerald-500"
                          : getDayCellClasses(day, true);
                        return (
                          <button
                            type="button"
                            key={`req-${day.dayNumber}`}
                            onClick={() => handleToggleRequestDay(day.dayNumber)}
                            className={`flex h-10 flex-col items-center justify-center rounded-lg border text-[10px] font-semibold transition hover:brightness-110 ${tone}`}
                          >
                            <span>{day.dayNumber}</span>
                            <span className="uppercase tracking-wide text-[9px]">{day.label.slice(0, 3)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-sky-100/70">Kliknij w dzień, aby dodać lub usunąć zaznaczenie.</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddGeneratorRequest}
                    className="w-full rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow transition hover:brightness-110 disabled:opacity-60"
                  >
                    Dodaj do listy
                  </button>

                  <div className="space-y-2">
                    {generatorRequests.length === 0 && (
                      <p className="text-xs text-sky-200/70">Brak dodanych urlopów ani próśb.</p>
                    )}
                    {generatorRequests.map((item) => {
                      const employee = employeeMap.get(item.employeeId);
                      const label =
                        item.kind === "vacation"
                          ? "Urlop"
                          : item.kind === "unavailable"
                            ? "Nieobecność"
                            : "Preferuje dyżur";
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-xl border border-sky-200/20 bg-slate-800/70 px-3 py-2 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-sky-50">
                              {employee?.firstName} {employee?.lastName}
                            </p>
                            <p className="text-sky-100/80">
                              {label}: {item.startDay}–{item.endDay}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveGeneratorRequest(item.id)}
                            className="rounded-full bg-rose-600/60 px-3 py-1 text-[11px] font-semibold text-rose-50 transition hover:bg-rose-500"
                          >
                            Usuń
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200/20 bg-slate-950/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-300/80">Założenia</p>
                <h3 className="text-lg font-semibold text-sky-50">Parametry generatora</h3>
                <ul className="mt-3 space-y-2 text-sm text-sky-100/80">
                  <li>• Odpoczynek dobowy: minimum 11h między zmianami.</li>
                  <li>• Odpoczynek tygodniowy: minimum 35h w każdym 7-dniowym oknie.</li>
                  <li>• Maksymalnie 13h pracy w dobie, minimalna długość zmiany 6h.</li>
                  <li>• Automatyczne liczenie normy miesięcznej na bazie dni roboczych i świąt (możesz ją nadpisać).</li>
                  <li>
                    • Minimalne obsady dnia: 3 pielęgniarki, preferencyjnie 1 sanitariusz (drugi tylko przy brakach godzinowych), 2
                    salowe, opiekun medyczny pracuje w dni robocze na etacie 8h.
                  </li>
                  <li>• Krótsze dyżury (6–11h) tylko gdy brakuje kilku godzin do normy.</li>
                  <li>• Prośby „Preferuje dyżur” zwiększają szansę na przydział w danym dniu.</li>
                </ul>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-sky-50">
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wide text-sky-200">Norma miesięczna – godziny</label>
                    <input
                      type="number"
                      min={0}
                      value={monthlyNormInput.hours}
                      onChange={(e) => setMonthlyNormInput((prev) => ({ ...prev, hours: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-sky-200/30 bg-slate-900/80 px-3 py-2 text-sky-50 shadow focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wide text-sky-200">Norma miesięczna – minuty</label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={monthlyNormInput.minutes}
                      onChange={(e) => setMonthlyNormInput((prev) => ({ ...prev, minutes: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-sky-200/30 bg-slate-900/80 px-3 py-2 text-sky-50 shadow focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <p className="col-span-2 text-[11px] text-sky-100/70">
                    Domyślna wartość wynosi {Math.floor(defaultMonthlyNorm)}h {Math.round((defaultMonthlyNorm % 1) * 60)} min na podstawie kalendarza i świąt.
                  </p>
                </div>
                <div className="mt-4 rounded-xl border border-sky-200/20 bg-slate-900/60 p-3 text-xs text-sky-100/70">
                  <p>Legenda:</p>
                  <p>
                    <span className="font-semibold">D</span> – dyżur dzienny 12h, <span className="font-semibold">N</span> – dyżur nocny 12h,
                    <span className="font-semibold"> 1</span> – etat 8h, liczba 6–11 – krótszy dyżur dzienny.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200/20 bg-slate-950/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-300/80">Generowanie</p>
                <h3 className="text-lg font-semibold text-sky-50">Uruchom generator</h3>

                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={handleGenerateSchedule}
                    disabled={generatorPending || !employees.length}
                    className="rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generatorPending ? "Generowanie..." : "Generuj grafik"}
                  </button>
                  <button
                    onClick={handleApplyGenerated}
                    disabled={!generatorResult}
                    className="rounded-full border border-sky-200/30 bg-slate-800/70 px-4 py-2 text-sm font-semibold text-sky-50 shadow transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Wstaw do edytora grafiku
                  </button>
                  {generatorStatus && <p className="text-xs text-sky-100/80">{generatorStatus}</p>}
                </div>

                {generatorResult && (
                  <div className="mt-4 space-y-3 text-sm text-sky-100/80">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-sky-200">Ostrzeżenia</p>
                      {generatorResult.warnings.length === 0 ? (
                        <p className="text-emerald-200">Brak ostrzeżeń – grafiki spełniają założenia.</p>
                      ) : (
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-200">
                          {generatorResult.warnings.map((warning, index) => (
                            <li key={index}>
                              <span className="mr-2 rounded-full bg-amber-300/20 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                {warning.code}
                              </span>
                              {warning.description}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-sky-200">Podsumowanie godzin</p>
                      <div className="divide-y divide-slate-700 rounded-xl border border-sky-200/20 bg-slate-900/60 text-xs">
                        {sortedEmployees.map((employee) => {
                          const summary = generatorResult.hoursSummary[employee.id];
                          if (!summary) return null;
                          const diff = Math.round(summary.difference * 10) / 10;
                          return (
                            <div key={employee.id} className="flex items-center justify-between px-3 py-2">
                              <div className="flex flex-col">
                                <span className="font-semibold text-sky-50">
                                  {employee.firstName} {employee.lastName}
                                </span>
                                <span className="text-[11px] text-sky-200/80">{employee.position}</span>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-sky-50">{summary.workedHours}h</p>
                                <p className="text-[11px] text-sky-200/70">
                                  Cel: {summary.targetHours}h, różnica: {diff > 0 ? "+" : ""}
                                  {diff}h
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {generatorResult.dailySummaries.length > 0 && (
                      <div className="max-h-64 overflow-y-auto rounded-xl border border-sky-200/20 bg-slate-900/50 p-3">
                        <p className="text-xs uppercase tracking-wide text-sky-200">Podsumowanie dzienne</p>
                        <div className="mt-2 space-y-2 text-[11px] text-sky-100/80">
                          {generatorResult.dailySummaries.map((summary) => (
                            <div key={summary.date} className="rounded-lg border border-sky-200/10 bg-slate-950/60 p-2">
                              <div className="flex items-center justify-between text-xs font-semibold text-sky-50">
                                <span>{summary.date}</span>
                                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-50">Dzień/Noc</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-md border border-emerald-300/30 bg-emerald-900/30 p-2">
                                  <p className="text-[10px] font-semibold uppercase text-emerald-100">Dzień</p>
                                  <p>Pielęgniarki: {summary.dayShift.nurses.total} (nowi: {summary.dayShift.nurses.new}, doświadczone: {summary.dayShift.nurses.experienced})</p>
                                  <p>Sanitariusze: {summary.dayShift.sanitariusze}, Salowe: {summary.dayShift.salowe}, Opiekunowie: {summary.dayShift.opiekunowie}</p>
                                </div>
                                <div className="rounded-md border border-sky-300/30 bg-sky-900/30 p-2">
                                  <p className="text-[10px] font-semibold uppercase text-sky-100">Noc</p>
                                  <p>Pielęgniarki: {summary.nightShift.nurses.total} (nowi: {summary.nightShift.nurses.new}, doświadczone: {summary.nightShift.nurses.experienced})</p>
                                  <p>Sanitariusze: {summary.nightShift.sanitariusze}, Salowe: {summary.nightShift.salowe}, Opiekunowie: {summary.nightShift.opiekunowie}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-sky-200/20 bg-slate-950/60 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-sky-300/80">Podgląd grafiku</p>
                  <h3 className="text-lg font-semibold text-sky-50">Automatycznie ułożony miesiąc</h3>
                  <p className="text-xs text-sky-100/70">Kliknij „Wstaw do edytora”, aby zapisać go w tabeli powyżej.</p>
                </div>
                <div className="rounded-full bg-slate-800/70 px-3 py-1 text-xs font-semibold text-sky-100 shadow">
                  {days.length} dni / {sortedEmployees.length} pracowników
                </div>
              </div>

              <div className="mt-3 overflow-x-auto rounded-2xl border border-sky-200/20 bg-slate-900/60 shadow-inner">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-900/80 px-3 py-2 text-left font-semibold text-sky-200">
                        Pracownik
                      </th>
                      {days.map((day) => (
                        <th
                          key={day.dayNumber}
                          className={`border-b border-slate-800 px-2 py-2 text-center font-semibold ${getDayCellClasses(day)}`}
                        >
                          <div className="flex flex-col text-[10px] leading-tight text-sky-50">
                            <span>{day.dayNumber}</span>
                            <span className="uppercase tracking-wide text-[9px]">{day.label.slice(0, 3)}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEmployees.map((employee) => {
                      const entry = generatorResult?.schedule[employee.id] || {};
                      const theme = getPositionTheme(employee.position || "");
                      return (
                        <tr key={employee.id} className={`${theme.rowBg} ${theme.rowBorder} border-b border-slate-800/40`}>
                          <td className="sticky left-0 z-10 bg-slate-900/80 px-3 py-2 text-left text-sky-50">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${theme.accentDot}`}></span>
                              <div>
                                <p className="text-sm font-semibold leading-tight">
                                  {employee.firstName} {employee.lastName}
                                </p>
                                <p className="text-[10px] uppercase tracking-wide text-sky-200/80">{employee.position}</p>
                              </div>
                            </div>
                          </td>
                          {days.map((day) => {
                            const value = entry[day.dayNumber] || "";
                            const badges = extractShiftBadges(value);
                            const tone = deriveShiftTone(value);
                            return (
                              <td key={`${employee.id}-${day.dayNumber}`} className="px-1 py-1 text-center">
                                <div
                                  className={`relative flex h-10 items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold ${tone}`}
                                >
                                  {badges.base || "-"}
                                  {badges.hasO && <span className="rounded-sm bg-emerald-400 px-1 text-[9px] font-bold text-emerald-950">O</span>}
                                  {badges.hasR && <span className="rounded-sm bg-sky-300 px-1 text-[9px] font-bold text-sky-950">R</span>}
                                  {badges.hasK && <span className="rounded-sm bg-red-400 px-1 text-[9px] font-bold text-red-950">K</span>}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!sortedEmployees.length && (
                  <p className="px-4 py-6 text-center text-sm text-sky-100/70">Brak pracowników do wyświetlenia.</p>
                )}
                {sortedEmployees.length > 0 && !generatorResult && (
                  <p className="px-4 py-4 text-center text-xs text-sky-100/70">
                    Uruchom generator, aby zobaczyć automatyczny grafik dla tego miesiąca.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
      </div>

      {summaryDay && (
        <DaySummaryModal
          dayLabel={`${summaryDay.dayNumber} ${getMonthLabel(currentMonth)} (${summaryDay.label})`}
          dayNumber={summaryDay.dayNumber}
          assignments={buildDayAssignments(summaryDay.dayNumber)}
          onClose={() => setSummaryDay(null)}
        />
      )}
    </main>
  );
}
