import PageShell from "@/components/site/PageShell";
import FlightsView from "./ui/FlightsView";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <PageShell current="Flights">
      <FlightsView searchParams={resolvedSearchParams} />
    </PageShell>
  );
}