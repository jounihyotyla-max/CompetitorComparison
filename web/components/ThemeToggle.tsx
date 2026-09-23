"use client";
import { useEffect, useState } from "react";

export type Theme = "light" | "system" | "dark";
const THEMES: Theme[] = ["light", "system", "dark"];

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as Theme | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore client-only storage after hydration
      if (saved && THEMES.includes(saved)) setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    apply(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (theme === "system") apply("system"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (t: Theme) => {
    setTheme(t);
    try { localStorage.setItem("theme", t); } catch {}
  };

  return (
    <div className="seg" role="radiogroup" aria-label="Theme" style={{ fontSize: 12 }}>
      {THEMES.map((t) => (
        <label key={t} className="seg-opt">
          <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => choose(t)} />
          <span style={{ textTransform: "capitalize" }}>{t}</span>
        </label>
      ))}
    </div>
  );
}
