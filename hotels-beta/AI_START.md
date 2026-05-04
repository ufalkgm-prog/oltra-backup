We are continuing work on OLTRA.

Project context:
OLTRA is a curated luxury travel platform built with Next.js 15 App Router, TypeScript, Tailwind v4, Server Components by default, Directus on Railway as canonical CMS via /src/lib/directus, and Supabase for auth/member-specific data only. The AI layer is placeholder only and must not query Directus directly.

Strict rules:
- Minimal-diff, production-grade changes only.
- No new libraries unless explicitly approved.
- No schema redesign unless explicitly requested.
- Preserve the editorial luxury UX.
- Centralize reusable logic.
- Use Hotels as behavioral/design reference.
- Avoid temporary hacks unless explicitly marked and documented.
- Provide exact file-level edits and terminal commands one step at a time.
- Do not give multiple terminal commands without explaining what each checks or changes.

Repo/deployment status:
- Real repo root: /workspaces/oltra-beta.
- Real Next.js app: /workspaces/oltra-beta/hotels-beta.
- Ignore/edit nothing in old nested copies.
- GitHub origin repo: ufalkgm-prog/oltra-beta.
- Backup remote: backup → ufalkgm-prog/oltra-backup.
- Plain `git push` may track backup/main; for deployment use `git push origin main:main`.
- Backup push command: `git push backup main:main`.
- If backup push has permission issues, run `unset GITHUB_TOKEN` first.
- Vercel project root directory is hotels-beta.
- Production branch is main.
- Always build locally before pushing to origin.
- Push to origin/main to trigger Vercel deployment.
- Push to backup/main after origin succeeds.
- After changing Vercel env vars, redeploy in Vercel.

Important working commands:
Repo/root checks:
  cd /workspaces/oltra-beta
  git status -sb
  git log --oneline --decorate -5
  git remote -v

Local build:
  cd /workspaces/oltra-beta/hotels-beta
  rm -rf .next
  npm run build

Local dev:
  cd /workspaces/oltra-beta/hotels-beta
  npm run dev

Commit/deploy:
  cd /workspaces/oltra-beta
  git add -A hotels-beta
  git commit -m "..."
  git push origin main:main
  unset GITHUB_TOKEN
  git push backup main:main

Current completed changes from latest session:
- Landing page search panel made darker using page-level CSS override, not global glass variables.
- Landing search now searches Hotels only.
- Removed “Search in”, Hotels checkbox, and Flights checkbox from landing search.
- Removed Flights summary line/action from landing page.
- Bedrooms dropdown defaults to 1.
- Landing date fields changed to display format `dd mmm yyyy`, using a display span over native date input.
- Date fields should open picker on click and prevent typing/text entry.
- Old duplicate date placeholder spans/classes were removed or should be removed if still present.
- Header has OLTRA SVG logo at /public/images/oltra-logo.svg.
- Added orange BETA badge near logo with hover/focus popup:
  “This site is at beta launch stage and does not yet include full hotel list or flights search functionality. Additional content and functionality will be added pending partner discussions.”
- BETA popup was narrowed to around 280px with reduced padding.
- Added orange slanted WIP stamp to Flights nav item, overlapping the top-right of “Flights”.
- WIP should slant positively and sit slightly lower over the “ts”.
- Top nav active outline behavior remains: active page outline stays after navigation but clears while hovering other top menu pages.

Files likely touched last session:
- hotels-beta/src/app/page.tsx
- hotels-beta/src/app/LandingSearchPanel.tsx
- hotels-beta/src/app/page.module.css
- hotels-beta/src/components/site/SiteHeader.tsx
- hotels-beta/src/styles/oltra-theme.css

Known relevant implementation notes:
- SiteHeader uses global `.oltra-site-header...` styles in `src/styles/oltra-theme.css`, not `siteheader.module`.
- Keep landing search panel opacity changes scoped to `src/app/page.module.css`; do not globally change `--oltra-glass-bg`.
- Landing page now assumes `includes = ["hotels"]`.
- `flightsHref` and `flightLine` should no longer be referenced in `page.tsx`.
- `LandingSearchPanel` should no longer accept `selectedIncludes`.
- `hotelsSelected`, `flightsSelected`, `noVerticalSelected`, and `toggleInclude` should no longer exist.
- `resultCountTooLarge` should now only depend on destination state and active hotel count.
- Date display uses `formatDisplayDate(value)` and `data-has-value`.
- CSS date height should use `--oltra-control-height`, not `--oltra-input-height`.

Current product status:
- Hotels UI is stable and functional, but next session should fix a few remaining Hotels page UI issues.
- Restaurants UI is functional and aligned.
- Shared dropdown behavior is implemented.
- Saint Tropez ↔ Ramatuelle city alias logic is implemented.
- Agoda Affiliate Lite / Long Tail availability integration is functional.
- Single selected hotel Agoda availability works.
- Batch Agoda availability for visible hotel results works.
- Result thumbnails show Agoda price/night or “Not available on Agoda.”
- Agoda hotel IDs come from Directus field `agoda_hotel_id`.
- Agoda endpoint path should resolve to `/affiliateservice/lt_v1`.
- Agoda image URLs are stored in Directus fields `agoda_photo1`–`agoda_photo5`; fallback handling may need small UI checks.
- GuestSelector was corrected so `onChange` fires from `useEffect` after local state changes.
- Agoda dirty-state behavior should make both Agoda buttons active again when destination/purpose, dates, guests, or bedrooms change.

Members status:
- Member pages were heavily refined and mostly stable.
- Personal information, saved trips, favorites, feedback/suggest, and review page updates are complete as of prior sessions.

Next session focus:
1. Disable the Flights page/functionality for beta launch while preserving the menu item with WIP sticker.
   - Likely options: make `/flights` show a polished beta/WIP page or prevent navigation and show/route to a simple notice.
   - Keep minimal-diff and luxury editorial tone.
   - Do not remove Flights permanently.
2. Fix a few UI issues on the Hotels page.
   - Ask me for the specific Hotels UI issues first.
   - Ask for only the minimum relevant files/snippets if not already known.
3. Then guide through:
   - local build/test from `/workspaces/oltra-beta/hotels-beta`
   - git status from `/workspaces/oltra-beta`
   - commit
   - push to origin/main for Vercel
   - push to backup/main
   - Vercel deployment check

Please start by asking exactly:
“What should the disabled Flights experience be for beta: a non-clickable WIP nav item, or a clickable polished beta notice page? And what Hotels page UI issue should we fix first?”