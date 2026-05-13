"use client";

import { useEffect, useRef, useState } from "react";

const IMAGES = Array.from({ length: 49 }, (_, i) =>
  `/images/landing/landing-${String(i + 1).padStart(2, "0")}.jpg`
);

const SLIDE_MS = 5000;
const FADE_MS = 1200;
const GAP = 20;

type MotionMode = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "fly-over";

const MOTIONS: MotionMode[] = [
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "fly-over",
];

function randomMotion(): MotionMode {
  return MOTIONS[Math.floor(Math.random() * MOTIONS.length)];
}

function shuffleAll(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a full shuffle of all 49 indices, ensuring the first GAP positions
// don't repeat any of the previous cycle's last GAP images. Guarantees at
// least GAP unique images between any repeat across the cycle boundary.
function buildCycle(prevTail: number[]): number[] {
  const all = shuffleAll(IMAGES.length);
  if (prevTail.length === 0) return all;
  const tail = new Set(prevTail);
  const block = Math.min(GAP, all.length);
  for (let i = 0; i < block; i += 1) {
    if (tail.has(all[i])) {
      for (let j = block; j < all.length; j += 1) {
        if (!tail.has(all[j])) {
          [all[i], all[j]] = [all[j], all[i]];
          break;
        }
      }
    }
  }
  return all;
}

function transformFor(mode: MotionMode, end: boolean): string {
  switch (mode) {
    case "zoom-in":
      return end ? "scale(1.12)" : "scale(1.03)";
    case "zoom-out":
      return end ? "scale(1.04)" : "scale(1.14)";
    case "pan-left":
      return end
        ? "scale(1.1) translate3d(-1.2%, 0, 0)"
        : "scale(1.06) translate3d(1.2%, 0, 0)";
    case "pan-right":
      return end
        ? "scale(1.1) translate3d(1.2%, 0, 0)"
        : "scale(1.06) translate3d(-1.2%, 0, 0)";
    case "fly-over":
      return end
        ? "scale(1.11) translate3d(1%, -0.8%, 0)"
        : "scale(1.06) translate3d(-1%, 0.8%, 0)";
    default:
      return end ? "scale(1.12)" : "scale(1.03)";
  }
}

type Slot = {
  index: number;
  motion: MotionMode;
  end: boolean;
  visible: boolean;
  animateTransform: boolean;
};

const blankSlot: Slot = {
  index: 0,
  motion: "zoom-in",
  end: false,
  visible: false,
  animateTransform: false,
};

export default function LandingBackground() {
  const [mounted, setMounted] = useState(false);
  const [slotA, setSlotA] = useState<Slot>(blankSlot);
  const [slotB, setSlotB] = useState<Slot>({ ...blankSlot, motion: "zoom-out" });

  const queueRef = useRef<number[]>([]);
  const tailRef = useRef<number[]>([]);

  function takeNextIndex(): number {
    if (queueRef.current.length === 0) {
      queueRef.current = buildCycle(tailRef.current);
    }
    const idx = queueRef.current.shift()!;
    tailRef.current = [...tailRef.current, idx].slice(-GAP);
    return idx;
  }

  useEffect(() => {
    setMounted(true);
    IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    const timeouts: number[] = [];
    const rafs: number[] = [];

    const after = (ms: number, fn: () => void) => {
      const t = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(t);
    };
    const onFrame = (fn: () => void) => {
      const r = window.requestAnimationFrame(() => {
        if (!cancelled) fn();
      });
      rafs.push(r);
    };

    queueRef.current = buildCycle([]);
    tailRef.current = [];

    // First two images: slot A (visible) and slot B (preset, hidden)
    const idx0 = takeNextIndex();
    const idx1 = takeNextIndex();
    setSlotA({
      index: idx0,
      motion: randomMotion(),
      end: false,
      visible: true,
      animateTransform: false,
    });
    setSlotB({
      index: idx1,
      motion: randomMotion(),
      end: false,
      visible: false,
      animateTransform: false,
    });

    // Arm slot A's transition, then change its target. Two RAFs so the browser
    // commits the unarmed start frame before applying the animated end frame.
    onFrame(() => {
      setSlotA((s) => ({ ...s, animateTransform: true }));
      onFrame(() => {
        setSlotA((s) => ({ ...s, end: true }));
      });
    });

    let activeSide: "A" | "B" = "A";

    function doTick() {
      if (cancelled) return;
      const incoming: "A" | "B" = activeSide === "A" ? "B" : "A";
      const outgoing = activeSide;
      const setIncoming = incoming === "A" ? setSlotA : setSlotB;
      const setOutgoing = outgoing === "A" ? setSlotA : setSlotB;

      // Cross-fade: outgoing fades to 0, incoming fades to 1.
      // The incoming slot was reset (animateTransform=false, end=false) when it
      // was last fully hidden, so its transform sits at the start of its motion.
      // Arm its transition first, then on the next frame set end=true.
      setOutgoing((s) => ({ ...s, visible: false }));
      setIncoming((s) => ({ ...s, visible: true, animateTransform: true }));
      onFrame(() => {
        setIncoming((s) => ({ ...s, end: true }));
      });

      // Once the outgoing slot is fully hidden, reset it with the next image.
      // Because animateTransform=false, the transform value snaps to the new
      // motion's start position with no visible animation.
      after(FADE_MS, () => {
        const nextIdx = takeNextIndex();
        const nextMot = randomMotion();
        setOutgoing({
          index: nextIdx,
          motion: nextMot,
          end: false,
          visible: false,
          animateTransform: false,
        });
      });

      activeSide = incoming;
      after(SLIDE_MS, doTick);
    }

    // First cross-fade fires SLIDE_MS - FADE_MS into slot A's run, so that A's
    // transform has been animating for that long when B starts to fade in.
    after(SLIDE_MS - FADE_MS, doTick);

    return () => {
      cancelled = true;
      timeouts.forEach((t) => window.clearTimeout(t));
      rafs.forEach((r) => window.cancelAnimationFrame(r));
    };
  }, [mounted]);

  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
          backgroundColor: "#0b1118",
        }}
      >
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
        backgroundColor: "#0b1118",
      }}
    >
      {([slotA, slotB] as const).map((slot, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${IMAGES[slot.index]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: slot.visible ? 1 : 0,
            transform: transformFor(slot.motion, slot.end),
            transition: slot.animateTransform
              ? `opacity ${FADE_MS}ms ease-in-out, transform ${SLIDE_MS}ms linear`
              : `opacity ${FADE_MS}ms ease-in-out`,
            willChange: "opacity, transform",
            backfaceVisibility: "hidden",
          }}
        />
      ))}

    </div>
  );
}
