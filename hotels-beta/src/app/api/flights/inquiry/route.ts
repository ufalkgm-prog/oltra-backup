import { NextRequest, NextResponse } from 'next/server'
import type { Offer } from '@duffel/api/types'
import { getDuffel } from '@/lib/flights/duffelClient'

export interface FlightInquiryRequest {
  offerId: string
  offerSnapshot: Offer
  contact: {
    name: string
    email: string
    phone?: string
  }
  notes?: string
}

export async function POST(req: NextRequest) {
  let body: FlightInquiryRequest
  try {
    body = (await req.json()) as FlightInquiryRequest
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { offerId, offerSnapshot, contact, notes } = body

  if (!offerId || !offerSnapshot || !contact?.name || !contact?.email) {
    return NextResponse.json(
      { ok: false, error: 'offerId, offerSnapshot, contact.name, and contact.email are required' },
      { status: 400 }
    )
  }

  if (!offerId.startsWith('off_')) {
    return NextResponse.json({ ok: false, error: 'Invalid offer ID' }, { status: 400 })
  }

  let latestOffer: Offer
  try {
    const duffel = getDuffel()
    const response = await duffel.offers.get(offerId)
    latestOffer = response.data
  } catch (err) {
    console.error('[Duffel inquiry – offer refresh]', err)
    const message = err instanceof Error ? err.message : 'Could not refresh offer'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }

  // TODO: wire up email delivery (e.g. Resend, SendGrid, or Nodemailer)
  // Replace this block with an actual send call once a provider is chosen.
  const emailPayload = {
    to: 'concierge@oltra.com', // replace with real concierge inbox
    subject: `Flight inquiry – ${(latestOffer.slices?.[0]?.origin as unknown as Record<string, string>)?.iata_city_code ?? ''} → ${(latestOffer.slices?.[0]?.destination as unknown as Record<string, string>)?.iata_city_code ?? ''}`,
    contact,
    notes: notes ?? '',
    offerId,
    latestPrice: latestOffer.total_amount,
    latestCurrency: latestOffer.total_currency,
    snapshotPrice: offerSnapshot.total_amount,
    snapshotCurrency: offerSnapshot.total_currency,
    latestOfferSnapshot: latestOffer,
  }

  console.log('[Duffel inquiry] email payload (delivery not yet wired up):', JSON.stringify(emailPayload, null, 2))

  return NextResponse.json({
    ok: true,
    message: 'Inquiry received — your concierge will be in touch shortly.',
    offerId,
    latestPrice: latestOffer.total_amount,
    latestCurrency: latestOffer.total_currency,
  })
}
