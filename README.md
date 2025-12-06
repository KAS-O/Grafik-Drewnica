# Grafik Drewnica

Nowoczesna strona logowania i panel **„Twój grafik”** zbudowane w **Next.js 16**, **React 19**, **Tailwind CSS** i **Firebase**.
Gotowe do wrzucenia na **GitHub** i wdrożenia na **Vercel**.

Motyw graficzny:
- kolory: jasno niebieski, ciemny niebieski, biały,
- styl: gradient, neon, mat, drewno (drewniane tło + szklane panele),
- rola `*` – dostęp tylko do własnego grafiku,
- rola `Administrator` – pełny dostęp.

---

## 1. Wymagania

- Node.js (zalecana aktualna LTS 18+)
- npm lub yarn
- konto Firebase
- konto Vercel (do hostingu)
- konto GitHub (repozytorium kodu)

---

## 2. Instalacja lokalnie

```bash
# zainstaluj zależności
npm install

# uruchom dev server
npm run dev
```

Aplikacja domyślnie ruszy na: http://localhost:3000

---

## 3. Konfiguracja Firebase

1. Wejdź na [Firebase Console](https://console.firebase.google.com/).
2. Utwórz nowy projekt (jeśli jeszcze go nie masz).
3. Dodaj aplikację typu **Web (</>)**.
4. Skopiuj konfigurację Firebase (apiKey, authDomain itd.).
5. W katalogu projektu:
   - skopiuj plik `.env.example` do `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
   - uzupełnij zmienne środowiskowe danymi z Firebase.

### 3.1. Uwierzytelnianie (Authentication)

1. W Firebase w sekcji **Authentication → Sign-in method** włącz metodę:
   - **Email/Password** (Klasyczne logowanie).
2. W zakładce **Users** dodaj ręcznie użytkowników (email + hasło).

### 3.2. Role użytkowników w Firestore

1. Włącz **Cloud Firestore**.
2. Utwórz kolekcję `users`.
3. Dodaj dokument o ID równym `uid` użytkownika (widoczny w Authentication).
4. W każdym dokumencie dodaj pole:
   - `role: "*"` – użytkownik z dostępem tylko do swojego grafiku,
   - lub `role: "Administrator"` – pełen dostęp.

Przykład dokumentu:
```json
{
  "role": "Administrator"
}
```

Jeśli pole `role` nie istnieje, aplikacja traktuje użytkownika jako `*`.

> Uwaga: Prawdziwe zabezpieczenie danych wymaga ustawienia reguł bezpieczeństwa w Firestore
> (Firebase Security Rules). Ten projekt na razie ogarnia tylko logikę po stronie frontendu.

---

## 4. Struktura projektu

```text
grafik-drewnica/
├─ app/
│  ├─ layout.jsx          # globalny layout + AuthProvider
│  ├─ globals.css         # Tailwind + motyw (gradient / drewno / neon)
│  ├─ page.jsx            # strona logowania
│  └─ dashboard/
│     └─ page.jsx         # „Twój grafik” po zalogowaniu
├─ context/
│  └─ AuthContext.jsx     # kontekst autoryzacji + wczytywanie roli z Firestore
├─ lib/
│  └─ firebase.js         # inicjalizacja Firebase (Auth)
├─ .env.example
├─ package.json
├─ tailwind.config.js
├─ postcss.config.js
├─ next.config.mjs
└─ README.md
```

---

## 5. Jak działa logowanie i role

### 5.1. Logowanie

Na stronie głównej (`/`) znajduje się formularz logowania:
- **Login (email)** – pole email,
- **Hasło** – hasło użytkownika,
- po udanym logowaniu następuje przekierowanie do `/dashboard`.

Korzystamy z `firebase/auth` (`signInWithEmailAndPassword`).

### 5.2. Rola `*` i `Administrator`

Po zalogowaniu komponent `AuthContext`:
1. pobiera aktualnego użytkownika z Firebase Auth,
2. w Firestore (kolekcja `users`) odczytuje dokument:
   - `users/{uid}`,
3. z pola `role` ustala zakres uprawnień:
   - `"*"` → zwykły użytkownik (tylko własny grafik),
   - `"Administrator"` → pełny dostęp.

W panelu `/dashboard` UI różni się opisem uprawnień, ale logika jest już przygotowana
pod rozbudowę (np. inne przyciski, dodatkowe widoki tylko dla admina).

---

## 6. Deploy na Vercel + GitHub

1. **Wrzuć projekt na GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Grafik Drewnica"
   git branch -M main
   git remote add origin git@github.com:twoj-login/grafik-drewnica.git
   git push -u origin main
   ```

2. **Połącz repozytorium z Vercel**:
   - Wejdź na https://vercel.com,
   - „Add New Project” → wybierz swoje repo,
   - Vercel automatycznie wykryje Next.js.

3. **Dodaj zmienne środowiskowe w Vercel**:
   - w ustawieniach projektu przejdź do **Environment Variables**,
   - dodaj wszystkie zmienne z `.env.local`
     (`NEXT_PUBLIC_FIREBASE_API_KEY` itd.).

4. Zapisz, uruchom deploy — po chwili aplikacja będzie dostępna pod adresem z Vercel.

---

## 7. Rozbudowa w przyszłości

Miejsca przygotowane pod rozbudowę:
- `app/dashboard/page.jsx` – można dodać:
  - widok miesięcznego / tygodniowego grafiku,
  - komponent kalendarza,
  - obsługę zamiany zmian,
  - eksport do PDF / CSV.
- nowe podstrony w `app/`:
  - np. `/admin/users`, `/admin/settings`,
  - widok tylko dla `Administrator` (sprawdzanie `role === "Administrator"`).

Jeśli chcesz, możemy w kolejnym kroku:
- dodać widok kalendarza,
- zbudować strukturę danych w Firestore dla zmian,
- dodać proste reguły bezpieczeństwa dla kolekcji `shifts`.
