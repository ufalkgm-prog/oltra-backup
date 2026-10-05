/** Where to go after logging in: a path on this site, or /members.
 *
 * `?next=` came from the URL and was followed as given, so
 * /login?next=https://elsewhere sent a member off-site the moment they
 * logged in - an open redirect (2026-10-05 test pass). Only a same-site path
 * passes: it starts with one "/", and not "//" or "/\", which browsers read as
 * another host. */
export function safeNext(value: string | null | undefined, fallback = "/members"): string {
  const next = (value ?? "").trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
