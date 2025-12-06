"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, auth } from "../lib/firebase";

const AuthContext = createContext({
  user: null,
  role: null,
  profile: null,
  loading: true,
  isAdmin: false
});

const normalizeRole = (value) => {
  return (value || "").trim().toLowerCase() === "administrator" ? "Administrator" : "Użytkownik";
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
          const baseProfile = {
            firstName: firebaseUser.displayName || "",
            lastName: "",
            role: "Użytkownik",
            email: firebaseUser.email || "",
            createdAt: serverTimestamp()
          };

          await setDoc(userRef, baseProfile);
          setRole("Użytkownik");
          setIsAdmin(false);
          setProfile({ firstName: baseProfile.firstName, lastName: baseProfile.lastName });
          setLoading(false);
          return;
        }

        const data = snapshot.data();
        const normalizedRole = normalizeRole(data.role);
        setRole(normalizedRole);
        setIsAdmin(normalizedRole === "Administrator");
        setProfile({ firstName: data.firstName || "", lastName: data.lastName || "" });
      } catch (error) {
        console.error("Błąd pobierania profilu użytkownika:", error);
        setRole("Użytkownik");
        setIsAdmin(false);
        setProfile({ firstName: firebaseUser.displayName || "", lastName: "" });
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
