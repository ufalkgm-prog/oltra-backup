"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ratio } from "./contrast";
import { INVENTORY, type TargetType } from "./buttonInventory";
import s from "./ButtonStandard.module.css";

/* Button standard review page, 2026-09-14. This is the audit the standard was
 * decided from; the shipped template is the .oltra-btn block in
 * oltra-theme.css and the decisions are design-system.md §35A. The palette
 * below is kept local so the contrast table computes directly in JS. */

const BASE = "#2c3634";
const PANEL = "#374240";
const FIELD = "#232c2a";
const LABEL = "#f5f2ec";
const LABEL_PRESS = "#eae4d8"; // label −6% lightness: "dims slightly"
const FOCUS_RING = "#f5f2ec";

// Hover = +8% HSL lightness, pressed = −4%. Pressed is the smaller step
// because darkening is what pushes a rim under 3:1 (see the table).
type Palette = { rim: string; hover: string; press: string; label: string; labelPress: string };

const PRIMARY: Palette = { rim: "#8aa884", hover: "#a1b99c", press: "#7fa078", label: LABEL, labelPress: LABEL_PRESS };
const DESTRUCTIVE_GIVEN: Palette = { rim: "#c0756a", hover: "#cc9087", press: "#ba685c", label: LABEL, labelPress: LABEL_PRESS };
const DESTRUCTIVE_PROPOSED: Palette = { rim: "#c98479", hover: "#d59f96", press: "#c3776a", label: LABEL, labelPress: LABEL_PRESS };
// Shipped #67716E, lifted from the specified #3E4947 (§35A).
const PASSIVE: Palette = { rim: "#67716e", hover: "#67716e", press: "#67716e", label: "#7e8783", labelPress: "#7e8783" };
const AI: Palette = { rim: "#a8c4a2", hover: "#bfd4bb", press: "#9cbc96", label: "#a8c4a2", labelPress: "#9cbc96" };

function vars(p: Palette): CSSProperties {
  return {
    "--rim": p.rim,
    "--rim-hover": p.hover,
    "--rim-press": p.press,
    "--label": p.label,
    "--label-press": p.labelPress,
    "--focus-ring": FOCUS_RING,
  } as CSSProperties;
}

type State = "default" | "hover" | "pressed" | "focus";
const STATE_CLASS: Record<State, string> = { default: "", hover: s.isHover, pressed: s.isPressed, focus: s.isFocus };

