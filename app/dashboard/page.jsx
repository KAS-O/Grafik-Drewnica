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
    const isoDay = weekday === 0 ? 7 : weekday;
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
      isoDay,
      label: WEEKDAYS[weekday],
      tone
    };
  });
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

  const renderScheduleTable = (employeesList, { editable = false, highlightPersonal = false } = {}) => (
    <div className="overflow-x-auto rounded-2xl border border-sky-200/30 bg-slate-950/40 shadow-inner">
      <table className="min-w-full border-collapse text-xs text-sky-50">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-slate-900/80 px-3 py-3 text-left text-sm font-semibold shadow-[6px_0_12px_-10px_rgba(0,0,0,0.55)]">
              Pracownik
            </th>
            {days.map((day) => {
              const isWeekend = day.weekday === 0 || day.weekday === 6;
              const headerTone = isWeekend
                ? "bg-rose-900/60 text-rose-100 border-rose-400/30"
                : "bg-slate-900/50 text-sky-100 border-sky-200/20";
              const separator = day.isoDay === 1 ? "border-l border-sky-200/30" : "";
              return (
                <th
                  key={`head-${day.dayNumber}`}
                  className={`min-w-[70px] px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide ${headerTone} ${separator}`}
                >
                  <div className="text-sm font-bold leading-tight">{day.dayNumber}</div>
                  <div className="text-[10px] opacity-80">{day.label.slice(0, 3)}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employeesList.map((employee) => {
            const entry = scheduleEntries[employee.id] || { shifts: {} };
            const isPersonalRow = highlightPersonal && personalEmployee?.id === employee.id;

            return (
              <tr
                key={employee.id}
                className={`${isPersonalRow ? "ring-1 ring-emerald-400/70" : ""} odd:bg-slate-950/40 even:bg-slate-900/40`}
              >
                <td className="sticky left-0 z-10 bg-slate-950/95 px-3 py-3 text-left font-medium shadow-[6px_0_12px_-10px_rgba(0,0,0,0.55)]">
                  <div className="text-sm">{employee.firstName} {employee.lastName}</div>
                  <div className="text-[11px] text-sky-100/70">{employee.position}</div>
                </td>
                {days.map((day) => {
                  const value = entry.shifts?.[day.dayNumber] || "";
                  const separator = day.isoDay === 1 ? "border-l border-sky-200/20" : "";
                  const baseTone = day.weekday === 0
                    ? "bg-rose-500/10 border-rose-400/40"
                    : day.weekday === 6
                      ? "bg-emerald-500/10 border-emerald-400/40"
                      : "bg-slate-900/30 border-slate-800";

                  return (
                    <td
                      key={`${employee.id}-${day.dayNumber}`}
                      className={`px-2 py-2 text-center align-top ${baseTone} ${separator}`}
                    >
                      {editable ? (
                        <select
                          value={value}
                          onChange={(e) => handleShiftChange(employee.id, day.dayNumber, e.target.value)}
                          className="w-16 rounded-md border border-sky-200/40 bg-slate-950/70 px-2 py-1 text-[11px] text-sky-50 focus:border-rose-300 focus:ring-2 focus:ring-rose-400/50"
                        >
                          <option value="">-</option>
                          <option value="D">D</option>
                          <option value="N">N</option>
                        </select>
                      ) : value ? (
                        <span className="rounded-md bg-slate-900/40 px-2 py-1 text-[11px] font-semibold text-sky-50">{value}</span>
                      ) : (
                        <span className="text-[11px] text-sky-200/70">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

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
        <header
          className={`flex flex-wrap items-center justify-between gap-4 rounded-3xl border px-4 py-4 md:px-6 ${
            isAdmin
              ? "border-rose-400/60 bg-gradient-to-r from-rose-950/80 via-slate-950/70 to-rose-900/70 shadow-[0_18px_60px_-35px_rgba(244,63,94,0.9)]"
              : "border-sky-200/30 bg-slate-950/40"
          }`}
        >
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-sky-50">Twój grafik</h1>
            <p className="text-sm text-sky-100/80">
              Witaj, <span className="font-semibold">{fullName || user.email}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <div className="flex items-center gap-3 rounded-2xl border border-rose-300/60 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 shadow-[0_10px_40px_-24px_rgba(244,63,94,0.9)]">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-500/30 text-base">🛡️</span>
                <div className="text-left leading-tight">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-rose-100/80">tryb</p>
                  <p>Panel administratora</p>
                </div>
              </div>
            )}

            {isAdmin && (
              <button
                onClick={() => setAdminPanelOpen((prev) => !prev)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  adminPanelOpen
                    ? "border-rose-300 bg-rose-500/30 text-rose-50 shadow-[0_8px_24px_-18px_rgba(244,63,94,0.9)]"
                    : "border-rose-300/60 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                }`}
              >
                {adminPanelOpen ? "Zamknij panel" : "Otwórz panel"}
              </button>
            )}

            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                isAdmin
                  ? "border-rose-300/70 bg-rose-500/15 text-rose-50"
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
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-4 shadow-inner ${
            isAdmin
              ? "border-rose-400/40 bg-gradient-to-r from-rose-950/70 via-slate-950/60 to-rose-900/60"
              : "border-sky-200/30 bg-slate-950/40"
          }`}
        >
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-200">Bieżący miesiąc</p>
            <p className="text-lg font-semibold text-sky-50">{getMonthLabel(currentMonth)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleMonthChange(-1)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                isAdmin
                  ? "border-rose-300/60 text-rose-50 hover:bg-rose-500/20"
                  : "border-sky-200/40 text-sky-50 hover:bg-sky-400/10"
              }`}
            >
              Poprzedni
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                isAdmin
                  ? "border-rose-300/60 text-rose-50 hover:bg-rose-500/20"
                  : "border-sky-200/40 text-sky-50 hover:bg-sky-400/10"
              }`}
            >
              Dzisiaj
            </button>
            <button
              onClick={() => handleMonthChange(1)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                isAdmin
                  ? "border-rose-300/60 text-rose-50 hover:bg-rose-500/20"
                  : "border-sky-200/40 text-sky-50 hover:bg-sky-400/10"
              }`}
            >
              Następny
            </button>
          </div>
        </div>

        {/* Widok grafiku */}
        <section className="glass-panel rounded-3xl p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Grafik miesięczny</h2>
              <p className="text-xs text-sky-100/80">
                Poziomy widok tygodni i dyżurów inspirowany tabelą – szybkie porównanie dni i pracowników.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {personalEmployee && !isAdmin && (
                <span className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-100">
                  Twoje dyżury podświetlone
                </span>
              )}
              <span className="rounded-full border border-sky-200/40 bg-sky-400/10 px-3 py-1 font-medium text-sky-100">
                {visibleEmployees.length ? `${visibleEmployees.length} prac.` : "Brak przypisania"}
              </span>
            </div>
          </div>

          {visibleEmployees.length ? (
            renderScheduleTable(visibleEmployees, { editable: isAdmin, highlightPersonal: !isAdmin })
          ) : (
            <div className="rounded-2xl border border-sky-200/30 bg-slate-950/50 px-4 py-6 text-center text-sm text-sky-100/80">
              Brak przypisanego pracownika dla tego konta.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-sky-100/80">
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-300/40 bg-rose-500/10 px-3 py-1">
              <span className="h-3 w-3 rounded-full bg-rose-400" /> Niedziele i święta
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1">
              <span className="h-3 w-3 rounded-full bg-emerald-300" /> Soboty
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/40 bg-slate-900/40 px-3 py-1">
              <span className="h-3 w-3 rounded-full bg-sky-300" /> Dni robocze
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1">
              <span className="h-3 w-3 rounded-full bg-emerald-400" /> Podświetlenie przypisanego pracownika
            </span>
          </div>
        </section>

        {/* Panel administratora */}
        {isAdmin && adminPanelOpen && (
          <section className="rounded-3xl border border-rose-400/50 bg-gradient-to-br from-rose-950/85 via-slate-950/75 to-rose-900/80 p-5 md:p-6 shadow-[0_20px_80px_-40px_rgba(244,63,94,0.9)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-rose-500/25 text-lg">🛠️</span>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-100">Panel administratora</h2>
                  <p className="text-xs text-rose-100/80">
                    Czerwony motyw wyraźnie odróżnia tryb edycji od podglądu. Dodawaj pracowników, przypisuj konta i zapisuj grafik.
                  </p>
                </div>
              </div>
              {statusMessage && (
                <span className="rounded-full border border-rose-300/50 bg-rose-500/20 px-3 py-1 text-[11px] font-medium text-rose-50 shadow-[0_10px_30px_-22px_rgba(244,63,94,0.8)]">
                  {statusMessage}
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <form onSubmit={handleAddEmployee} className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 shadow-inner shadow-rose-500/10">
                <h3 className="text-sm font-semibold text-rose-50">Dodaj pracownika</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-rose-100/80">
                    Imię
                    <input
                      value={employeeForm.firstName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-rose-900/40 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/50"
                      required
                    />
                  </label>
                  <label className="text-xs text-rose-100/80">
                    Nazwisko
                    <input
                      value={employeeForm.lastName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-rose-900/40 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/50"
                      required
                    />
                  </label>
                  <label className="text-xs text-rose-100/80 md:col-span-2">
                    Stanowisko
                    <select
                      value={employeeForm.position}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, position: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-rose-900/40 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/50"
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
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-rose-400 via-amber-300 to-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110"
                >
                  Dodaj pracownika
                </button>
              </form>

              <form onSubmit={handleAssignAccount} className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 shadow-inner shadow-rose-500/10">
                <h3 className="text-sm font-semibold text-rose-50">Przypisz konto do pracownika</h3>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs text-rose-100/80">
                    Pracownik
                    <select
                      value={assignmentForm.employeeId}
                      onChange={(e) => setAssignmentForm((prev) => ({ ...prev, employeeId: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-rose-900/40 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/50"
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

                  <label className="text-xs text-rose-100/80">
                    Email konta (Firebase)
                    <input
                      type="email"
                      value={assignmentForm.accountEmail}
                      onChange={(e) => setAssignmentForm((prev) => ({ ...prev, accountEmail: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-rose-900/40 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/50"
                      placeholder="np. jan.kowalski@drewnica.pl"
                      required
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-300 via-rose-300 to-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110"
                >
                  Przypisz konto
                </button>
              </form>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-rose-50">Tabela edycji grafiku (poziomo)</h3>
                <button
                  onClick={handleSaveSchedule}
                  disabled={scheduleSaving}
                  className="rounded-xl bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-wait disabled:opacity-75"
                >
                  {scheduleSaving ? "Zapisywanie..." : "Zapisz grafik"}
                </button>
              </div>

              {employees.length ? (
                renderScheduleTable(employees, { editable: true })
              ) : (
                <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-5 text-sm text-rose-50/80">
                  Brak pracowników do edycji.
                </div>
              )}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
