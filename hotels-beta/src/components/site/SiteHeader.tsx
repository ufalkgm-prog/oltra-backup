"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readHotelFlightSearch } from "@/lib/searchSession";
import { fetchMemberProfileBrowser } from "@/lib/members/db";

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
  const [hotelsHref, setHotelsHref] = useState("/hotels");
  const [flightsHref, setFlightsHref] = useState("/flights");
  const [restaurantsHref, setRestaurantsHref] = useState("/restaurants");

  const supabase = createClient();

  const memberFirstName = memberName.trim().split(/\s+/)[0] ?? "";
  const truncatedFirstName =
    memberFirstName.length > 12 ? `${memberFirstName.slice(0, 12)}...` : memberFirstName;
  const membersLabel = user
    ? truncatedFirstName
      ? `Hello ${truncatedFirstName}`
      : "Hello"
    : "Members";

  const navItems: { label: string; href: string; match: string; badge?: string }[] = [
    { label: "Hotels", href: hotelsHref, match: "/hotels" },
    { label: "Flights", href: flightsHref, match: "/flights" /* , badge: "WIP" */ },
    { label: "Restaurants", href: restaurantsHref, match: "/restaurants" },
    { label: "Inspire", href: "/inspire", match: "/inspire" },
    { label: membersLabel, href: user ? "/members" : "/login", match: user ? "/members" : "/login" },
  ];

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        if (!session?.user) setMemberName("");
      }
    });

    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("scroll", onScroll);
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

      setHotelsHref(hotelParams.toString() ? `/hotels?${hotelParams.toString()}` : "/hotels");
      setFlightsHref(flightParams.toString() ? `/flights?${flightParams.toString()}` : "/flights");

      const restaurantCity = saved.city?.trim();
      setRestaurantsHref(restaurantCity ? `/restaurants?city=${encodeURIComponent(restaurantCity)}` : "/restaurants");
    }

    updateSearchHrefs();

    window.addEventListener("oltra:hotel-flight-search-change", updateSearchHrefs);
    window.addEventListener("focus", updateSearchHrefs);

    return () => {
      window.removeEventListener("oltra:hotel-flight-search-change", updateSearchHrefs);
      window.removeEventListener("focus", updateSearchHrefs);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".oltra-site-header__currency")) setCurrencyOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function updateCurrency(currency: string) {
    setSelectedCurrency(currency);
    setCurrencyOpen(false);
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    window.dispatchEvent(new CustomEvent("oltra:currency-change", { detail: { currency } }));
  }

  return (
    <header className={`oltra-site-header ${isScrolled ? "is-scrolled" : ""}`}>
      <div className="oltra-site-header__inner">
        <div className="oltra-site-header__brand">
          <Link href="/" className="oltra-site-header__logo" aria-label="Go to OLTRA home">
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
          {current ? <div className="oltra-site-header__route oltra-route-label">{current}</div> : null}
        </div>

        <nav className="oltra-site-header__nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = pathname === item.match || pathname.startsWith(`${item.match}/`);

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`oltra-site-header__nav-link ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span>{item.label}</span>
                {"badge" in item && item.badge ? (
                  <span className="oltra-site-header__nav-badge">{item.badge}</span>
                ) : null}
              </Link>
            );
          })}

          <div className="oltra-site-header__currency">
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