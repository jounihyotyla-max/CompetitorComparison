"use client";
import { useAuth } from "@/lib/auth";

export default function SignIn() {
  const { signIn, error, loading } = useAuth();
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="blueprint" style={{ maxWidth: 420, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="kicker">Nofence · internal</span>
        <h2 style={{ margin: 0 }}>Nofence competitor analytics</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Every cell in the tables traces back to a dated, sourced quote. Sign in with your Nofence Google account (nofence.com or nofence.no) to see them.
        </p>
        <button className="btn btn-primary" type="button" onClick={signIn} disabled={loading} style={{ alignSelf: "flex-start" }}>
          Sign in with Google
        </button>
        {error && <p className="bad" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
      </div>
    </main>
  );
}
