"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readHotelFlightSearch } from "@/lib/searchSession";
import { fetchMemberProfileBrowser } from "@/lib/members/db";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import { useAiSearch } from "@/lib/ai/aiSearchStore";
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
  const [hotelsHref, setHotelsHref] = useState("/hotels");
  const [flightsHref, setFlightsHref] = useState("/flights");
  const [restaurantsHref, setRestaurantsHref] = useState("/restaurants");

  const supabase = createClient();

  /* The concierge opens from here on every page (2026-09-15), and while it is
     open the header stays above it, sharp, naming it under the logo. */
  const { conciergeOpen, setConciergeOpen } = useAiSearch();

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
    { label: "Hotels", href: hotelsHref, match: "/hotels" },
    { label: "Flights", href: flightsHref, match: "/flights" /* , badge: "WIP" */ },
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

    /* The window is not the only thing that scrolls.
     *
     * Hotels, Flights and Restaurants each bound their layout to the viewport
     * and scroll an inner pane instead (§30, §33), so window.scrollY never
     * moves there and the header stayed transparent over content sliding
     * under it — on exactly the pages where it is hardest to read.
     *
     * `scroll` does not bubble, so this listens in the CAPTURE phase on the
     * document, which sees every scroller. A document-level scroll reports
     * `document` as its target and falls through to window.scrollY; an element
     * reports itself, and we read its scrollTop.
     *
     * Any scroller counts, with no size test. A first version required half
     * the viewport, on the theory that a dropdown should not darken the site
     * header — but Restaurants scrolls two panes of roughly 220px each, so the
     * page it was written for was the one it excluded. Guessing which
     * containers are "the main window" from their height does not work; every
     * scroll darkening the header is predictable, and a small list scrolling
     * under a header that is already legible costs nothing. */
    const onScroll = (event?: Event) => {
      const target = event?.target;
      if (target instanceof HTMLElement) {
        setIsScrolled(target.scrollTop > 8);
        return;
      }
      setIsScrolled(window.scrollY > 8);
    };
    onScroll();

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [supabase]);

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

      if (!saved) {
        setHotelsHref("/hotels");
        setFlightsHref("/flights");
        setRestaurantsHref("/restaurants");
        return;
      }

      const hotelParams = new URLSearchParams();
      const flightParams = new URLSearchParams();

      for (const params of [hotelParams, flightParams]) {
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

      if (saved.bedrooms) hotelParams.set("bedrooms", saved.bedrooms);
      if (saved.origin) flightParams.set("origin", saved.origin);

      setHotelsHref(hotelParams.toString() ? `/hotels?${hotelParams.toString()}` : "/hotels");
      setFlightsHref(flightParams.toString() ? `/flights?${flightParams.toString()}` : "/flights");

      const restaurantCity = saved.city?.trim();
      const restaurantParams = new URLSearchParams();
      if (restaurantCity) restaurantParams.set("city", restaurantCity);
      if (saved.hotelId) restaurantParams.set("hotel_id", saved.hotelId);
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
      className={`oltra-site-header ${isScrolled ? "is-scrolled" : ""} ${
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

          <span
            className="oltra-site-header__beta-badge"
            tabIndex={0}
            aria-label="OLTRA beta launch notice"
          >
            BETA
            <span className="oltra-site-header__beta-popover" role="tooltip">
              This site is at beta launch stage and does not yet include full hotel list or flights search functionality. Additional content and functionality will be added pending partner discussions.
            </span>
          </span>
          {conciergeOpen ? (
            /* Orange, like the button that opened it and like the logo's BETA
               line (Ulrik, 2026-09-21). The modifier is on this one route
               label only — every other page's route name keeps the muted
               grey. */
            <div className="oltra-site-header__route oltra-route-label oltra-route-label--ai">
              AI Concierge
            </div>
          ) : current ? (
            <div className="oltra-site-header__route oltra-route-label">{current}</div>
          ) : null}
        </div>

        <nav className="oltra-site-header__nav" aria-label="Primary">
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