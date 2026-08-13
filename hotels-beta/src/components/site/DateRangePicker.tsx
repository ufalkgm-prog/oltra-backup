"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDaysIso,
  addMonths,
  buildMonthGrid,
  compareIso,
  monthLabel,
  parseIsoDateLocal,
  startOfMonth,
  toIsoDateLocal,
  weekdayLabelsMondayFirst,
} from "@/lib/dateRange";
import styles from "./DateRangePicker.module.css";

type Props = {
  fromValue: string;
  toValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  fromMinDate?: string;
  minNights?: number;
  label?: string;
  className?: string;
};

type Awaiting = "start" | "end";

const CLOSE_DELAY_MS = 200;

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

export default function DateRangePicker({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  fromMinDate,
  minNights = 1,
  label = "Dates",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [awaiting, setAwaiting] = useState<Awaiting>("start");
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonthState] = useState<Date>(() =>
    startOfMonth(new Date())
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    function reposition() {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const panelWidth = panelRef.current?.offsetWidth ?? 480;
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

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose() {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }

  function openPicker() {
    if (open) return;

    setDraftFrom(fromValue || "");
    setDraftTo(toValue || "");
    setAwaiting("start");
    setVisibleMonthState(
      startOfMonth(parseIsoDateLocal(fromValue) ?? new Date())
    );
    setHoveredIso(null);
    setOpen(true);
  }

  function handleDayClick(iso: string) {
    if (awaiting === "start") {
      setDraftFrom(iso);
      setDraftTo("");
      setAwaiting("end");
      setHoveredIso(null);
      onFromChange(iso);
      onToChange("");
      return;
    }

    // awaiting === "end"
    if (compareIso(iso, addDaysIso(draftFrom, minNights)) >= 0) {
      setDraftTo(iso);
      setAwaiting("start");
      setHoveredIso(null);
      onToChange(iso);
      return;
    }

    // clicked date can't be a valid end for the current start - restart
    setDraftFrom(iso);
    setDraftTo("");
    setAwaiting("end");
    setHoveredIso(null);
    onFromChange(iso);
    onToChange("");
  }

  const effectiveMinIso = fromMinDate || "";

  function isDisabled(iso: string): boolean {
    if (!effectiveMinIso) return false;
    return compareIso(iso, effectiveMinIso) < 0;
  }

  const rangeEndForShading =
    draftTo || (awaiting === "end" ? hoveredIso : null);

  function isInRange(iso: string): boolean {
    if (!draftFrom || !rangeEndForShading) return false;
    const lo =
      compareIso(draftFrom, rangeEndForShading) <= 0
        ? draftFrom
        : rangeEndForShading;
    const hi =
      compareIso(draftFrom, rangeEndForShading) <= 0
        ? rangeEndForShading
        : draftFrom;
    return compareIso(iso, lo) >= 0 && compareIso(iso, hi) <= 0;
  }

  function isRangeStart(iso: string): boolean {
    return Boolean(draftFrom) && iso === draftFrom;
  }

  function isRangeEnd(iso: string): boolean {
    return Boolean(draftTo) && iso === draftTo;
  }

  const minMonth = useMemo(() => {
    const minDate = effectiveMinIso ? parseIsoDateLocal(effectiveMinIso) : null;
    return minDate ? startOfMonth(minDate) : null;
  }, [effectiveMinIso]);

  const canPagePrev =
    !minMonth || compareIso(toIsoDateLocal(addMonths(visibleMonth, -1)), toIsoDateLocal(minMonth)) >= 0;

  function pageMonths(delta: number) {
    setVisibleMonthState((prev) => addMonths(prev, delta));
  }

  const secondMonth = addMonths(visibleMonth, 1);

  const displayText =
    fromValue && toValue
      ? `${formatDisplayDate(fromValue)} – ${formatDisplayDate(toValue)}`
      : formatDisplayDate(fromValue);

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
              const inRange = !disabled && isInRange(cell.iso);
              const isStart = isRangeStart(cell.iso);
              const isEnd = isRangeEnd(cell.iso);

              return (
                <button
                  type="button"
                  key={cell.iso}
                  disabled={disabled}
                  aria-label={formatAriaDate(cell.iso)}
                  aria-disabled={disabled}
                  className={[
                    styles.dayCell,
                    inRange ? styles.dayCellInRange : "",
                    isStart ? styles.dayCellStart : "",
                    isEnd ? styles.dayCellEnd : "",
                  ].join(" ")}
                  onClick={() => handleDayClick(cell.iso)}
                  onMouseEnter={() => {
                    if (awaiting === "end" && !disabled) {
                      setHoveredIso(cell.iso);
                    }
                  }}
                  onMouseLeave={() => {
                    if (awaiting === "end") {
                      setHoveredIso((prev) => (prev === cell.iso ? null : prev));
                    }
                  }}
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
      onMouseEnter={cancelScheduledClose}
      onMouseLeave={scheduleClose}
    >
      <div className="oltra-label">{label}</div>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <span className={styles.triggerText} data-has-value={fromValue ? "true" : "false"}>
          {displayText || "Select dates"}
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className={`oltra-dropdown-panel ${styles.panel}`}
              style={
                panelPos
                  ? { top: panelPos.top, left: panelPos.left }
                  : { top: -9999, left: -9999 }
              }
              onMouseEnter={cancelScheduledClose}
              onMouseLeave={scheduleClose}
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

              <div className={styles.monthsRow}>
                {renderMonth(visibleMonth)}
                {renderMonth(secondMonth)}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
