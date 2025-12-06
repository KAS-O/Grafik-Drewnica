"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getIdTokenResult, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, auth } from "../lib/firebase";

const AuthContext = createContext({
  user: null,
  role: null,
  profile: null,
  loading: true,
  isAdmin: false
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const normalizeRole = (rawRole, hasAdminPrivilege = false) => {
    const value = (rawRole || "").trim().toLowerCase();
    if (hasAdminPrivilege) return "Administrator";
    if (value === "administrator" || value === "admin") return "Administrator";
    return "Użytkownik";
  };

  useEffect(() => {
    setLoading(true);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRole(null);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const db = getFirestore(app);
        const userRef = doc(db, "users", firebaseUser.uid);
        const tokenResult = await getIdTokenResult(firebaseUser);
        const hasAdminClaim = tokenResult?.claims?.admin === true;
        const isEnvAdmin = adminEmails.includes((firebaseUser.email || "").toLowerCase());
        const desiredRole = hasAdminClaim || isEnvAdmin ? "Administrator" : "Użytkownik";

        const snap = await getDoc(userRef);
        const baseProfile = {
          firstName: firebaseUser.displayName || "",
          lastName: "",
          employeeId: null
        };

        if (!snap.exists()) {
          // Automatycznie utwórz profil użytkownika po pierwszym zalogowaniu.
          const payload = {
            role: desiredRole,
            email: firebaseUser.email || "",
            ...baseProfile,
            createdAt: serverTimestamp()
          };

          try {
            await setDoc(userRef, payload);
            setRole(normalizeRole(payload.role, desiredRole === "Administrator"));
            setIsAdmin(payload.role === "Administrator");
            setProfile(baseProfile);
          } catch (createError) {
            console.error("Nie udało się utworzyć profilu użytkownika:", createError);
            setRole(normalizeRole(desiredRole, hasAdminClaim || isEnvAdmin));
            setIsAdmin(desiredRole === "Administrator");
            setProfile(baseProfile);
          }
          setLoading(false);
          return;
        }

        if (snap.exists()) {
          const data = snap.data();
          const normalizedRole = normalizeRole(data.role, hasAdminClaim || isEnvAdmin);
          const profileData = {
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            employeeId: data.employeeId || null
          };
          setRole(normalizedRole);
          setIsAdmin(normalizedRole === "Administrator");
          setProfile(profileData);
        } else {
          // Domyślnie traktujemy jako zwykłego użytkownika lub administratora z listy env/custom claims
          const normalizedRole = normalizeRole(desiredRole, hasAdminClaim || isEnvAdmin);
          setRole(normalizedRole);
          setIsAdmin(normalizedRole === "Administrator");
          setProfile(baseProfile);
        }
      } catch (error) {
        console.error("Błąd pobierania roli użytkownika:", error);
        setRole("Użytkownik");
        setIsAdmin(false);
        setProfile({ firstName: firebaseUser.displayName || "", lastName: "", employeeId: null });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, profile, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
