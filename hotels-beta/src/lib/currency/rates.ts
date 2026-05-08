type Rates = Record<string, number>

let cache: { rates: Rates; fetchedAt: number } | null = null
const TTL_MS = 60 * 60 * 1000 // 1 hour — ECB rates update once daily

const SUPPORTED = ['USD', 'GBP', 'CHF']
const FALLBACK: Rates = { EUR: 1, USD: 1.08, GBP: 0.86, CHF: 0.94, AED: 3.97 }
// AED is pegged to USD at a fixed rate of 3.6725 USD/AED
const AED_PER_USD = 3.6725

export async function getExchangeRates(): Promise<Rates> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates

  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=EUR&to=${SUPPORTED.join(',')}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) throw new Error(`frankfurter ${res.status}`)
    const data = (await res.json()) as { rates: Record<string, number> }
    const rates: Rates = {
      EUR: 1,
      ...data.rates,
      AED: (data.rates.USD ?? FALLBACK.USD) * AED_PER_USD,
    }
    cache = { rates, fetchedAt: Date.now() }
    return rates
  } catch {
    return FALLBACK
  }
}
