const SAINT_TROPEZ_ALIASES = [
  "saint tropez",
  "st tropez",
  "saint-tropez",
  "st-tropez",
  "ramatuelle",
];

function normalizeCity(value: string): string {
  return value.trim().toLowerCase();
}

export function expandCityAliases(values: string[]): string[] {
  const normalized = values.map(normalizeCity).filter(Boolean);

  const hasSaintTropezCluster = normalized.some((value) =>
    SAINT_TROPEZ_ALIASES.includes(value)
  );

  if (!hasSaintTropezCluster) {
    return values;
  }

  const out = new Set(values.filter(Boolean));
  out.add("Saint Tropez");
  out.add("Ramatuelle");

  return Array.from(out);
}