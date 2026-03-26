import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import InspireView from "./ui/InspireView";
import { buildInspireCities } from "@/lib/inspire/buildInspireCities";

export const metadata: Metadata = {
  title: "Inspire — OLTRA",
  description: "Discover where to go based on season, purpose, and travel radius.",
};

export default async function InspirePage() {
  const cities = await buildInspireCities();

  return (
    <PageShell current="Inspire">
      <InspireView cities={cities} />
    </PageShell>
  );
}