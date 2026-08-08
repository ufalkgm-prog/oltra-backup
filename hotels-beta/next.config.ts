import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
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
