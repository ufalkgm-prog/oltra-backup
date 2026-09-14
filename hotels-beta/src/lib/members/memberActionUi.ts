export type MemberActionKind = "trip" | "favorite";

export function getMemberActionLoginMessage(action: MemberActionKind): string {
  return action === "trip"
    ? "Log in to add to trip."
    : "Log in to add favorites.";
}