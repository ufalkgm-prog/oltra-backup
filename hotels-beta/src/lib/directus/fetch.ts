// src/lib/directus/fetch.ts
type Opts = {
  params?: Record<string, string>;
  revalidate?: number;
  /**
   * If true, do NOT attach Authorization header even if a token exists.
   * Useful for public endpoints/collections.
   */
  public?: boolean;
};

function getDirectusToken(): string | undefined {
  // Support common naming conventions so we don't "accidentally" run without auth.
  return (
    process.env.DIRECTUS_TOKEN ||
    process.env.DIRECTUS_ACCESS_TOKEN ||
    process.env.DIRECTUS_API_TOKEN ||
    process.env.DIRECTUS_STATIC_TOKEN
  );
}

export async function directusFetch<T>(
  path: string,
  { params, revalidate = 60, public: isPublic = false }: Opts = {}
): Promise<T> {
  const base = process.env.DIRECTUS_URL;
  if (!base) throw new Error("DIRECTUS_URL is not set");

  const token = getDirectusToken();

  const url = new URL(path, base);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!isPublic && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    headers,
    next: { revalidate },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const snippet = body ? body.slice(0, 400) : "";
    throw new Error(
      `Directus fetch failed: ${res.status} ${res.statusText} — ${url.pathname}${url.search}\n${snippet}`
    );
  }

  return (await res.json()) as T;
}