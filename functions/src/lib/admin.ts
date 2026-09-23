import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

export const storage = getStorage();

export const nowIso = () => new Date().toISOString();

/** Firestore rejects nested `undefined`; Zod output can contain it for optional keys. */
export const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));
