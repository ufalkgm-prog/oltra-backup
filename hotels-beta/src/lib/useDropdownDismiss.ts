"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

type DismissRef = RefObject<HTMLElement | null>;

type UseDropdownDismissOptions = {
  open: boolean;
  onClose: () => void;
  /** One ref normally; pass more than one for a panel rendered outside the
   * trigger's DOM subtree (e.g. via a portal). Every listed ref is treated
   * as "inside" for both click-outside and hover-close purposes. A nested
   * dropdown wanting to opt out of proximity-closing (so it doesn't fight a
   * parent dropdown that owns that responsibility) should NOT include the
   * parent's ref here — instead pass closeOnHoverOutside/closeOnFocusOutside
   * as false on the nested instance and rely on DOM containment: as long as
   * the nested dropdown's markup is a real (non-portaled) descendant of the
   * parent's ref, the parent's own hover-close naturally won't fire while
   * the cursor is inside the nested one. */
  refs: DismissRef | DismissRef[];
  closeOnHoverOutside?: boolean;
  closeOnFocusOutside?: boolean;
  hoverCloseDelayMs?: number;
};

export function useDropdownDismiss({
  open,
  onClose,
  refs,
  closeOnHoverOutside = true,
  closeOnFocusOutside = true,
  hoverCloseDelayMs = 200,
}: UseDropdownDismissOptions): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const refList = Array.isArray(refs) ? refs : [refs];
  const isInside = (target: Node) =>
    refList.some((r) => r.current?.contains(target));

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(event: MouseEvent) {
      if (!isInside(event.target as Node)) onCloseRef.current();
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnFocusOutside) return;

    function handleFocusIn(event: FocusEvent) {
      if (!isInside(event.target as Node)) onCloseRef.current();
    }

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closeOnFocusOutside]);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  // Cancel any pending hover-close whenever `open` goes false for any other
  // reason (click-outside, Escape, a parent closing it) - otherwise a stale
  // timer can fire after the dropdown is already closed and, for callers
  // whose onClose is an unconditional toggle rather than a true "set
  // closed", incorrectly reopen it.
  useEffect(() => {
    if (!open) cancelScheduledClose();
    return cancelScheduledClose;
  }, [open]);

  function handleMouseEnter() {
    cancelScheduledClose();
  }

  function handleMouseLeave() {
    if (!closeOnHoverOutside) return;
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      onCloseRef.current();
    }, hoverCloseDelayMs);
  }

  return { onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave };
}
