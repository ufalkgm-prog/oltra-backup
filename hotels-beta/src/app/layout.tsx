import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AiSearchProvider } from "@/lib/ai/aiSearchStore";
import AiConciergeRoot from "@/components/ai/AiConciergeRoot";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "myOLTRA - %s",
    default: "myOLTRA",
  },
  description: "Curated luxury travel — hotels, restaurants, flights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* The provider wraps the whole app so one conversation spans the
            site — it used to live inside the landing page, which meant the
            first navigation destroyed it. `children` is passed straight
            through, so the pages below stay server components.

            The concierge UI itself is far narrower than the provider:
            AiConciergeRoot renders on five pages and never in the members
            area. */}
        <AiSearchProvider>
          {children}
          <AiConciergeRoot />
        </AiSearchProvider>
        <Analytics />
      </body>
    </html>
  );
}
