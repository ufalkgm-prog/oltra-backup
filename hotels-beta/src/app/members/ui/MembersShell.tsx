"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type MembersNavItem = {
  href: string;
  label: string;
};

const MEMBERS_NAV: MembersNavItem[] = [
  { href: "/members/personal-information", label: "PERSONAL INFORMATION" },
  { href: "/members/saved-trips", label: "SAVED TRIPS" },
  { href: "/members/favorite-hotels", label: "FAVORITE HOTELS" },
  { href: "/members/favorite-restaurants", label: "FAVORITE RESTAURANTS" },
  { href: "/members/feedback-suggest", label: "FEEDBACK / SUGGEST" },
  { href: "/members/review", label: "REVIEW" },
];

export default function MembersShell({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="members-page-shell">
      <aside className="oltra-glass members-sidebar">
        <div className="members-sidebar__inner">
          <nav className="members-nav" aria-label="Members navigation">
            {MEMBERS_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`members-nav__item ${isActive ? "is-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <section className="members-main">
        {title ? (
          <div className="oltra-route-label members-content-label">{title}</div>
        ) : null}
        {children}
      </section>
    </div>
  );
}