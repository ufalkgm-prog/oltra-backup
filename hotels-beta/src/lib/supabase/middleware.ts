import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isMembersRoute = request.nextUrl.pathname.startsWith("/members");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const isForgotPasswordRoute =
    request.nextUrl.pathname.startsWith("/forgot-password");
  const isUpdatePasswordRoute =
    request.nextUrl.pathname.startsWith("/update-password");
  const isAuthCallbackRoute =
    request.nextUrl.pathname.startsWith("/auth/callback");

  if (
    isMembersRoute &&
    !user &&
    !isLoginRoute &&
    !isForgotPasswordRoute &&
    !isUpdatePasswordRoute &&
    !isAuthCallbackRoute
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (isLoginRoute && user) {
    const next = request.nextUrl.searchParams.get("next") || "/members";
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}