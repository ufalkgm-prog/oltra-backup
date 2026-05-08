import { NextRequest, NextResponse } from 'next/server'
import { getDuffel } from '@/lib/flights/duffelClient'

export async function POST(req: NextRequest) {
  let offerId: string
  try {
    const body = (await req.json()) as { offerId?: string }
    offerId = body.offerId ?? ''
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!offerId?.startsWith('off_')) {
    return NextResponse.json({ ok: false, error: 'Invalid offer ID' }, { status: 400 })
  }

  const origin = req.headers.get('origin') ?? req.nextUrl.origin

  try {
    const duffel = getDuffel()
    const session = await duffel.links.create({
      reference: `oltra-${offerId}-${Date.now()}`,
      success_url: `${origin}/flights?booking=confirmed`,
      failure_url: `${origin}/flights?booking=failed`,
      abandonment_url: `${origin}/flights`,
    })
    return NextResponse.json({ ok: true, url: session.data.url })
  } catch (err) {
    console.error('[Duffel book-link]', err)
    const message = err instanceof Error ? err.message : 'Could not create booking link'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
