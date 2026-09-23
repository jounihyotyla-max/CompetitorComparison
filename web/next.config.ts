import type { NextConfig } from "next";

// Static export served by Firebase Hosting; all data comes from Firestore via the web SDK.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ["@cc/shared"],
};

export default nextConfig;
