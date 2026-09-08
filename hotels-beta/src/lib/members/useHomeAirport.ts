"use client";

import { useEffect, useState } from "react";
import { fetchMemberProfileBrowser } from "./db";

/* The member's home airport, as an IATA code.
 *
 * Personal Information has held one since the members area was built, and the
 * Flights page has read it since — but the landing page kept its own copy in
 * localStorage and the concierge knew nothing about it, so the same member got
 * three different answers to "where do you fly from" depending on where they
 * asked. This is the one reader, so they agree.
 *
 * Empty for a signed-out visitor, and empty until the fetch resolves — callers
 * must treat "" as "not known yet" rather than as "no home airport", or they
 * will clear a value the visitor typed a moment earlier.
 *
 * The column is free text and has held three shapes over the life of the
 * field: a bare code ("CPH", what Personal Information writes now), and two
 * labels — "CPH · Copenhagen Kastrup, DK" and "Copenhagen (CPH)", which
 * InspireView still parses by hand. readAirportCode covers all three. */
export function readAirportCode(value: string | null | undefined): string {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw) return "";

  if (/^[A-Z]{3}$/.test(raw)) return raw;

  // "Copenhagen (CPH)"
  const bracketed = /\(([A-Z]{3})\)/.exec(raw);
  if (bracketed) return bracketed[1];

  /* "CPH · Copenhagen Kastrup, DK" — the code leads, followed by a separator.
     Anchored to the front and required to be followed by punctuation rather
     than picked out of the string anywhere, or "San Francisco" would resolve
     to SAN. A value we cannot read confidently returns nothing: a flight
     search cannot use a half-valid origin, and departing from the wrong
     airport is worse than being asked for the right one. */
  const leading = /^([A-Z]{3})\s*[·\-–—|,]/.exec(raw);
  return leading ? leading[1] : "";
}

export function useHomeAirport(): string {
  const [code, setCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchMemberProfileBrowser()
      .then((profile) => {
        if (cancelled) return;
        const parsed = readAirportCode(profile?.homeAirport);
        if (parsed) setCode(parsed);
      })
      .catch(() => {
        /* Signed out, or offline. No home airport is a normal state. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return code;
}
