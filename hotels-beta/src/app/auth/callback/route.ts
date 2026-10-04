import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/members";

  if (!next.startsWith("/")) {
    next = "/members";
  }

  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const forwardedHost = headerStore.get("x-forwarded-host");

  const publicOrigin =
    forwardedProto && forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : url.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      await ensureMemberProfile(supabase);
      return NextResponse.redirect(`${publicOrigin}${next}`);
    }
  }

  /* The first of the two links of an e-mail change (Secure email change sends
     one to each address). Supabase accepts it and sends a message, not a code:
     nothing is signed in yet, and the change waits for the other link.
     Personal Information shows it as pending. */
  if (!code && searchParams.get("message")) {
    return NextResponse.redirect(`${publicOrigin}${next}`);
  }

  return NextResponse.redirect(
    `${publicOrigin}/login?error=auth_callback_failed`
  );
}

/* THE MEMBER RECORD IS MADE WHEN THE ADDRESS IS CONFIRMED (Ulrik, 2026-09-21).
 *
 * A `member_profiles` row used to appear only when someone saved Personal
 * Information, so a confirmed account could exist with nothing of ours
 * attached to it — every read fell back to the auth user's own metadata.
 * Confirming the address is the moment the membership begins, and this route
 * is where that lands, for the email link and for Google alike.
 *
 * `ignoreDuplicates` so returning through here never touches a profile the
 * member has since filled in. It writes the address and nothing else; the rest
 * of the profile is theirs to enter.
 *
 * Failure is swallowed on purpose. The row is a convenience — the members area
 * reads perfectly well without one — and refusing to sign somebody in because
 * a side write failed would turn a small problem into a locked door. */
async function ensureMemberProfile(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("member_profiles")
      .upsert(
        { user_id: user.id, email: user.email ?? null },
        { onConflict: "user_id", ignoreDuplicates: true }
      );

    if (error) console.error("[auth callback] member profile", error.message);

    /* Keep the copy in step with the login address, which an e-mail change
       just moved (Ulrik, 2026-10-04). */
    if (user.email) {
      const { error: syncError } = await supabase
        .from("member_profiles")
        .update({ email: user.email })
        .eq("user_id", user.id);
      if (syncError) console.error("[auth callback] member email", syncError.message);
    }
  } catch (err) {
    console.error("[auth callback] member profile", err);
  }
}