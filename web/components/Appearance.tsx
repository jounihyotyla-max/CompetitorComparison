"use client";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

export type Variant = "" | "a" | "b" | "c";
const VARIANTS: [Variant, string, string][] = [
  ["", "Mockup", "Light page, white cards, plain section heads"],
  ["a", "A · Pasture", "Dark green-grey content area, off-white cards, tinted heads"],
  ["b", "B · Field", "Warm grey page, solid green section heads"],
  ["c", "C · Meadow", "Pale green page, green top rule on each card"],
];

/** Colour variant picker (per browser, localStorage). Lets everyone compare options A–C on live data. */
export default function Appearance({ compact = false }: { compact?: boolean }) {
  const [variant, setVariant] = useState<Variant>("");
  useEffect(() => {
    try { const v = localStorage.getItem("variant") as Variant | null; if (v) setVariant(v); } catch {}
  }, []);
  const choose = (v: Variant) => {
    setVariant(v);
    if (v) document.documentElement.dataset.variant = v; else delete document.documentElement.dataset.variant;
    try { localStorage.setItem("variant", v); } catch {}
  };
  if (compact) {
    return (
      <div className="seg" role="radiogroup" aria-label="Colour variant">
        {VARIANTS.map(([v, label]) => (
          <label key={v || "m"} className="seg-opt" title={label}><input type="radio" name="variant" value={v} checked={variant === v} onChange={() => choose(v)} /><span>{v ? v.toUpperCase() : "M"}</span></label>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>Light / dark</span><ThemeToggle />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
        {VARIANTS.map(([v, label, desc]) => (
          <label key={v || "m"} className="blueprint" style={{ padding: 12, cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", outline: variant === v ? "2px solid var(--green)" : "none" }}>
            <input type="radio" name="variant-full" value={v} checked={variant === v} onChange={() => choose(v)} style={{ marginTop: 3 }} />
            <span><b style={{ display: "block", fontSize: 14 }}>{label}</b><span className="muted" style={{ fontSize: 12 }}>{desc}</span></span>
          </label>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Stored in this browser only. The chosen direction becomes the default once decided; the greens are the mockup&apos;s #2b6a4c family until the brand palette is confirmed.</p>
    </div>
  );
}
