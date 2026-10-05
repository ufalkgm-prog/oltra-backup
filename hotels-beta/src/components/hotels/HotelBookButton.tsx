"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* ONE BOOK BUTTON FOR EVERY PARTNER (Ulrik, 2026-10-01).
 *
 * RateHawk, KAYAK and andBeyond hotels all show the same BOOK. Pressing it
 * opens this pop-up, which names who takes the booking — ZenHotels for
 * RateHawk, andBeyond, or the hotel's own website while KAYAK is not live —
 * and only Continue goes on. The flight BOOK already works this way for
 * Trip.com (TripComBookButton); this is the hotel version.
 *
 * Continue either follows a link (a partner's site, in a new tab) or runs a
 * step here: for RateHawk that is Prebook, which must still fire only on the
 * guest's own Continue (§32) — opening the pop-up costs nothing.
 *
 * Portalled to document.body: the buttons sit inside glass panels whose
 * backdrop-filter traps fixed positioning (design-system §35, "A panel that
 * must escape the glass is portalled"). */

export type BookDetail = { label: string; value: string };

type Props = {
  /** Pop-up heading, e.g. "Book with ZenHotels". */
  title: string;
  /** Who takes the booking, in a sentence or two. */
  body: string;
  /** Rows shown between the text and the buttons (room, dates, total…). */
  details?: BookDetail[];
  /** Small print under the rows. */
  note?: string;
  /** Continue opens this in a new tab… */
  href?: string;
  /** …or runs this instead (RateHawk Prebook). */
  onContinue?: () => void;
  /** Called when Continue is pressed, before leaving (click logging). */
  onProceed?: () => void;
  /** BOOK is passive and says why — no dates, no room chosen. */
  blockedReason?: string | null;
  /** Busy: BOOK shows this instead of its label and cannot be pressed. */
  busyLabel?: ReactNode;
  /** Classes for BOOK, from the button standard (§35A). */
  className: string;
  label?: string;
};

export default function HotelBookButton({
  title,
  body,
  details = [],
  note,
  href,
  onContinue,
  onProceed,
  blockedReason,
  busyLabel,
  className,
  label = "BOOK",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={Boolean(busyLabel)}
        aria-disabled={blockedReason ? "true" : undefined}
        data-reason={blockedReason ?? undefined}
        onClick={(event) => {
          // Cards around these buttons are click-to-select, and some are links.
          event.preventDefault();
          event.stopPropagation();
          // aria-disabled does not block the click.
          if (blockedReason || busyLabel) return;
          setOpen(true);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {busyLabel ?? label}
      </button>
      {open ? (
        <BookDialog
          title={title}
          body={body}
          details={details}
          note={note}
          href={href}
          onContinue={onContinue}
          onProceed={onProceed}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function BookDialog({
  title,
  body,
  details,
  note,
  href,
  onContinue,
  onProceed,
  onClose,
}: Omit<Props, "className" | "label" | "blockedReason" | "busyLabel"> & { details: BookDetail[]; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="oltra-modal-scrim fixed inset-0 z-[1000] flex justify-center overflow-y-auto px-6 py-10"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      role="presentation"
    >
      <div
        className="oltra-modal-panel relative my-auto h-fit w-full max-w-[520px] rounded-[var(--oltra-radius-xl)] border border-[var(--oltra-field-border)] p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotel-book-title"
      >
        <div id="hotel-book-title" className="oltra-subheader">
          {title}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--oltra-text-muted)]">{body}</p>

        {details.length ? (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {details.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                  {row.label}
                </dt>
                <dd className="m-0 text-[color:var(--oltra-text-primary)]">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {note ? (
          <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--oltra-text-muted)]">{note}</p>
        ) : null}

        <div className="oltra-btn-pair mt-5">
          <button type="button" className="oltra-btn" onClick={onClose}>
            Cancel
          </button>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="oltra-btn"
              onClick={() => {
                onProceed?.();
                onClose();
              }}
            >
              Continue
            </a>
          ) : (
            <button
              type="button"
              className="oltra-btn"
              onClick={() => {
                onProceed?.();
                onClose();
                onContinue?.();
              }}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
