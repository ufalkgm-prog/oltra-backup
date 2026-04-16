OLTRA — ADDING / UPDATING HOTELS FROM EXCEL TO DIRECTUS
WORKFLOW NOTE (based on 2026 hotel batch import process)

============================================================
1. PURPOSE
============================================================

This procedure is for adding new hotels to the Directus hotels database
from the structured Excel onboarding file.

The Excel file uses Directus-style field headers and supports:
- scalar fields
- boolean fields
- many-to-many relational fields entered as comma-separated labels

This workflow was used successfully for the 14-hotel batch added in 2026.

============================================================
2. REQUIRED INPUT FILE FORMAT
============================================================

Use an Excel .xlsx file, NOT CSV.

Reason:
- several relational fields contain multiple comma-separated values
- CSV can create delimiter ambiguity
- .xlsx preserves cell integrity safely

Expected column headers:

id
hotel_name
affiliation
region
country
city
state_province__county__island
local_area
highlights
styles
settings
activities
description
www
insta
total_rooms_suites_villas
high_season
low_season
rain_season
awards
ext_points
editor_rank_13
published

Important notes:
- id is the primary key for the hotel item
- published is boolean (TRUE/FALSE or equivalent)
- relational fields are comma-separated labels:
  - styles
  - settings
  - activities
  - awards

============================================================
3. PREPARE THE EXCEL FILE
============================================================

Before ingestion, complete all missing editorial / scalar fields.

In the 2026 process, the missing fields filled were:
- description
- total_rooms_suites_villas
- high_season
- low_season
- rain_season

Description guidance:
- minimum 40 words
- property-specific
- non-generic
- based on official website and supporting sources
- aligned with OLTRA editorial tone

Season guidance:
- use climate-based destination logic
- format with en dash:
  Example:
  May–Sep
  Nov–Mar

Room count guidance:
- integer only
- use total rooms / suites / villas combined

============================================================
4. KEEP RELATIONAL VALUES AS LABELS IN EXCEL
============================================================

Do NOT convert relational values to IDs in Excel.

Enter them as comma-separated labels, for example:

styles:
Design, Contemporary

settings:
Beachfront, Countryside

activities:
Spa, Gastronomy, Hiking

awards:
best50, lhw

Important:
- these values must match Directus taxonomy options
- awards are matched by code
- styles/settings/activities are matched by name

============================================================
5. CONVERT EXCEL TO JSON
============================================================

After Excel is complete, convert it to JSON for machine-safe ingestion.

Why JSON:
- preserves field structure
- safely handles commas inside relational cells
- works cleanly with scripts

The JSON should preserve the same fields as the Excel file.

Each row becomes one JSON object.

============================================================
6. SCRIPT BEHAVIOR
============================================================

The hotel creation script should:

1. read DIRECTUS_URL and DIRECTUS_TOKEN from .env.local
2. load the JSON input file
3. load Directus lookup collections:
   - styles
   - settings
   - activities
   - awards
4. map Excel relational labels to Directus item IDs
5. convert many-to-many fields into junction-object payloads
6. POST new hotels into the hotels collection

Important:
- do NOT send raw UUID arrays for M2M relations
- send junction objects instead

Correct pattern:

styles:
[
  { "styles_id": "<uuid>" }
]

settings:
[
  { "settings_id": "<uuid>" }
]

activities:
[
  { "activities_id": "<uuid>" }
]

awards:
[
  { "awards_id": "<uuid>" }
]

This is critical.
A previous failed attempt used raw UUID arrays, which caused Directus
to throw integer junction-table errors.

============================================================
7. DIRECTUS / TOKEN REQUIREMENTS
============================================================

The API token must have permission to:

READ:
- styles
- settings
- activities
- awards

CREATE:
- hotels

Note:
- read access to hotels is not strictly necessary for new-hotel creation
  if the script is written without a pre-check on existing hotel IDs

If the token lacks permission on lookup collections, dry run will fail
with 403 errors.

============================================================
8. DRY RUN FIRST
============================================================

Always run a dry run before live creation.

Example command:

DOTENV_CONFIG_PATH=.env.local node --require dotenv/config scripts/directus-create-hotels-from-json.mjs --input scripts/hotel_update_completed.json --dry-run

Optional single-hotel dry run:

DOTENV_CONFIG_PATH=.env.local node --require dotenv/config scripts/directus-create-hotels-from-json.mjs --input scripts/hotel_update_completed.json --hotel-id 1810 --dry-run

What to check:
- all hotels load correctly
- relational labels map successfully
- no taxonomy mismatches
- no permission errors

============================================================
9. SINGLE HOTEL LIVE TEST
============================================================

Before full batch, test one hotel live.

Example:

DOTENV_CONFIG_PATH=.env.local node --require dotenv/config scripts/directus-create-hotels-from-json.mjs --input scripts/hotel_update_completed.json --hotel-id 1821

If successful, Directus should return:
Create result: OK

============================================================
10. FULL BATCH LIVE RUN
============================================================

After single-hotel validation, run full batch:

DOTENV_CONFIG_PATH=.env.local node --require dotenv/config scripts/directus-create-hotels-from-json.mjs --input scripts/hotel_update_completed.json

============================================================
11. COMMON ERRORS AND MEANING
============================================================

A. 403 FORBIDDEN
Meaning:
- token lacks permission on a required collection

Most likely collections:
- styles
- settings
- activities
- awards
- hotels (if script tries to pre-read hotels)

Fix:
- update Directus role permissions
- or remove unnecessary pre-check against hotels

------------------------------------------------------------

B. 500 with junction-table integer / UUID mismatch
Example:
invalid input syntax for type integer in hotels_activities

Meaning:
- script sent raw related UUIDs instead of junction objects

Fix:
- use:
  activities: [{ activities_id: "<uuid>" }]
  not:
  activities: ["<uuid>"]

------------------------------------------------------------

C. Could not map styles/settings/activities/awards
Meaning:
- Excel label does not exactly match a Directus taxonomy option

Fix:
- correct the label in Excel or JSON
- or extend lookup logic if needed

============================================================
12. RECOMMENDED WORKFLOW NEXT TIME
============================================================

1. Prepare new hotels in .xlsx
2. Fill all missing editorial/scalar fields
3. Save master Excel
4. Convert Excel to JSON
5. Run dry run
6. Run one-hotel live test
7. Run full batch
8. Check Directus visually after import

============================================================
13. IMPORTANT BEST PRACTICES
============================================================

- Use .xlsx, not CSV
- Keep Excel as the editorial master file
- Use JSON as machine input
- Do not manually create many hotels in Directus one by one
- Always test one hotel live before full batch
- Preserve script files in /scripts
- Save successful JSON examples for reference when useful

============================================================
14. FILES TO KEEP IN PROJECT
============================================================

Recommended to save:
- the final import script in /scripts
- this workflow note in /docs or project notes
- a blank template Excel file for future hotel additions

Optional:
- save one example JSON for future troubleshooting

============================================================
END
============================================================