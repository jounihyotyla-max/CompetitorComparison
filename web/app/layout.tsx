import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// The mockup's typeface (Competitor Comparison Table canvas), self-hosted by Next.
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: "Competitor Comparison",
  description: "Nofence competitor comparison: every cell traces back to a dated, sourced quote.",
};

// Applies the saved light/dark theme and colour variant before React hydrates so nothing flashes.
const themeInit = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var v=localStorage.getItem("variant");if(v)document.documentElement.dataset.variant=v}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={plex.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
