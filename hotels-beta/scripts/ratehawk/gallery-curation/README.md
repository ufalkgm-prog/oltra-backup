# Gallery curation: exclusions, then hero and second image

Two vision passes over hotel galleries (`ratehawk_image_1..50`), kept here so they can be run again on new hotels and after any re-import. They were first run as one-offs: the hero pass on 2026-10-06 (819 hotels), the exclusion pass on 2026-10-07 (821 hotels). Those runs' files are in `../output/hero-reorder-2026-10-06/` and `../output/gallery-clean-2026-10-07/`, which are gitignored and on one machine only. The prompts below are the same ones.

- **The exclusion pass** finds floor plans and renderings (CGI, artist's impressions). The ones it is certain of are deleted from the gallery and added to `../excluded-gallery-images.json`, so `apply-ratehawk-images.mjs` never brings them back. The ones it is unsure of go to a person first, on a local approval page.
- **The hero pass** picks slot 1 (hero) and slot 2 (second) and moves problem images to the back. It removes nothing.

Room images are not touched: the room pop-up reads `ratehawk_room_groups`, a separate list ETG owns.

## When to run it

- **New hotels**, after images are applied (`apply-ratehawk-images.mjs` or a promotion driver) and **before they are published**. Use `--only` with their ids.
- **After any re-import in ETG order.** That undoes the hero order on every hotel it touches; the exclusions survive it.

## Steps

Run from this folder. Each run works in a folder of its own: `--work <dir>`, default `../output/gallery-curation-<today>/` (gitignored). Use **two work folders**, one for each pass, because the hero pass must judge the gallery as the exclusion pass left it.

```bash
# Exclusion pass
node snapshot.mjs --work ../output/excl-2026-11-01 --only 3101,3102   # omit --only for every hotel
python sheets.py ../output/excl-2026-11-01                             # needs Pillow
node exclusions-classify.mjs --work ../output/excl-2026-11-01          # model calls
node exclusions-apply.mjs --work ../output/excl-2026-11-01             # dry run: read what it will do
node exclusions-apply.mjs --work ../output/excl-2026-11-01 --confirm   # deletes the CERTAIN ones
node exclusions-approve-page.mjs --work ../output/excl-2026-11-01      # approve.html for the uncertain ones
#   open approve.html, mark Delete, Export decisions, then:
node exclusions-apply.mjs --work ../output/excl-2026-11-01 --approved <approved-deletions.json> --confirm

# Hero pass, on a fresh snapshot
node snapshot.mjs --work ../output/hero-2026-11-01 --only 3101,3102
python sheets.py ../output/hero-2026-11-01
node hero-classify.mjs --work ../output/hero-2026-11-01
node hero-apply.mjs --work ../output/hero-2026-11-01                   # dry run
node hero-apply.mjs --work ../output/hero-2026-11-01 --confirm
```

**Commit `../excluded-gallery-images.json` after every confirmed exclusion run.** It is the record that keeps the images out.

## Safety

- Snapshot, sheets and both classify steps are read-only. Classify costs model calls: the full collection was about $19 for the exclusion pass.
- Both apply steps are dry runs unless `--confirm`. They read the gallery as it is in Directus at that moment and match images by URL, so runs can follow each other. They write a rollback file into the work folder first (`--rollback <file> --confirm` restores it), and read every hotel back after writing.
- The exclusion apply holds back any hotel that would keep fewer than 2 photos, and lists it.
- The hero apply skips a hotel whose chosen hero or second image is no longer in its gallery.
- Concurrency: `C=6` by default, set with the `C` environment variable.

## The decisions behind it (Ulrik)

- 2026-10-07: delete certain floor plans and renderings. **Keep all 1,263 uncertain ones from that run.** They are a decision, not a backlog.
- Hero and second: never a floor plan, map, logo, text overlay, collage, food close-up, bathroom, meeting room, gym, corridor, people shot, or a dark, blurry or low-resolution image. ETG's category labels are unreliable, so the choice is made by looking.
