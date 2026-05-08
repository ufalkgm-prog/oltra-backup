'use client'

import { useState } from 'react'
import type { CabinClass } from '@duffel/api/types'

interface SearchForm {
  origin: string
  destination: string
  departureDate: string
  returnDate: string
  adults: number
  cabinClass: CabinClass
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any

export default function FlightsTestPage() {
  const [form, setForm] = useState<SearchForm>({
    origin: 'LHR',
    destination: 'JFK',
    departureDate: '2026-08-01',
    returnDate: '',
    adults: 1,
    cabinClass: 'business',
  })
  const [result, setResult] = useState<AnyJson>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runSearch() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/flights/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          returnDate: form.returnDate || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Unknown error')
      else setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const field = (
    label: string,
    key: keyof SearchForm,
    type: 'text' | 'date' | 'number' = 'text'
  ) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>{label}</span>
      <input
        type={type}
        value={form[key] as string | number}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]: type === 'number' ? Number(e.target.value) : e.target.value,
          }))
        }
        style={{ padding: '6px 10px', border: '1px solid #333', borderRadius: 6, background: '#111', color: '#fff', width: 180 }}
      />
    </label>
  )

  return (
    <div style={{ fontFamily: 'monospace', padding: 40, background: '#0a0a0a', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Duffel flights — search test</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32 }}>
        Hits <code>POST /api/flights/search</code> directly. Results cached 15 min per param set.
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        {field('Origin (IATA)', 'origin')}
        {field('Destination (IATA)', 'destination')}
        {field('Departure date', 'departureDate', 'date')}
        {field('Return date (optional)', 'returnDate', 'date')}
        {field('Adults', 'adults', 'number')}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Cabin class</span>
          <select
            value={form.cabinClass}
            onChange={(e) => setForm((f) => ({ ...f, cabinClass: e.target.value as CabinClass }))}
            style={{ padding: '6px 10px', border: '1px solid #333', borderRadius: 6, background: '#111', color: '#fff' }}
          >
            {(['economy', 'premium_economy', 'business', 'first'] as CabinClass[]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <button
        onClick={runSearch}
        disabled={loading}
        style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
      >
        {loading ? 'Searching…' : 'Search'}
      </button>

      {error && (
        <p style={{ marginTop: 20, color: '#f87171' }}>Error: {error}</p>
      )}

      {result && (
        <div style={{ marginTop: 28 }}>
          <p style={{ color: '#86efac', marginBottom: 12 }}>
            {result.cached ? '(cached) ' : ''}{result.offers?.length ?? 0} offers returned
          </p>
          {result.offers?.slice(0, 3).map((offer: AnyJson) => (
            <div key={offer.id} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 4 }}>
                {offer.id}
              </div>
              <div style={{ fontSize: 15 }}>
                {offer.total_amount} {offer.total_currency}
                {' · '}
                {offer.owner?.name ?? 'Unknown airline'}
              </div>
            </div>
          ))}
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', color: '#888', fontSize: 13 }}>Raw JSON (first offer)</summary>
            <pre style={{ fontSize: 11, color: '#ccc', overflow: 'auto', marginTop: 8 }}>
              {JSON.stringify(result.offers?.[0] ?? result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
