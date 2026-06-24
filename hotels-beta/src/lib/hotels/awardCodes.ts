// Boolean award-flag columns on the hotels collection.
// Shared between the server-side filter builder and the client UI so the
// allow-list used for filtering always matches the codes the UI can select.
export const AWARD_CODES = [
  "forbes5",
  "michelin3keys",
  "best50",
  "cn",
  "tl100",
  "telegraph",
  "aaa5d",
] as const;

export type AwardCode = (typeof AWARD_CODES)[number];
