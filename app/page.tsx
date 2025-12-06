"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await signInWithEmailAndPassword(auth, login, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      console.error(err);
      let message = "Logowanie nie powiodło się. Sprawdź dane i spróbuj ponownie.";
      const errorObj = err as { code?: string };
      if (errorObj?.code === "auth/invalid-email") {
        message = "Nieprawidłowy format loginu (email).";
      }
      if (errorObj?.code === "auth/user-not-found" || errorObj?.code === "auth/wrong-password") {
        message = "Nieprawidłowy login lub hasło.";
      }
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const handleLoginChange = (event: ChangeEvent<HTMLInputElement>) => setLogin(event.target.value);
  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center">
        <section className="space-y-6 text-slate-50">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em]">
            <span className="h-2 w-2 rounded-full bg-sky-400 shadow-neon" />
            Panel grafiku
          </div>

          <div>
            <h1 className="neon-text text-4xl font-semibold tracking-tight md:text-5xl">
              Grafik Drewnica
            </h1>
            <p className="mt-4 max-w-xl text-sm text-sky-100/80 md:text-base">
              Zaloguj się, aby zobaczyć grafik. Role są tylko dwie: "Użytkownik" ma podgląd,
              a "Administrator" dodatkowo ma dostęp do prostego panelu administracji.
            </p>
          </div>

          <div className="grid gap-4 text-sm text-sky-100/80 md:grid-cols-2">
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                Rola: <span className="text-sky-100">Użytkownik</span>
              </p>
              <p className="mt-2 text-xs md:text-sm">
                Podgląd listy pracowników i miesięcznego grafiku.
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                Rola: <span className="text-sky-100">Administrator</span>
              </p>
              <p className="mt-2 text-xs md:text-sm">
                Dodatkowy dostęp do panelu administracji: dodawanie pracowników oraz edycja grafiku.
              </p>
            </div>
          </div>
        </section>

        <section className="glass-panel relative rounded-3xl p-6 shadow-neon md:p-8">
          <div className="pointer-events-none absolute inset-0 rounded-3xl border border-sky-300/40" />
          <div className="relative">
            <div className="mb-6 space-y-1">
              <h2 className="text-xl font-semibold text-sky-50">
                Logowanie
              </h2>
              <p className="text-xs text-sky-100/80">
                Użyj loginu (email) i hasła z Firebase Authentication.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="login"
                  className="block text-xs font-medium uppercase tracking-wide text-sky-100"
                >
                  Login (email)
                </label>
                <input
                  id="login"
                  type="email"
                  autoComplete="email"
                  required
                  value={login}
                  onChange={handleLoginChange}
                  className="block w-full rounded-2xl border border-sky-400/40 bg-slate-950/40 px-3 py-2.5 text-sm text-sky-50 shadow-inner outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                  placeholder="np. jan.kowalski@drewnica.pl"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium uppercase tracking-wide text-sky-100"
                >
                  Hasło
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={handlePasswordChange}
                  className="block w-full rounded-2xl border border-sky-400/40 bg-slate-950/40 px-3 py-2.5 text-sm text-sky-50 shadow-inner outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/70"
                  placeholder="Wpisz hasło"
                />
              </div>

              {error && (
                <p className="rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="mt-2 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-sky-400 via-sky-500 to-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-neon transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80"
              >
                {pending ? "Logowanie..." : "Zaloguj się"}
              </button>
            </form>

            <p className="mt-4 text-[11px] leading-relaxed text-sky-100/70">
              Role są przechowywane w kolekcji <code className="rounded bg-slate-900/60 px-1">users</code>.
              Użytkownicy to tylko konta logowania, a pracownicy są osobnymi wpisami w kolekcji
              <code className="rounded bg-slate-900/60 px-1"> employees</code>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
