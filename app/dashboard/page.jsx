"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp
} from "firebase/firestore";
import { auth, app } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

const POSITIONS = [
  "Pielęgniarka / Pielęgniarz",
  "Opiekun Medyczny",
  "Sanitariusz",
  "Salowa"
];

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

const WEEKDAYS = [
  "Niedziela",
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota"
];

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthLabel(date) {
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function buildDays(date) {
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
      tone
    };
  });
}

function groupDaysByWeek(days) {
  const weeks = [];
  let currentWeek = [];

  days.forEach((day) => {
    const isoDay = day.weekday === 0 ? 7 : day.weekday;

    if (isoDay === 1 && currentWeek.length) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentWeek.push({ ...day, isoDay });

    if (isoDay === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  if (currentWeek.length) {
    weeks.push(currentWeek);
  }

  return weeks;
}

function mergeEntriesWithEmployees(entries, employees) {
  const next = { ...entries };

  employees.forEach((employee) => {
    const fullName = `${employee.firstName} ${employee.lastName}`.trim();
    next[employee.id] = {
      shifts: {},
      ...next[employee.id],
      fullName,
      position: employee.position,
      userId: employee.assignedUserId || null
    };
  });

  return next;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, role, profile, loading } = useAuth();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [employees, setEmployees] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    firstName: "",
    lastName: "",
    position: POSITIONS[0]
  });
  const [assignmentForm, setAssignmentForm] = useState({ employeeId: "", accountEmail: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const db = useMemo(() => getFirestore(app), []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  const isAdmin = role === "Administrator";
  const monthId = useMemo(() => getMonthKey(currentMonth), [currentMonth]);
  const days = useMemo(() => buildDays(currentMonth), [currentMonth]);
  const weeks = useMemo(() => groupDaysByWeek(days), [days]);

  useEffect(() => {
    if (!user) return;

    const fetchEmployees = async () => {
      try {
        if (isAdmin) {
          const snapshot = await getDocs(collection(db, "employees"));
          const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setEmployees(list);
          if (!assignmentForm.employeeId && list.length) {
            setAssignmentForm((prev) => ({ ...prev, employeeId: list[0].id }));
          }
        } else if (profile?.employeeId) {
          const employeeSnap = await getDoc(doc(db, "employees", profile.employeeId));
          if (employeeSnap.exists()) {
            setEmployees([{ id: employeeSnap.id, ...employeeSnap.data() }]);
          } else {
            setEmployees([]);
          }
        } else {
          setEmployees([]);
        }
      } catch (error) {
        console.error("Nie udało się pobrać listy pracowników:", error);
      }
    };

    fetchEmployees();
  }, [user, isAdmin, profile?.employeeId, db]);

  useEffect(() => {
    if (!user) return;

    const loadSchedule = async () => {
      setScheduleLoading(true);
      try {
        const scheduleRef = doc(db, "schedules", monthId);
        const scheduleSnap = await getDoc(scheduleRef);

        const loadedEntries = scheduleSnap.exists() ? scheduleSnap.data().entries || {} : {};
        const synced = mergeEntriesWithEmployees(loadedEntries, employees);
        setScheduleEntries(synced);
      } catch (error) {
        console.error("Błąd pobierania grafiku:", error);
        setScheduleEntries(mergeEntriesWithEmployees({}, employees));
      } finally {
        setScheduleLoading(false);
      }
    };

    loadSchedule();
  }, [user, monthId, db, employees]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {
      console.error("Błąd wylogowania:", error);
    }
  };

  const handleMonthChange = (direction) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + direction);
      return next;
    });
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    setStatusMessage("");

    try {
      const payload = {
        firstName: employeeForm.firstName.trim(),
        lastName: employeeForm.lastName.trim(),
        position: employeeForm.position,
        assignedUserId: null,
        assignedUserEmail: null,
        createdAt: serverTimestamp()
      };

      const ref = await addDoc(collection(db, "employees"), payload);
      setEmployees((prev) => [...prev, { id: ref.id, ...payload }]);
      setEmployeeForm({ firstName: "", lastName: "", position: POSITIONS[0] });
      setStatusMessage("Dodano nowego pracownika.");
    } catch (error) {
      console.error("Nie udało się dodać pracownika:", error);
      setStatusMessage("Nie udało się dodać pracownika. Sprawdź uprawnienia.");
    }
  };

  const handleAssignAccount = async (e) => {
    e.preventDefault();
    if (!assignmentForm.employeeId || !assignmentForm.accountEmail) return;
    setStatusMessage("");

    try {
      const userQuery = query(
        collection(db, "users"),
        where("email", "==", assignmentForm.accountEmail.trim().toLowerCase())
      );
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        setStatusMessage("Nie znaleziono konta o podanym adresie e-mail.");
        return;
      }

      const userDoc = userSnapshot.docs[0];
      const userId = userDoc.id;
      const employee = employees.find((emp) => emp.id === assignmentForm.employeeId);

      await updateDoc(doc(db, "users", userId), {
        employeeId: employee?.id || null,
        firstName: employee?.firstName || "",
        lastName: employee?.lastName || "",
        role: userDoc.data().role || "Użytkownik"
      });

      await updateDoc(doc(db, "employees", assignmentForm.employeeId), {
        assignedUserId: userId,
        assignedUserEmail: assignmentForm.accountEmail.trim().toLowerCase()
      });

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === assignmentForm.employeeId
            ? { ...emp, assignedUserId: userId, assignedUserEmail: assignmentForm.accountEmail.trim().toLowerCase() }
            : emp
        )
      );

      setStatusMessage("Przypisano konto do pracownika.");
    } catch (error) {
      console.error("Nie udało się przypisać konta:", error);
      setStatusMessage("Nie udało się przypisać konta. Upewnij się, że masz uprawnienia administratora.");
    }
  };

  const handleShiftChange = (employeeId, dayNumber, value) => {
    setScheduleEntries((prev) => {
      const current = prev[employeeId] || { shifts: {} };
      return {
        ...prev,
        [employeeId]: {
          ...current,
          shifts: { ...current.shifts, [dayNumber]: value }
        }
      };
    });
  };

  const handleSaveSchedule = async () => {
    setScheduleSaving(true);
    setStatusMessage("");

    try {
      const viewerIds = Object.values(scheduleEntries)
        .map((entry) => entry.userId)
        .filter(Boolean);
      const uniqueViewers = Array.from(new Set(viewerIds));

      await setDoc(
        doc(db, "schedules", monthId),
        {
          month: monthId,
          entries: scheduleEntries,
          viewerIds: uniqueViewers,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      setStatusMessage("Grafik zapisany.");
    } catch (error) {
      console.error("Nie udało się zapisać grafiku:", error);
      setStatusMessage("Nie udało się zapisać grafiku.");
    } finally {
      setScheduleSaving(false);
    }
  };

  const personalEmployee = useMemo(() => {
    if (!user) return null;
    return employees.find(
      (emp) => emp.assignedUserId === user.uid || emp.id === profile?.employeeId
    );
  }, [employees, user, profile?.employeeId]);

  const visibleEmployees = isAdmin ? employees : personalEmployee ? [personalEmployee] : [];

  const fullName = useMemo(() => {
    if (profile?.firstName || profile?.lastName) {
      return `${profile.firstName} ${profile.lastName}`.trim();
    }
    if (personalEmployee?.firstName || personalEmployee?.lastName) {
      return `${personalEmployee.firstName} ${personalEmployee.lastName}`.trim();
    }
    return user?.email || "";
  }, [profile, personalEmployee, user]);

  if (loading || scheduleLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="glass-panel rounded-2xl px-6 py-4 text-sm text-sky-100">
          Ładowanie Twojego grafiku...
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* Pasek górny */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-sky-50">Twój grafik</h1>
            <p className="text-sm text-sky-100/80">
              Witaj, <span className="font-semibold">{fullName || user.email}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setAdminPanelOpen((prev) => !prev)}
                className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-50 transition hover:bg-emerald-400/20"
              >
                Administracja
              </button>
            )}

            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                isAdmin
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100"
                  : "border-sky-400/60 bg-sky-400/10 text-sky-100"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {isAdmin ? "Administrator" : "Użytkownik"}
            </span>

            <button
              onClick={handleLogout}
              className="rounded-full border border-sky-400/50 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-sky-50 transition hover:bg-sky-500/20"
            >
              Wyloguj
            </button>
          </div>
        </header>

        {/* Nawigacja miesiąca */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/30 bg-slate-950/40 p-4 shadow-inner">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-200">Bieżący miesiąc</p>
            <p className="text-lg font-semibold text-sky-50">{getMonthLabel(currentMonth)}</p>
          </div>
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
        </div>

        {/* Widok grafiku */}
        <section className="glass-panel rounded-3xl p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Grafik tygodniowy</h2>
              <p className="text-xs text-sky-100/80">
                Każda karta obejmuje poniedziałek-niedzielę, kolory odzwierciedlają typ dnia.
              </p>
            </div>
            <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-medium text-sky-200">
              {visibleEmployees.length ? `${visibleEmployees.length} prac.` : "Brak przypisania"}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weeks.map((weekDays, index) => {
              const firstDay = weekDays[0]?.dayNumber;
              const lastDay = weekDays[weekDays.length - 1]?.dayNumber;
              const label = `Tydzień ${firstDay}-${lastDay}`;

              return (
                <div
                  key={`${label}-${index}`}
                  className="rounded-2xl border border-sky-200/30 bg-slate-950/40 p-4 shadow-sm transition hover:shadow-lg"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-sky-50">{label}</p>
                      <p className="text-[11px] text-sky-100/70">Poniedziałek - Niedziela</p>
                    </div>
                    {personalEmployee && (
                      <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-semibold text-sky-50">
                        Twoje dyżury
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {weekDays.map((day) => {
                      const shiftsForDay = visibleEmployees
                        .map((employee) => {
                          const entry = scheduleEntries[employee.id];
                          const shift = entry?.shifts?.[day.dayNumber];
                          return shift ? `${entry.fullName}: ${shift}` : null;
                        })
                        .filter(Boolean);

                      const personalShift = personalEmployee
                        ? scheduleEntries[personalEmployee.id]?.shifts?.[day.dayNumber]
                        : null;

                      return (
                        <div
                          key={`${label}-${day.dayNumber}`}
                          className={`${day.tone} rounded-xl border px-3 py-2`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[13px] font-semibold">{day.label}</p>
                              <p className="text-[11px] text-slate-700">Dzień {day.dayNumber}</p>
                            </div>
                            {personalShift && (
                              <span className="rounded-full bg-slate-900/10 px-2 py-1 text-[11px] font-semibold text-slate-800">
                                {personalShift}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 space-y-1 text-[11px] text-slate-800">
                            {shiftsForDay.length > 0 ? (
                              shiftsForDay.map((shift) => (
                                <p key={`${shift}-${day.dayNumber}`} className="font-semibold">
                                  {shift}
                                </p>
                              ))
                            ) : (
                              <p className="text-slate-600">Brak zaplanowanego dyżuru.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Panel administratora */}
        {isAdmin && adminPanelOpen && (
          <section className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Panel administracyjny</h2>
                <p className="text-xs text-sky-100/80">
                  Dodawaj pracowników, przypisuj konta i twórz grafik za pomocą tabeli poniżej.
                </p>
              </div>
              {statusMessage && (
                <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-medium text-sky-200">
                  {statusMessage}
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <form onSubmit={handleAddEmployee} className="rounded-2xl border border-sky-200/30 bg-slate-950/30 p-4">
                <h3 className="text-sm font-semibold text-sky-50">Dodaj pracownika</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-sky-100/80">
                    Imię
                    <input
                      value={employeeForm.firstName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-sky-200/40 bg-slate-900/40 px-3 py-2 text-sm text-sky-50 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/50"
                      required
                    />
                  </label>
                  <label className="text-xs text-sky-100/80">
                    Nazwisko
                    <input
                      value={employeeForm.lastName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-sky-200/40 bg-slate-900/40 px-3 py-2 text-sm text-sky-50 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/50"
                      required
                    />
                  </label>
                  <label className="text-xs text-sky-100/80 md:col-span-2">
                    Stanowisko
                    <select
                      value={employeeForm.position}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, position: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-sky-200/40 bg-slate-900/40 px-3 py-2 text-sm text-sky-50 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/50"
                    >
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="submit"
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110"
                >
                  Dodaj pracownika
                </button>
              </form>

              <form onSubmit={handleAssignAccount} className="rounded-2xl border border-sky-200/30 bg-slate-950/30 p-4">
                <h3 className="text-sm font-semibold text-sky-50">Przypisz konto do pracownika</h3>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs text-sky-100/80">
                    Pracownik
                    <select
                      value={assignmentForm.employeeId}
                      onChange={(e) => setAssignmentForm((prev) => ({ ...prev, employeeId: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-sky-200/40 bg-slate-900/40 px-3 py-2 text-sm text-sky-50 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/50"
                      required
                    >
                      <option value="">Wybierz pracownika</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.position})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs text-sky-100/80">
                    Email konta (Firebase)
                    <input
                      type="email"
                      value={assignmentForm.accountEmail}
                      onChange={(e) => setAssignmentForm((prev) => ({ ...prev, accountEmail: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-sky-200/40 bg-slate-900/40 px-3 py-2 text-sm text-sky-50 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/50"
                      placeholder="np. jan.kowalski@drewnica.pl"
                      required
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-500 via-sky-400 to-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110"
                >
                  Przypisz konto
                </button>
              </form>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-sky-50">Tabela edycji grafiku</h3>
                <button
                  onClick={handleSaveSchedule}
                  disabled={scheduleSaving}
                  className="rounded-xl bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-wait disabled:opacity-75"
                >
                  {scheduleSaving ? "Zapisywanie..." : "Zapisz grafik"}
                </button>
              </div>

              <div className="mt-3 overflow-auto rounded-2xl border border-sky-200/30">
                <table className="min-w-full divide-y divide-sky-200/30 text-xs text-sky-50">
                  <thead className="bg-slate-900/60">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Pracownik</th>
                      {weeks.map((weekDays, index) => {
                        const firstDay = weekDays[0]?.dayNumber;
                        const lastDay = weekDays[weekDays.length - 1]?.dayNumber;
                        return (
                          <th key={`week-${index}`} className="px-3 py-3 text-left font-semibold">
                            <div>{`Tydzień ${firstDay}-${lastDay}`}</div>
                            <div className="text-[10px] font-normal text-sky-100/70">Pon - Nd</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => (
                      <tr key={employee.id} className="odd:bg-slate-900/40 even:bg-slate-900/20">
                        <td className="whitespace-nowrap px-4 py-3 text-left font-medium">
                          <div>{employee.firstName} {employee.lastName}</div>
                          <div className="text-[11px] text-sky-100/70">{employee.position}</div>
                        </td>
                        {weeks.map((weekDays, weekIndex) => {
                          const entry = scheduleEntries[employee.id] || { shifts: {} };
                          return (
                            <td key={`${employee.id}-week-${weekIndex}`} className="px-3 py-2 align-top">
                              <div className="grid gap-2 rounded-xl border border-sky-200/20 bg-slate-900/30 p-2">
                                {weekDays.map((day) => {
                                  const value = entry.shifts?.[day.dayNumber] || "";
                                  return (
                                    <label
                                      key={`${employee.id}-${day.dayNumber}`}
                                      className="flex items-center justify-between gap-2 text-[11px]"
                                    >
                                      <span className="text-sky-50">{day.label}</span>
                                      <select
                                        value={value}
                                        onChange={(e) => handleShiftChange(employee.id, day.dayNumber, e.target.value)}
                                        className="w-16 rounded-md border border-sky-200/40 bg-slate-900/60 px-2 py-1 text-[11px] text-sky-50 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/50"
                                      >
                                        <option value="">-</option>
                                        <option value="D">D</option>
                                        <option value="N">N</option>
                                      </select>
                                    </label>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
