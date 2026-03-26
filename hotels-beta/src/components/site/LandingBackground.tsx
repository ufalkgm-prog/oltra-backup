"use client";

import { useEffect, useState } from "react";

const IMAGES = [
  "/images/landing/landing-01.jpg",
  "/images/landing/landing-02.jpg",
  "/images/landing/landing-03.jpg",
  "/images/landing/landing-04.jpg",
  "/images/landing/landing-05.jpg",
  "/images/landing/landing-06.jpg",
  "/images/landing/landing-07.jpg",
  "/images/landing/landing-08.jpg",
  "/images/landing/landing-09.jpg",
  "/images/landing/landing-10.jpg",
  "/images/landing/landing-11.jpg",
  "/images/landing/landing-12.jpg",
  "/images/landing/landing-13.jpg",
  "/images/landing/landing-14.jpg",
  "/images/landing/landing-15.jpg",
  "/images/landing/landing-16.jpg",
  "/images/landing/landing-17.jpg",
  "/images/landing/landing-18.jpg",
  "/images/landing/landing-19.jpg",
  "/images/landing/landing-20.jpg",
];

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

function motionFor(index: number): MotionMode {
  return MOTIONS[index % MOTIONS.length];
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
    setNextIndex((start + 1) % IMAGES.length);
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
      const newNext = (nextIndex + 1) % IMAGES.length;

      setCurrentIndex(newCurrent);
      setNextIndex(newNext);
    }, SLIDE_MS);

    return () => {
      window.cancelAnimationFrame(startMotion);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(swapTimer);
    };
  }, [mounted, nextIndex]);

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
          transform: transformFor(motionFor(currentIndex), currentEnd),
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
          transform: transformFor(motionFor(nextIndex), nextEnd),
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