"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type SiteHeaderProps = {
  current?: string;
  currentCurrency?: string;
};

const currencies = ["EUR", "USD", "GBP", "CHF", "AED"];
const CURRENCY_STORAGE_KEY = "oltra_currency";

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      style={{ width: 12, height: 12, display: "block" }}
    >
      <path
        d="M5.5 7.5 10 12l4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SiteHeader({
  current = "",
  currentCurrency = "EUR",
}: SiteHeaderProps) {
  const [user, setUser] = useState<any>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(currentCurrency);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });

    const onScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("scroll", onScroll);
    };
  }, [supabase]);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(CURRENCY_STORAGE_KEY)
        : null;

    if (stored && currencies.includes(stored)) {
      setSelectedCurrency(stored);
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".oltra-site-header__currency")) {
        setCurrencyOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function updateCurrency(currency: string) {
    setSelectedCurrency(currency);
    setCurrencyOpen(false);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
      window.dispatchEvent(
        new CustomEvent("oltra:currency-change", {
          detail: { currency },
        })
      );
    }
  }

  return (
    <header className={`oltra-site-header ${isScrolled ? "is-scrolled" : ""}`}>
      <div className="oltra-site-header__inner">
        <div className="oltra-site-header__brand">
          <Link href="/" className="oltra-site-header__logo" aria-label="Go to OLTRA home">
            OLTRA
          </Link>

          {current ? (
            <div className="oltra-site-header__route oltra-route-label">{current}</div>
          ) : null}
        </div>

        <nav className="oltra-site-header__nav" aria-label="Primary">
          <Link href="/hotels" className="oltra-site-header__nav-link">
            Hotels
          </Link>

          <Link href="/flights" className="oltra-site-header__nav-link">
            Flights
          </Link>

          <Link href="/restaurants" className="oltra-site-header__nav-link">
            Restaurants
          </Link>

          <Link href="/inspire" className="oltra-site-header__nav-link">
            Inspire
          </Link>

          <Link
            href={user ? "/members" : "/login"}
            className="oltra-site-header__nav-link"
          >
            Members
          </Link>

          <div className="oltra-site-header__currency">
            <button
              type="button"
              className="oltra-site-header__currency-trigger"
              onClick={() => setCurrencyOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={currencyOpen}
            >
              <span>{selectedCurrency}</span>
              <span className="oltra-site-header__currency-chevron">
                <ChevronDown />
              </span>
            </button>

            {currencyOpen ? (
              <div className="oltra-site-header__currency-panel oltra-dropdown-panel">
                <div className="oltra-dropdown-list" role="listbox">
                  {currencies.map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      className="oltra-dropdown-item"
                      onClick={() => updateCurrency(currency)}
                    >
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