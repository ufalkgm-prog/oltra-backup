import { NextRequest, NextResponse } from 'next/server'
import { getDuffel } from '@/lib/flights/duffelClient'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id?.startsWith('off_')) {
    return NextResponse.json({ ok: false, error: 'Invalid offer ID' }, { status: 400 })
  }

  try {
    const duffel = getDuffel()
    const response = await duffel.offers.get(id)
    return NextResponse.json({ ok: true, offer: response.data })
  } catch (err) {
    console.error('[Duffel offer]', err)
    const message = err instanceof Error ? err.message : 'Could not retrieve offer'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
