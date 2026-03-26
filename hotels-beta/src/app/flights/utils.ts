export function formatDateLabel(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function travellersLabel(adults: number, children: number, infants: number) {
  const parts = [`${adults} adult${adults > 1 ? "s" : ""}`];
  if (children > 0) parts.push(`${children} child${children > 1 ? "ren" : ""}`);
  if (infants > 0) parts.push(`${infants} infant${infants > 1 ? "s" : ""}`);
  return parts.join(" · ");
}