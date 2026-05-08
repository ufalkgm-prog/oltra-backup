import { NextResponse } from 'next/server'
import { getExchangeRates } from '@/lib/currency/rates'

export async function GET() {
  const rates = await getExchangeRates()
  return NextResponse.json(
    { ok: true, rates },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
  )
}
