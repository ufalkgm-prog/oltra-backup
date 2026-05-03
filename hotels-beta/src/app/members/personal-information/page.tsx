import MembersShell from "../ui/MembersShell";
import PersonalInformationView from "../ui/PersonalInformationView";

export default async function PersonalInformationPage() {
  return (
    <MembersShell>
      <PersonalInformationView />
    </MembersShell>
  );
}