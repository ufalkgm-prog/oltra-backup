OLTRA — ANNUAL AWARDS UPDATE PROCEDURE

VERSION: v1 (2026 baseline)
PURPOSE: Maintain a clean, consistent, and auditable awards + scoring system across all hotels in Directus.

---

1. OVERVIEW

---

The awards system is based on:

1. External audited sources (objective, repeatable)
2. A weighted point system (ext_points)
3. A controlled Directus relational field (awards)

Each yearly update consists of THREE phases:

A. Positive audit update (validated awards)
B. Incorrect delta cleanup (remove outdated awards)
C. Residual normalization (set ext_points = 0 for remaining hotels)

---

2. AWARD SOURCES (AUDITED SET)

---

Only the following sources are included in the scoring model:

## Code                Source Name

forbes5             Forbes Travel Guide 5-Star
michelin3keys       Michelin Key Hotels (3-key equivalent)
best50              The World’s 50 Best Hotels
cn                  Condé Nast Gold List
tl100               Travel + Leisure 100
telegraph           Telegraph Travel Awards
aaa                 AAA Five Diamond

IMPORTANT:

* These are the ONLY sources that:

  * influence ext_points
  * are automatically updated/removed via scripts

---

3. PRESERVED (NON-AUDITED) AWARDS

---

These must NEVER be removed by automation:

## Code

lhw
et
glh
aahs
hideaway

These are editorial/partner-driven and remain untouched.

---

4. SCORING SYSTEM (ext_points)

---

Each audited award contributes:

## Award              Points

forbes5            5
michelin3keys      5
best50             4
cn                 2
tl100              2
telegraph          2
aaa                1

Rules:

* Points are additive
* No duplicates
* Missing awards = 0
* ext_points stored as STRING in Directus

Example:
best50 + cn + forbes5 = 4 + 2 + 5 = 11

---

5. EXCEL INPUT FORMAT (MASTER FILE)

---

Required columns:

id                  (Directus hotel ID)
hotel_name          (for reference only)
new_awards          (comma-separated OR array)
external_score      (integer)

Example:

## id | hotel_name | new_awards                | external_score

1223 | The Siam | cn,best50               | 6
1452 | Aman Tokyo | forbes5,michelin3keys | 10

NOTES:

* new_awards must only include AUDITED_CODES
* normalize:
  michelinkeys → michelin3keys

---

6. YEARLY WORKFLOW

---

STEP 1 — DATA COLLECTION

Collect latest lists from:

* Forbes Travel Guide (latest year)
* Michelin Keys (latest release)
* World’s 50 Best Hotels (latest ranking)
* Condé Nast Gold List (latest)
* Travel + Leisure 100
* Telegraph Travel Awards
* AAA Five Diamond list

Best practice:

* work in Excel master file
* normalize naming early
* deduplicate per hotel

---

STEP 2 — BUILD AUDIT DATASET

For each hotel:

* map awards → codes
* calculate external_score

Output:
→ cleaned Excel file
→ convert to JSON

---

STEP 3 — POSITIVE UPDATE

Script:
directus-sync-hotel-awards.mjs

Effect:

* updates awards (audited only)
* updates ext_points

Logic:
FINAL = (CURRENT - AUDITED_CODES) ∪ NEW_AUDITED_CODES

---

STEP 4 — DELTA IDENTIFICATION

Goal:
Find hotels that:

* are NOT in audit dataset
* but still have audited awards

Script:
directus-find-incorrect-award-deltas.mjs

Output:
hotel_awards_incorrect_deltas.json

---

STEP 5 — DELTA CLEANUP

Script:
directus-apply-incorrect-award-deltas.mjs

Effect:

* removes outdated audited awards
* preserves non-audited awards
* sets ext_points = 0

---

STEP 6 — REMAINING HOTELS CLEANUP

Goal:
All hotels NOT covered in steps 3–5

Action:

* set ext_points = 0

Script:
directus-zero-ext-points-from-json.mjs

---

7. SAFETY RULES

---

ALWAYS:

1. Run dry-run first
2. Test single hotel before batch
3. Check:

   * removed awards
   * preserved awards
4. Never run scripts without:
   DOTENV_CONFIG_PATH=.env.local

---

8. COMMON PITFALLS

---

* Missing hotels in audit file → accidental deletions
* Naming mismatches (brand vs property)
* Michelin naming inconsistency
* Forgetting to normalize award codes
* Running cleanup before audit update

---

9. FINAL STATE AFTER FULL RUN

---

Each hotel will be in ONE of three states:

1. Audited hotel
   → correct awards + ext_points > 0

2. Formerly incorrect hotel
   → cleaned awards + ext_points = 0

3. Non-awarded hotel
   → no audited awards + ext_points = 0

---

10. OPTIONAL FUTURE IMPROVEMENTS

---

* Add recency weighting
* Introduce score tiers (e.g. Elite / Core / Emerging)
* Automate data ingestion (APIs/scraping)
* Add validation dashboard

---

## END OF PROCEDURE
