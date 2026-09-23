import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Directus serves the supplier images from its own host, which next/image has
// to be told about explicitly. Derived from DIRECTUS_URL so a host change is
// picked up with the env var rather than needing an edit here.
const directusHostname = (() => {
  try {
    return process.env.DIRECTUS_URL ? new URL(process.env.DIRECTUS_URL).hostname : null;
  } catch {
    return null;
  }
})();

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
      // Ratehawk/Worldota property image CDN — see CLAUDE.md §29
      { protocol: "https", hostname: "cdn.worldota.net" },
      // Directus asset store. Supplier images are normally proxied through
      // /api/hotel-images/file/[fileId], so this matters only if a public read
      // policy is added in Directus and the URLs start pointing there directly.
      // Any host outside this list makes next/image throw (CLAUDE.md §29).
      ...(directusHostname
        ? [{ protocol: "https" as const, hostname: directusHostname }]
        : []),
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
