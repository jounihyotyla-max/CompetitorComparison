"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type User as FbUser } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { COLLECTIONS, type Role } from "@cc/shared";
import { ALLOWED_DOMAINS, auth, db, googleProvider } from "./firebase";

const allowed = (email?: string | null) => !!email && ALLOWED_DOMAINS.some((d) => email.toLowerCase().endsWith(`@${d}`));
const domainMessage = `Only ${ALLOWED_DOMAINS.join(" or ")} Google accounts can use this tool. Pick your Nofence account in the Google window.`;

/** Firebase's error codes, in words a first-time user can act on. */
function explain(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? "");
  switch (code) {
    case "auth/popup-blocked":
    case "auth/operation-not-supported-in-this-environment":
      return "Your browser blocked the Google sign-in window. Open this page in Safari or Chrome (not inside Slack) and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google window was closed before sign-in finished. Try again.";
    case "auth/network-request-failed":
      return "No connection to Google. Check your network and try again.";
    case "auth/unauthorized-domain":
      return "This address is not allowed to sign in. Use https://nofence-competitor-compare.web.app.";
    default:
      return `Sign-in failed (${code || (e as Error)?.message || "unknown"}). Try again, or tell Jouni which browser you used.`;
  }
}
/** Popup blocked or unsupported (Slack's in-app browser, iOS Safari): a full-page redirect works there. */
const wantsRedirect = (e: unknown) => ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"].includes(String((e as { code?: string })?.code ?? ""));

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

  // After a redirect sign-in, surface its error (the success case arrives through onAuthStateChanged).
  useEffect(() => { getRedirectResult(auth).catch((e) => setError(explain(e))); }, []);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setError("");
    if (u && !allowed(u.email)) {
      await fbSignOut(auth);
      setError(domainMessage);
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
    signIn: async () => {
      setError("");
      try { await signInWithPopup(auth, googleProvider); }
      catch (e) {
        if (wantsRedirect(e)) { try { await signInWithRedirect(auth, googleProvider); return; } catch (e2) { setError(explain(e2)); return; } }
        setError(explain(e));
      }
    },
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
