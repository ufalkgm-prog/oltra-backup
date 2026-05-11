"use client";

import { useEffect, useState } from "react";

const IMAGES = Array.from({ length: 49 }, (_, i) =>
  `/images/landing/landing-${String(i + 1).padStart(2, "0")}.jpg`
);

const SLIDE_MS = 5000;
const FADE_MS = 1200;

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

function pickRandomIndex(exclude: number): number {
  if (IMAGES.length <= 1) return 0;
  let i = Math.floor(Math.random() * IMAGES.length);
  if (i === exclude) i = (i + 1) % IMAGES.length;
  return i;
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

export default function LandingBackground() {
  const [mounted, setMounted] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [currentMotion, setCurrentMotion] = useState<MotionMode>("zoom-in");
  const [nextMotion, setNextMotion] = useState<MotionMode>("zoom-out");

  const [currentEnd, setCurrentEnd] = useState(false);
  const [nextEnd, setNextEnd] = useState(false);
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    setMounted(true);

    IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    const start = Math.floor(Math.random() * IMAGES.length);
    setCurrentIndex(start);
    setNextIndex(pickRandomIndex(start));
    setCurrentMotion(randomMotion());
    setNextMotion(randomMotion());
  }, []);

  useEffect(() => {
    if (!mounted) return;

    setCurrentEnd(false);
    setNextEnd(false);
    setShowNext(false);

    const startMotion = window.requestAnimationFrame(() => {
      setCurrentEnd(true);
    });

    const fadeTimer = window.setTimeout(() => {
      const raf1 = window.requestAnimationFrame(() => {
        setShowNext(true);

        const raf2 = window.requestAnimationFrame(() => {
          setNextEnd(true);
        });

        window.setTimeout(() => window.cancelAnimationFrame(raf2), 0);
      });

      window.setTimeout(() => window.cancelAnimationFrame(raf1), 0);
    }, SLIDE_MS - FADE_MS);

    const swapTimer = window.setTimeout(() => {
      const newCurrent = nextIndex;
      const newNext = pickRandomIndex(newCurrent);

      setCurrentIndex(newCurrent);
      setNextIndex(newNext);
      setCurrentMotion(nextMotion);
      setNextMotion(randomMotion());
    }, SLIDE_MS);

    return () => {
      window.cancelAnimationFrame(startMotion);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(swapTimer);
    };
  }, [mounted, nextIndex, nextMotion]);

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
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.34)",
          }}
        />
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
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${IMAGES[currentIndex]})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: showNext ? 0 : 1,
          transform: transformFor(currentMotion, currentEnd),
          transition: `opacity ${FADE_MS}ms ease-in-out, transform ${SLIDE_MS}ms linear`,
          willChange: "opacity, transform",
          backfaceVisibility: "hidden",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${IMAGES[nextIndex]})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: showNext ? 1 : 0,
          transform: transformFor(nextMotion, nextEnd),
          transition: `opacity ${FADE_MS}ms ease-in-out, transform ${SLIDE_MS}ms linear`,
          willChange: "opacity, transform",
          backfaceVisibility: "hidden",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.34)",
        }}
      />
    </div>
  );
}