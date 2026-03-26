import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/members/:path*",
    "/login",
    "/forgot-password",
    "/update-password",
    "/auth/callback",
  ],
};