function Btn({
  palette,
  format,
  state = "default",
  passive = false,
  children,
  style,
  onClick,
  describedBy,
}: {
  palette: Palette;
  format: "full" | "condensed" | "ai";
  state?: State;
  passive?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  describedBy?: string;
}) {
  const formatClass = format === "full" ? s.full : format === "condensed" ? s.condensed : s.ai;
  return (
    <button
      type="button"
      className={`${s.btn} ${formatClass} ${STATE_CLASS[state]}`}
      style={{ ...vars(palette), ...style }}
      aria-disabled={passive || undefined}
      aria-describedby={describedBy}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

const FLAGS: { title: string; body: ReactNode }[] = [
  {
    title: "Save and Book are not one size across the site — pick one",
    body: (
      <>
        Landing, concierge frames and the landing flight rows share <strong>set A</strong> (22px tall, 0 6px,
        0.58rem, 0.14em, BOOK and SAVE identical). The /flights price cards use <strong>set B</strong>, and there
        BOOK and SAVE <strong>differ from each other</strong>: 0.62rem / 400 / 0.1em / radius 4px against
        0.6rem / 500 / 0.08em / radius 2px. Both are 24px tall. The /hotels result cards have no Book or Save at
        all. Details in the measured-values table.
      </>
    ),
  },
  {
    title: "There is no home for secondary actions",
    body: (
      <>
        Cancel, No, Exit, Log out, Back to log in and Close are secondary outline buttons today. In the four
        types they all become Primary, so a delete confirmation shows a red <em>Yes</em> beside a sage{" "}
        <em>No</em> of equal weight, and Save and Log out look the same. That may be intended. If it isn&apos;t,
        it is the one action type the standard hasn&apos;t accounted for.
      </>
    ),
  },
  {
    title: "Passive is defined as \"entries incomplete\", but most disabled buttons are something else",
    body: (
      <>
        Availability checked, already searched with nothing changed, no changes to save, already in favourites,
        5-leg cap, 10-member cap, logged out. None of these is a missing entry, so there is no field to move
        focus to. Proposal: they use Passive with a helper that states the reason (&ldquo;No changes to
        save&rdquo;), and click focuses nothing. Say if you&apos;d rather they stay Primary.
      </>
    ),
  },
  {
    title: "Destructive rim #C0756A fails 3:1 on the panel (2.97:1)",
    body: (
      <>
        It clears the base (3.56:1) but destructive buttons live in modals, which are panel-coloured. Proposed{" "}
        <strong>#C98479</strong>: 3.50:1 on panel, 4.19:1 on base. Its pressed step lands at #C3776A, almost
        exactly your value. The as-specified pressed step (#BA685C) fails both surfaces. Use the toggle above
        the specimens to compare.
      </>
    ),
  },
  {
    title: "Passive rim #3E4947 cannot meet 3:1 and still look passive",
    body: (
      <>
        It measures 1.34:1 on base and 1.12:1 on panel. The first value to clear 3:1 on panel is about #7C908C,
        which is the same brightness as the passive label, so passive would read as active. Recommendation:
        exempt the passive rim, as you already have for the passive label. WCAG 1.4.11 exempts inactive
        components, and the grey label plus helper text carry the state.
      </>
    ),
  },
  {
    title: "Tap targets, and stacked card buttons whose hit areas would overlap",
    body: (
      <>
        Measured: Condensed is 22px (set A) or 24px (set B), the AI button is <strong>24px</strong> (not 22),
        and Full is 33px. All are extended to 44px with a pseudo-element (toggle &ldquo;show hit areas&rdquo;).
        On hotel cards, BOOK sits 6px above SAVE, so two 44px targets overlap by 16px and the later button (SAVE)
        wins the shared strip. The fix is to split each gap at its midpoint. That needs a stacked-pair rule
        rather than one pseudo-element size.
      </>
    ),
  },
  {
    title: "Full format is wider than today's buttons — fixed widths that break",
    body: (
      <>
        13px uppercase with today&apos;s 0.16em tracking plus 20px side padding. Concierge Clear / Exit / Stop /
        Ask are fixed at 88px, and &ldquo;CLEAR&rdquo; needs about 99px. Delete flight needs about 186px in a
        ~159px cell. Restaurants&apos; Add to favourites <em>already</em> overflows its ~141px column. Either the
        tracking comes down for Full, or those widths go.
      </>
    ),
  },
  {
    title: "The itinerary modal is white",
    body: (
      <>
        Print / Send / Close sit on #FFF. A sage rim with a #F5F2EC label is invisible there. It needs a
        light-surface exception, or the toolbar moves off the paper.
      </>
    ),
  },
  {
    title: "Clickable italic that isn't the AI button",
    body: (
      <>
        Six italic delete links become Destructive pills. &ldquo;Update price and availability&rdquo;
        (italic, not a delete) becomes Primary-Condensed. The italic &ldquo;Saved&rdquo; flash on /flights
        SAVE loses its italic. That leaves the <strong>/flights &ldquo;info&rdquo; pill</strong>: §35 keeps it as
        a deliberately inverted control, and it is italic. Drop the italic, or turn it into an icon?
      </>
    ),
  },
  {
    title: "Over photography the rim does not hold on bright images",
    body: (
      <>
        See the three photo strips. On a bright photo the sage rim nearly disappears, and the scrim behind the
        button fixes it without touching the rim. The same applies to the SWITCH TO HOTEL VIEW toggle over map
        tiles, which relies on an opaque fill today.
      </>
    ),
  },
  {
    title: "The Hotels \"Search\" popup has to work without hover",
    body: (
      <>
        I agree with the proposal: label <strong>SEARCH</strong>, reason in a popup. Hover doesn&apos;t exist on a
        phone, so in the demo the popup also opens on keyboard focus. A tap moves focus to the first incomplete
        field and prints the reason under the button. That covers the passive-behaviour rule as well.
      </>
    ),
  },
  {
    title: "AI button label and mark",
    body: (
      <>
        Today it reads &ldquo;AI mode&rdquo; with a small sage dot. The spec calls it Ask AI. Should the label
        change? And does the dot go, now that the label itself is the colour?
      </>
    ),
  },
  {
    title: "Shape rule side effects",
    body: (
      <>
        The destination-field token chip (&ldquo;City: Paris ×&rdquo;) is pill-shaped today and would move to
        the crisp radius. Trip-type tabs, steppers, carousel arrows and icon closes are listed as &ldquo;doesn&apos;t
        fit&rdquo;. I&apos;d treat them as controls, not actions, and leave their shapes alone. Say if any of them
        should become a pill.
      </>
    ),
  },
];

// ---------------------------------------------------------------------------

type ContrastCheck = { hex: string; min: number; kind: "rim" | "label" | "ring" };
const CONTRAST: { role: string; check: ContrastCheck; note?: string }[] = [
  { role: "Primary rim", check: { hex: PRIMARY.rim, min: 3, kind: "rim" } },
  { role: "Primary rim — hover", check: { hex: PRIMARY.hover, min: 3, kind: "rim" } },
  { role: "Primary rim — pressed", check: { hex: PRIMARY.press, min: 3, kind: "rim" } },
  { role: "Destructive rim — as specified", check: { hex: DESTRUCTIVE_GIVEN.rim, min: 3, kind: "rim" }, note: "Fails on panel by 0.03." },
  { role: "Destructive rim — as specified, pressed", check: { hex: DESTRUCTIVE_GIVEN.press, min: 3, kind: "rim" } },
  { role: "Destructive rim — PROPOSED", check: { hex: DESTRUCTIVE_PROPOSED.rim, min: 3, kind: "rim" } },
  { role: "Destructive rim — proposed, hover", check: { hex: DESTRUCTIVE_PROPOSED.hover, min: 3, kind: "rim" } },
  { role: "Destructive rim — proposed, pressed", check: { hex: DESTRUCTIVE_PROPOSED.press, min: 3, kind: "rim" } },
  { role: "Passive rim", check: { hex: PASSIVE.rim, min: 3, kind: "rim" }, note: "Recommend exempt — flag 5." },
  { role: "AI rim", check: { hex: AI.rim, min: 3, kind: "rim" } },
  { role: "AI rim — hover / pressed", check: { hex: AI.hover, min: 3, kind: "rim" }, note: `Pressed ${AI.press.toUpperCase()}: ${ratio(AI.press, BASE).toFixed(2)} / ${ratio(AI.press, PANEL).toFixed(2)} / ${ratio(AI.press, FIELD).toFixed(2)}.` },
  { role: "Standard label", check: { hex: LABEL, min: 4.5, kind: "label" } },
  { role: "Standard label — pressed (dimmed)", check: { hex: LABEL_PRESS, min: 4.5, kind: "label" } },
  { role: "Passive label", check: { hex: PASSIVE.label, min: 4.5, kind: "label" }, note: "Intentionally below AA." },
  { role: "AI label as TEXT (12px bold italic)", check: { hex: AI.label, min: 4.5, kind: "label" }, note: "Clears 4.5:1 with margin on all three, pressed included (4.98:1 on panel), so no brighter value is needed. Arial ships a real Bold Italic face on Windows and macOS, so it is not synthesised there." },
  { role: "Focus ring (2px, offset 2px)", check: { hex: FOCUS_RING, min: 3, kind: "ring" }, note: "Primary text colour — distinct from every rim, so focus never relies on a rim colour change." },
];

function ContrastCell({ hex, against, min }: { hex: string; against: string; min: number }) {
  const r = ratio(hex, against);
  return <td className={r >= min ? s.pass : s.fail}>{r.toFixed(2)}:1{r >= min ? "" : " ✗"}</td>;
}

// ---------------------------------------------------------------------------

function StateMatrix({ surface, destructive, showHit }: { surface: string; destructive: Palette; showHit: boolean }) {
  const states: State[] = ["default", "hover", "pressed", "focus"];
  const rows: { name: string; palette: Palette; label: string; passive?: boolean; ai?: boolean }[] = [
    { name: "Primary", palette: PRIMARY, label: "Search" },
    { name: "Destructive", palette: destructive, label: "Delete trip" },
    { name: "Passive", palette: PASSIVE, label: "Search", passive: true },
  ];
  return (
    <div className={`${s.surface} ${showHit ? s.showHit : ""}`} style={{ background: surface }}>
      <div className={s.h3}>On {surface === BASE ? `base ${BASE}` : `panel ${PANEL}`}</div>
      <div className={s.table} style={{ border: "none" }}>
        <table style={{ fontSize: "inherit" }}>
          <thead>
            <tr>
              <th style={{ background: "transparent" }}>Type</th>
              {states.map((st) => (
                <th key={st} style={{ background: "transparent" }}>{st === "focus" ? "focus-visible" : st}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className={s.muted} style={{ borderBottom: "none", paddingTop: 14 }}>{r.name}</td>
                {states.map((st) => (
                  <td key={st} style={{ borderBottom: "none", padding: "12px 10px" }}>
                    {r.passive && (st === "hover" || st === "pressed") ? (
                      <span className={s.cellLabel}>no state</span>
                    ) : (
                      <div className={s.cell}>
                        <Btn palette={r.palette} format="full" state={st} passive={r.passive}>{r.label}</Btn>
                        <Btn palette={r.palette} format="condensed" state={st} passive={r.passive}>
                          {r.name === "Destructive" ? "Delete" : r.passive ? "Save" : "Book"}
                        </Btn>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={s.muted} style={{ borderBottom: "none", paddingTop: 14 }}>AI</td>
              {states.map((st) => (
                <td key={st} style={{ borderBottom: "none", padding: "12px 10px" }}>
                  <Btn palette={AI} format="ai" state={st}>AI mode</Btn>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PassiveSearchDemo({ showHit }: { showHit: boolean }) {
  const [destination, setDestination] = useState("Paris");
  const [dates, setDates] = useState("");
  const [guests, setGuests] = useState("");
  const [explained, setExplained] = useState("");
  const refs = {
    destination: useRef<HTMLInputElement>(null),
    dates: useRef<HTMLInputElement>(null),
    guests: useRef<HTMLInputElement>(null),
  };

  const missing = !destination.trim()
    ? { key: "destination" as const, text: "Add a destination to continue" }
    : !dates
      ? { key: "dates" as const, text: "Add dates to continue" }
      : !guests.trim()
        ? { key: "guests" as const, text: "Add guests to continue" }
        : null;

  return (
    <div className={`${s.surface} ${showHit ? s.showHit : ""}`}>
      <div className={s.h3}>Passive behaviour + the Hotels &ldquo;Search&rdquo; proposal</div>
      <p className={s.lede}>
        Today the Hotels search button prints &ldquo;Please select dates and guest details to check
        availability&rdquo; as a two-line label inside a 34px box. Here it is a plain <strong>SEARCH</strong>.
        When entries are missing it is Passive (<code>aria-disabled</code>, not <code>disabled</code>, so it still
        takes a click). The reason shows as a popup on hover or keyboard focus. A click or tap moves focus to
        the first incomplete field and leaves the reason under the button, where a phone user can read it.
        Clear the fields to try it.
      </p>
      <div className={s.demoForm}>
        <label className={s.demoField}>
          <span className={s.cellLabel}>Destination</span>
          <input ref={refs.destination} value={destination} onChange={(e) => { setDestination(e.target.value); setExplained(""); }} />
        </label>
        <label className={s.demoField}>
          <span className={s.cellLabel}>Dates</span>
          <input ref={refs.dates} type="date" value={dates} onChange={(e) => { setDates(e.target.value); setExplained(""); }} />
        </label>
        <label className={s.demoField}>
          <span className={s.cellLabel}>Guests</span>
          <input ref={refs.guests} value={guests} placeholder="2 adults" onChange={(e) => { setGuests(e.target.value); setExplained(""); }} />
        </label>
        <div>
          <span className={s.tipAnchor}>
            <Btn
              palette={missing ? PASSIVE : PRIMARY}
              format="full"
              passive={Boolean(missing)}
              describedBy={missing ? "passive-demo-reason" : undefined}
              onClick={() => {
                if (!missing) {
                  setExplained("Searching — Primary state, nothing to explain.");
                  return;
                }
                setExplained(missing.text);
                refs[missing.key].current?.focus();
              }}
            >
              Search
            </Btn>
            {missing ? (
              <span className={s.tip} role="tooltip" id="passive-demo-reason">
                {missing.text}. SEARCH checks live availability and prices for every hotel in the results.
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <div className={s.helper} aria-live="polite">{explained}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MeasuredCondensed({ showHit }: { showHit: boolean }) {
  const setA: CSSProperties = {};
  const setBBook: CSSProperties = { height: 24, fontSize: "0.62rem", letterSpacing: "0.1em", fontWeight: 400, width: 56 };
  const setBSave: CSSProperties = { height: 24, fontSize: "0.6rem", letterSpacing: "0.08em", fontWeight: 500, width: 56 };
  const rows = [
    ["Set A — BOOK", "HotelSmallCard.tsx:165 · FlightResultRow.tsx:224 (landing + concierge)", "22px", "0 6px", "0.58rem (9.28px)", "400", "0.14em", "uppercase (CSS)", "4px", "1px", "84 / 80 / 74px (hotel col.) · 84px fixed (flight row)"],
    ["Set A — SAVE", "LandingSummary.tsx:528 · FlightResultRow.tsx:231 · AiResultFrames.tsx:391", "22px", "0 6px", "0.58rem (9.28px)", "400", "0.14em", "uppercase (CSS)", "4px", "1px", "same as BOOK"],
    ["Set B — BOOK", "FlightsView.tsx:2130 (/flights price card)", "24px", "0 6px", "0.62rem (9.92px)", "400", "0.1em", "literal \"BOOK\"", "4px", "1px", "~56px (2-col grid in 140px column)"],
    ["Set B — SAVE", "FlightsView.tsx:2142 (/flights price card)", "24px", "0 6px", "0.6rem (9.6px)", "500", "0.08em", "literal \"SAVE\"", "2px", "1px", "~56px"],
  ];
  return (
    <div className={`${s.surface} ${showHit ? s.showHit : ""}`}>
      <div className={s.h3}>Measured condensed values — Save and Book today</div>
      <p className={s.lede}>
        <strong>Set A is already one size for both</strong> (it is <code>.oltra-button--xs</code>, and a
        comment there exists precisely to keep the pair matched). <strong>Set B does not match itself</strong>.
        With <code>box-sizing: border-box</code>, the 2px rim takes 2px from the inside, so the outer size stays
        the same. Proposed tokens once you pick: <code>--oltra-button-condensed-height</code>,{" "}
        <code>-padding-x</code>, <code>-font-size</code>, <code>-tracking</code>. The specimens below use set A.
      </p>
      <div className={s.table}>
        <table>
          <thead>
            <tr>
              {["", "Where", "Height", "Padding", "Size", "Weight", "Tracking", "Case", "Radius today", "Border today", "Width"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((c, i) => (
                  <td key={i} className={i === 1 ? `${s.mono} ${s.muted}` : undefined}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.row} style={{ marginTop: 18 }}>
        <div className={s.cell}>
          <span className={s.cellLabel}>Set A — hotel card column (84px), stacked</span>
          <div style={{ width: 84, display: "flex", flexDirection: "column", gap: 6, background: FIELD, padding: 8, borderRadius: 4 }}>
            <Btn palette={PRIMARY} format="condensed" style={{ ...setA, width: "100%" }}>Book</Btn>
            <Btn palette={PRIMARY} format="condensed" style={{ ...setA, width: "100%" }}>Save</Btn>
          </div>
        </div>
        <div className={s.cell}>
          <span className={s.cellLabel}>Set A — 74px column, &ldquo;Saving...&rdquo;</span>
          <div style={{ width: 74, display: "flex", flexDirection: "column", gap: 6, background: FIELD, padding: 8, borderRadius: 4 }}>
            <Btn palette={PRIMARY} format="condensed" style={{ width: "100%" }}>Book</Btn>
            <Btn palette={PRIMARY} format="condensed" style={{ width: "100%", overflow: "hidden" }}>Saving...</Btn>
          </div>
        </div>
        <div className={s.cell}>
          <span className={s.cellLabel}>Set A — flight row, 84px each</span>
          <div style={{ display: "flex", gap: 8, background: FIELD, padding: 8, borderRadius: 4 }}>
            <Btn palette={PRIMARY} format="condensed" style={{ width: 84 }}>Book</Btn>
            <Btn palette={PRIMARY} format="condensed" style={{ width: 84 }}>Save</Btn>
          </div>
        </div>
        <div className={s.cell}>
          <span className={s.cellLabel}>Set B as measured — /flights price cell</span>
          <div style={{ display: "flex", gap: 8, background: FIELD, padding: 8, borderRadius: 4 }}>
            <Btn palette={PRIMARY} format="condensed" style={setBBook}>Book</Btn>
            <Btn palette={PRIMARY} format="condensed" style={setBSave}>Save</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OverImagery({ destructive, showHit }: { destructive: Palette; showHit: boolean }) {
  const photos = [
    { src: "/images/landing/landing-32.webp", label: "darkest photo" },
    { src: "/images/landing/landing-27.webp", label: "mid photo" },
    { src: "/images/landing/landing-15.webp", label: "brightest photo" },
  ];
  const buttons = (
    <>
      <Btn palette={PRIMARY} format="condensed" style={{ width: 84 }}>Book</Btn>
      <Btn palette={destructive} format="condensed" style={{ width: 84 }}>Delete</Btn>
      <Btn palette={AI} format="ai">AI mode</Btn>
    </>
  );
  return (
    <div className={`${s.surface} ${showHit ? s.showHit : ""}`}>
      <div className={s.h3}>Over photography — rim alone, then with a scrim behind the buttons only</div>
      <p className={s.lede}>
        The landing hero pool, sampled by average brightness. The top row is the bare rim. The bottom row adds a
        soft dark pool behind the buttons, with no fill on the button and no change to the rim.
      </p>
      <div className={s.photoRow}>
        {photos.map((p) => (
          <div key={p.src} className={s.photo} style={{ backgroundImage: `url(${p.src})` }}>
            <span className={s.photoCaption}>{p.label} — bare</span>
            {buttons}
          </div>
        ))}
      </div>
      <div className={s.photoRow} style={{ marginTop: 10 }}>
        {photos.map((p) => (
          <div key={p.src} className={s.photo} style={{ backgroundImage: `url(${p.src})` }}>
            <span className={s.photoCaption}>{p.label} — scrim</span>
            <span className={s.scrim}>{buttons}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TYPE_TAG: Record<TargetType, string> = {
  Primary: "Primary",
  "Primary / Passive": "Primary / Passive",
  Destructive: "Destructive",
  AI: "AI",
  "Doesn't fit": "Doesn't fit",
  "Delete (dead code)": "Dead code",
};

function Mapping() {
  const all = INVENTORY.flatMap((g) => g.rows);
  const count = (t: TargetType) => all.filter((r) => r.type === t).length;
  return (
    <div className={s.surface}>
      <div className={s.h3}>Audit and mapping — {all.length} rows</div>
      <p className={s.lede}>
        {count("Primary")} Primary · {count("Primary / Passive")} Primary with a Passive state ·{" "}
        {count("Destructive")} Destructive · {count("AI")} AI · {count("Doesn't fit")} don&apos;t fit ·{" "}
        {count("Delete (dead code)")} dead code. Rows marked <span className={`${s.tag} ${s.tagFlag}`}>flag</span>{" "}
        don&apos;t map cleanly and are tied to a question above. &ldquo;Doesn&apos;t fit&rdquo; is mostly
        navigation, toggles, steppers, icon-only controls and selectable rows. Those are controls, not actions,
        and I&apos;ve left them out of the pill rule.
      </p>
      {INVENTORY.map((g) => (
        <div key={g.title} style={{ marginTop: 16 }}>
          <div className={s.cellLabel} style={{ marginBottom: 6 }}>{g.title}</div>
          <div className={s.table}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Where</th>
                  <th style={{ width: "18%" }}>Label</th>
                  <th style={{ width: "18%" }}>Today</th>
                  <th>Maps to</th>
                  <th>Format</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.where + r.label}>
                    <td className={`${s.mono} ${s.muted}`}>{r.where}</td>
                    <td>{r.label}</td>
                    <td className={s.muted}>{r.today}</td>
                    <td>
                      <span className={s.tag}>{TYPE_TAG[r.type]}</span>
                      {r.flag ? <> <span className={`${s.tag} ${s.tagFlag}`}>flag</span></> : null}
                    </td>
                    <td className={s.muted}>{r.format ?? ""}</td>
                    <td className={s.muted}>{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function ButtonStandard() {
  const [useProposedDestructive, setUseProposedDestructive] = useState(true);
  const [showHit, setShowHit] = useState(false);
  const destructive = useProposedDestructive ? DESTRUCTIVE_PROPOSED : DESTRUCTIVE_GIVEN;

  return (
    <div className={s.wrap}>
      <div className={s.surface}>
        <div className={s.h3}>
          Button standard — audit, 2026-09-14. Shipped as .oltra-btn in oltra-theme.css; every question below
          was decided (design-system.md §35A)
        </div>
        <p className={s.lede}>
          Four types: <strong>Primary</strong>, <strong>Destructive</strong>, <strong>Passive</strong>, and{" "}
          <strong>AI</strong>. All have a transparent background, a 2px rim and a 999px radius. The three
          standard types come in Full (8/20 padding, 13px label) and Condensed (today&apos;s card sizes, carried
          over). Hover brightens the rim by +8% lightness. Pressed darkens it by −4% and dims the label. Focus
          is a 2px #F5F2EC ring offset 2px. Passive has no hover or pressed state. These questions come before
          the mapping:
        </p>
        <ol className={s.flagList}>
          {FLAGS.map((f) => (
            <li key={f.title}>
              <strong>{f.title}.</strong> <em>{f.body}</em>
            </li>
          ))}
        </ol>
      </div>

      <div className={s.surface}>
        <div className={s.row}>
          <label className={s.toggle}>
            <input type="checkbox" checked={useProposedDestructive} onChange={(e) => setUseProposedDestructive(e.target.checked)} />
            Use proposed destructive rim #C98479 (off = as specified #C0756A)
          </label>
          <label className={s.toggle}>
            <input type="checkbox" checked={showHit} onChange={(e) => setShowHit(e.target.checked)} />
            Show 44px hit areas
          </label>
        </div>
      </div>

      <StateMatrix surface={BASE} destructive={destructive} showHit={showHit} />
      <StateMatrix surface={PANEL} destructive={destructive} showHit={showHit} />

      <div className={s.surface}>
        <div className={s.h3}>Contrast — computed live</div>
        <p className={s.lede}>
          Rims and the focus ring need 3:1, and labels need 4.5:1. Field (#232C2A) is included because the
          landing and concierge hotel cards that carry Book and Save are field-coloured.
        </p>
        <div className={s.table}>
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Value</th>
                <th>Min</th>
                <th>vs base {BASE}</th>
                <th>vs panel {PANEL}</th>
                <th>vs field {FIELD}</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {CONTRAST.map((row) => (
                <tr key={row.role}>
                  <td>{row.role}</td>
                  <td className={s.mono}>
                    <span className={s.swatch} style={{ background: row.check.hex }} />
                    {row.check.hex.toUpperCase()}
                  </td>
                  <td className={s.muted}>{row.check.min}:1</td>
                  <ContrastCell hex={row.check.hex} against={BASE} min={row.check.min} />
                  <ContrastCell hex={row.check.hex} against={PANEL} min={row.check.min} />
                  <ContrastCell hex={row.check.hex} against={FIELD} min={row.check.min} />
                  <td className={s.muted} style={{ maxWidth: 360 }}>{row.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <MeasuredCondensed showHit={showHit} />
      <PassiveSearchDemo showHit={showHit} />
      <OverImagery destructive={destructive} showHit={showHit} />
      <Mapping />
    </div>
  );
}
