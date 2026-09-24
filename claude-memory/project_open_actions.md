---
name: project-open-actions
description: "Open actions still outstanding, in the order to take them; updated 2026-09-24 (answer-log workflow parked, multi-city layout closed)"
metadata:
  node_type: memory
  type: project
  originSessionId: 113be546-0d38-4348-be9c-ff9b034556a4
  modified: 2026-09-24T20:24:45.801Z
---

Outstanding, highest value first. Everything built so far is on `main` (through `c572e6d`) and backed up.

**0. MUST FIX BEFORE GO-LIVE (Ulrik, 2026-09-24): choosing rooms on the Hotels page.** Guests need to choose the number of rooms and different room types. Today the room count comes only from the search form, and one room type covers every room. Ulrik deferred building it on 2026-09-24 until RateHawk answer the booking question. Constraints, from `.claude/rules/etg-ratehawk.md`:
- one rate covers every room searched, up to 9 rooms, same type only;
- mixed occupancy or types cannot be priced in one search (tested 2026-09-17);
- different types need a search and Prebook per room, joined at checkout — only if the White Label accepts several `p-` hashes.

The question to RateHawk is drafted and held until their redirect spec arrives and certification is done. A count-only stepper in the room panel is buildable now, within the rules, and was offered but deferred with the rest. Raise it when RateHawk reply or when go-live planning starts.

**1. Two Supabase dashboard steps only Ulrik can do (members project `hrlvtzcapsqkgrcawluf`).**
- Add `/auth/callback` to Authentication → URL Configuration → Redirect URLs, for `http://localhost:3000` **and** the Vercel domain. Without it the signup confirmation link silently falls back to the Site URL and lands on the landing page instead of Members — which looks exactly like the code failing.
- Authentication → Email Templates → Confirm signup: subject `myOLTRA member authentication`, body `Follow this link to confirm your membership`, keeping `{{ .ConfirmationURL }}` untouched. The "Supabase Auth" **sender** name needs custom SMTP, which §16 already flags as a pre-production job.

**2. PARKED (Ulrik, 2026-09-24): wiring the monitoring agent to the concierge answer log.** The code is done and pushed (`c572e6d`): the chat route writes one record per answer to `concierge_answer_log` (answers only — never the member's question; member as a hash), and `hotels-beta/docs/concierge-monitoring-brief.md` holds ~50 rules with IDs (T/P/D/L/R/H/F/M/S/W, pages G1–G9), a review routine and a report layout. Remaining steps, all Ulrik's, in order:
- Run `hotels-beta/scripts/members/2026-09-24-concierge-answer-log.sql` in the Supabase SQL Editor of the **members** project.
- Give the monitoring agent a read credential for the `concierge_log_reader` role (a role JWT over REST, or a login for the role — both options are at the end of the SQL file); keep it out of git.
- Optional: set `CONCIERGE_LOG_SALT` on Vercel.
- In an `oltra-agents` session, instruct the agent — the word **edit** must be in his own message (its CLAUDE.md rule): "Please edit `agents/monitoring-agent/AGENT.md`: add to 'What to check' an AI Concierge section. At the start of every run read `../oltra-beta/hotels-beta/docs/concierge-monitoring-brief.md` fresh, review the `concierge_answer_log` records since the last report as its §4 describes, and report by rule ID as in its §10. Never send the concierge questions of your own."
- Verify one record is written: sign in on the dev site, ask one question, check the table (or `[ai log]` in the dev log). Not yet verified live — the browser was signed out when it was built.
The agent **monitors real usage only, never tests** (Ulrik); testing stays in Claude sessions. When a fix changes a rule, update the brief in the same commit — see [[concierge-testing-rounds]].

**Closed, noted so they are not re-raised:** The multi-city leg picker ellipsising two rows — gone with the 2026-09-24 layout (400px full-size cards): no truncated text in any card at 1536, longest checked "Aegean Airlines · 1 stop · ATH 1h15" beside its inline price. Infants — fixed 2026-09-24 (not a missing field: the age dropdown already asks every child's age; the flight side threw the ages away). Under-2s now fly as lap infants by default everywhere, via `lib/flights/passengers.ts`; saved trips still hold counts only. Trip.com affiliate tracking — Ulrik confirmed 2026-09-24 that clicks on generated links register in the affiliate dashboard (noted in §7B; re-check after changing `partners.ts` or the tracking parameters). Filtering the Hotels/Restaurants result lists to the visible map window ("search as I move the map") — DROPPED by Ulrik 2026-09-24 as overkill for the size of the collection; do not propose it again. Multi-city flights clipping below ~1230px — fixed 2026-09-24 (`1f938eb`): the sidebar stays beside the results down to 1000px and the flight columns scroll sideways, with code-only airport fields. From 2026-09-21: the browser normalising nothing (the wire format is ours); the fixed header covering the search panel at 502; the landing leg cards cutting the arrival time; the Flights results clipping between 1181 and 1400 for one-way and return. Portalling every dropdown was decided against — the rule for when one misbehaves is in `.claude/rules/design-system.md` §35.
