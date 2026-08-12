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

const PAGE = "#0e1719";
const PANEL = "#162225";
// Candidate C, confirmed 2026-08-12 — warm variant on the accent gold's hue
// (H40, low saturation), replacing the audit's original #E8EDEC/#8FA3A5
// pick (too white/too bright per review). Candidates A/B (cool-hue dims)
// were not carried forward.
const TEXT_PRIMARY = "#d9d4c9";
const MUTED = "#978869";
const ACCENT_TEXT = "#c8a96a";
const ACCENT_FILL = "#c8a96a";
const ACCENT_FILL_TEXT = "#0e1719";
const BORDER_FUNCTIONAL = "#6a6a6a";
const ERROR_TEXT = "#d66452";

type TokenRow = {
  role: string;
  value: string;
  checks?: { against: string; label: string; min: number }[];
  note?: string;
};

const TOKEN_ROWS: TokenRow[] = [
  {
    role: "Body text — Candidate C (confirmed 2026-08-12)",
    value: TEXT_PRIMARY,
    checks: [
      { against: PAGE, label: "vs page", min: 4.5 },
      { against: PANEL, label: "vs panel", min: 4.5 },
    ],
    note: "Was #E8EDEC (audit's original pick, too white/too bright per review). See the Primary text candidates section below for A/B, not carried forward.",
  },
  {
    role: "Muted text — Candidate C's companion (confirmed)",
    value: MUTED,
    checks: [
      { against: PAGE, label: "vs page", min: 4.5 },
      { against: PANEL, label: "vs panel", min: 4.5 },
    ],
    note: "Was #8FA3A5. Dimmest value on Candidate C's hue that still clears 4.5:1 against both page and panel.",
  },
  {
    role: "Accent — text/link/outline label/focus ring",
    value: ACCENT_TEXT,
    checks: [
      { against: PAGE, label: "vs page", min: 4.5 },
      { against: PANEL, label: "vs panel", min: 4.5 },
    ],
    note: "Confirmed — the source gold #C8A96A needed no adjustment for dark.",
  },
  {
    role: "Accent — filled button bg",
    value: ACCENT_FILL,
    checks: [{ against: PAGE, label: "vs page", min: 3 }],
    note: "Same value as accent-text on dark — one gold serves both roles here (unlike the ivory version, which needed two).",
  },
  {
    role: "Text on filled accent button",
    value: ACCENT_FILL_TEXT,
    checks: [{ against: ACCENT_FILL, label: "vs fill", min: 4.5 }],
    note: "Confirmed — dark text on the gold fill, not near-white. Near-white only reached ~2:1 on this fill.",
  },
  {
    role: "Functional border (input/focus/checkbox)",
    value: BORDER_FUNCTIONAL,
    checks: [
      { against: PAGE, label: "vs page", min: 3 },
      { against: PANEL, label: "vs panel", min: 3 },
    ],
  },
  {
    role: "Decorative border (card/divider)",
    value: "rgba(217,212,201,0.12)",
    note: "No 3:1 requirement — the card background already distinguishes the boundary. Re-derived from Candidate C's RGB (was based on #E8EDEC before).",
  },
  {
    role: "Error text/border",
    value: ERROR_TEXT,
    checks: [
      { against: PAGE, label: "vs page", min: 4.5 },
      { against: PANEL, label: "vs panel", min: 4.5 },
    ],
    note: "Still not part of your brief — no error color exists anywhere in the codebase either. Derived, flagged as unreviewed, review it alongside the text candidates below.",
  },
];

type TextCandidate = {
  label: string;
  primary: string;
  muted: string;
  family: string;
};

const TEXT_CANDIDATES: TextCandidate[] = [
  {
    label: "A — same cool family, moderate dim (not carried forward)",
    primary: "#c2cbcb",
    muted: "#708f8e",
    family: "Same hue as the original #E8EDEC (blue-green-grey), just less bright.",
  },
  {
    label: "B — same cool family, deeper dim (not carried forward)",
    primary: "#a7b4b3",
    muted: "#708f8e",
    family: "Same hue again, pulled further down — closer to the muted tone, still clearly a distinct tier.",
  },
  {
    label: "C — warm variant — SELECTED 2026-08-12",
    primary: "#d9d4c9",
    muted: "#978869",
    family: "Shifted onto the gold accent's hue (H40) at low saturation — warm off-white against the cool blue-green base. Now the live values below, throughout the single-column preview.",
  },
];

