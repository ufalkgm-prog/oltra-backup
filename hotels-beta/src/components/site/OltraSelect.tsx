"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
};

type Props = {
  name: string;
  value?: string;
  placeholder: string;
  options: Option[];
  className?: string;
  align?: "center" | "left";
  onValueChange?: (value: string) => void;
};

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="pointer-events-none h-3 w-3 shrink-0 opacity-90"
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

export default function OltraSelect({
  name,
  value = "",
  placeholder,
  options,
  className = "",
  align = "center",
  onValueChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function handlePointerOver(event: PointerEvent) {
      if (!open) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (rootRef.current?.contains(target)) return;

      const hoveredInteractive = target.closest(
        'input, button, select, textarea, [role="button"], [data-oltra-control="true"]'
      );

      if (hoveredInteractive) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerover", handlePointerOver);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerover", handlePointerOver);
    };
  }, [open]);

  const selected = useMemo(
    () => options.find((opt) => opt.value === selectedValue),
    [options, selectedValue]
  );

  const displayLabel =
    selectedValue === "" || (name === "kids" && selectedValue === "0")
      ? placeholder
      : selected?.label ?? placeholder;

  const justifyClass =
    align === "center"
      ? "justify-center text-center"
      : "justify-start text-left";

  function selectValue(nextValue: string) {
    setSelectedValue(nextValue);

    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = nextValue;
      hiddenInputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }

    onValueChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={`relative z-20 overflow-visible ${className}`}
      data-oltra-control="true"
    >
      <input ref={hiddenInputRef} type="hidden" name={name} value={selectedValue} />

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={[
          "oltra-select relative flex w-full items-center gap-2 pr-3",
          justifyClass,
          selectedValue ? "text-white" : "text-white/62",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="block min-w-0 flex-1 truncate leading-[1.2]">
          {displayLabel}
        </span>
        <ChevronDown />
      </button>

      {open ? (
        <div className="oltra-dropdown-panel absolute left-0 right-0 top-[calc(100%+8px)] z-[500] overflow-hidden">
          <div
            className="oltra-dropdown-list max-h-[var(--oltra-dropdown-list-max-height)] overflow-y-auto"
            role="listbox"
          >
            {options.map((opt) => {
              const active = opt.value === selectedValue;

              return (
                <button
                  key={`${name}-${opt.value || "empty"}`}
                  type="button"
                  onClick={() => selectValue(opt.value)}
                  className={[
                    "oltra-dropdown-item",
                    justifyClass,
                    active ? "bg-white/10 text-white" : "",
                  ].join(" ")}
                  role="option"
                  aria-selected={active}
                >
                  <span className="block w-full whitespace-nowrap">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}