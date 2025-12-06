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
  setDoc,
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
      tone,
      isSaturday,
      isSundayOrHoliday
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

function getDayCellClasses(day, isEditable = false) {
  const padding = isEditable ? "px-1.5 py-1" : "px-2 py-2";

  if (day.isSundayOrHoliday) {
    return `${padding} bg-rose-900/40 text-rose-50 border border-rose-500/30`;
  }

  if (day.isSaturday) {
    return `${padding} bg-amber-900/30 text-amber-50 border border-amber-400/30`;
  }

  return `${padding} bg-slate-900/40 text-sky-50 border border-sky-200/20`;
}

function cycleShiftValue(current) {
  if (current === "D") return "N";
  if (current === "N") return "";
  return "D";
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, role, profile, loading, isAdmin } = useAuth();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [employees, setEmployees] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    firstName: "",
    lastName: "",
    position: POSITIONS[0]
  });
  const [adminNotice, setAdminNotice] = useState({ type: "", text: "" });
  const [formPending, setFormPending] = useState(false);
  const db = useMemo(() => getFirestore(app), []);

  useEffect(() => {
    if (isAdmin) {
      setAdminPanelOpen(true);
    } else {
      setAdminPanelOpen(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

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
        setScheduleDirty(false);
      } catch (error) {
        console.error("Błąd pobierania grafiku:", error);
        setScheduleEntries(mergeEntriesWithEmployees({}, employees));
        setScheduleDirty(false);
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
    setAdminNotice({ type: "", text: "" });

    if (!isAdmin) {
      setAdminNotice({ type: "error", text: "Tylko administrator może dodawać pracowników." });
      return;
    }

    if (formPending) return;

    const trimmedFirst = employeeForm.firstName.trim();
    const trimmedLast = employeeForm.lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setAdminNotice({ type: "error", text: "Uzupełnij imię i nazwisko." });
      return;
    }

    try {
      setFormPending(true);

      const payload = {
        firstName: trimmedFirst,
        lastName: trimmedLast,
        position: employeeForm.position,
        assignedUserId: null,
        assignedUserEmail: null,
        createdAt: serverTimestamp()
      };

      const ref = await addDoc(collection(db, "employees"), payload);
      const newEmployee = { id: ref.id, ...payload };

      setEmployees((prev) => [...prev, newEmployee]);
      setScheduleEntries((prev) => ({
        ...prev,
        [ref.id]: { shifts: {}, fullName: `${trimmedFirst} ${trimmedLast}`.trim(), position: employeeForm.position, userId: null }
      }));
      setEmployeeForm({ firstName: "", lastName: "", position: POSITIONS[0] });
      setAdminPanelOpen(true);
      setAdminNotice({ type: "success", text: "Dodano nowego pracownika." });
    } catch (error) {
      console.error("Nie udało się dodać pracownika:", error);
      setAdminNotice({ type: "error", text: "Nie udało się dodać pracownika. Sprawdź uprawnienia." });
    } finally {
      setFormPending(false);
    }
  };

  const handleToggleShift = (employeeId, dayNumber) => {
    if (!isAdmin) return;

    setScheduleEntries((prev) => {
      const current = prev[employeeId] || { shifts: {} };
      const currentValue = current.shifts?.[dayNumber] || "";
      const nextValue = cycleShiftValue(currentValue);
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
    if (!isAdmin) {
      setAdminNotice({ type: "error", text: "Tylko administrator może zapisywać grafik." });
      return;
    }

    setScheduleSaving(true);
    setAdminNotice({ type: "", text: "" });

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

      setScheduleDirty(false);
      setAdminNotice({ type: "success", text: "Grafik zapisany." });
    } catch (error) {
      console.error("Nie udało się zapisać grafiku:", error);
      setAdminNotice({ type: "error", text: "Nie udało się zapisać grafiku." });
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
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  adminPanelOpen
                    ? "border-rose-400/70 bg-rose-500/20 text-rose-50 shadow-lg shadow-rose-500/30"
                    : "border-rose-300/60 bg-rose-500/10 text-rose-50 hover:bg-rose-500/20"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                Panel admina
              </button>
            )}

            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                isAdmin
                  ? "border-rose-300/70 bg-rose-500/10 text-rose-50"
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Grafik miesięczny</h2>
              <p className="text-xs text-sky-100/80">
                Układ poziomy inspirowany tabelą – po lewej pracownicy, w kolumnach kolejne dni miesiąca.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-sky-100">
              <span className="rounded-full bg-sky-400/10 px-3 py-1">{days.length} dni</span>
              <span className="rounded-full bg-sky-400/10 px-3 py-1">
                {visibleEmployees.length ? `${visibleEmployees.length} prac.` : "Brak przypisania"}
              </span>
            </div>
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
                        <span className="text-[10px] uppercase tracking-wide opacity-80">
                          {day.label.slice(0, 3)}
                        </span>
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
                      const isPersonal = personalEmployee && personalEmployee.id === employee.id;
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
                              className={`mx-auto flex h-8 w-12 items-center justify-center rounded-md border border-sky-200/30 px-2 text-[11px] font-semibold transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sky-300/60 ${
                                tone
                              } ${isPersonal ? "ring-2 ring-sky-300/60" : ""}`}
                              title="Kliknij, aby przełączać dyżury (pusty → D → N → pusty)"
                            >
                              {value || "—"}
                            </button>
                          ) : value ? (
                            <span
                              className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold ${
                                isPersonal ? "bg-slate-900/60 ring-2 ring-sky-300/60" : "bg-slate-900/30"
                              }`}
                            >
                              {value}
                            </span>
                          ) : (
                            <span className="text-sky-100/60">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {/* Panel administratora */}
        {isAdmin && adminPanelOpen && (
          <section className="rounded-3xl border-2 border-rose-400/40 bg-gradient-to-br from-rose-950/70 via-slate-950 to-slate-950 p-5 md:p-6 shadow-xl shadow-rose-500/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  Tryb administratora
                </div>
                <h2 className="text-lg font-bold text-rose-50">Panel administracyjny</h2>
                <p className="text-xs text-rose-100/80">
                  Pełny widok grafiku wszystkich osób, nowe wirtualne rekordy pracowników oraz szybkie kliknięcia w kafelki dyżurów (D/N).
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 text-right">
                {adminNotice.text && (
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-medium ${
                      adminNotice.type === "error"
                        ? "border-red-300/60 bg-red-500/20 text-red-50"
                        : "border-emerald-300/60 bg-emerald-500/20 text-emerald-50"
                    }`}
                  >
                    {adminNotice.text}
                  </span>
                )}
                <span className="rounded-full border border-rose-300/50 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-50">
                  Uprawnienia administratora aktywne
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-rose-300/40 bg-rose-950/40 p-4">
                <h3 className="text-sm font-semibold text-rose-50">Uprawnienia administratora</h3>
                <ul className="mt-3 space-y-2 text-xs text-rose-100/80">
                  <li className="flex items-start gap-2">
                    <span className="mt-[3px] inline-block h-2 w-2 rounded-full bg-rose-300" />
                    Dodajesz wirtualnych pracowników (imię, nazwisko, stanowisko) bez zakładania kont w Firebase.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-[3px] inline-block h-2 w-2 rounded-full bg-rose-300" />
                    Widzisz pełny grafik wszystkich osób i możesz go swobodnie edytować.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-[3px] inline-block h-2 w-2 rounded-full bg-rose-300" />
                    Klikasz kafelek dnia, aby przełączać kolejno: pusty → D (dyżur dzienny) → N (dyżur nocny).
                  </li>
                </ul>
                <p className="mt-3 rounded-xl border border-rose-300/30 bg-rose-950/60 px-3 py-2 text-[11px] text-rose-100/70">
                  Podczas tworzenia grafiku nie tworzysz kont. W razie potrzeby konta użytkowników możesz przygotować osobno w kolekcji <code className="rounded bg-slate-900/60 px-1">users</code>.
                </p>
              </div>

              <div className="rounded-2xl border border-rose-300/40 bg-rose-950/40 p-4">
                <h3 className="text-sm font-semibold text-rose-50">Legenda dyżurów i nawigacja</h3>
                <div className="mt-3 grid gap-2 text-[11px] text-rose-100/80">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-[44px] items-center justify-center rounded-md bg-amber-300/80 px-2 text-sm font-bold text-amber-950">D</span>
                    Dyżur dzienny
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-[44px] items-center justify-center rounded-md bg-sky-300/80 px-2 text-sm font-bold text-slate-950">N</span>
                    Dyżur nocny
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-[44px] items-center justify-center rounded-md border border-rose-200/40 bg-slate-950/50 px-2 text-sm font-semibold text-rose-100/70">—</span>
                    Puste pole (brak dyżuru)
                  </div>
                  <p className="mt-2 rounded-lg border border-rose-300/30 bg-rose-900/40 px-3 py-2 text-xs">
                    Edytuj grafik w tabeli poniżej lub klikaj kafelki w głównym widoku grafiku. Zapisz zmiany przyciskiem „Zapisz grafik”.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <form onSubmit={handleAddEmployee} className="rounded-2xl border border-rose-300/40 bg-rose-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-rose-50">Dodaj pracownika</h3>
                    <p className="text-[11px] text-rose-100/70">Imię, nazwisko i stanowisko — bez zakładania konta.</p>
                  </div>
                  <span className="rounded-full bg-rose-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-100">Formularz wirtualnych danych</span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-rose-100/80">
                    Imię
                    <input
                      value={employeeForm.firstName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-slate-950/60 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/60"
                      placeholder="np. Jan"
                      required
                    />
                  </label>
                  <label className="text-xs text-rose-100/80">
                    Nazwisko
                    <input
                      value={employeeForm.lastName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-slate-950/60 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/60"
                      placeholder="np. Kowalska"
                      required
                    />
                  </label>
                  <label className="text-xs text-rose-100/80 md:col-span-2">
                    Stanowisko
                    <select
                      value={employeeForm.position}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, position: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-rose-200/40 bg-slate-950/60 px-3 py-2 text-sm text-rose-50 focus:border-rose-200 focus:ring-2 focus:ring-rose-400/60"
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
                  disabled={formPending}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-rose-500 via-amber-400 to-rose-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80"
                >
                  {formPending ? "Dodawanie..." : "Dodaj pracownika"}
                </button>
              </form>

              <div className="rounded-2xl border border-rose-300/40 bg-rose-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-rose-50">Lista pracowników</h3>
                  <span className="rounded-full bg-rose-500/20 px-3 py-1 text-[11px] font-medium text-rose-100">
                    {employees.length} osób
                  </span>
                </div>

                {employees.length === 0 ? (
                  <p className="mt-3 text-xs text-rose-100/70">
                    Brak pracowników w bazie. Dodaj pierwszą osobę, aby rozpocząć układanie grafiku.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-rose-200/20">
                    {employees.map((employee) => (
                      <li
                        key={`employee-${employee.id}`}
                        className="flex flex-col gap-1 py-2 text-sm text-rose-50 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="font-semibold">
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="text-[11px] uppercase tracking-wide text-rose-100/70">{employee.position}</div>
                        </div>
                        <div className="text-[11px] text-rose-100/80">
                          {employee.assignedUserEmail ? (
                            <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-100">
                              Konto: {employee.assignedUserEmail}
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-500/20 px-3 py-1 font-semibold text-amber-100">
                              Bez przypisanego konta
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-rose-50">Tabela edycji grafiku (poziomo)</h3>
                  <p className="text-[11px] text-rose-100/70">Kliknij dowolny kafelek, aby przełączać D/N i zapisuj zmiany jednym przyciskiem.</p>
                </div>
                <div className="flex items-center gap-2">
                  {scheduleDirty && (
                    <span className="rounded-full border border-amber-300/60 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-50">
                      Niezapisane zmiany
                    </span>
                  )}
                  <button
                    onClick={handleSaveSchedule}
                    disabled={scheduleSaving || !scheduleDirty}
                    className="rounded-xl bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {scheduleSaving ? "Zapisywanie..." : scheduleDirty ? "Zapisz grafik" : "Brak zmian"}
                  </button>
                </div>
              </div>

              <div className="overflow-auto rounded-2xl border border-rose-300/40">
                <table className="min-w-full text-[11px] text-rose-50">
                  <thead className="bg-rose-950/60">
                    <tr>
                      <th className="sticky left-0 z-10 bg-rose-950/80 px-4 py-3 text-left font-semibold">Pracownik</th>
                      {days.map((day) => (
                        <th
                          key={`edit-day-${day.dayNumber}`}
                          className={`${getDayCellClasses(day, true)} text-center text-[10px] font-semibold`}
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
                    {employees.map((employee) => (
                      <tr key={employee.id} className="odd:bg-rose-950/40 even:bg-rose-950/20">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-rose-950/70 px-4 py-3 text-left font-medium">
                          <div>{employee.firstName} {employee.lastName}</div>
                          <div className="text-[10px] text-rose-100/80">{employee.position}</div>
                        </td>
                        {days.map((day) => {
                          const entry = scheduleEntries[employee.id] || { shifts: {} };
                          const value = entry.shifts?.[day.dayNumber] || "";
                          const tone =
                            value === "D"
                              ? "bg-amber-400/80 text-slate-950"
                              : value === "N"
                                ? "bg-sky-400/80 text-slate-950"
                                : "bg-slate-900/50 text-rose-100/70";

                          return (
                            <td
                              key={`${employee.id}-edit-${day.dayNumber}`}
                              className={`${getDayCellClasses(day, true)} align-middle`}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleShift(employee.id, day.dayNumber)}
                                className={`mx-auto flex h-8 w-16 items-center justify-center rounded-md border border-rose-200/40 px-2 text-[11px] font-semibold transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-rose-400/60 ${tone}`}
                                title="Kliknij, aby przełączać dyżury (pusty → D → N → pusty)"
                              >
                                {value || "—"}
                              </button>
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
