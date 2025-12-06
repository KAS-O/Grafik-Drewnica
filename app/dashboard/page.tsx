"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore
} from "firebase/firestore";
import { auth, app } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

const POSITIONS = [
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

type Position = (typeof POSITIONS)[number];
type ShiftValue = "" | "D" | "N";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  position: Position | string;
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

type DayCell = {
  dayNumber: number;
  weekday: number;
  label: string;
  tone: string;
  isSaturday: boolean;
  isSundayOrHoliday: boolean;
};

const POLISH_HOLIDAYS = new Set([
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

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function buildDays(date: Date): DayCell[] {
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

    let tone = "bg-sky-50 text-slate-900 border-sky-100";
    if (isSaturday) {
      tone = "bg-emerald-100 text-emerald-900 border-emerald-200";
    }
    if (isSundayOrHoliday) {
      tone = "bg-red-100 text-red-900 border-red-200";
    }

    return {
      dayNumber,
      weekday,
      label: WEEKDAYS[weekday],
      tone,
      isSaturday,
      isSundayOrHoliday
    };
  });
}

function mergeEntriesWithEmployees(entries: ScheduleEntries, employees: Employee[]): ScheduleEntries {
  const combined: ScheduleEntries = {};

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

function cycleShiftValue(current: ShiftValue): ShiftValue {
  if (current === "D") return "N";
  if (current === "N") return "";
  return "D";
}

function getDayCellClasses(day: DayCell, isEditable = false): string {
  const padding = isEditable ? "px-1.5 py-1" : "px-2 py-2";

  if (day.isSundayOrHoliday) {
    return `${padding} bg-rose-900/40 text-rose-50 border border-rose-500/30`;
  }

  if (day.isSaturday) {
    return `${padding} bg-amber-900/30 text-amber-50 border border-amber-400/30`;
  }

  return `${padding} bg-slate-900/40 text-sky-50 border border-sky-200/20`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, isAdmin, role } = useAuth();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntries>({});
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
  const db: Firestore = useMemo(() => getFirestore(app), []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const monthId = useMemo(() => getMonthKey(currentMonth), [currentMonth]);
  const days = useMemo(() => buildDays(currentMonth), [currentMonth]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoadingData(true);
      setStatus({ type: "", text: "" });

      try {
        const employeesSnap = await getDocs(collection(db, "employees"));
        const employeeList: Employee[] = employeesSnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<Employee, "id">) }));
        setEmployees(employeeList);

        const scheduleRef = doc(db, "schedules", monthId);
        const scheduleSnap = await getDoc(scheduleRef);
        const loadedEntries = (scheduleSnap.exists() ? (scheduleSnap.data()?.entries as ScheduleEntries) || {} : {}) as ScheduleEntries;

        setScheduleEntries(mergeEntriesWithEmployees(loadedEntries, employeeList));
        setScheduleDirty(false);
      } catch (error) {
        console.error("Nie udało się pobrać danych:", error);
        setStatus({ type: "error", text: "Nie udało się pobrać danych z Firestore." });
        setEmployees([]);
        setScheduleEntries({});
      } finally {
        setLoadingData(false);
      }
    };

    void load();
  }, [user, monthId, db]);

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

  const handleToggleShift = (employeeId: string, dayNumber: number) => {
    if (!isAdmin) return;

    setScheduleEntries((prev) => {
      const current = prev[employeeId] || { shifts: {} };
      const currentValue = current.shifts?.[dayNumber] || "";
      const nextValue = cycleShiftValue(currentValue as ShiftValue);
      setScheduleDirty(true);
      return {
        ...prev,
        [employeeId]: {
          ...current,
          shifts: { ...current.shifts, [dayNumber]: nextValue }
        }
      };
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

  const visibleEmployees = employees;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-sky-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-200/20 bg-slate-900/60 p-4 shadow-lg">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-200">Panel grafiku</p>
            <h1 className="text-2xl font-semibold">Grafik Drewnica</h1>
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span className="rounded-full border border-sky-400/60 bg-sky-400/10 px-3 py-1 text-sky-100">{role || "--"}</span>
            <button
              onClick={handleLogout}
              className="rounded-full border border-sky-400/50 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-sky-50 transition hover:bg-sky-500/20"
            >
              Wyloguj
            </button>
          </div>
        </header>

        {status.text && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              status.type === "error"
                ? "border-red-400/40 bg-red-500/10 text-red-100"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {status.text}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Grafik miesięczny</h2>
                <p className="text-xs text-sky-100/80">
                  Lista pracowników i prosty układ dyżurów. Kliknięcie pola zmienia wartość (pusty → D → N → pusty).
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-sky-100">
                <span className="rounded-full bg-sky-400/10 px-3 py-1">{days.length} dni</span>
                <span className="rounded-full bg-sky-400/10 px-3 py-1">{visibleEmployees.length} prac.</span>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
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

            <div className="overflow-auto rounded-2xl border border-sky-200/30">
              <table className="min-w-full text-[11px] text-sky-50">
                <thead className="bg-slate-900/60">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-900/60 px-4 py-3 text-left text-xs font-semibold">Pracownik</th>
                    {days.map((day) => (
                      <th
                        key={`day-header-${day.dayNumber}`}
                        className={`${getDayCellClasses(day)} text-center text-[10px] font-semibold`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs">{day.dayNumber}</span>
                          <span className="text-[10px] uppercase tracking-wide opacity-80">{day.label.slice(0, 3)}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((employee) => (
                    <tr key={`row-${employee.id}`} className="odd:bg-slate-900/40 even:bg-slate-900/20">
                      <td className="sticky left-0 z-10 bg-slate-950/80 px-4 py-3 text-left">
                        <div className="font-semibold">{employee.firstName} {employee.lastName}</div>
                        <div className="text-[10px] uppercase tracking-wide text-sky-100/70">{employee.position}</div>
                      </td>
                      {days.map((day) => {
                        const entry = scheduleEntries[employee.id];
                        const value = entry?.shifts?.[day.dayNumber] || "";
                        const tone =
                          value === "D"
                            ? "bg-amber-300/90 text-slate-950"
                            : value === "N"
                              ? "bg-sky-300/90 text-slate-950"
                              : "bg-slate-900/50 text-sky-100/70";
                        return (
                          <td
                            key={`${employee.id}-day-${day.dayNumber}`}
                            className={`${getDayCellClasses(day)} text-center align-middle`}
                          >
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => handleToggleShift(employee.id, day.dayNumber)}
                                className={`mx-auto flex h-8 w-12 items-center justify-center rounded-md border border-sky-200/30 px-2 text-[11px] font-semibold transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sky-300/60 ${tone}`}
                                title="Kliknij, aby zmieniać dyżur"
                              >
                                {value || "-"}
                              </button>
                            ) : (
                              <span className={`mx-auto flex h-8 w-12 items-center justify-center rounded-md border border-sky-200/30 px-2 text-[11px] font-semibold ${tone}`}>
                                {value || "-"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {!visibleEmployees.length && (
                    <tr>
                      <td
                        colSpan={days.length + 1}
                        className="px-4 py-6 text-center text-sm text-sky-100/80"
                      >
                        Brak pracowników. Dodaj pracownika w panelu administratora.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-sky-100/80">
                Edycja grafiku jest dostępna tylko dla administratora. Użytkownik widzi podgląd.
              </p>
              {isAdmin && (
                <button
                  onClick={handleSaveSchedule}
                  disabled={scheduleSaving || loadingData || !scheduleDirty}
                  className="rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {scheduleSaving ? "Zapisywanie..." : scheduleDirty ? "Zapisz grafik" : "Grafik zapisany"}
                </button>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Lista pracowników</h2>
                <p className="text-xs text-sky-100/80">Pracownicy to osobne wpisy – nie są kontami logowania.</p>
              </div>
              <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-semibold text-sky-100">{employees.length}</span>
            </div>

            <div className="space-y-3">
              {employees.map((employee) => (
                <div key={employee.id} className="rounded-2xl border border-sky-200/30 bg-slate-900/60 px-4 py-3 text-sm">
                  <div className="font-semibold text-sky-50">{employee.firstName} {employee.lastName}</div>
                  <div className="text-[12px] uppercase tracking-wide text-sky-100/70">{employee.position}</div>
                </div>
              ))}

              {!employees.length && (
                <p className="text-sm text-sky-100/80">Brak pracowników do wyświetlenia.</p>
              )}
            </div>

            {isAdmin && (
              <form onSubmit={handleAddEmployee} className="mt-6 space-y-4 rounded-2xl border border-sky-200/30 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-sky-100">Dodaj pracownika</h3>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">Admin</span>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-sky-200">Imię</label>
                    <input
                      type="text"
                      value={employeeForm.firstName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="w-full rounded-xl border border-sky-300/40 bg-slate-950/40 px-3 py-2 text-sm text-sky-50 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-sky-200">Nazwisko</label>
                    <input
                      type="text"
                      value={employeeForm.lastName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="w-full rounded-xl border border-sky-300/40 bg-slate-950/40 px-3 py-2 text-sm text-sky-50 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-sky-200">Stanowisko</label>
                    <select
                      value={employeeForm.position}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, position: e.target.value as Position }))}
                      className="w-full rounded-xl border border-sky-300/40 bg-slate-950/40 px-3 py-2 text-sm text-sky-50 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                    >
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos} className="bg-slate-900">
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={formPending}
                  className="w-full rounded-2xl bg-gradient-to-r from-sky-400 via-sky-500 to-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {formPending ? "Dodawanie..." : "Dodaj pracownika"}
                </button>
              </form>
            )}

            {loadingData && (
              <p className="mt-4 text-xs text-sky-100/70">Trwa pobieranie danych...</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
