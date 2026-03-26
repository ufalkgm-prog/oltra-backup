import MembersShell from "../ui/MembersShell";
import FavoriteRestaurantsView from "../ui/FavoriteRestaurantsView";

export default function FavoriteRestaurantsPage() {
  return (
    <MembersShell title="FAVORITE RESTAURANTS">
      <FavoriteRestaurantsView />
    </MembersShell>
  );
}