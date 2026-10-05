/* How a saved flight row reads its second leg (2026-10-05 test pass).
 *
 * A saved return is ONE row: `route` and `timing` describe the outbound,
 * and the flight home survives only as `return_depart_at`. Nothing showed
 * it, so a member who saved CPH ⇄ LHR saw a one-way to London. These read
 * the return back out of what every saved row already holds. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "CPH → London" read the other way: "London → CPH". */
export function reverseRoute(route: string | null | undefined): string {
  const parts = (route ?? "").split(/\s*→\s*/).map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  return `${parts[1]} → ${parts[0]}`;
}

/** "08 Nov 2026 · 10:20" from the stored departure, in the airport's own
 * local time: the stamp carries its offset, and the wall-clock part is read
 * as written rather than converted to the viewer's zone. */
export function formatReturnDeparture(iso: string | null | undefined): string {
  const match = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!match) return "";
  const [, y, m, d, time] = match;
  const day = `${d} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
  return time ? `${day} · ${time}` : day;
}
