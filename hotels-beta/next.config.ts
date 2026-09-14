import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Both pinned to this app directory. Left unset, file tracing infers its
  // root from the nearest lockfile it finds above, and a leftover one at the
  // repo root (since deleted) made it disagree with turbopack.root, so every
  // build warned that the two must match.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      // Agoda property image CDN — subdomains pix1–pix5.agoda.net
      { protocol: "https", hostname: "*.agoda.net" },
      // Ratehawk/Worldota property image CDN — see CLAUDE.md §29
      { protocol: "https", hostname: "cdn.worldota.net" },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
