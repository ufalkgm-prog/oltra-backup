import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import FlightsView from "./ui/FlightsView";

export const metadata: Metadata = {
  title: "Flights",
  description: "Search and book luxury flights.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <PageShell current="Flights" background="/images/background5.jpg">
      <FlightsView searchParams={resolvedSearchParams} />
    </PageShell>
  );
}