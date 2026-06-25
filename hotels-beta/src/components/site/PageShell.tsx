import type { ReactNode } from "react";
import SiteHeader from "./SiteHeader";

type PageShellProps = {
  current?: string;
  children: ReactNode;
  disableBackground?: boolean;
  background?: string;
};

export default function PageShell({
  current = "",
  children,
  disableBackground = false,
  background,
}: PageShellProps) {
  return (
    <main className="oltra-page">
      {!disableBackground ? (
        <div
          className="oltra-page__bg"
          style={
            background
              ? {
                  backgroundImage: `url(${background})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />
      ) : null}
      <div className="oltra-page__header-bg" />

      <SiteHeader current={current} />

      <section className="oltra-page__content">{children}</section>
    </main>
  );
}