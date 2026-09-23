/**
 * Seed the local Firestore emulator: `npm run seed -w functions` with the emulators running.
 * Production is seeded through the admin-only `seed` callable from the web app's Settings page.
 */
export {};
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "nofence-competitor-compare";
const { db } = await import("../src/lib/admin.ts");
const { seedAll } = await import("../src/seed/seed.ts");
const r = await seedAll(db, { withNotes: true, author: "seed@local" });
console.log("seeded emulator:", r);
