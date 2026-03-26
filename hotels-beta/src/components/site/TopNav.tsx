"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const MENU_ITEMS = [
  { label: "Hotels", href: "/hotels" },
  { label: "Restaurants", href: "/restaurants" },
  { label: "Villas", href: "/villas" },
  { label: "Yachts", href: "/yachts" },
  { label: "Inspire", href: "/inspire" },
];

export default function TopNav() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="absolute left-0 top-0 z-50 w-full">
      <div className="flex items-center justify-between px-6 py-5 md:px-10">
        <Link
          href="/"
          className="text-sm uppercase tracking-[0.35em] text-white"
        >
          OLTRA
        </Link>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md transition hover:bg-white/15"
          >
            <span className="flex flex-col gap-1.5">
              <span className="block h-[1.5px] w-5 bg-white" />
              <span className="block h-[1.5px] w-5 bg-white" />
              <span className="block h-[1.5px] w-5 bg-white" />
            </span>
          </button>

          {open ? (
            <div className="absolute right-0 mt-3 w-64 rounded-[24px] border border-white/20 bg-black/45 p-3 text-white shadow-2xl backdrop-blur-xl">
              <nav className="flex flex-col">
                {MENU_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-2xl px-4 py-3 text-sm transition hover:bg-white/10"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-2 border-t border-white/15 pt-2">
                <button
                  type="button"
                  className="w-full rounded-2xl px-4 py-3 text-left text-sm text-white/85 transition hover:bg-white/10"
                >
                  Login
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}