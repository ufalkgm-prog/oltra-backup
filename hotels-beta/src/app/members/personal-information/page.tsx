import MembersShell from "../ui/MembersShell";
import PersonalInformationView from "../ui/PersonalInformationView";
import { fetchAllHotelTaxonomies } from "@/lib/directus/taxonomy";

export default async function PersonalInformationPage() {
  const taxonomies = await fetchAllHotelTaxonomies();

  const preferredHotelStyleOptions = Array.from(taxonomies.styles.entries()).map(
    ([value, label]) => ({
      value,
      label,
    })
  );

  const preferredAirlineOptions = [
    { value: "SAS", label: "SAS" },
    { value: "Lufthansa", label: "Lufthansa" },
    { value: "Emirates", label: "Emirates" },
    { value: "easyJet", label: "easyJet" },
  ];

  return (
    <MembersShell>
      <PersonalInformationView
        preferredHotelStyleOptions={preferredHotelStyleOptions}
        preferredAirlineOptions={preferredAirlineOptions}
      />
    </MembersShell>
  );
}