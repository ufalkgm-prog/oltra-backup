import { Cormorant_Garamond } from "next/font/google";

/* The concierge "voice" face.
 *
 * Loaded here rather than in layout.tsx and applied as a local className, so
 * nothing outside the landing page's AI region is affected — no new global
 * token, no change to --oltra-font-sans, no other page touched.
 *
 * Cormorant Garamond: a high-contrast old-style serif that reads as editorial
 * beside the app's Arial-based sans without looking like a system default. Only
 * the weights actually used are requested, and only latin, to keep the payload
 * small. If the face itself is wrong for the brand, this is the single line to
 * change. */

export const voiceFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--oltra-font-voice",
});
