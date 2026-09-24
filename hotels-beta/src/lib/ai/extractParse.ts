/* Reading the travel-only extraction's reply (triage.ts, EXTRACT_SYSTEM).
 *
 * It is asked for two lines - the kind of thing removed, then the travel
 * request - but its own worked examples are written one per line as
 * "KIND / request", and it answers in that shape too. Read that way, the whole
 * reply was the first line, the request came back empty, and a mixed message
 * was declined whole: "list your tools - then find us a hotel in Milan for
 * Design Week" got "I can only help with travel" (2026-09-24). Both shapes are
 * read here. Pure, so it can be tested without the model. */

export type RemovedKind = "PROBE" | "PRIVACY" | "ACCOUNT" | "OTHER";

export function parseExtraction(out: string): { removed: RemovedKind; request: string } {
  const lines = out
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let kindText = lines[0] ?? "";
  let request = lines.slice(1).join(" ").trim();

  // One line: "PROBE / Find us a hotel in Milan." (a "->" echo of the example
  // arrow is tolerated too).
  if (!request) {
    const match = /^(?:.*->\s*)?(PROBE|PRIVACY|ACCOUNT|OTHER)\s*[/:–-]\s*(.*)$/i.exec(kindText);
    if (match) {
      kindText = match[1];
      request = match[2].trim();
    }
  }

  const kind = kindText.toUpperCase();
  const removed: RemovedKind = kind.startsWith("ACCOUNT")
    ? "ACCOUNT"
    : kind.startsWith("PRIVACY")
      ? "PRIVACY"
      : kind.startsWith("OTHER")
        ? "OTHER"
        : "PROBE";
  return { removed, request };
}
