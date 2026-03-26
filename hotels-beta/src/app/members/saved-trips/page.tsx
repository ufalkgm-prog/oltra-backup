import MembersShell from "../ui/MembersShell";
import SavedTripsView from "../ui/SavedTripsView";

export default function SavedTripsPage() {
  return (
    <MembersShell title="SAVED TRIPS">
      <SavedTripsView />
    </MembersShell>
  );
}