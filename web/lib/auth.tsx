"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User as FbUser } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { COLLECTIONS, type Role } from "@cc/shared";
import { ALLOWED_DOMAIN, auth, db, googleProvider } from "./firebase";

export interface AuthState {
  loading: boolean;
  user: FbUser | null;
  role: Role | null;
  /** true once users/{uid} has been read (role may still be viewer while an admin promotion is pending) */
  ready: boolean;
  error: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FbUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setError("");
    if (u && !u.email?.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      await fbSignOut(auth);
      setError(`Only ${ALLOWED_DOMAIN} Google accounts can use this tool.`);
      setUser(null); setRole(null); setLoading(false); setReady(true);
      return;
    }
    setUser(u);
    setLoading(false);
    if (!u) { setRole(null); setReady(true); }
  }), []);

  // users/{uid}: created on first sign-in as viewer; the onUserNew function promotes listed admins.
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, COLLECTIONS.users, user.uid);
    let unsub = () => {};
    (async () => {
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, { id: user.uid, email: user.email, displayName: user.displayName ?? "", role: "viewer", createdAt: new Date().toISOString() });
        }
        unsub = onSnapshot(ref, (s) => { setRole((s.data()?.role as Role) ?? "viewer"); setReady(true); }, (e) => { setError(e.message); setReady(true); });
      } catch (e) { setError((e as Error).message); setReady(true); }
    })();
    return () => unsub();
  }, [user]);

  const value: AuthState = {
    loading, user, role, ready, error,
    signIn: async () => { setError(""); try { await signInWithPopup(auth, googleProvider); } catch (e) { setError((e as Error).message); } },
    signOut: () => fbSignOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};

export const can = (role: Role | null, needed: Role) =>
  role !== null && ({ viewer: 0, editor: 1, admin: 2 } as const)[role] >= ({ viewer: 0, editor: 1, admin: 2 } as const)[needed];
