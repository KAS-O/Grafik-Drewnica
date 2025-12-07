"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore, type Firestore } from "firebase/firestore";
import { auth, app } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  buildDays,
  deriveShiftTone,
  getDayCellClasses,
  getMonthKey,
  getMonthLabel,
  mergeEntriesWithEmployees,
  parseShiftValue,
  sortEmployeesByPosition,
  type DayCell
} from "./utils";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  createdAt?: unknown;
};

type ScheduleEntry = {
  shifts: Record<number, string>;
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, isAdmin, role } = useAuth();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customHolidays, setCustomHolidays] = useState<number[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntries>({});
  const [loadingData, setLoadingData] = useState(false);
  const [status, setStatus] = useState<StatusState>({ type: "", text: "" });
  const db: Firestore = useMemo(() => getFirestore(app), []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const monthId = useMemo(() => getMonthKey(currentMonth), [currentMonth]);

  useEffect(() => {
    if (!user) return;

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
  }, [user, monthId, db]);

  const days: DayCell[] = useMemo(() => buildDays(currentMonth, new Set(customHolidays)), [currentMonth, customHolidays]);
  const sortedEmployees = useMemo(() => sortEmployeesByPosition(employees), [employees]);
  const groupedEmployees = useMemo(
    () =>
      sortedEmployees.reduce<{ position: string; members: Employee[] }[]>((acc, employee) => {
        const existing = acc.find((group) => group.position === employee.position);
        if (existing) {
          existing.members.push(employee);
          return acc;
        }

        return [...acc, { position: employee.position, members: [employee] }];
      }, []),
    [sortedEmployees]
  );
  const visibleEmployees = sortedEmployees;

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

  return (
    <main className="min-h-screen overflow-x-auto bg-slate-950 px-4 py-8 text-sky-50">
      <div className="mx-auto flex w-full min-w-[1200px] max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-200/20 bg-slate-900/60 p-4 shadow-lg">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-200">Panel grafiku</p>
            <h1 className="text-2xl font-semibold">Grafik Drewnica</h1>
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold">
            {isAdmin && (
              <a
                href="/dashboard/admin"
                className="rounded-full border border-rose-400/60 bg-rose-900/60 px-3 py-1.5 text-xs font-semibold text-rose-50 shadow-inner transition hover:bg-rose-700/60"
              >
                Panel Administracji
              </a>
            )}
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
                ? "border-red-300/60 bg-red-900/40 text-red-100"
                : status.type === "success"
                  ? "border-emerald-300/60 bg-emerald-900/40 text-emerald-50"
                  : "border-sky-200/60 bg-slate-900/60 text-sky-100"
            }`}
          >
            {status.text}
          </div>
        )}

        <section className="rounded-3xl border border-sky-200/20 bg-slate-900/50 p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Grafik miesięczny</h2>
              <p className="text-xs text-sky-100/80">
                Podgląd grafiku. Aby edytować dyżury i pracowników, przejdź do panelu administracji.
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
            <table className="min-w-max text-[11px] text-sky-50">
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
                {groupedEmployees.map((group, groupIndex) => (
                  <Fragment key={`group-${group.position || groupIndex}`}>
                    {groupIndex > 0 && (
                      <tr>
                        <td colSpan={days.length + 1} className="h-3 bg-slate-950" aria-hidden />
                      </tr>
                    )}

                    {group.members.map((employee) => (
                      <tr key={`row-${employee.id}`} className="odd:bg-slate-900/40 even:bg-slate-900/25">
                        <td className="sticky left-0 z-10 bg-slate-950/80 px-4 py-3 text-left">
                          <div className="font-semibold">{employee.firstName} {employee.lastName}</div>
                          <div className="text-[10px] uppercase tracking-wide text-sky-100/70">{employee.position}</div>
                        </td>
                        {days.map((day) => {
                          const entry = scheduleEntries[employee.id];
                          const value = entry?.shifts?.[day.dayNumber] || "";
                          const parsedShift = parseShiftValue(value);
                          const tone = deriveShiftTone(value);
                          return (
                            <td
                              key={`${employee.id}-day-${day.dayNumber}`}
                              className={`${getDayCellClasses(day)} text-center align-middle`}
                            >
                              <div
                                className={`mx-auto flex h-10 w-16 items-center justify-center rounded-md border border-sky-200/30 px-2 text-[11px] font-semibold ${tone}`}
                              >
                                <div className="relative flex h-full w-full items-center justify-center">
                                  <span className="text-[11px] font-bold">{parsedShift.baseLabel || "-"}</span>
                                  {parsedShift.wardSide && (
                                    <span
                                      className={`absolute right-1 top-1 rounded-md px-1 text-[9px] font-black shadow-sm ${
                                        parsedShift.wardSide === "o"
                                          ? "bg-sky-300 text-slate-950"
                                          : "bg-fuchsia-300 text-slate-950"
                                      }`}
                                    >
                                      {parsedShift.wardSide.toUpperCase()}
                                    </span>
                                  )}
                                  {parsedShift.coordinator && (
                                    <span className="absolute left-1 top-1 rounded-md bg-red-700 px-1 text-[9px] font-black text-rose-50 shadow-sm">
                                      K
                                    </span>
                                  )}
                                </div>
                              </div>
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
                      Brak pracowników. Administrator może dodać pracowników w panelu administracyjnym.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loadingData && (
            <p className="mt-4 text-xs text-sky-100/70">Trwa pobieranie danych...</p>
          )}
        </section>
      </div>
    </main>
  );
}
