"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getIdTokenResult, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
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

  const normalizeRole = (rawRole, hasAdminClaim = false) => {
    const value = (rawRole || "").trim().toLowerCase();
    if (hasAdminClaim) return "Administrator";
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
        const snap = await getDoc(userRef);
        const tokenResult = await getIdTokenResult(firebaseUser);
        const hasAdminClaim = tokenResult?.claims?.admin === true;

        if (snap.exists()) {
          const data = snap.data();
          const normalizedRole = normalizeRole(data.role, hasAdminClaim);
          setRole(normalizedRole);
          setIsAdmin(normalizedRole === "Administrator");
          setProfile({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            employeeId: data.employeeId || null
          });
        } else {
          // Domyślnie traktujemy jako zwykłego użytkownika
          const normalizedRole = normalizeRole(null, hasAdminClaim);
          setRole(normalizedRole);
          setIsAdmin(normalizedRole === "Administrator");
          setProfile({ firstName: firebaseUser.displayName || "", lastName: "", employeeId: null });
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
