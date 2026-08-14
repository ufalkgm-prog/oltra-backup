"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  buildMonthGrid,
  compareIso,
  monthLabel,
  parseIsoDateLocal,
  startOfMonth,
  toIsoDateLocal,
  weekdayLabelsMondayFirst,
} from "@/lib/dateRange";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import styles from "./DateRangePicker.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  label?: string;
  className?: string;
};

function formatDisplayDate(value: string): string {
  if (!value) return "";
  const date = parseIsoDateLocal(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatAriaDate(iso: string): string {
  const date = parseIsoDateLocal(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

const WEEKDAY_LABELS = weekdayLabelsMondayFirst();

// Single-date sibling of DateRangePicker - same panel/day-cell styling
// (shares DateRangePicker.module.css so the two stay visually identical),
// but one month at a time and one click picks a date and closes. Used for
// Flights' one-way "Depart" field and each multi-city leg's "Date" field,
// which never needed a range - only the same graphical treatment as the
// return-trip's DateRangePicker instead of the native <input type="date">
// popup DateField used previously.
export default function SingleDatePicker({
  value,
  onChange,
  minDate,
  label = "Date",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonthState] = useState<Date>(() =>
    startOfMonth(new Date())
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  const dismissHoverProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: [rootRef, panelRef],
  });

  useLayoutEffect(() => {
    if (!open) return;

    function reposition() {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const panelWidth = panelRef.current?.offsetWidth ?? 260;
      const viewportWidth = window.innerWidth;
      const left = Math.min(rect.left, viewportWidth - panelWidth - 16);
      setPanelPos({
        top: rect.bottom + 8,
        left: Math.max(16, left),
      });
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, visibleMonth]);

  function openPicker() {
    if (open) return;
    setVisibleMonthState(startOfMonth(parseIsoDateLocal(value) ?? new Date()));
    setOpen(true);
  }

  function handleDayClick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  const effectiveMinIso = minDate || "";

  function isDisabled(iso: string): boolean {
    if (!effectiveMinIso) return false;
    return compareIso(iso, effectiveMinIso) < 0;
  }

  function isSelected(iso: string): boolean {
    return Boolean(value) && iso === value;
  }

  const minMonth = effectiveMinIso
    ? startOfMonth(parseIsoDateLocal(effectiveMinIso) ?? new Date())
    : null;

  const canPagePrev =
    !minMonth ||
    compareIso(toIsoDateLocal(addMonths(visibleMonth, -1)), toIsoDateLocal(minMonth)) >= 0;

  function pageMonths(delta: number) {
    setVisibleMonthState((prev) => addMonths(prev, delta));
  }

  function renderMonth(monthDate: Date) {
    const grid = buildMonthGrid(monthDate);
    return (
      <div className={styles.month} key={`${grid.year}-${grid.month}`}>
        <div className={styles.monthLabel}>{monthLabel(monthDate)}</div>
        <div className={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, i) => (
            <div className={styles.weekdayCell} key={i}>
              {label}
            </div>
          ))}
        </div>
        {grid.weeks.map((week, weekIndex) => (
          <div className={styles.weekRow} key={weekIndex}>
            {week.map((cell, cellIndex) => {
              if (!cell) {
                return <div className={styles.dayCellBlank} key={cellIndex} />;
              }

              const disabled = isDisabled(cell.iso);
              const selected = isSelected(cell.iso);

              return (
                <button
                  type="button"
                  key={cell.iso}
                  disabled={disabled}
                  aria-label={formatAriaDate(cell.iso)}
                  aria-disabled={disabled}
                  className={[styles.dayCell, selected ? styles.dayCellStart : ""].join(" ")}
                  onClick={() => handleDayClick(cell.iso)}
                >
                  <span className={styles.dayNumber}>{cell.day}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${className}`}
      data-oltra-control="true"
      {...dismissHoverProps}
    >
      <div className="oltra-label">{label}</div>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <span className={styles.triggerText} data-has-value={value ? "true" : "false"}>
          {formatDisplayDate(value) || "Select date"}
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className={`oltra-dropdown-panel ${styles.panel} ${styles.panelSingle}`}
              style={
                panelPos
                  ? { top: panelPos.top, left: panelPos.left }
                  : { top: -9999, left: -9999 }
              }
              {...dismissHoverProps}
            >
              <div className={styles.panelHead}>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-label="Previous month"
                  disabled={!canPagePrev}
                  onClick={() => pageMonths(-1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-label="Next month"
                  onClick={() => pageMonths(1)}
                >
                  ›
                </button>
              </div>

              <div className={styles.monthsRow}>{renderMonth(visibleMonth)}</div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
