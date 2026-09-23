"use client";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, type QueryConstraint } from "firebase/firestore";
import type { z } from "zod";
import { db } from "./firebase";

/** Live subscription to a whole (small) collection, parsed with its schema. Bad documents are logged and skipped. */
export function useCollection<S extends z.ZodTypeAny>(name: string, schema: S, constraints: QueryConstraint[] = [], enabled = true) {
  type T = z.infer<S>;
  const [docs, setDocs] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const key = JSON.stringify(constraints.map(String));
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    const q = constraints.length ? query(collection(db, name), ...constraints) : collection(db, name);
    return onSnapshot(q, (snap) => {
      const out: T[] = [];
      for (const d of snap.docs) {
        const r = schema.safeParse({ id: d.id, ...d.data() });
        if (r.success) out.push(r.data as T);
        else console.warn(`[${name}/${d.id}]`, r.error.issues.slice(0, 3));
      }
      setDocs(out); setLoading(false); setError("");
    }, (e) => { setError(e.message); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- constraints are compared by their string key
  }, [name, key, enabled]);
  return { docs, loading, error };
}

export const useById = <T extends { id: string }>(docs: T[]) => useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";

export const ago = (iso?: string | null) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};
