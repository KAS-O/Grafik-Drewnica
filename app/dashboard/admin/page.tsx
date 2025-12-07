"use client";

import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore
} from "firebase/firestore";
import { auth, app } from "../../../lib/firebase";
import { useAuth } from "../../../context/AuthContext";
import {
  buildDays,
  getDayCellClasses,
  getMonthKey,
  getMonthLabel,
  getPositionTheme,
  groupEmployeesByPosition,
  mergeEntriesWithEmployees,
  sortEmployees,
  type DayCell
} from "../utils";

type ShiftValue = string;

type Position =
  | "Pielęgniarka / Pielęgniarz"
  | "Opiekun Medyczny"
  | "Sanitariusz"
  | "Salowa"
  | string;

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
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
  "Salowa"
];

type ShiftTemplate = "D" | "N" | "1" | "hours" | "clear";

type WardSide = "" | "o" | "r";

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
  const [status, setStatus] = useState<StatusState>({ type: "", text: "" });
  const [employeeForm, setEmployeeForm] = useState<Pick<Employee, "firstName" | "lastName" | "position">>({
    firstName: "",
    lastName: "",
    position: POSITIONS[0]
  });
  const [formPending, setFormPending] = useState(false);
  const [shiftTemplate, setShiftTemplate] = useState<ShiftTemplate>("D");
  const [hoursValue, setHoursValue] = useState("6:10");
  const [wardSide, setWardSide] = useState<WardSide>("");
  const [coordinator, setCoordinator] = useState(false);
  const db: Firestore = useMemo(() => getFirestore(app), []);

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
  const groupedEmployees = useMemo(() => groupEmployeesByPosition(employees), [employees]);
  const sortedEmployees = useMemo(() => sortEmployees(employees), [employees]);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const load = async () => {
      setLoadingData(true);
      setStatus({ type: "", text: "" });

      try {
        const employeesSnap = await getDocs(collection(db, "employees"));
        const employeeList: Employee[] = employeesSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Employee, "id">)
        }));
        setEmployees(employeeList);

        const scheduleRef = doc(db, "schedules", monthId);
        const scheduleSnap = await getDoc(scheduleRef);
        const scheduleData = (scheduleSnap.exists() ? scheduleSnap.data() : {}) as ScheduleDocument;
        const loadedEntries = (scheduleData.entries as ScheduleEntries) || {};

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
    };

    void load();
  }, [user, monthId, db, isAdmin]);

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
      setEmployeeForm({ firstName: "", lastName: "", position: POSITIONS[0] });
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
      setScheduleDirty(true);
      setStatus({ type: "success", text: "Usunięto pracownika i zaktualizowano grafik." });
    } catch (error) {
      console.error("Nie udało się usunąć pracownika:", error);
      setStatus({ type: "error", text: "Nie udało się usunąć pracownika." });
    } finally {
      setDeletingEmployeeId(null);
    }
  };

  const buildShiftValue = (): string | null => {
    if (shiftTemplate === "clear") return "";
    if (shiftTemplate === "hours") {
      const normalized = normalizeHours(hoursValue);
      if (!normalized) {
        setStatus({ type: "error", text: "Podaj poprawny czas w formacie GG:MM (np. 6:10)." });
        return null;
      }
      return `${normalized}${wardSide ? ` ${wardSide}` : ""}${coordinator ? " K" : ""}`.trim();
    }

    const base = shiftTemplate;
    return `${base}${wardSide ? ` ${wardSide}` : ""}${coordinator ? " K" : ""}`.trim();
  };

  const handleApplyShift = (employeeId: string, dayNumber: number) => {
    if (!isAdmin) return;

    const value = buildShiftValue();
    if (value === null) return;

    setScheduleEntries((prev) => {
      const current = prev[employeeId] || { shifts: {} };
      const updatedShifts = { ...current.shifts };

      if (value) {
        updatedShifts[dayNumber] = value;
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
      await setDoc(
        doc(db, "schedules", monthId),
        {
          month: monthId,
          entries: scheduleEntries,
          customHolidays,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      setScheduleDirty(false);
      setStatus({ type: "success", text: "Grafik zapisany." });
    } catch (error) {
      console.error("Nie udało się zapisać grafiku:", error);
      setStatus({ type: "error", text: "Nie udało się zapisać grafiku." });
    } finally {
      setScheduleSaving(false);
    }
  };

  const visibleEmployees = sortedEmployees;

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-sky-50">
      <div className="mx-auto w-full max-w-[1600px] overflow-x-auto">
        <div className="flex w-full min-w-[1200px] flex-col gap-6">
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-100">Lista pracowników</h3>
                <span className="text-[11px] uppercase tracking-[0.2em] text-rose-200">Kliknij aby usunąć</span>
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
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() => handleDeleteEmployee(employee.id)}
                            disabled={deletingEmployeeId === employee.id}
                            className={`group flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm shadow-inner transition ${theme.rowBg} ${theme.rowBorder} hover:brightness-110 disabled:opacity-70`}
                          >
                            <div>
                              <div className="font-semibold text-rose-50">{employee.firstName} {employee.lastName}</div>
                              <div className="text-[12px] uppercase tracking-wide text-rose-100/70">{employee.position}</div>
                            </div>
                            <span className="rounded-full border border-red-300/60 bg-red-500/20 px-3 py-1 text-[11px] font-semibold text-red-50 transition group-hover:bg-red-500/30">
                              {deletingEmployeeId === employee.id ? "Usuwanie..." : "Usuń"}
                            </span>
                          </button>
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

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-panel rounded-3xl border border-sky-200/20 bg-slate-900/60 p-5 md:p-6">
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
                  onClick={() => setShiftTemplate("D")}
                  className={`rounded-full px-3 py-1 ${shiftTemplate === "D" ? "bg-amber-400 text-slate-900 shadow" : "border border-sky-200/40 text-sky-100"}`}
                >
                  D (Dzień)
                </button>
                <button
                  type="button"
                  onClick={() => setShiftTemplate("N")}
                  className={`rounded-full px-3 py-1 ${shiftTemplate === "N" ? "bg-sky-300 text-slate-900 shadow" : "border border-sky-200/40 text-sky-100"}`}
                >
                  N (Noc)
                </button>
                <button
                  type="button"
                  onClick={() => setShiftTemplate("1")}
                  className={`rounded-full px-3 py-1 ${shiftTemplate === "1" ? "bg-emerald-300 text-emerald-950 shadow" : "border border-sky-200/40 text-sky-100"}`}
                >
                  1 (8h / Pn-Pt)
                </button>
                <div className="flex items-center gap-2 rounded-full border border-sky-200/40 px-3 py-1">
                  <label className="text-sky-100">Godziny</label>
                  <input
                    value={hoursValue}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setHoursValue(e.target.value)}
                    onFocus={() => setShiftTemplate("hours")}
                    className="w-20 rounded-lg border border-sky-200/40 bg-slate-900 px-2 py-1 text-xs text-sky-50 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-300/60"
                    placeholder="6:10"
                  />
                  <button
                    type="button"
                    onClick={() => setShiftTemplate("hours")}
                    className={`rounded-full px-2 py-1 text-[11px] ${shiftTemplate === "hours" ? "bg-sky-200 text-slate-900" : "bg-slate-800 text-sky-100"}`}
                  >
                    Ustaw
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShiftTemplate("clear")}
                  className={`rounded-full px-3 py-1 ${shiftTemplate === "clear" ? "bg-slate-200 text-slate-900 shadow" : "border border-sky-200/40 text-sky-100"}`}
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
                  onClick={() => setWardSide((prev) => (prev === "o" ? "" : "o"))}
                  className={`rounded-full px-3 py-1 ${wardSide === "o" ? "bg-emerald-300 text-emerald-950" : "border border-sky-200/40 text-sky-100"}`}
                >
                  o (ostra)
                </button>
                <button
                  type="button"
                  onClick={() => setWardSide((prev) => (prev === "r" ? "" : "r"))}
                  className={`rounded-full px-3 py-1 ${wardSide === "r" ? "bg-purple-300 text-purple-950" : "border border-sky-200/40 text-sky-100"}`}
                >
                  r (rehabilitacja)
                </button>
                <button
                  type="button"
                  onClick={() => setCoordinator((prev) => !prev)}
                  className={`rounded-full px-3 py-1 ${coordinator ? "bg-amber-300 text-amber-950" : "border border-sky-200/40 text-sky-100"}`}
                >
                  K (koordynujący)
                </button>
              </div>
              <span className="text-[11px] text-sky-200/80">
                Krótkie godziny (np. 6:10) są traktowane jako dyżur dzienny; dyżury nocne nie mają skróconych godzin.
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
            </div>

            <div className="overflow-x-auto rounded-2xl border border-sky-200/30">
              <table className="min-w-[1200px] text-[11px] text-sky-50">
                <thead className="bg-slate-900/60">
                  <tr>
                    <th className="sticky left-0 z-20 bg-slate-900/60 px-4 py-3 text-left text-xs font-semibold">Pracownik</th>
                    {days.map((day) => (
                      <th
                        key={`day-header-${day.dayNumber}`}
                        className={`${getDayCellClasses(day, true)} relative text-center text-[10px] font-semibold`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs">{day.dayNumber}</span>
                          <span className="text-[10px] uppercase tracking-wide opacity-80">{day.label.slice(0, 3)}</span>
                        </div>
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-sky-100/80">
              <p>
                Krótkie dyżury wpisuj w formacie <strong>6:10</strong>. Litera <strong>o</strong> lub <strong>r</strong> oznacza stronę oddziału, a
                <strong> K</strong> wyróżnia pielęgniarkę/pielęgniarza koordynującego. <strong>1</strong> to etat 8h (Pn–Pt).
              </p>
              <button
                onClick={handleSaveSchedule}
                disabled={scheduleSaving || loadingData || !scheduleDirty}
                className="rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scheduleSaving ? "Zapisywanie..." : scheduleDirty ? "Zapisz grafik" : "Grafik zapisany"}
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Podgląd ustawień</h2>
                <p className="text-xs text-sky-100/80">Aktualny tryb wstawiania dyżurów.</p>
              </div>
              <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-semibold text-sky-100">{employees.length}</span>
            </div>

            <div className="space-y-3 text-sm text-sky-100/90">
              <div className="rounded-2xl border border-sky-200/30 bg-slate-900/60 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-sky-200">Wybrany tryb</p>
                <p className="mt-1 text-base font-semibold text-sky-50">
                  {shiftTemplate === "D" && "Dzień (D)"}
                  {shiftTemplate === "N" && "Noc (N)"}
                  {shiftTemplate === "1" && "1 etat (8h)"}
                  {shiftTemplate === "hours" && `Godziny: ${hoursValue}`}
                  {shiftTemplate === "clear" && "Czyszczenie pola"}
                </p>
                <p className="mt-2 text-xs text-sky-100/70">
                  Oznaczenia dodatkowe: {wardSide || "brak"} {coordinator ? ", K" : ""}
                </p>
              </div>

              <div className="rounded-2xl border border-sky-200/30 bg-slate-900/60 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-sky-200">Święta własne</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                  {customHolidays.length ? (
                    customHolidays
                      .sort((a, b) => a - b)
                      .map((day) => (
                        <span key={day} className="rounded-full bg-rose-400/20 px-3 py-1 text-rose-50">
                          {day} {getMonthLabel(currentMonth)}
                        </span>
                      ))
                  ) : (
                    <span className="text-sky-100/70">Brak dodatkowych świąt w tym miesiącu.</span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200/30 bg-slate-900/60 px-4 py-3 text-xs text-sky-100/80">
                <p>
                  • Święta można zaznaczać przy nagłówkach dni (przycisk Ś).<br />• Litery <strong>o</strong> i <strong>r</strong> oznaczają odpowiednio ostrą i rehabilitacyjną część oddziału.<br />• Wpisanie liczby godzin (np. 6:10) ustawia dyżur dzienny z krótkim czasem pracy.
                </p>
              </div>
            </div>

            {loadingData && <p className="mt-4 text-xs text-sky-100/70">Trwa pobieranie danych...</p>}
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}
