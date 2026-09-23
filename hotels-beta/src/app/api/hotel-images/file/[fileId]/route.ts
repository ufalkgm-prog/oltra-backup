import { NextRequest, NextResponse } from "next/server";

// Serves a Directus asset to the browser.
//
// Directus assets are not publicly readable — an anonymous GET /assets/{id}
// returns 403 — and the browser has no token, so the image is fetched here
// with the server token and streamed on. Directus does the resizing, so the
// width/fit/quality params are passed straight through.
//
// The alternative is a public read policy on directus_files plus the Directus
// host in next.config.ts remotePatterns, which would let the browser hit the
// bucket directly and skip this hop. That is a Directus permissions change and
// is deliberately not assumed here.

const PASS_THROUGH = ["width", "height", "fit", "quality", "format"];
const MAX_WIDTH = 3000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  // Directus file ids are UUIDs; anything else is a bad request, not a lookup.
  if (!/^[0-9a-fA-F-]{36}$/.test(fileId)) {
    return NextResponse.json({ ok: false, error: "Bad file id" }, { status: 400 });
  }

  const base = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_TOKEN;
  if (!base || !token) {
    return NextResponse.json({ ok: false, error: "Directus is not configured" }, { status: 500 });
  }

  const target = new URL(`${base}/assets/${fileId}`);
  for (const key of PASS_THROUGH) {
    const value = req.nextUrl.searchParams.get(key);
    if (!value) continue;
    if (key === "width" && Number(value) > MAX_WIDTH) continue;
    target.searchParams.set(key, value);
  }

  try {
    const upstream = await fetch(target, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ ok: false, error: "Image not available" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        // Immutable: a Directus file id never points at different bytes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("HOTEL IMAGE PROXY ERROR:", error);
    return NextResponse.json({ ok: false, error: "Image not available" }, { status: 502 });
  }
}
