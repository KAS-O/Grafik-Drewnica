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
  setDoc,
  updateDoc
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

const POSITIONS = [
  "Pielęgniarka / Pielęgniarz",
  "Opiekun Medyczny",
  "Sanitariusz",
  "Salowa"
];

const HOLIDAYS_MM_DD = [
  "01-01",
  "01-06",
  "05-01",
  "05-03",
  "08-15",
  "11-01",
  "11-11",
  "12-25",
  "12-26"
];

function formatMonthId(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function getWeekdayLabel(date) {
  const days = [
    "Niedziela",
    "Poniedziałek",
    "Wtorek",
    "Środa",
    "Czwartek",
    "Piątek",
    "Sobota"
  ];
  return days[date.getDay()];
}

function getMonthLabel(date) {
  const months = [
    "Styczeń",
    "Luty",
    "Marzec",
    "Kwiecień",
    "Maj",
    "Czerwiec",
    "Lipiec",
    "Sierpień",
    "Wrzesień",
    "Październik",
    "Listopad",
    "Grudzień"
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function isHoliday(date) {
  const key = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
  return HOLIDAYS_MM_DD.includes(key);
}

function generateDays(date) {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1;
    const dayDate = new Date(date.getFullYear(), date.getMonth(), day);
    return {
      day,
      date: dayDate,
      weekday: getWeekdayLabel(dayDate)
    };
  });
}

function getTileColors(date) {
  if (isHoliday(date) || date.getDay() === 0) {
    return "bg-red-100 text-red-900 border-red-200";
  }
  if (date.getDay() === 6) {
    return "bg-emerald-100 text-emerald-900 border-emerald-200";
  }
  return "bg-sky-50 text-sky-900 border-sky-100";
}

function ShiftBadge({ value }) {
  if (!value) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        value === "D"
          ? "bg-amber-200 text-amber-900"
          : "bg-indigo-200 text-indigo-900"
      }`}
    >
      {value === "D" ? "Dyżur dzienny" : "Dyżur nocny"}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, role, profile, loading } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [dataLoading, setDataLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    firstName: "",
    lastName: "",
    position: POSITIONS[0]
  });
  const [linkForm, setLinkForm] = useState({ employeeId: "", accountUid: "" });
  const [savingShift, setSavingShift] = useState(false);

  const isAdmin = role === "Administrator";
  const days = useMemo(() => generateDays(currentDate), [currentDate]);
  const displayName = profile?.firstName
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : user?.email;

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const fetchEmployees = async () => {
      setDataLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const loaded = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        setEmployees(loaded);
      } catch (error) {
        console.error("Błąd pobierania pracowników", error);
        setEmployees([]);
      } finally {
        setDataLoading(false);
      }
    };

    fetchEmployees();
  }, [user]);

  const myEmployee = useMemo(() => {
    if (!employees.length || !user) return null;
    return (
      employees.find((emp) => emp.accountUid === user.uid) ||
      employees.find((emp) => emp.id === profile?.employeeId) ||
      null
    );
  }, [employees, user, profile]);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin && !myEmployee) return;

    const fetchAssignments = async () => {
      setDataLoading(true);
      try {
        const monthId = formatMonthId(currentDate);

        if (!isAdmin && myEmployee) {
          const entryRef = doc(db, "schedules", monthId, "entries", myEmployee.id);
          const snap = await getDoc(entryRef);
          setAssignments(
            snap.exists() ? { [myEmployee.id]: snap.data().shifts || {} } : {}
          );
          return;
        }

        const snapshot = await getDocs(
          collection(db, "schedules", monthId, "entries")
        );
        const loaded = {};
        snapshot.docs.forEach((docSnap) => {
          loaded[docSnap.id] = docSnap.data().shifts || {};
        });
        setAssignments(loaded);
      } catch (error) {
        console.error("Błąd pobierania grafiku", error);
        setAssignments({});
      } finally {
        setDataLoading(false);
      }
    };

    fetchAssignments();
  }, [currentDate, isAdmin, myEmployee, user]);

  const myShifts = myEmployee ? assignments[myEmployee.id] || {} : {};

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {
      console.error("Błąd wylogowania:", error);
    }
  };

  const changeMonth = (offset) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!employeeForm.firstName.trim() || !employeeForm.lastName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, "employees"), {
        firstName: employeeForm.firstName.trim(),
        lastName: employeeForm.lastName.trim(),
        position: employeeForm.position,
        accountUid: null
      });
      const newEmployee = {
        id: docRef.id,
        ...employeeForm,
        accountUid: null
      };
      setEmployees((prev) => [...prev, newEmployee]);
      setAssignments((prev) => ({ ...prev, [docRef.id]: {} }));
      setEmployeeForm({ firstName: "", lastName: "", position: POSITIONS[0] });
    } catch (error) {
      console.error("Błąd dodawania pracownika", error);
    }
  };

  const handleLinkAccount = async (e) => {
    e.preventDefault();
    if (!linkForm.employeeId || !linkForm.accountUid) return;
    try {
      const employee = employees.find((emp) => emp.id === linkForm.employeeId);
      if (!employee) return;

      const employeeRef = doc(db, "employees", linkForm.employeeId);
      await updateDoc(employeeRef, { accountUid: linkForm.accountUid });

      await setDoc(
        doc(db, "users", linkForm.accountUid),
        {
          role: "Użytkownik",
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeId: linkForm.employeeId
        },
        { merge: true }
      );

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === linkForm.employeeId ? { ...emp, accountUid: linkForm.accountUid } : emp
        )
      );
      setLinkForm({ employeeId: "", accountUid: "" });
    } catch (error) {
      console.error("Błąd przypisywania konta", error);
    }
  };

  const handleShiftChange = async (employeeId, day, value) => {
    setSavingShift(true);
    const dayKey = String(day);
    const monthId = formatMonthId(currentDate);

    setAssignments((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || {}),
        [dayKey]: value
      }
    }));

    try {
      const entryRef = doc(db, "schedules", monthId, "entries", employeeId);
      const current = (await getDoc(entryRef)).data() || {};
      const nextShifts = {
        ...(current.shifts || {}),
        [dayKey]: value
      };
      await setDoc(
        entryRef,
        {
          employeeId,
          month: monthId,
          shifts: nextShifts
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Błąd zapisu grafiku", error);
    } finally {
      setSavingShift(false);
    }
  };

  const filteredAssignments = useMemo(() => {
    if (isAdmin) return assignments;
    if (!myEmployee) return {};
    return { [myEmployee.id]: assignments[myEmployee.id] || {} };
  }, [assignments, isAdmin, myEmployee]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="glass-panel rounded-2xl px-6 py-4 text-sm text-sky-100">
          Ładowanie Twojego grafiku...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-sky-50">Panel grafików</h1>
            <p className="text-sm text-sky-100/80">
              Witaj, <span className="font-semibold">{displayName}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setAdminOpen(true)}
                className="rounded-full border border-emerald-400/60 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-50 transition hover:bg-emerald-400/20"
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

        <section className="glass-panel rounded-3xl p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">
                Grafik miesięczny
              </h2>
              <p className="text-xs text-sky-100/80">
                Kolory: jasny niebieski (zwykły dzień), zielony (sobota), czerwony (niedziele i święta).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => changeMonth(-1)}
                className="rounded-xl border border-sky-400/50 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-sky-50 transition hover:bg-sky-500/20"
              >
                Poprzedni
              </button>
              <div className="rounded-xl bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-sky-100 border border-sky-400/50">
                {getMonthLabel(currentDate)}
              </div>
              <button
                onClick={() => changeMonth(1)}
                className="rounded-xl border border-sky-400/50 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-sky-50 transition hover:bg-sky-500/20"
              >
                Następny
              </button>
            </div>
          </div>

          {dataLoading ? (
            <div className="grid min-h-[200px] place-items-center rounded-2xl border border-dashed border-sky-300/40 bg-slate-950/30 text-sm text-sky-100/70">
              Pobieranie danych...
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {days.map((day) => {
                const shift = myShifts[String(day.day)];
                return (
                  <div
                    key={day.day}
                    className={`rounded-2xl border p-4 shadow-sm ${getTileColors(day.date)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                          {day.weekday}
                        </p>
                        <p className="text-3xl font-bold leading-tight">{day.day}</p>
                      </div>
                      <ShiftBadge value={shift} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">
                  Podsumowanie dostępu
                </h2>
                <p className="text-xs text-sky-100/80">
                  Administrator widzi i edytuje wszystkie grafiki, użytkownicy tylko swoje.
                </p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
                Pełne uprawnienia
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-sky-400/30 bg-slate-950/30">
              <table className="min-w-full text-left text-xs text-sky-50">
                <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Pracownik</th>
                    <th className="px-4 py-3">Stanowisko</th>
                    <th className="px-4 py-3">Powiązane konto</th>
                    <th className="px-4 py-3">Dostęp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {employees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="px-4 py-3 font-semibold text-sky-100">
                        {emp.firstName} {emp.lastName}
                      </td>
                      <td className="px-4 py-3 text-sky-100/80">{emp.position}</td>
                      <td className="px-4 py-3 text-sky-100/80">
                        {emp.accountUid ? (
                          <code className="rounded bg-slate-900/60 px-2 py-1 text-[11px]">
                            {emp.accountUid}
                          </code>
                        ) : (
                          <span className="text-sky-200/70">Brak powiązania</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {emp.accountUid ? "Dostęp do własnego grafiku" : "Nieprzypisane konto"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {isAdmin && adminOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div className="glass-panel relative w-full max-w-6xl rounded-3xl p-6 shadow-2xl">
            <button
              onClick={() => setAdminOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-sky-400/50 bg-slate-950/50 px-3 py-1.5 text-xs font-medium text-sky-50 transition hover:bg-sky-500/20"
            >
              Zamknij
            </button>

            <h2 className="mb-1 text-xl font-semibold text-sky-50">Panel administracyjny</h2>
            <p className="mb-6 text-sm text-sky-100/80">
              Dodawaj pracowników, przypisuj konta Firebase i ustawiaj dyżury D/N w widoku tabelarycznym.
            </p>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-5">
                <div className="rounded-2xl border border-sky-400/30 bg-slate-950/40 p-4">
                  <h3 className="text-sm font-semibold text-sky-100">Dodaj pracownika</h3>
                  <form onSubmit={handleAddEmployee} className="mt-3 space-y-3 text-sm">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
                          Imię
                        </label>
                        <input
                          type="text"
                          value={employeeForm.firstName}
                          onChange={(e) =>
                            setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))
                          }
                          className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sky-50 shadow-inner outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                          placeholder="np. Anna"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
                          Nazwisko
                        </label>
                        <input
                          type="text"
                          value={employeeForm.lastName}
                          onChange={(e) =>
                            setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))
                          }
                          className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sky-50 shadow-inner outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                          placeholder="np. Kowalska"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
                        Stanowisko
                      </label>
                      <select
                        value={employeeForm.position}
                        onChange={(e) =>
                          setEmployeeForm((prev) => ({ ...prev, position: e.target.value }))
                        }
                        className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sky-50 shadow-inner outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
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
                      className="w-full rounded-xl bg-gradient-to-r from-sky-400 via-sky-500 to-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110"
                    >
                      Dodaj pracownika
                    </button>
                  </form>
                </div>

                <div className="rounded-2xl border border-sky-400/30 bg-slate-950/40 p-4">
                  <h3 className="text-sm font-semibold text-sky-100">Przypisz konto Firebase</h3>
                  <p className="mt-1 text-xs text-sky-100/70">
                    Użytkownik otrzyma rolę „Użytkownik” i dostęp tylko do swojego grafiku.
                  </p>
                  <form onSubmit={handleLinkAccount} className="mt-3 space-y-3 text-sm">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
                        Pracownik
                      </label>
                      <select
                        value={linkForm.employeeId}
                        onChange={(e) =>
                          setLinkForm((prev) => ({ ...prev, employeeId: e.target.value }))
                        }
                        className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sky-50 shadow-inner outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                        required
                      >
                        <option value="" className="bg-slate-900">
                          Wybierz pracownika
                        </option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id} className="bg-slate-900">
                            {emp.firstName} {emp.lastName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
                        UID konta Firebase
                      </label>
                      <input
                        type="text"
                        value={linkForm.accountUid}
                        onChange={(e) =>
                          setLinkForm((prev) => ({ ...prev, accountUid: e.target.value }))
                        }
                        className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sky-50 shadow-inner outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                        placeholder="np. 1AbCDeFGhI..."
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110"
                    >
                      Przypisz konto
                    </button>
                  </form>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-400/30 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-sky-100">Edycja grafiku</h3>
                    <p className="text-[11px] text-sky-100/70">
                      Kliknij w kratkę, aby ustawić dyżur D (dzienny) lub N (nocny) dla wybranego dnia.
                    </p>
                  </div>
                  <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-medium text-sky-100">
                    {getMonthLabel(currentDate)}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-sky-400/20 bg-slate-950/40">
                  <table className="min-w-full text-xs text-sky-50">
                    <thead className="bg-slate-900/60">
                      <tr>
                        <th className="sticky left-0 z-10 bg-slate-900/80 px-3 py-2 text-left text-[11px] uppercase tracking-wide">
                          Pracownik
                        </th>
                        {days.map((d) => (
                          <th key={d.day} className="px-2 py-2 text-[11px] font-semibold">
                            {d.day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {employees.map((emp) => {
                        const shifts = filteredAssignments[emp.id] || {};
                        return (
                          <tr key={emp.id}>
                            <td className="sticky left-0 z-10 bg-slate-950/80 px-3 py-2 text-left font-semibold">
                              <div className="leading-tight">
                                <div>{emp.firstName} {emp.lastName}</div>
                                <p className="text-[11px] text-sky-100/70">{emp.position}</p>
                              </div>
                            </td>
                            {days.map((d) => {
                              const current = shifts[String(d.day)] || "";
                              return (
                                <td key={d.day} className="px-1 py-1 text-center">
                                  <div className="inline-flex gap-1">
                                    {"DN".split("").map((symbol) => (
                                      <button
                                        key={symbol}
                                        onClick={() => handleShiftChange(emp.id, d.day, symbol)}
                                        className={`h-7 w-7 rounded-lg border text-[11px] font-bold transition focus:outline-none ${
                                          current === symbol
                                            ? symbol === "D"
                                              ? "border-amber-400 bg-amber-200/80 text-amber-900"
                                              : "border-indigo-400 bg-indigo-200/80 text-indigo-900"
                                            : "border-sky-500/40 bg-slate-900/40 text-sky-100 hover:bg-slate-800"
                                        }`}
                                      >
                                        {symbol}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {savingShift && (
                  <p className="mt-2 text-[11px] text-sky-100/70">Zapisywanie zmian...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
