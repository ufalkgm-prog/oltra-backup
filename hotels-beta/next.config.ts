import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Agoda property image CDN — subdomains pix1–pix5.agoda.net
      { protocol: "https", hostname: "*.agoda.net" },
    ],
  },
};

export default nextConfig;
