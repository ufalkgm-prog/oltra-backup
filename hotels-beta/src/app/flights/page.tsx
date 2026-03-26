import PageShell from "@/components/site/PageShell";
import FlightsView from "./ui/FlightsView";

export default function FlightsPage() {
  return (
    <PageShell current="Flights">
      <FlightsView />
    </PageShell>
  );
}