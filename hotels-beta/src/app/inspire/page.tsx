import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import InspireView from "./ui/InspireView";
import { buildInspireCities } from "@/lib/inspire/buildInspireCities";

export const metadata: Metadata = {
  title: "Inspire",
  description: "Discover where to go based on season, purpose, and travel radius.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InspirePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [cities, params] = await Promise.all([buildInspireCities(), searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  return (
    <PageShell current="Inspire">
      <InspireView
        cities={cities}
        initial={{
          month: one(params.month),
          purpose: one(params.purpose),
          hours: one(params.hours),
          from: one(params.from),
        }}
      />
    </PageShell>
  );
}