"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, app } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

const POSITIONS = ["Pielęgniarka / Pielęgniarz", "Opiekun medyczny", "Sanitariusz", "Salowa"];

const WEEKDAYS = ["Nd", "Pn", "Wt", "Śr", "Czw", "Pt", "Sb"];

const cycleShift = (value) => {
  if (value === "D") return "N";
  if (value === "N") return "";
  return "D";
};

const getMonthKey = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading, isAdmin, role } = useAuth();
  const db = useMemo(() => getFirestore(app), []);

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [employees, setEmployees] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [formPending, setFormPending] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ firstName: "", lastName: "", position: POSITIONS[0] });

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const total = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [currentMonth]);

  const monthKey = useMemo(() => getMonthKey(currentMonth), [currentMonth]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setEmployees(list);
      } catch (err) {
        console.error("Nie udało się pobrać pracowników", err);
        setEmployees([]);
      }
    };

    fetchEmployees();
  }, [db, user]);

  useEffect(() => {
    if (!user) return;

    const fetchSchedule = async () => {
      try {
        const ref = doc(db, "schedules", monthKey);
        const snapshot = await getDoc(ref);
        if (snapshot.exists()) {
          const data = snapshot.data();
          const entries = data.entries || {};
          const normalized = Object.fromEntries(
            Object.entries(entries).map(([employeeId, value]) => [employeeId, value.shifts || value])
          );
          setScheduleEntries(normalized);
        } else {
          setScheduleEntries({});
        }
        setScheduleDirty(false);
      } catch (err) {
        console.error("Nie udało się pobrać grafiku", err);
        setScheduleEntries({});
        setScheduleDirty(false);
      }
    };

    fetchSchedule();
  }, [db, monthKey, user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (err) {
      console.error("Wylogowanie nie powiodło się", err);
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
    setError("");
    setStatus("");

    if (!isAdmin) {
      setError("Tylko administrator może dodawać pracowników.");
      return;
    }

    if (formPending) return;

    const firstName = employeeForm.firstName.trim();
    const lastName = employeeForm.lastName.trim();

    if (!firstName || !lastName) {
      setError("Wpisz imię i nazwisko pracownika.");
      return;
    }

    try {
      setFormPending(true);
      const payload = {
        firstName,
        lastName,
        position: employeeForm.position,
        createdAt: serverTimestamp()
      };
      const ref = await addDoc(collection(db, "employees"), payload);
      setEmployees((prev) => [...prev, { id: ref.id, ...payload }]);
      setEmployeeForm({ firstName: "", lastName: "", position: POSITIONS[0] });
      setStatus("Pracownik został dodany.");
    } catch (err) {
      console.error("Nie udało się dodać pracownika", err);
      setError("Nie udało się dodać pracownika.");
    } finally {
      setFormPending(false);
    }
  };

  const toggleShift = (employeeId, day) => {
    if (!isAdmin) return;

    setScheduleEntries((prev) => {
      const current = prev[employeeId]?.[day] || "";
      const nextValue = cycleShift(current);
      setScheduleDirty(true);
      return { ...prev, [employeeId]: { ...(prev[employeeId] || {}), [day]: nextValue } };
    });
  };

  const handleSaveSchedule = async () => {
    if (!isAdmin) {
      setError("Tylko administrator może zapisywać grafik.");
      return;
    }

    setSaving(true);
    setStatus("");
    setError("");

    try {
      await setDoc(
        doc(db, "schedules", monthKey),
        {
          month: monthKey,
          entries: scheduleEntries,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setScheduleDirty(false);
      setStatus("Grafik zapisany.");
    } catch (err) {
      console.error("Nie udało się zapisać grafiku", err);
      setError("Nie udało się zapisać grafiku.");
    } finally {
      setSaving(false);
    }
  };

  const fullName = profile?.firstName || profile?.lastName ? `${profile.firstName} ${profile.lastName}`.trim() : user?.email;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel rounded-2xl px-6 py-4 text-sm text-sky-100">Ładowanie...</div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-200">Twój grafik</p>
            <h1 className="text-2xl font-semibold text-sky-50">Witaj, {fullName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                isAdmin ? "border-rose-300/70 bg-rose-500/10 text-rose-50" : "border-sky-300/70 bg-sky-500/10 text-sky-50"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {role || (isAdmin ? "Administrator" : "Użytkownik")}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-full border border-sky-400/50 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-sky-50 transition hover:bg-sky-500/20"
            >
              Wyloguj
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/30 bg-slate-950/40 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-200">Bieżący miesiąc</p>
            <p className="text-lg font-semibold text-sky-50">
              {currentMonth.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
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

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Grafik miesięczny</h2>
                <p className="text-xs text-sky-100/80">Klikaj w komórki, aby przełączać dyżury D/N. Zmiany zapisujesz jednym przyciskiem.</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-sky-100">
                <span className="rounded-full bg-sky-400/10 px-3 py-1">{daysInMonth.length} dni</span>
                <span className="rounded-full bg-sky-400/10 px-3 py-1">{employees.length} prac.</span>
              </div>
            </div>

            <div className="overflow-auto rounded-2xl border border-sky-200/30">
              <table className="min-w-full text-[11px] text-sky-50">
                <thead className="bg-slate-900/60">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-900/60 px-4 py-3 text-left text-xs font-semibold">Pracownik</th>
                    {daysInMonth.map((day) => (
                      <th key={`day-${day}`} className="px-2 py-2 text-center text-[10px] font-semibold">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs">{day}</span>
                          <span className="text-[10px] uppercase tracking-wide opacity-80">{WEEKDAYS[new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).getDay()]}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth.length + 1} className="px-4 py-6 text-center text-sm text-sky-100/80">
                        Brak pracowników. Dodaj pierwszą osobę w panelu administratora.
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr key={employee.id} className="odd:bg-slate-900/40 even:bg-slate-900/20">
                        <td className="sticky left-0 z-10 bg-slate-950/80 px-4 py-3 text-left">
                          <div className="font-semibold">
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-sky-100/70">{employee.position}</div>
                        </td>
                        {daysInMonth.map((day) => {
                          const value = scheduleEntries[employee.id]?.[day] || "";
                          const tone =
                            value === "D"
                              ? "bg-amber-300/90 text-slate-950"
                              : value === "N"
                                ? "bg-sky-300/90 text-slate-950"
                                : "bg-slate-900/40 text-sky-100/70";
                          return (
                            <td key={`${employee.id}-${day}`} className="px-2 py-2 text-center align-middle">
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => toggleShift(employee.id, day)}
                                  className={`mx-auto flex h-8 w-12 items-center justify-center rounded-md border border-sky-200/30 px-2 text-[11px] font-semibold transition hover:scale-105 ${tone}`}
                                >
                                  {value || "—"}
                                </button>
                              ) : (
                                <span className={`inline-flex h-8 w-12 items-center justify-center rounded-md border border-sky-200/20 px-2 text-[11px] font-semibold ${tone}`}>
                                  {value || "—"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {isAdmin && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {scheduleDirty && (
                  <span className="rounded-full border border-amber-300/60 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-50">
                    Niezapisane zmiany
                  </span>
                )}
                <button
                  onClick={handleSaveSchedule}
                  disabled={saving || !scheduleDirty}
                  className="rounded-xl bg-gradient-to-r from-sky-400 via-sky-500 to-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Zapisywanie..." : scheduleDirty ? "Zapisz grafik" : "Brak zmian"}
                </button>
              </div>
            )}
          </section>

          <section className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">Panel administratora</h2>
                <p className="text-xs text-sky-100/80">Dodawaj pracowników – tylko imię, nazwisko i stanowisko.</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  isAdmin ? "bg-emerald-500/20 text-emerald-50" : "bg-rose-500/20 text-rose-50"
                }`}
              >
                {isAdmin ? "Dostępny" : "Brak dostępu"}
              </span>
            </div>

            {isAdmin ? (
              <form onSubmit={handleAddEmployee} className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-100" htmlFor="firstName">
                      Imię
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      value={employeeForm.firstName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sm text-sky-50 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                      placeholder="np. Anna"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-100" htmlFor="lastName">
                      Nazwisko
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      value={employeeForm.lastName}
                      onChange={(e) => setEmployeeForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sm text-sky-50 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                      placeholder="np. Kowalska"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-sky-100" htmlFor="position">
                    Stanowisko
                  </label>
                  <select
                    id="position"
                    value={employeeForm.position}
                    onChange={(e) => setEmployeeForm((prev) => ({ ...prev, position: e.target.value }))}
                    className="w-full rounded-xl border border-sky-400/40 bg-slate-950/40 px-3 py-2 text-sm text-sky-50 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                  >
                    {POSITIONS.map((pos) => (
                      <option key={pos}>{pos}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={formPending}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-400 via-sky-400 to-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {formPending ? "Dodawanie..." : "Dodaj pracownika"}
                </button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-sky-100/80">Panel dodawania pracowników jest dostępny tylko dla administratora.</p>
            )}

            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold text-sky-50">Lista pracowników</h3>
              {employees.length === 0 ? (
                <p className="text-sm text-sky-100/70">Brak danych.</p>
              ) : (
                <ul className="divide-y divide-sky-200/20 text-sm text-sky-50">
                  {employees.map((employee) => (
                    <li key={employee.id} className="flex items-center justify-between py-2">
                      <div>
                        <div className="font-semibold">
                          {employee.firstName} {employee.lastName}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-sky-100/70">{employee.position}</div>
                      </div>
                      <span className="rounded-full bg-sky-500/20 px-3 py-1 text-[11px] font-semibold text-sky-50">Na liście grafiku</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(status || error) && (
              <p
                className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                  status
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-50"
                    : "border-rose-400/50 bg-rose-500/10 text-rose-50"
                }`}
              >
                {status || error}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
