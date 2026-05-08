'use client'

import { useEffect, useState } from 'react'

type Rates = Record<string, number>

const STORAGE_KEY = 'oltra_currency'
const FALLBACK: Rates = { EUR: 1, USD: 1.08, GBP: 0.86, CHF: 0.94, AED: 3.97 }

// Module-level cache shared across all hook instances in the same page
let ratesCache: Rates | null = null

export function useCurrency() {
  const [currency, setCurrency] = useState<string>('EUR')
  const [rates, setRates] = useState<Rates>(ratesCache ?? FALLBACK)

  // Read initial currency from localStorage after hydration
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setCurrency(stored)
  }, [])

  // Listen for header currency changes
  useEffect(() => {
    function onCurrencyChange(e: Event) {
      const next = (e as CustomEvent<{ currency?: string }>).detail?.currency
      if (next) setCurrency(next)
    }
    window.addEventListener('oltra:currency-change', onCurrencyChange)
    return () => window.removeEventListener('oltra:currency-change', onCurrencyChange)
  }, [])

  // Fetch live rates once per page load
  useEffect(() => {
    if (ratesCache) { setRates(ratesCache); return }
    fetch('/api/currency/rates')
      .then(r => r.json())
      .then((data: { rates?: Rates }) => {
        if (data.rates) {
          ratesCache = data.rates
          setRates(data.rates)
        }
      })
      .catch(() => {})
  }, [])

  function convert(amount: number, fromCurrency = 'EUR'): number {
    if (fromCurrency === currency) return amount
    const inEur = fromCurrency === 'EUR' ? amount : amount / (rates[fromCurrency] ?? 1)
    return currency === 'EUR' ? inEur : inEur * (rates[currency] ?? 1)
  }

  function format(amount: number, fromCurrency = 'EUR'): string {
    return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(
      convert(amount, fromCurrency)
    )
  }

  return { currency, convert, format }
}
