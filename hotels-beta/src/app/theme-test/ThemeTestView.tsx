"use client";

import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HotelRecord } from "@/lib/directus";
import OltraSelect from "@/components/site/OltraSelect";
import GuestSelector from "@/components/site/GuestSelector";
import HotelSmallCard from "@/components/hotels/HotelSmallCard";
import styles from "./ThemeTestView.module.css";

let _ml: typeof maplibregl | null = null;
async function loadMaplibre(): Promise<typeof maplibregl> {
  if (!_ml) _ml = (await import("maplibre-gl")).default;
  return _ml;
}

// --- Contrast math, mirrored from the audit script so the on-page table is
// computed live rather than a hand-typed copy of numbers from chat. ---
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)) as [number, number, number];
}
function relLum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: string, b: string): number {
  const L1 = relLum(hexToRgb(a));
  const L2 = relLum(hexToRgb(b));
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// FINAL PALETTE, 2026-08-13 — mirrors the values now shipped into
// [data-oltra-surface="dark"] in oltra-theme.css. Kept as local constants
// here (rather than reading the CSS custom properties at runtime) so the
// contrast table below can compute against them directly in JS.
const BASE = "#2c3634";
const PANEL = "#374240";
const FIELD = "#232c2a";
const TEXT_PRIMARY = "#f5f2ec";
const MUTED = "#cbd0cb";
const PLACEHOLDER = "#c0c6c1";
const DISABLED = "#787774";
const BORDER_FIELD = "#3e4947";
const BORDER_PANEL = "#738783";
const BUTTON_FILL = "#7ba079";
const BUTTON_FILL_TEXT = FIELD;
const BUTTON_OUTLINE_BORDER = "#6c8c6a";
const ERROR_TEXT = "#ff8a71";
const ERROR_TEXT_ALT = "#ff7762"; // less-shifted alternative, fails vs panel — shown for comparison only

type ContrastRow = {
  role: string;
  value: string;
  checks: { against: string; againstLabel: string; label: string; min: number }[];
  note?: string;
};

const SURFACE_CHECKS = [
  { against: BASE, againstLabel: BASE, label: "vs base" },
  { against: PANEL, againstLabel: PANEL, label: "vs panel" },
  { against: FIELD, againstLabel: FIELD, label: "vs field" },
];

const CONTRAST_ROWS: ContrastRow[] = [
  {
    role: "Text — primary #F5F2EC",
    value: TEXT_PRIMARY,
    checks: SURFACE_CHECKS.map((c) => ({ ...c, min: 4.5 })),
    note: "Headings, body, card titles, input values, dropdown item labels, map popup labels, outline-button labels.",
  },
  {
    role: "Text — muted #CBD0CB",
    value: MUTED,
    checks: SURFACE_CHECKS.map((c) => ({ ...c, min: 4.5 })),
    note: "Secondary/metadata only — locations, price-per-night suffixes, helper text, timestamps, badge text.",
  },
  {
    role: "Text — placeholder #C0C6C1",
    value: PLACEHOLDER,
    checks: SURFACE_CHECKS.map((c) => ({ ...c, min: 4.5 })),
    note: "Input placeholders only.",
  },
  {
    role: "Field border #3E4947 (given, not derived)",
    value: BORDER_FIELD,
    checks: [
      { against: BASE, againstLabel: BASE, label: "vs base", min: 3 },
      { against: FIELD, againstLabel: FIELD, label: "vs field", min: 3 },
    ],
    note: "Flagged, not silently strengthened: 1.34:1 vs base, 1.53:1 vs field — well under the 3:1 non-text-UI guideline. Reads as a soft recessed edge; the field's own darker fill is what actually signals \"this is a field\".",
  },
  {
    role: "Panel/dropdown border #738783 (derived)",
    value: BORDER_PANEL,
    checks: [{ against: BASE, againstLabel: BASE, label: "vs base", min: 3 }],
    note: "Minimum hue-matched value that clears 3:1 was #6D817D (3.02:1) — used with a small safety margin instead (3.28:1).",
  },
  {
    role: "Outline button border #6C8C6A (derived)",
    value: BUTTON_OUTLINE_BORDER,
    checks: [{ against: BASE, againstLabel: BASE, label: "vs base", min: 3 }],
    note: "Sage hue family, brightness recomputed for the new base. Label on outline buttons is plain primary text, not this color.",
  },
  {
    role: "Filled button bg #7BA079 (derived)",
    value: BUTTON_FILL,
    checks: [{ against: BASE, againstLabel: BASE, label: "vs base", min: 3 }],
    note: "SHIFTED from live --oltra-button-active-bg (#B6CCA8, pale pastel) to a deeper mid-tone sage — flagged per instruction rather than shipped quietly.",
  },
  {
    role: "Filled button label (field color) on fill",
    value: BUTTON_FILL_TEXT,
    checks: [{ against: BUTTON_FILL, againstLabel: BUTTON_FILL, label: "vs fill", min: 4.5 }],
    note: "Reuses the field color #232C2A as the dark label, rather than inventing a new token.",
  },
  {
    role: "Disabled text #787774 (derived, deliberately sub-AA)",
    value: DISABLED,
    checks: [{ against: BASE, againstLabel: BASE, label: "vs base", min: 4.5 }],
    note: "Intentionally below 4.5:1 (2.78:1) — disabled state needs to visibly read as unavailable. Only for text backed up by another disabled cue (cursor/opacity/attribute).",
  },
  {
    role: "Error text #FF8A71 (derived, flagged hue shift)",
    value: ERROR_TEXT,
    checks: SURFACE_CHECKS.map((c) => ({ ...c, min: 4.5 })),
    note: "Brick-red source (#D66452) only reached 3.45/2.88/3.96 vs base/panel/field — brightened to clear 4.5:1 on the hardest surface (panel), which pushed it toward coral. See the alternative row below.",
  },
  {
    role: "Error text — less-shifted alternative (fails vs panel)",
    value: ERROR_TEXT_ALT,
    checks: SURFACE_CHECKS.map((c) => ({ ...c, min: 4.5 })),
    note: "Stays closer to brick-red but only clears base (4.79:1) — fails vs panel (4.00:1) and would need to avoid ever rendering on a panel background.",
  },
];

function ContrastTable() {
  return (
    <div className={styles.tokenTable}>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Value</th>
            <th>Contrast</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {CONTRAST_ROWS.map((row) => (
            <tr key={row.role}>
              <td>{row.role}</td>
              <td>
                <span className={styles.tokenSwatch} style={{ background: row.value }} />
                {row.value.toUpperCase()}
              </td>
              <td>
                {row.checks
                  .map((c) => {
                    const r = ratio(row.value, c.against);
                    const pass = r >= c.min;
                    return `${c.label} ${r.toFixed(2)}:1${pass ? "" : " ✗ below " + c.min + ":1"}`;
                  })
                  .join("  ·  ")}
              </td>
              <td className={row.note ? styles.note : undefined} style={{ whiteSpace: "normal", maxWidth: 420 }}>
                {row.note ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RADIUS_TIERS: { label: string; oldPx: number; newPx: number; usedFor: string }[] = [
  { label: "Large panels / modals / lightbox", oldPx: 16, newPx: 6, usedFor: "--oltra-radius-xl, --oltra-radius-lg" },
  { label: "Cards / dropdowns / map popups / inputs / buttons", oldPx: 10, newPx: 4, usedFor: "--oltra-radius-md, --oltra-dropdown-radius" },
  { label: "Badges / chips / small pills / thumbnails", oldPx: 8, newPx: 2, usedFor: "--oltra-radius-sm, --oltra-radius-xs, --oltra-dropdown-item-radius" },
];

function RadiusScale() {
  return (
    <div className={styles.radiusGrid}>
      {RADIUS_TIERS.map((t) => (
        <div key={t.label} className={styles.radiusCard}>
          <div className={styles.radiusRow}>
            <div>
              <div className={styles.radiusSwatch} style={{ borderRadius: t.oldPx, background: PANEL, border: `1px solid ${BORDER_PANEL}` }} />
              <div className={styles.note}>before {t.oldPx}px</div>
            </div>
            <div>
              <div className={styles.radiusSwatch} style={{ borderRadius: t.newPx, background: PANEL, border: `1px solid ${BORDER_PANEL}` }} />
              <div className={styles.note}>after {t.newPx}px</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--oltra-surface-text)" }}>{t.label}</div>
          <div className={styles.note} style={{ marginTop: 2 }}>
            {t.usedFor}
          </div>
        </div>
      ))}
    </div>
  );
}

function StateButtons() {
  return (
    <div>
      <div className={styles.buttonGridLabel}>Primary (filled) — deepened sage, recomputed</div>
      <div className={styles.buttonGrid}>
        <button className={styles.stateButton} style={{ background: BUTTON_FILL, color: BUTTON_FILL_TEXT }}>
          Default
        </button>
        <button className={styles.stateButton} style={{ background: "#719570", color: BUTTON_FILL_TEXT }}>
          Hover
        </button>
        <button className={styles.stateButton} style={{ background: "#688b67", color: BUTTON_FILL_TEXT }}>
          Active
        </button>
        <button
          className={styles.stateButton}
          style={{ background: PANEL, color: DISABLED, border: `1px solid ${BORDER_FIELD}`, cursor: "not-allowed" }}
          disabled
        >
          Disabled
        </button>
      </div>

      <div className={styles.buttonGridLabel} style={{ marginTop: 14 }}>
        Secondary (outline) — border recomputed, label is plain primary text
      </div>
      <div className={styles.buttonGrid}>
        <button className={styles.stateButton} style={{ background: "transparent", color: TEXT_PRIMARY, borderColor: BUTTON_OUTLINE_BORDER }}>
          Default
        </button>
        <button className={styles.stateButton} style={{ background: "rgba(108,140,106,0.12)", color: TEXT_PRIMARY, borderColor: BUTTON_OUTLINE_BORDER }}>
          Hover
        </button>
        <button className={styles.stateButton} style={{ background: "rgba(108,140,106,0.2)", color: TEXT_PRIMARY, borderColor: BUTTON_OUTLINE_BORDER }}>
          Active
        </button>
        <button
          className={styles.stateButton}
          style={{ background: "transparent", color: DISABLED, borderColor: BORDER_FIELD, cursor: "not-allowed" }}
          disabled
        >
          Disabled
        </button>
      </div>
    </div>
  );
}

function FieldStates() {
  const fieldBase: React.CSSProperties = {
    width: "100%",
    height: 34,
    borderRadius: 4,
    padding: "0 12px",
    fontSize: "0.85rem",
    fontFamily: "inherit",
    color: TEXT_PRIMARY,
    background: FIELD,
    border: `1px solid ${BORDER_FIELD}`,
  };
  return (
    <div className={styles.formGrid}>
      <div>
        <div className={styles.formFieldLabel}>Default (recessed solid)</div>
        <input style={fieldBase} placeholder="Guest name" readOnly />
      </div>
      <div>
        <div className={styles.formFieldLabel}>Filled with placeholder-role value</div>
        <input style={fieldBase} defaultValue="" placeholder="Type 2+ letters…" readOnly />
        <div className={styles.note} style={{ marginTop: 4 }}>
          Placeholder text is #C0C6C1, distinct from a real (primary) value.
        </div>
      </div>
      <div>
        <div className={styles.formFieldLabel}>Disabled</div>
        <input style={{ ...fieldBase, color: DISABLED, cursor: "not-allowed" }} placeholder="Guest name" disabled />
      </div>
      <div>
        <div className={styles.formFieldLabel}>Error</div>
        <input style={{ ...fieldBase, border: `1px solid ${ERROR_TEXT}` }} placeholder="Guest name" readOnly />
        <div style={{ marginTop: 4, fontSize: "0.72rem", color: ERROR_TEXT }}>Required field</div>
      </div>
    </div>
  );
}

function BadgeStates() {
  return (
    <div className={styles.buttonGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
      <div>
        <div className={styles.formFieldLabel}>Chip / badge (recessed)</div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 28,
            padding: "0 12px",
            borderRadius: 999,
            background: FIELD,
            border: `1px solid ${BORDER_FIELD}`,
            color: MUTED,
            fontSize: "0.78rem",
          }}
        >
          Free cancellation
        </span>
      </div>
      <div>
        <div className={styles.formFieldLabel}>Rectangular badge, 2px radius</div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 24,
            padding: "0 10px",
            borderRadius: 2,
            background: FIELD,
            border: `1px solid ${BORDER_FIELD}`,
            color: MUTED,
            fontSize: "0.68rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Michelin 3 Keys
        </span>
      </div>
      <div>
        <div className={styles.formFieldLabel}>Disabled badge</div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 28,
            padding: "0 12px",
            borderRadius: 999,
            background: FIELD,
            border: `1px solid ${BORDER_FIELD}`,
            color: DISABLED,
            fontSize: "0.78rem",
          }}
        >
          Sold out
        </span>
      </div>
    </div>
  );
}

function DropdownRowStates() {
  const rowBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    height: 32,
    padding: "0 10px",
    borderRadius: 2,
    fontSize: "0.78rem",
    color: TEXT_PRIMARY,
  };
  return (
    <div style={{ marginTop: 14, maxWidth: 280, background: PANEL, border: `1px solid ${BORDER_PANEL}`, borderRadius: 4, padding: 6 }}>
      <div style={rowBase}>Default row</div>
      <div style={{ ...rowBase, background: "#414c4a" }}>Hover row — one step lighter</div>
      <div style={{ ...rowBase, background: "#4c5754" }}>Selected row — two steps lighter</div>
      <div className={styles.note} style={{ marginTop: 6, paddingLeft: 10 }}>
        Illustrative — the real OltraSelect/GuestSelector below already re-skin via tokens (panel bg,
        primary item text, hover row); the row-level *selected* state is still hardcoded per-component
        Tailwind (e.g. OltraSelect.tsx) rather than token-driven, so it is not previewed live here yet —
        that is a live-page migration, out of scope for this token pass.
      </div>
    </div>
  );
}

function InlineMessage() {
  return (
    <div style={{ fontSize: "0.75rem", color: TEXT_PRIMARY }}>
      <button className={styles.stateButton} style={{ background: BUTTON_FILL, color: BUTTON_FILL_TEXT, width: "auto", padding: "0 16px" }}>
        Add to trip
      </button>
      <div style={{ marginTop: 8, color: MUTED }}>Added to trip.</div>
      <div className={styles.sectionNote}>
        This is the real pattern — the app has no floating toast/snackbar component anywhere.
        Member-action feedback renders as plain inline text next to the button, not an overlay.
      </div>
    </div>
  );
}

function ModalPreview() {
  return (
    <div className={styles.modalPreviewWrap}>
      <div className="oltra-modal-scrim absolute inset-0 flex items-center justify-center p-6">
        <div className="oltra-modal-panel relative w-full max-w-[420px] rounded-[var(--oltra-radius-xl)] border border-white/12 p-4">
          <div style={{ color: TEXT_PRIMARY, fontSize: "0.85rem", fontWeight: 600 }}>
            Deluxe Double Room
          </div>
          <div style={{ color: MUTED, fontSize: "0.75rem", marginTop: 4 }}>
            Sleeps 2 · City view · Free cancellation
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultsGridSection({ hotels }: { hotels: HotelRecord[] }) {
  return (
    <div className={styles.resultsGrid}>
      {hotels.length ? (
        hotels.map((h) => <HotelSmallCard key={h.id} hotel={h} />)
      ) : (
        <div style={{ fontSize: "0.75rem", color: MUTED }}>No sample hotels loaded (Directus unreachable at build time).</div>
      )}
    </div>
  );
}

function LiveMap() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) return;

    let cancelled = false;
    loadMaplibre().then((ml) => {
      if (cancelled || !mapRef.current) return;
      const map = new ml.Map({
        container: mapRef.current,
        style: `https://api.maptiler.com/maps/streets-v4/style.json?key=${key}`,
        center: [2.3488, 48.8534],
        zoom: 10,
        attributionControl: false,
      });
      mapInstanceRef.current = map;
      map.on("load", () => {
        map.resize();
        window.setTimeout(() => map.resize(), 200);
      });
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  return (
    <div>
      <div className={styles.mapWrap} ref={mapRef} />
      <div className={styles.sectionNote}>
        Standard MapTiler streets-v4, unchanged — confirmed fine as-is, no dark style needed. Map
        popups/markers keep their existing translucency (glass-over-imagery exception) — not part of
        this pass.
      </div>
    </div>
  );
}

export default function ThemeTestView({ sampleHotels }: { sampleHotels: HotelRecord[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h1>Theme test — final palette (2026-08-13)</h1>
        <p>
          Lighter base (#2C3634, was #0E1719) with a genuine three-tier surface system: recessed
          fields, base page, raised panels — plus a raised dropdown/popup tier. Three text roles
          (primary/muted/placeholder), solid hex throughout, no white-at-opacity anywhere. Supersedes
          the 2026-08-11/12 gold-accent pass entirely — nothing from that palette carried forward.
          Still sandbox-only via [data-oltra-surface=&quot;dark&quot;]; nothing here is live yet.
        </p>
      </div>

      <div className={styles.introSectionTitle}>Contrast table (required, computed live)</div>
      <ContrastTable />

      <div className={styles.introSectionTitle}>Radius scale — before / after (unchanged this pass)</div>
      <RadiusScale />

      {ready ? (
        <div className={styles.singleColumnWrap}>
          <div className={styles.column} data-oltra-surface="dark">
            <div className={styles.columnHeader}>
              <h2>Final palette — recessed fields, raised dropdowns</h2>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>1 — Surfaces &amp; text roles</div>
              <div className={styles.swatchStrip}>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: BASE }} />
                  <div className={styles.swatchLabel}>base {BASE}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: PANEL }} />
                  <div className={styles.swatchLabel}>panel (raised) {PANEL}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: FIELD }} />
                  <div className={styles.swatchLabel}>field (recessed) {FIELD}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: TEXT_PRIMARY }} />
                  <div className={styles.swatchLabel}>text primary {TEXT_PRIMARY}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: MUTED }} />
                  <div className={styles.swatchLabel}>text muted {MUTED}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: PLACEHOLDER }} />
                  <div className={styles.swatchLabel}>placeholder {PLACEHOLDER}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: DISABLED }} />
                  <div className={styles.swatchLabel}>disabled {DISABLED}</div>
                </div>
              </div>
              <div className={styles.textSamples}>
                <div style={{ color: TEXT_PRIMARY, fontSize: "1.05rem" }}>Body text at default size (primary)</div>
                <div style={{ color: MUTED, fontSize: "0.78rem" }}>Muted / secondary / metadata text</div>
                <div style={{ color: PLACEHOLDER, fontSize: "0.85rem" }}>Placeholder-only text</div>
                <div style={{ color: DISABLED, fontSize: "0.85rem" }}>Disabled text (deliberately sub-AA)</div>
                <div style={{ color: ERROR_TEXT, fontSize: "0.85rem" }}>Error text — flagged hue shift, see table above</div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>2 — Buttons &amp; form fields</div>
              <StateButtons />
              <FieldStates />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>3 — Badges &amp; chips (recessed like fields)</div>
              <BadgeStates />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>4 — Dropdowns, open (raised, not recessed)</div>
              <div className={styles.dropdownRow}>
                <div className={styles.dropdownSlot}>
                  <OltraSelect
                    name="demo-select"
                    placeholder="Sort by"
                    defaultOpen
                    closeOnHoverOutside={false}
                    closeOnFocusOutside={false}
                    options={[
                      { value: "rank", label: "Editor rank" },
                      { value: "price", label: "Price" },
                      { value: "name", label: "Name" },
                    ]}
                  />
                </div>
                <div className={styles.dropdownSlot}>
                  <GuestSelector initialValue={{ adults: 2, kids: 1, kidAges: ["7"] }} defaultOpen placeholder="Guests" />
                </div>
              </div>
              <DropdownRowStates />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>5 — Date picker (native)</div>
              <div className={styles.dateRow}>
                <div>
                  <div className={styles.formFieldLabel}>From</div>
                  <input
                    type="date"
                    defaultValue="2026-09-10"
                    style={{
                      width: "100%",
                      height: 34,
                      borderRadius: 4,
                      padding: "0 12px",
                      fontFamily: "inherit",
                      color: TEXT_PRIMARY,
                      background: FIELD,
                      border: `1px solid ${BORDER_FIELD}`,
                      colorScheme: "dark",
                    }}
                  />
                </div>
                <div>
                  <div className={styles.formFieldLabel}>To</div>
                  <input
                    type="date"
                    defaultValue="2026-09-15"
                    style={{
                      width: "100%",
                      height: 34,
                      borderRadius: 4,
                      padding: "0 12px",
                      fontFamily: "inherit",
                      color: TEXT_PRIMARY,
                      background: FIELD,
                      border: `1px solid ${BORDER_FIELD}`,
                      colorScheme: "dark",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>6 — Modal</div>
              <ModalPreview />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>7 — Inline confirmation message</div>
              <InlineMessage />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>8 — Results grid</div>
              <ResultsGridSection hotels={sampleHotels} />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>9 — Live map</div>
              <LiveMap />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
