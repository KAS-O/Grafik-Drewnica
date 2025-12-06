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

  const normalizeRole = (rawRole) => {
    return rawRole === "Administrator" ? "Administrator" : "Użytkownik";
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

        const snap = await getDoc(userRef);
        const baseProfile = {
          firstName: firebaseUser.displayName || "",
          lastName: ""
        };

        if (!snap.exists()) {
          const payload = {
            role: hasAdminClaim ? "Administrator" : "Użytkownik",
            email: firebaseUser.email || "",
            ...baseProfile,
            createdAt: serverTimestamp()
          };

          try {
            await setDoc(userRef, payload);
          } catch (createError) {
            console.error("Nie udało się utworzyć profilu użytkownika:", createError);
          }

          const normalized = normalizeRole(payload.role);
          setRole(normalized);
          setIsAdmin(normalized === "Administrator");
          setProfile(baseProfile);
          setLoading(false);
          return;
        }

        const data = snap.data();
        const normalizedRole = normalizeRole(data.role);
        const profileData = {
          firstName: data.firstName || "",
          lastName: data.lastName || ""
        };

        // Synchronizuj rolę, jeśli w tokenie jest claim admina
        if (hasAdminClaim && data.role !== "Administrator") {
          try {
            await setDoc(userRef, { role: "Administrator" }, { merge: true });
          } catch (syncError) {
            console.warn("Nie udało się zapisać roli administratora:", syncError);
          }
        }

        setRole(normalizedRole);
        setIsAdmin(normalizedRole === "Administrator");
        setProfile(profileData);
      } catch (error) {
        console.error("Błąd pobierania roli użytkownika:", error);
        setRole("Użytkownik");
        setIsAdmin(false);
        setProfile({ firstName: "", lastName: "" });
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
