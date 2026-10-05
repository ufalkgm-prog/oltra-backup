"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readHotelFlightSearch, readLatestFlightsSearch, type SharedTravelSearch } from "@/lib/searchSession";
import { fetchMemberProfileBrowser } from "@/lib/members/db";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import { aiResultsAreCurrent, useAiSearch } from "@/lib/ai/aiSearchStore";
import { flightsHref as aiFlightsHref, hotelsHref as aiHotelsHref } from "@/lib/ai/handoff";
import AiModeButton from "@/components/ai/AiModeButton";

type SiteHeaderProps = {
  current?: string;
  currentCurrency?: string;
};

const currencies = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "AED",
  "DKK",
  "SEK",
  "NOK",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "SGD",
  "HKD",
  "CNY",
];
const CURRENCY_STORAGE_KEY = "oltra_currency";

/* Three lines, or a cross while the menu is open. */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" style={{ width: 18, height: 18, display: "block" }}>
      {open ? (
        <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M3.5 6h13M3.5 10h13M3.5 14h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" style={{ width: 12, height: 12, display: "block" }}>
      <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SiteHeader({ current = "", currentCurrency = "EUR" }: SiteHeaderProps) {
  const pathname = usePathname();

  const [user, setUser] = useState<any>(null);
  const [memberName, setMemberName] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(currentCurrency);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const [hotelsHref, setHotelsHref] = useState("/hotels");
  const [flightsHref, setFlightsHref] = useState("/flights");
  const [restaurantsHref, setRestaurantsHref] = useState("/restaurants");
  /* THE PHONE MENU (Ulrik, 2026-10-05). Below 700px the links wrapped onto
     three rows, about 230px of header before any content, and on Inspire it
     covered the top of the list. There they sit behind a menu button instead,
     in a panel that overlays the page rather than pushing it down. */
  const [menuOpen, setMenuOpen] = useState(false);

  const supabase = createClient();

  /* The concierge opens from here on every page (2026-09-15), and while it is
     open the header stays above it, sharp, naming it under the logo. */
  const {
    conciergeOpen,
    setConciergeOpen,
    query: aiQuery,
    results: aiResults,
    presentedAt,
    searchedAt,
  } = useAiSearch();

  /* WHILE THE CONCIERGE'S ANSWER IS CURRENT, THE HEADER HANDS IT OVER
     (2026-09-23). The links below are built from the shared session, and any
     param at all - the answer's dates and search_submitted - counts as a
     search on arrival, so AiResultsSync stood down and Hotels opened on its
     featured page (or a plain city search) instead of the six hotels the
     conversation had just chosen. The same URLs the concierge's own buttons
     use, so the two ways in cannot disagree. */
  const aiCurrent = aiResultsAreCurrent(aiResults, presentedAt, searchedAt);
  const navHotelsHref =
    aiCurrent && aiResults.hotelIds.length ? aiHotelsHref(aiQuery, aiResults) : hotelsHref;
  const navFlightsHref =
    aiCurrent && aiResults.flights.length ? aiFlightsHref(aiQuery, aiResults) : flightsHref;

  const oauthName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";
  const effectiveName = memberName || oauthName;
  const memberFirstName = effectiveName.trim().split(/\s+/)[0] ?? "";
  const truncatedFirstName =
    memberFirstName.length > 12 ? `${memberFirstName.slice(0, 12)}...` : memberFirstName;
  /* Confirmed by email, or by phone for an account that signed up that way.
   *
   * `confirmed_at` is Postgres-generated as the coalesce of the two, so it is
   * the one to read when either counts; email_confirmed_at is checked first
   * and explicitly because email is what this site actually signs people up
   * with. A Google OAuth account arrives with email_confirmed_at already set
   * by the provider, so social sign-in is unaffected. */
  const isVerifiedMember = Boolean(
    user?.email_confirmed_at ?? user?.confirmed_at
  );

  /* "Hello" is a greeting to a named, verified person, so it is never shown
   * without both. Three cases would otherwise have produced a bare or
   * unearned greeting, and they look identical on screen:
   *
   *  - the moment between the session arriving and the profile fetch
   *    resolving;
   *  - permanently, for a member with no name anywhere — an email/password
   *    signup that never filled in Personal Information has no member_name
   *    row and no OAuth full_name to fall back on;
   *  - a session on an address that has never been confirmed.
   *
   * All three read "Members", which is honest in every case. The link still
   * goes to /members, so a signed-in member is not sent back through login;
   * only the label is neutral.
   *
   * Note the label was never an access control: /members is gated server-side
   * in its layout, which calls getUser() and redirects to /login without a
   * session. That gate does NOT check confirmation — an unconfirmed session
   * can still open the members area, and closing that is a change to the
   * route, not to this greeting. */
  const membersLabel =
    user && isVerifiedMember && truncatedFirstName
      ? `Hello ${truncatedFirstName}`
      : "Members";

  const navItems: { label: string; href: string; match: string; badge?: string; disabledMessage?: string }[] = [
    { label: "Hotels", href: navHotelsHref, match: "/hotels" },
    { label: "Flights", href: navFlightsHref, match: "/flights" /* , badge: "WIP" */ },
    { label: "Restaurants", href: restaurantsHref, match: "/restaurants" },
    { label: "Inspire", href: "/inspire", match: "/inspire" },
    { label: membersLabel, href: user ? "/members" : "/login", match: user ? "/members" : "/login" },
  ];

  useEffect(() => {
    let mounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        if (!session?.user) setMemberName("");
      }
    });

    /* The header changes only when the PAGE scrolls (Ulrik, 2026-09-26), and
     * the page scrolls only when it overflows (html is overflow-y: auto).
     *
     * It used to react to every scroller on the page, inner panes included —
     * Hotels, Flights and Restaurants scroll panes inside a viewport-bound
     * layout (§30, §33) — with dropdowns and popups excepted. But the page
     * reserves the header's measured height (below), so nothing in an inner
     * pane passes under the header, and the header changing while the page
     * itself stood still read as a glitch: scrolling the landing page's
     * welcome letter darkened it. So inner scrollers are ignored entirely,
     * and this listens on the window only.
     *
     * Not on the landing page (Ulrik, 2026-10-04): there the header's shade is
     * the top shade on bright photos in LandingBackground instead. */
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("scroll", onScroll);
    };
  }, [supabase]);

  /* THE PAGE RESERVES WHATEVER THE HEADER ACTUALLY MEASURES.
   *
   * The header is `position: fixed`, and `--oltra-page-top-padding` was a flat
   * 110px - correct only while the header was 80px tall. It is not: below
   * 1000px the brand stacks above the nav (130px), and below about 520px the
   * nav itself wraps to a second row (180px). At 502 that put "Inspire ·
   * Hello Ulrik · GBP" directly on top of the Hotels search panel, covering
   * the DESTINATION label and the city token (Ulrik, 2026-09-21).
   *
   * Measured rather than pinned to breakpoints, because the wrap point moves
   * with content a media query cannot see: the greeting is longer for a
   * signed-in member than for a visitor, and the currency label changes width.
   * Until this runs the variable is unset and the 80px fallback reproduces the
   * old 110px exactly, so nothing shifts at desktop widths. */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--oltra-header-height",
        `${Math.round(el.getBoundingClientRect().height)}px`
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (stored && currencies.includes(stored)) setSelectedCurrency(stored);
  }, []);

  useEffect(() => {
    if (!user) {
      setMemberName("");
      return;
    }
    let cancelled = false;
    fetchMemberProfileBrowser()
      .then(profile => { if (!cancelled) setMemberName(profile?.memberName ?? ""); })
      .catch(() => { if (!cancelled) setMemberName(""); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    function updateSearchHrefs() {
      const saved = readHotelFlightSearch();
      /* Flights opens on its own last search unless a newer one was made on
         Landing, Hotels or by the concierge (2026-09-28). */
      const flightSaved = readLatestFlightsSearch();

      if (!saved && !flightSaved) {
        setHotelsHref("/hotels");
        setFlightsHref("/flights");
        setRestaurantsHref("/restaurants");
        return;
      }

      const hotelParams = new URLSearchParams();
      const flightParams = new URLSearchParams();

      for (const [params, source] of [
        [hotelParams, saved],
        [flightParams, flightSaved],
      ] as [URLSearchParams, SharedTravelSearch | null][]) {
        if (!source) continue;
        const saved = source;
        if (saved.q) params.set("q", saved.q);
        if (saved.city) params.set("city", saved.city);
        if (saved.country) params.set("country", saved.country);
        if (saved.region) params.set("region", saved.region);
        if (saved.from) params.set("from", saved.from);
        if (saved.to) params.set("to", saved.to);
        if (saved.adults) params.set("adults", saved.adults);
        if (saved.kids) params.set("kids", saved.kids);

        for (let i = 1; i <= 6; i += 1) {
          const key = `kid_age_${i}` as keyof typeof saved;
          const value = saved[key];
          if (value) params.set(`kid_age_${i}`, String(value));
        }

        params.set("search_submitted", "1");
      }

      if (saved?.bedrooms) hotelParams.set("bedrooms", saved.bedrooms);
      /* The rest of the latest search, so Hotels opens on all of it: the finer
         destination levels (an area search arrived as nothing before), the
         destination field's tags and the Hotels filters (2026-09-28). */
      for (const key of [
        "state",
        "admin_region",
        "macro_region",
        "activities",
        "settings",
        "styles",
        "awards",
        "affiliation",
        "local_area",
        "min_price",
        "max_price",
      ] as const) {
        const value = saved?.[key];
        if (value) hotelParams.set(key, String(value));
      }
      if (flightSaved?.origin) flightParams.set("origin", flightSaved.origin);

      setHotelsHref(hotelParams.toString() ? `/hotels?${hotelParams.toString()}` : "/hotels");
      setFlightsHref(flightParams.toString() ? `/flights?${flightParams.toString()}` : "/flights");

      const restaurantCity = saved?.city?.trim();
      const restaurantParams = new URLSearchParams();
      if (restaurantCity) restaurantParams.set("city", restaurantCity);
      if (saved?.hotelId) restaurantParams.set("hotel_id", saved.hotelId);
      setRestaurantsHref(restaurantParams.toString() ? `/restaurants?${restaurantParams.toString()}` : "/restaurants");
    }

    updateSearchHrefs();

    window.addEventListener("oltra:hotel-flight-search-change", updateSearchHrefs);
    window.addEventListener("focus", updateSearchHrefs);

    return () => {
      window.removeEventListener("oltra:hotel-flight-search-change", updateSearchHrefs);
      window.removeEventListener("focus", updateSearchHrefs);
    };
  }, []);

  // A page change closes the menu, and so does Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const currencyDismissProps = useDropdownDismiss({
    open: currencyOpen,
    onClose: () => setCurrencyOpen(false),
    refs: currencyRef,
  });

  function updateCurrency(currency: string) {
    setSelectedCurrency(currency);
    setCurrencyOpen(false);
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    window.dispatchEvent(new CustomEvent("oltra:currency-change", { detail: { currency } }));
  }

  return (
    <header
      ref={headerRef}
      className={`oltra-site-header ${isScrolled && pathname !== "/" ? "is-scrolled" : ""} ${
        conciergeOpen ? "is-concierge-open" : ""
      }`}
    >
      <div className="oltra-site-header__inner">
        <div className="oltra-site-header__brand">
          <Link href="/" className="oltra-site-header__logo" aria-label="Go to OLTRA home">
            {/* eslint-disable-next-line @next/next/no-img-element -- an SVG wordmark; next/image does not optimise SVG */}
            <img
              src="/images/myOLTRA.svg"
              alt="OLTRA"
              className="oltra-site-header__logo-image"
              style={{ transform: "translateX(calc(-4px))" }}
            />
          </Link>

          {/* The orange BETA badge beside the logo was removed with the
              green-A logo (Ulrik, 2026-09-26). */}
          {conciergeOpen ? (
            /* Orange, like the button that opened it and like the former BETA
               badge's line (Ulrik, 2026-09-21). The modifier is on this one route
               label only — every other page's route name keeps the muted
               grey. */
            <div className="oltra-site-header__route oltra-route-label oltra-route-label--ai">
              AI Concierge
            </div>
          ) : current ? (
            <div className="oltra-site-header__route oltra-route-label">{current}</div>
          ) : (
            /* The line is reserved even with no label (the landing page), so
               the header is the same height with or without one. Opening the
               concierge adds "AI Concierge" here, and without this the header
               grew, --oltra-header-height with it, and the search frame under
               it moved 8px down (Ulrik, 2026-09-28). */
            <div
              className="oltra-site-header__route oltra-route-label"
              aria-hidden="true"
              style={{ visibility: "hidden" }}
            >
              &nbsp;
            </div>
          )}
        </div>

        {/* Shown below 700px only (oltra-theme.css). A control, not an action
            (§35A), so it keeps its own shape rather than the button pill. */}
        <button
          type="button"
          className="oltra-site-header__menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Menu"}
          aria-expanded={menuOpen}
          aria-controls="oltra-primary-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MenuIcon open={menuOpen} />
        </button>

        <nav
          id="oltra-primary-nav"
          className={`oltra-site-header__nav ${menuOpen ? "is-open" : ""}`}
          aria-label="Primary"
          onClick={(event) => {
            // A choice closes the menu; opening the currency list does not.
            const target = event.target as HTMLElement;
            if (target.closest(".oltra-site-header__currency-trigger")) return;
            if (target.closest("a, button")) setMenuOpen(false);
          }}
        >
          <AiModeButton placement="header" />

          {navItems.map((item) => {
            const isActive = pathname === item.match || pathname.startsWith(`${item.match}/`);

            if (item.disabledMessage) {
              return (
                <span
                  key={item.label}
                  className="oltra-site-header__nav-link oltra-site-header__nav-link--disabled"
                  tabIndex={0}
                  aria-disabled="true"
                >
                  <span>{item.label}</span>
                  <span className="oltra-site-header__nav-popover" role="tooltip">
                    {item.disabledMessage}
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`oltra-site-header__nav-link ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                // Leaving for another page closes the concierge rather than
                // carrying an open panel over the next page.
                onClick={() => setConciergeOpen(false)}
              >
                <span>{item.label}</span>
                {"badge" in item && item.badge ? (
                  <span className="oltra-site-header__nav-badge">{item.badge}</span>
                ) : null}
              </Link>
            );
          })}

          <div
            ref={currencyRef}
            className="oltra-site-header__currency"
            data-oltra-control="true"
            {...currencyDismissProps}
          >
            <button
              type="button"
              className="oltra-site-header__currency-trigger"
              onClick={() => setCurrencyOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={currencyOpen}
            >
              <span>{selectedCurrency}</span>
              <span className="oltra-site-header__currency-chevron"><ChevronDown /></span>
            </button>

            {currencyOpen ? (
              <div className="oltra-site-header__currency-panel oltra-dropdown-panel">
                <div className="oltra-dropdown-list" role="listbox">
                  {currencies.map((currency) => (
                    <button key={currency} type="button" className="oltra-dropdown-item" onClick={() => updateCurrency(currency)}>
                      {currency}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}