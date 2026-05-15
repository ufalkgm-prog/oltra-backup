import { NextRequest, NextResponse } from "next/server";

const BETA_COOKIE = "beta_auth";
const BETA_TOKEN = "oltra_beta_granted";

const PUBLIC_PATHS = ["/beta-login", "/api/beta-login", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(BETA_COOKIE);
  if (cookie?.value === BETA_TOKEN) {
    return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/beta-login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
