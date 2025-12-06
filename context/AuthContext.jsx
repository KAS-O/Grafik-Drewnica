"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { app, auth } from "../lib/firebase";

const AuthContext = createContext({
  user: null,
  role: null,
  profile: null,
  loading: true
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRole(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const db = getFirestore(app);
        const userRef = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();
          setRole(data.role || "Użytkownik");
          setProfile({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            employeeId: data.employeeId || null
          });
        } else {
          // Domyślnie traktujemy jako zwykłego użytkownika
          setRole("Użytkownik");
          setProfile({ firstName: firebaseUser.displayName || "", lastName: "", employeeId: null });
        }
      } catch (error) {
        console.error("Błąd pobierania roli użytkownika:", error);
        setRole("Użytkownik");
        setProfile({ firstName: firebaseUser.displayName || "", lastName: "", employeeId: null });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
