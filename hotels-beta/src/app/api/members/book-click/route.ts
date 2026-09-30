import { createClient } from "@/lib/supabase/server";
import { parseBookClick } from "@/lib/members/bookClicks";

/* One BOOK click, recorded for the signed-in member (member_book_clicks,
 * scripts/members/2026-09-30-member-book-clicks.sql). The booking-intent
 * signal the concierge tiering will read.
 *
 * Sent with sendBeacon, so nobody waits on the answer: a signed-out visitor, a
 * malformed body or a failed insert all answer 204 and record nothing. The
 * member's own session writes the row, so RLS decides whose it is. */

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 204 });
  }
  const click = parseBookClick(body);
  if (!click) return new Response(null, { status: 204 });

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return new Response(null, { status: 204 });
    const { error } = await supabase.from("member_book_clicks").insert({
      kind: click.kind,
      hotel_id: click.hotelId ?? null,
      flight_route: click.flightRoute ?? null,
      source: click.source ?? null,
    });
    if (error) console.error("[book click]", error.message);
  } catch (err) {
    console.error("[book click]", err);
  }
  return new Response(null, { status: 204 });
}
