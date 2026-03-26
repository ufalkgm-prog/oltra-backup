import type { ReactNode } from "react";
import SiteHeader from "./SiteHeader";

type PageShellProps = {
  current?: string;
  children: ReactNode;
  disableBackground?: boolean;
};

export default function PageShell({
  current = "",
  children,
  disableBackground = false,
}: PageShellProps) {
  return (
    <main className="oltra-page">
      {!disableBackground ? <div className="oltra-page__bg" /> : null}
      <div className="oltra-page__header-bg" />

      <SiteHeader current={current} />

      <section className="oltra-page__content">{children}</section>
    </main>
  );
}