import { NextRequest, NextResponse } from "next/server";

const BETA_PASSWORD = "Oltra2387";
const BETA_COOKIE = "beta_auth";
const BETA_TOKEN = "oltra_beta_granted";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== BETA_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(BETA_COOKIE, BETA_TOKEN, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
