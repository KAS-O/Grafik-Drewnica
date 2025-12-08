"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, type Firestore } from "firebase/firestore";
import { auth, db as firestore } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
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
} from "./utils";
import { DaySummaryModal, type DayAssignment } from "./DaySummaryModal";

export const dynamic = "force-dynamic";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  employmentRate?: string;
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

function deriveShiftTone(value: string): string {
  if (!value) return "bg-slate-900/50 text-sky-100/70";
  if (value.startsWith("N")) return "bg-sky-300/90 text-slate-950";
  if (value.startsWith("D")) return "bg-amber-300/90 text-slate-950";
  if (/^\d/.test(value) || value.includes(":")) return "bg-amber-200/90 text-slate-950";
  if (value.startsWith("1")) return "bg-emerald-200/90 text-emerald-950";
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, isAdmin, role } = useAuth();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customHolidays, setCustomHolidays] = useState<number[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntries>({});
  const [loadingData, setLoadingData] = useState(false);
  const [summaryDay, setSummaryDay] = useState<DayCell | null>(null);
  const [status, setStatus] = useState<StatusState>({ type: "", text: "" });
  const db: Firestore = firestore;

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
        const employeeList: Employee[] = employeesSnap.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<Employee, "id">;
          return {
            id: docSnap.id,
            ...data,
            employmentRate: data.employmentRate || "1 etat 12h"
          };
        });
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
  const sortedEmployees = useMemo(() => sortEmployees(employees), [employees]);
  const groupedEmployees = useMemo(() => groupEmployeesByPosition(employees), [employees]);
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
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-sky-50">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex w-full flex-col gap-6">
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

          <div className="overflow-x-auto rounded-2xl border border-sky-200/30">
            <table className="min-w-[1200px] text-[11px] text-sky-50">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-900/60 px-4 py-3 text-left text-xs font-semibold">Pracownik</th>
                  {days.map((day) => (
                    <th
                      key={`day-header-${day.dayNumber}`}
                      className={`${getDayCellClasses(day)} text-center text-[10px] font-semibold`}
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
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedEmployees.map((group) => (
                  <Fragment key={`group-${group.position}`}>
                    {(() => {
                      const theme = getPositionTheme(group.position);

                      return (
                        <tr>
                          <td
                            colSpan={days.length + 1}
                            className={`bg-slate-950/80 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.2em] ${theme.rowBorder}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${theme.accentDot}`} />
                              <span className={`text-xs ${theme.labelText}`}>{group.position}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.labelPill}`}>
                                {group.items.length} os.
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                    {group.items.map((employee, employeeIndex) => {
                      const theme = getPositionTheme(employee.position);

                      return (
                        <tr
                          key={`row-${employee.id}`}
                          className={`${employeeIndex % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/20"}`}
                        >
                          <td className={`sticky left-0 z-10 px-4 py-3 text-left ${theme.rowBg} ${theme.rowBorder} ${theme.accentBorder}`}>
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
                                className={`${getDayCellClasses(day)} text-center align-middle`}
                              >
                                <span
                                  className={`relative mx-auto flex h-12 w-16 items-center justify-center rounded-md border border-sky-200/30 px-2 text-[11px] font-semibold ${tone}`}
                                >
                                  {badges.hasK && (
                                    <span className="absolute left-1 top-1 rounded-sm bg-red-700 px-1 text-[10px] font-bold text-red-50 shadow-lg">
                                      K
                                    </span>
                                  )}
                                  <span className="absolute right-1 top-1 flex flex-col gap-1">
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
                                  </span>
                                  <span className="text-sm font-bold tracking-wide">{badges.base}</span>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
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
