"use client";

import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getIdTokenResult, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { SUPER_ADMIN_UIDS } from "../lib/admin";

type UserRole = "Administrator" | "Użytkownik";

type UserProfile = {
  firstName: string;
  lastName: string;
};

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const normalizeRole = (rawRole?: string | null): UserRole => {
  return rawRole === "Administrator" ? "Administrator" : "Użytkownik";
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
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
        const userRef = doc(db, "users", firebaseUser.uid);
        const tokenResult = await getIdTokenResult(firebaseUser);
        const hasAdminClaim = tokenResult?.claims?.admin === true;
        const isSuperAdmin = SUPER_ADMIN_UIDS.includes(firebaseUser.uid);

        const snap = await getDoc(userRef);
        const baseProfile: UserProfile = {
          firstName: firebaseUser.displayName || "",
          lastName: ""
        };

        if (!snap.exists()) {
          const payload = {
            role: hasAdminClaim || isSuperAdmin ? "Administrator" : "Użytkownik",
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

        const data = snap.data() as { role?: string; firstName?: string; lastName?: string };
        const normalizedRole = normalizeRole(isSuperAdmin ? "Administrator" : data.role);
        const profileData: UserProfile = {
          firstName: data.firstName || "",
          lastName: data.lastName || ""
        };

        if ((hasAdminClaim || isSuperAdmin) && data.role !== "Administrator") {
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

  if (!AuthContext) {
    throw new Error("AuthContext nie został zainicjalizowany.");
  }

  return (
    <AuthContext.Provider value={{ user, role, profile, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth musi być użyty wewnątrz AuthProvider");
  }

  return context;
}
