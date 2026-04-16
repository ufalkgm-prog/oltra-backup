# Activities taxonomy audit workflow

This package assumes:
- `activities(id, name, slug)`
- `hotels_activities(id, hotels_id, activities_id)`
- Directus credentials are available through `DIRECTUS_URL` and `DIRECTUS_TOKEN`

Included files:
- `activities_audit_plan.json` — generated from your spreadsheet
- `apply-activities-audit.ts` — dry-run/apply script

## What the plan does
- 41 survivor activities remain
- 12 source activities are merged into survivor activities
- 7 source activities are removed entirely

## Run sequence

### 1) Dry run
```bash
DIRECTUS_URL=... DIRECTUS_TOKEN=... node --import tsx /mnt/data/apply-activities-audit.ts
```

### 2) Apply relation changes only
```bash
DIRECTUS_URL=... DIRECTUS_TOKEN=... node --import tsx /mnt/data/apply-activities-audit.ts --apply
```

### 3) Apply relation changes and delete obsolete taxonomy rows
Run this only after you have checked the Directus admin UI and confirmed the live relation cleanup looks correct.

```bash
DIRECTUS_URL=... DIRECTUS_TOKEN=... node --import tsx /mnt/data/apply-activities-audit.ts --apply --delete-taxonomy
```

### 4) Verification only
```bash
DIRECTUS_URL=... DIRECTUS_TOKEN=... node --import tsx /mnt/data/apply-activities-audit.ts --verify-only
```

## Recommended safety order
1. Dry run
2. Apply relation changes without deleting taxonomy rows
3. Inspect a few merged hotels in Directus
4. Run again with `--delete-taxonomy`
5. Verification only

## Merge examples
- Bycicling -> Biking
- Cycling -> Biking
- Femily -> Family
- Horse riding -> Horseback riding
- Jeep safari -> Safari
- Party -> Nightlife
- Snorkling -> Snorkeling
- Trekking -> Hiking
- Watersports -> Water sports
- Yogs -> Yoga

## Hard deletes
- Adventure
- Business
- Casino
- Fitness
- Off-road motorCycling
- Relaxing
- Romance
