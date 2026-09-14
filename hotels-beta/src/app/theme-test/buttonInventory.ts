// Button audit, 2026-09-14 — every button, link-styled action and clickable
// text in the app, mapped to the four-type standard. Sandbox data for
// /theme-test only; nothing outside that page imports it.
//
// `type` is the proposed target. "Primary / Passive" means one control that
// is Primary when it can act and Passive while entries are incomplete.
// `flag` marks a row that does not map cleanly — each one names a decision.

export type TargetType =
  | "Primary"
  | "Primary / Passive"
  | "Destructive"
  | "AI"
  | "Doesn't fit"
  | "Delete (dead code)";

export type InventoryRow = {
  where: string;
  label: string;
  today: string;
  type: TargetType;
  format?: "Full" | "Condensed" | "—";
  note?: string;
  flag?: boolean;
};

export type InventoryGroup = { title: string; rows: InventoryRow[] };

export const INVENTORY: InventoryGroup[] = [
  {
    title: "Landing page (glass panels over the photo)",
    rows: [
      { where: "LandingSearchPanel.tsx:541", label: "AI mode", today: "24px pill, grey rim, muted label, sage dot", type: "AI", format: "—", note: "Inside the 34px destination field — 24px is the ceiling, which the AI spec (12px + 4/12 + 2px rim = 24px) meets exactly." },
      { where: "LandingSearchPanel.tsx:606 / :619", label: "Hotels / Flights checkboxes", today: "Checkbox + label", type: "Doesn't fit", note: "Checkbox, not an action. Flights' disabled state already says what's missing (title)." },
      { where: "LandingSearchPanel.tsx:658", label: "{city} — set home airport", today: "Underlined inline text", type: "Doesn't fit", note: "Text link inside a sentence." },
      { where: "LandingSearchPanel.tsx (none)", label: "— no search button —", today: "Form auto-submits 220ms after a change", type: "Doesn't fit", note: "Nothing to convert. searchDisabledReason is computed but never shown on screen; .searchButton / .searchButtonPassive are dead CSS.", flag: true },
      { where: "LandingSummary.tsx:487 / :550", label: "Go to hotels / Go to flights", today: "Sage fill, 30px, 0.72rem", type: "Primary", format: "Full", note: "Frame header, not inside a card." },
      { where: "HotelSmallCard.tsx:165", label: "BOOK", today: "Sage fill + .oltra-button--xs", type: "Primary", format: "Condensed", note: "Measured set A. Column 84 / 80 / 74px by frame count." },
      { where: "LandingSummary.tsx:528 → SaveToTripControl", label: "SAVE", today: "Sage outline + .oltra-button--xs, muted label", type: "Primary", format: "Condensed", note: "Matches BOOK exactly. \"SAVING...\" is ~78px with the 2px rim — over the 74px column at three frames.", flag: true },
      { where: "FlightResultRow.tsx:224 / :231", label: "BOOK / SAVE", today: "--xs pair, fixed 84px each", type: "Primary", format: "Condensed", note: "Measured set A, identical to the hotel cards." },
      { where: "AiResultFrames.tsx:361 / :428 / :466", label: "Go to hotels / flights / restaurants", today: "Sage fill, 30px", type: "Primary", format: "Full" },
      { where: "AiResultFrames.tsx:374 / :391", label: "BOOK / SAVE (hotel cards)", today: "--xs pair", type: "Primary", format: "Condensed", note: "Same component as landing." },
      { where: "AiResultFrames.tsx:408", label: "See all hotels in {destination}", today: "12px muted text link", type: "Primary", format: "Full", note: "Or keep as a text link — ~380px as a pill at 13px uppercase.", flag: true },
      { where: "HotelSmallCard.tsx:251, RestaurantSmallCard.tsx:95", label: "Whole card", today: "<a> around the card", type: "Doesn't fit", note: "Card link. BOOK/SAVE are buttons nested inside it." },
    ],
  },
  {
    title: "Hotels page",
    rows: [
      { where: "HotelsView.tsx:2327 / :2811", label: "AI mode", today: "Inline in destination field", type: "AI", format: "—" },
      { where: "HotelsView.tsx:2449", label: "CHECK AVAILABILITY / \"Please select dates and guest details to check availability\"", today: "Sage fill, or outline + real disabled with the reason as a 2-line label in a fixed 34px box", type: "Primary / Passive", format: "Full", note: "Your proposal: label becomes SEARCH, the reason moves to a popup — demoed above. Also carries CHECKING…, AVAILABILITY CHECKED (done, disabled) and COULDN'T CHECK — TAP TO RETRY. \"Checked\" is not \"incomplete\" — see flag 3.", flag: true },
      { where: "HotelsView.tsx:2441", label: "FILTERS", today: "Sage fill closed, function style open", type: "Doesn't fit", note: "Disclosure toggle — its look flips with state. Forced choice would be Primary-Full.", flag: true },
      { where: "HotelsView.tsx:331 ×3, :2488", label: "ACTIVITIES / SETTINGS / ACCOLADES / PRICE + chevron", today: "Uppercase text + chevron", type: "Doesn't fit", note: "Accordion headers." },
      { where: "HotelsView.tsx:2338", label: "{award} ×", today: "Recessed chip", type: "Doesn't fit", note: "Removable filter chip — badge shape, stays crisp." },
      { where: "HotelsView.tsx:2588", label: "Hotel result card", today: "<button> row", type: "Doesn't fit", note: "Selectable row. The result cards on /hotels carry no BOOK or SAVE." },
      { where: "HotelsView.tsx:2632", label: "Check availability on website", today: "10px recessed note, 132px", type: "Primary", format: "Condensed", note: "An <a> nested inside the card's <button> — invalid HTML today, and a pill makes it look more clickable still.", flag: true },
      { where: "HotelsView.tsx:2860 / :2868", label: "‹ › featured hotel", today: "38px glass circle over photo", type: "Doesn't fit", note: "Carousel arrow, icon-only." },
      { where: "HotelsView.tsx:2886", label: "SWITCH TO HOTEL VIEW", today: "Near-opaque dark fill, over the map", type: "Doesn't fit", note: "View toggle over map tiles — a transparent pill will not read on a busy map without the scrim.", flag: true },
      { where: "HotelsView.tsx:2916", label: "SWITCH TO MAP VIEW", today: "Function style", type: "Primary", format: "Full", note: "Paired with the one above; treat both the same way." },
      { where: "HotelsView.tsx:2936 / :2946, :3034, :3104", label: "Website · Instagram · more/less · More details", today: "Text links", type: "Doesn't fit", note: "Links in prose." },
      { where: "HotelsView.tsx:2967 / :2990", label: "Main image / thumbnails", today: "Image buttons", type: "Doesn't fit" },
      { where: "HotelsView.tsx:3123 / :3137", label: "− / + room quantity", today: "24px circle", type: "Doesn't fit", note: "Stepper." },
      { where: "HotelsView.tsx:3174, :3542, :3552 / :3578", label: "× close, ‹ › lightbox", today: "36–44px circles", type: "Doesn't fit", note: "Icon-only." },
      { where: "HotelsView.tsx:3318", label: "BOOK (booking_label from Directus)", today: "Recessed underlined box, 34px, full width, muted", type: "Primary", format: "Full", note: "Disappears once rooms are selected — there is no book action then. The label is free text from Directus.", flag: true },
      { where: "HotelsView.tsx:3470", label: "SAVE TO TRIP", today: "Sage fill, or outline when logged out", type: "Primary / Passive", format: "Full", note: "Logged-out is not \"incomplete entries\"; helper would be \"Log in to save\"." },
      { where: "HotelsView.tsx:3495", label: "ADD TO FAVOURITES / ALREADY IN FAVOURITES", today: "Sage fill or outline + disabled", type: "Primary / Passive", format: "Full", note: "\"Already in favourites\" is a done state, not incomplete — see flag 3." },
      { where: "HotelsView.tsx:3433, RestaurantsMapView.tsx:1091, SaveToTripControl.tsx:254", label: "Create new trip", today: "Styled as a dropdown row; aria-disabled + reason on click", type: "Primary / Passive", format: "Condensed", note: "Already the passive behaviour you describe — it just looks like a list row." },
      { where: "hotels/[hotelid]/page.tsx:345", label: "BOOK", today: "Light-theme pill", type: "Doesn't fit", note: "Standalone light page outside the intended flow (§15). Sage-on-white won't read — exclude or retire the page.", flag: true },
    ],
  },
  {
    title: "Flights page (plain base, no photo)",
    rows: [
      { where: "FlightsView.tsx:987", label: "AI mode", today: "Corner row", type: "AI", format: "—" },
      { where: "FlightsView.tsx:993", label: "One-way / Return / Multiple", today: "Outline tabs, 2px white border when active", type: "Doesn't fit", note: "Segmented choice, not an action. Recommend it keeps the crisp radius as a control.", flag: true },
      { where: "FlightsView.tsx:1035", label: "Add flight", today: "Sage fill; outline + disabled at 5 legs", type: "Primary / Passive", format: "Full", note: "Disabled at a cap, not for missing entries. ~159px cell." },
      { where: "FlightsView.tsx:1043", label: "Delete flight", today: "Sage FILL", type: "Destructive", format: "Full", note: "\"DELETE FLIGHT\" at 13px / 0.16em is ~186px against a ~159px cell.", flag: true },
      { where: "FlightsView.tsx:1110", label: "Search / Searching…", today: "Sage fill when dirty, else outline; disabled with no reason shown", type: "Primary / Passive", format: "Full", note: "After a search with nothing changed it looks inactive but is still clickable — a done state, not incomplete." },
      { where: "FlightsView.tsx:1184", label: "Preferred airlines only", today: "Checkbox", type: "Doesn't fit" },
      { where: "FlightsView.tsx:1261, :2218", label: "× dismiss / × deselect leg", today: "Icon", type: "Doesn't fit", note: "Clears a selection — not destructive." },
      { where: "FlightsView.tsx:1369 …2010", label: "Flight cards", today: "role=button rows", type: "Doesn't fit", note: "Selectable rows." },
      { where: "FlightsView.tsx:2130", label: "BOOK", today: "Sage fill, 24px, 0.62rem, 0.1em, radius 4px, ~56px", type: "Primary", format: "Condensed", note: "Measured set B-book. Does NOT match SAVE beside it.", flag: true },
      { where: "FlightsView.tsx:2142", label: "SAVE", today: "Grey outline, 24px, 0.6rem, weight 500, 0.08em, radius 2px, ~56px", type: "Primary", format: "Condensed", note: "Measured set B-save. Flashes italic \"Saved\" — must lose the italic.", flag: true },
      { where: "FlightsView.tsx:2208", label: "info", today: "Inverted white pill, ITALIC", type: "Doesn't fit", note: "§35 keeps it as a deliberate inverted control, but it is clickable italic — under the new rule it would read as AI. Needs a call: drop the italic, or make it an icon.", flag: true },
      { where: "FlightDetailsPopup.tsx:100", label: "× close", today: "28px circle", type: "Doesn't fit" },
      { where: "FlightResultCard, FlightDetailPanel, FlightsSearchBar, FlightsFilterRail, FlightsResultsList, flights.css", label: "BOOK, Save to trip, Continue to partner, Search, Reset, View all", today: "Never imported", type: "Delete (dead code)", note: "Not migrated — deleting is a separate call." },
      { where: "flights/test/page.tsx:102", label: "Search", today: "Blue inline style", type: "Doesn't fit", note: "Dev tool — excluded." },
    ],
  },
  {
    title: "Restaurants, Inspire",
    rows: [
      { where: "RestaurantsMapView.tsx:825, InspireView.tsx:340", label: "AI mode", today: "Corner row", type: "AI", format: "—" },
      { where: "RestaurantsMapView.tsx:1129", label: "SAVE TO TRIP", today: "Sage fill / outline logged out", type: "Primary / Passive", format: "Condensed", note: "Inside the restaurant detail card, so Condensed by rule — though it is the card's main action." },
      { where: "RestaurantsMapView.tsx:1150", label: "ADD TO FAVOURITES", today: "Same", type: "Primary / Passive", format: "Condensed", note: "Already overflows today at the 360px sidebar (~185px label in ~141px). No \"already favourited\" state, unlike Hotels.", flag: true },
      { where: "RestaurantsMapView.tsx:925, InspireView.tsx:491", label: "Restaurant row / destination card", today: "Selectable rows", type: "Doesn't fit" },
      { where: "RestaurantsMapView.tsx:977 / :990", label: "Website · Instagram", today: "Text links", type: "Doesn't fit" },
      { where: "Maps (all pages)", label: "Markers, zoom/compass, temperature On/Off, °C/°F", today: "Map chrome", type: "Doesn't fit", note: "§35 overlay chrome." },
    ],
  },
  {
    title: "Concierge modal",
    rows: [
      { where: "AiConciergeModal.tsx:166", label: "Clear", today: "Outline with #FF8A71 rim, fixed 88px", type: "Destructive", format: "Full", note: "Wipes the conversation, no confirm. \"CLEAR\" is ~99px against 88px.", flag: true },
      { where: "AiConciergeModal.tsx:174", label: "Exit", today: "Outline, 88px", type: "Primary", format: "Full", note: "A dismiss, not an action — see flag 2." , flag: true },
      { where: "AiConciergeModal.tsx:188", label: "See relevant hotels / Go to combined results on main page", today: "13px muted text link", type: "Primary", format: "Full", note: "~440px as a pill; wraps on a phone." },
      { where: "AiConversation.tsx:931", label: "Ask", today: "Sage fill with draft, else outline + disabled", type: "Primary / Passive", format: "Full", note: "Helper: \"Type a question to continue\". 88px fixed width." },
      { where: "AiConversation.tsx:921", label: "Stop", today: "Outline, 88px", type: "Primary", format: "Full", note: "Aborts a reply in flight — nothing is lost. Destructive is arguable.", flag: true },
    ],
  },
  {
    title: "Members area",
    rows: [
      { where: "MembersShell.tsx:40 ×6", label: "Sidebar nav", today: "Uppercase links", type: "Doesn't fit", note: "Navigation." },
      { where: "SavedTripsView.tsx:595", label: "Itinerary", today: "Sage fill", type: "Primary", format: "Full" },
      { where: "SavedTripsView.tsx:603", label: "Delete trip", today: "ITALIC muted text", type: "Destructive", format: "Full", note: "Italic delete link → pill. Row alignment was tuned for small text." },
      { where: "SavedTripsView.tsx:683 / :690", label: "Cancel / Proceed anyway", today: "Outline / sage fill", type: "Primary", format: "Full", note: "Cancel loses its lower rank — see flag 2. Proceed anyway is an alert() placeholder.", flag: true },
      { where: "SavedTripsView.tsx:712 / :723", label: "Yes (delete) / No", today: "Red FILLED pill / sage fill 4px", type: "Destructive", format: "Full", note: "Yes → Destructive; No → Primary." },
      { where: "SavedTripsView.tsx:818", label: "Update price and availability", today: "ITALIC muted text", type: "Primary", format: "Condensed", note: "Clickable italic that isn't a delete. 29 characters in a third-width column — will wrap as a pill.", flag: true },
      { where: "SavedTripsView.tsx:849", label: "Book", today: "Sage fill", type: "Primary", format: "Condensed", note: "Restaurants fall through to alert()." },
      { where: "SavedTripsView.tsx:856", label: "Delete (trip item)", today: "ITALIC muted text", type: "Destructive", format: "Condensed", note: "Deletes immediately, no confirm." },
      { where: "TripItineraryDocument.tsx:117 / :124 / :131", label: "Print / Save as PDF · Send · Close", today: "Sage fill / re-pointed outline", type: "Doesn't fit", note: "The itinerary modal is WHITE (#fff) — a sage rim with a #F5F2EC label is invisible there. Needs a light-surface exception.", flag: true },
      { where: "PersonalInformationView.tsx:594", label: "Save / Saved", today: "Sage fill when dirty, outline + disabled when clean", type: "Primary / Passive", format: "Full", note: "Passive here means \"no changes\", not \"incomplete\" — see flag 3.", flag: true },
      { where: "PersonalInformationView.tsx:606", label: "Log out", today: "Outline", type: "Primary", format: "Full", note: "Was secondary — flag 2." },
      { where: "PersonalInformationView.tsx:615", label: "Terminate membership", today: "ITALIC muted text", type: "Destructive", format: "Full" },
      { where: "PersonalInformationView.tsx:631", label: "Add family member", today: "Sage fill; disabled at 10", type: "Primary / Passive", format: "Full", note: "Cap, not incomplete." },
      { where: "PersonalInformationView.tsx:698", label: "Delete member", today: "ITALIC muted text", type: "Destructive", format: "Condensed", note: "No confirm (persists on Save)." },
      { where: "PersonalInformationView.tsx:720 / :729", label: "Yes (save & leave) / No (leave without saving)", today: "Sage fill / outline", type: "Primary", format: "Full", note: "\"No\" discards edits — Destructive is arguable.", flag: true },
      { where: "PersonalInformationView.tsx:750 / :758", label: "Yes (terminate) / No", today: "Red filled pill / sage fill", type: "Destructive", format: "Full", note: "Yes → Destructive; No → Primary." },
      { where: "FavoriteHotelsView.tsx:208, FavoriteRestaurantsView.tsx:202", label: "View hotel / View restaurant", today: "Sage fill, NO onClick", type: "Primary", format: "Condensed", note: "Dead buttons today — they do nothing.", flag: true },
      { where: "FavoriteHotelsView.tsx:215, FavoriteRestaurantsView.tsx:208", label: "Delete (favourite)", today: "ITALIC muted text", type: "Destructive", format: "Condensed", note: "No confirm." },
      { where: "FeedbackSuggestView.tsx:78", label: "Send", today: "Sage fill / outline + disabled", type: "Primary / Passive", format: "Full", note: "The 20-character minimum is never shown — helper text fixes that." },
      { where: "ReviewView.tsx:406", label: "Send review", today: "Same", type: "Primary / Passive", format: "Full" },
      { where: "ReviewView.tsx:354", label: "★ rating", today: "Star glyphs", type: "Doesn't fit" },
    ],
  },
  {
    title: "Login and account",
    rows: [
      { where: "LoginView.tsx:208", label: "LOG IN", today: "Sage fill / outline at 45% opacity + disabled", type: "Primary / Passive", format: "Full", note: "Fixed 140px — fits (\"LOG IN\" ~110px). Helper: \"Enter your email and password\"." },
      { where: "LoginView.tsx:216 / :292 / :341 / :370", label: "CREATE NEW ACCOUNT · CREATE ACCOUNT · SAVE PASSWORD · SEND RESET LINK", today: "Sage fill", type: "Primary", format: "Full" },
      { where: "LoginView.tsx:227", label: "CONTINUE WITH GOOGLE", today: "Sage fill", type: "Primary", format: "Full", note: "OAuth — fine as Primary; Google's own mark isn't used." },
      { where: "LoginView.tsx:300 / :378", label: "BACK TO LOG IN", today: "Outline", type: "Primary", format: "Full", note: "Was secondary — flag 2." },
      { where: "LoginView.tsx:238", label: "Forgot password", today: "Text link, explicitly not italic", type: "Doesn't fit" },
      { where: "beta-login/page.tsx:129", label: "Enter", today: "Inline off-system styles", type: "Primary / Passive", format: "Full", note: "Gate page — include or exclude?" },
    ],
  },
  {
    title: "Site chrome and shared controls",
    rows: [
      { where: "SiteHeader.tsx:292 ×5, :312", label: "Hotels · Flights · Restaurants · Inspire · Members · EUR ▾", today: "Nav links, radius 11px", type: "Doesn't fit", note: "Navigation, not actions." },
      { where: "DateRangePicker / SingleDatePicker", label: "‹ › month, day cells, trigger", today: "Circles / cells / field", type: "Doesn't fit" },
      { where: "GuestSelector.tsx:186–229", label: "− / + steppers", today: "32px circles", type: "Doesn't fit" },
      { where: "StructuredDestinationField.tsx:676", label: "Type: label ×", today: "Pill chip, whole chip removes", type: "Doesn't fit", note: "A chip that is pill-shaped today — the shape rule says badges keep the crisp scale.", flag: true },
      { where: "ResidencyPicker.tsx:65", label: "Change", today: "Underlined inline text", type: "Doesn't fit" },
      { where: "editor/**, TopNav.tsx", label: "Editor buttons, dead nav", today: "Off-system", type: "Doesn't fit", note: "Excluded per §35." },
    ],
  },
];
