"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

export default function DashboardPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {
      console.error("Błąd wylogowania:", error);
    }
  };

  if (loading) {
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

  const isAdmin = role === "Administrator";

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* Pasek górny */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-sky-50">
              Twój grafik
            </h1>
            <p className="text-sm text-sky-100/80">
              Witaj, <span className="font-semibold">{user.email}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                isAdmin
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100"
                  : "border-sky-400/60 bg-sky-400/10 text-sky-100"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {isAdmin ? "Administrator" : "Użytkownik „*”"}
            </span>

            <button
              onClick={handleLogout}
              className="rounded-full border border-sky-400/50 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-sky-50 transition hover:bg-sky-500/20"
            >
              Wyloguj
            </button>
          </div>
        </header>

        {/* Główne panele */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="glass-panel rounded-3xl p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-200">
                  Podgląd grafiku
                </h2>
                <p className="text-xs text-sky-100/80">
                  W tym miejscu później wyświetlimy szczegółowy grafik zmian.
                </p>
              </div>
              <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-medium text-sky-200">
                Wersja demo
              </span>
            </div>

            <div className="mt-2 grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-sky-300/40 bg-slate-950/30 px-4 text-center text-xs text-sky-100/70 md:text-sm">
              <p>
                Tutaj pojawią się:
              </p>
              <ul className="mt-2 list-disc space-y-1 text-left text-xs text-sky-100/80 md:text-sm">
                <li>Twoje zmiany w układzie kalendarza,</li>
                <li>możliwość podmiany zmian i zgłaszania próśb,</li>
                <li>widok miesięczny / tygodniowy,</li>
                <li>eksport do PDF / Excela.</li>
              </ul>
              <p className="mt-3 text-[11px] text-sky-100/60">
                Na razie to tylko placeholder — funkcje dodamy w kolejnych etapach.
              </p>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="glass-panel rounded-3xl p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-200">
                Uprawnienia konta
              </h2>
              <p className="mt-2 text-xs text-sky-100/80">
                Twoja rola:{" "}
                <span className="font-semibold text-sky-50">
                  {isAdmin ? "Administrator" : "„*” – dostęp do własnego grafiku"}
                </span>
              </p>
              {isAdmin ? (
                <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-sky-100/80">
                  <li>Podgląd i edycja wszystkich grafików.</li>
                  <li>Zarządzanie użytkownikami i ich rolami.</li>
                  <li>Dostęp do widoków raportowych i eksportów.</li>
                </ul>
              ) : (
                <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-sky-100/80">
                  <li>Podgląd własnych zmian.</li>
                  <li>Możliwość zgłaszania próśb o zamianę.</li>
                  <li>Brak dostępu do cudzych grafików.</li>
                </ul>
              )}
            </div>

            <div className="glass-panel rounded-3xl p-4 text-[11px] text-sky-100/80">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200">
                Co dalej?
              </h3>
              <p className="mt-2">
                Backend uprawnień i grafiku możesz oprzeć na Firebase (Firestore + Security Rules).
                Aktualnie to tylko strona startowa z logowaniem i prostym podziałem ról.
              </p>
              <p className="mt-2">
                Kolejne moduły (np. tworzenie grafików, eksport, powiadomienia)
                można dodać jako nowe podstrony w folderze{" "}
                <code className="rounded bg-slate-900/70 px-1">app/</code>.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