function TokenTable() {
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
          {TOKEN_ROWS.map((row) => (
            <tr key={row.role}>
              <td>{row.role}</td>
              <td>
                <span className={styles.tokenSwatch} style={{ background: row.value }} />
                {row.value}
              </td>
              <td>
                {row.checks
                  ? row.checks
                      .map((c) => {
                        const r = ratio(row.value.startsWith("#") ? row.value : PAGE, c.against);
                        const pass = r >= c.min;
                        return `${c.label} ${r.toFixed(2)}:1${pass ? "" : " ✗"}`;
                      })
                      .join("  ·  ")
                  : "—"}
              </td>
              <td className={row.note ? styles.note : undefined} style={{ whiteSpace: "normal", maxWidth: 380 }}>
                {row.note ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextCandidates() {
  return (
    <div className={styles.tokenTable}>
      <table>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Primary</th>
            <th>Contrast</th>
            <th>Muted companion</th>
            <th>Contrast</th>
            <th>Sample</th>
          </tr>
        </thead>
        <tbody>
          {TEXT_CANDIDATES.map((c) => (
            <tr key={c.label}>
              <td style={{ whiteSpace: "normal", maxWidth: 240 }}>
                <strong>{c.label}</strong>
                <div className={styles.note}>{c.family}</div>
              </td>
              <td>
                <span className={styles.tokenSwatch} style={{ background: c.primary }} />
                {c.primary}
              </td>
              <td>
                vs page {ratio(c.primary, PAGE).toFixed(2)}:1 · vs panel {ratio(c.primary, PANEL).toFixed(2)}:1
              </td>
              <td>
                <span className={styles.tokenSwatch} style={{ background: c.muted }} />
                {c.muted}
              </td>
              <td>
                vs page {ratio(c.muted, PAGE).toFixed(2)}:1 · vs panel {ratio(c.muted, PANEL).toFixed(2)}:1
              </td>
              <td style={{ background: PAGE, padding: "10px 14px" }}>
                <div style={{ color: c.primary, fontSize: "0.95rem" }}>Body text sample</div>
                <div style={{ color: c.muted, fontSize: "0.8rem", marginTop: 2 }}>Muted / secondary sample</div>
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
              <div className={styles.radiusSwatch} style={{ borderRadius: t.oldPx, background: PANEL, border: `1px solid ${BORDER_FUNCTIONAL}` }} />
              <div className={styles.note}>before {t.oldPx}px</div>
            </div>
            <div>
              <div className={styles.radiusSwatch} style={{ borderRadius: t.newPx, background: PANEL, border: `1px solid ${BORDER_FUNCTIONAL}` }} />
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
      <div className={styles.buttonGridLabel}>Primary (filled)</div>
      <div className={styles.buttonGrid}>
        <button className={styles.stateButton} style={{ background: ACCENT_FILL, color: ACCENT_FILL_TEXT }}>
          Default
        </button>
        <button className={styles.stateButton} style={{ background: "#c09c54", color: ACCENT_FILL_TEXT }}>
          Hover
        </button>
        <button className={styles.stateButton} style={{ background: "#b38e42", color: ACCENT_FILL_TEXT }}>
          Active
        </button>
        <button
          className={styles.stateButton}
          style={{ background: MUTED, color: PANEL, opacity: 0.4, cursor: "not-allowed" }}
          disabled
        >
          Disabled
        </button>
      </div>

      <div className={styles.buttonGridLabel} style={{ marginTop: 14 }}>
        Secondary (outline)
      </div>
      <div className={styles.buttonGrid}>
        <button className={styles.stateButton} style={{ background: "transparent", color: ACCENT_TEXT, borderColor: ACCENT_TEXT }}>
          Default
        </button>
        <button className={styles.stateButton} style={{ background: "rgba(200,169,106,0.1)", color: ACCENT_TEXT, borderColor: ACCENT_TEXT }}>
          Hover
        </button>
        <button className={styles.stateButton} style={{ background: "rgba(200,169,106,0.18)", color: ACCENT_TEXT, borderColor: ACCENT_TEXT }}>
          Active
        </button>
        <button
          className={styles.stateButton}
          style={{ background: "transparent", color: MUTED, borderColor: MUTED, opacity: 0.5, cursor: "not-allowed" }}
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
    background: "#121d1f",
    border: `1px solid ${BORDER_FUNCTIONAL}`,
  };
  return (
    <div className={styles.formGrid}>
      <div>
        <div className={styles.formFieldLabel}>Default</div>
        <input style={fieldBase} placeholder="Guest name" readOnly />
      </div>
      <div>
        <div className={styles.formFieldLabel}>Focus</div>
        <input style={{ ...fieldBase, border: `2px solid ${ACCENT_TEXT}`, outline: "none" }} placeholder="Guest name" readOnly />
      </div>
      <div>
        <div className={styles.formFieldLabel}>Disabled</div>
        <input style={{ ...fieldBase, opacity: 0.45, cursor: "not-allowed" }} placeholder="Guest name" disabled />
      </div>
      <div>
        <div className={styles.formFieldLabel}>Error</div>
        <input style={{ ...fieldBase, border: `1px solid ${ERROR_TEXT}` }} placeholder="Guest name" readOnly />
        <div style={{ marginTop: 4, fontSize: "0.68rem", color: ERROR_TEXT }}>Required field</div>
      </div>
    </div>
  );
}

function InlineMessage() {
  return (
    <div style={{ fontSize: "0.75rem", color: TEXT_PRIMARY }}>
      <button className={styles.stateButton} style={{ background: ACCENT_FILL, color: ACCENT_FILL_TEXT, width: "auto", padding: "0 16px" }}>
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
          <div style={{ color: "rgba(255,255,255,0.96)", fontSize: "0.85rem", fontWeight: 600 }}>
            Deluxe Double Room
          </div>
          <div style={{ color: "rgba(255,255,255,0.68)", fontSize: "0.72rem", marginTop: 4 }}>
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
        Standard MapTiler streets-v4, unchanged — confirmed fine as-is, no dark style needed.
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
        <h1>Theme test — dark surface refinement</h1>
        <p>
          Ivory dropped 2026-08-12 — dark is the only surface now. Corner-radius scale and primary
          text color (Candidate C, confirmed 2026-08-12) are both decided below but still only
          live in this sandbox — neither has shipped site-wide yet. Wraps real app components via
          [data-oltra-surface=&quot;dark&quot;], not replicas.
        </p>
      </div>

      <div className={styles.introSectionTitle}>Token table (dark)</div>
      <TokenTable />

      <div className={styles.introSectionTitle}>Radius scale — before / after</div>
      <RadiusScale />

      <div className={styles.introSectionTitle}>Primary text candidates</div>
      <TextCandidates />

      {ready ? (
        <div className={styles.singleColumnWrap}>
          <div className={styles.column} data-oltra-surface="dark">
            <div className={styles.columnHeader}>
              <h2>Tinted dark (editorial/browse) — with the new radius scale applied</h2>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>1 — Typography &amp; tokens</div>
              <div className={styles.swatchStrip}>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: PAGE }} />
                  <div className={styles.swatchLabel}>page {PAGE}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: PANEL }} />
                  <div className={styles.swatchLabel}>card {PANEL}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: TEXT_PRIMARY }} />
                  <div className={styles.swatchLabel}>text (Candidate C) {TEXT_PRIMARY}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: MUTED }} />
                  <div className={styles.swatchLabel}>muted (Candidate C) {MUTED}</div>
                </div>
                <div className={styles.swatchCard}>
                  <div className={styles.swatchColor} style={{ background: ACCENT_TEXT }} />
                  <div className={styles.swatchLabel}>accent {ACCENT_TEXT}</div>
                </div>
              </div>
              <div className={styles.textSamples}>
                <div style={{ color: TEXT_PRIMARY, fontSize: "1.05rem" }}>Body text at default size (Candidate C)</div>
                <div style={{ color: MUTED, fontSize: "0.78rem" }}>Muted / secondary text (Candidate C)</div>
                <div style={{ color: ACCENT_TEXT, fontSize: "0.85rem" }}>Accent / link text</div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>2 — Buttons &amp; form fields</div>
              <StateButtons />
              <FieldStates />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>3 — Dropdowns, open</div>
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
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>4 — Date picker (native)</div>
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
                      background: "#121d1f",
                      border: `1px solid ${BORDER_FUNCTIONAL}`,
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
                      background: "#121d1f",
                      border: `1px solid ${BORDER_FUNCTIONAL}`,
                      colorScheme: "dark",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>5 — Modal</div>
              <ModalPreview />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>6 — Inline confirmation message</div>
              <InlineMessage />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>7 — Results grid</div>
              <ResultsGridSection hotels={sampleHotels} />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>8 — Live map</div>
              <LiveMap />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
