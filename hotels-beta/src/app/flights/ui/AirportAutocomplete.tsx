'use client'

import { useEffect, useRef, useState } from 'react'
import { AIRPORT_OPTIONS } from '@/lib/airportOptions'
import styles from './FlightsView.module.css'

type Props = {
  label: string
  value: string
  onChange: (code: string) => void
}

function labelForCode(code: string): string {
  return AIRPORT_OPTIONS.find(o => o.value === code)?.label ?? code
}

export default function AirportAutocomplete({ label, value, onChange }: Props) {
  const [text, setText] = useState(() => labelForCode(value))
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setText(labelForCode(value))
  }, [value])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const query = text.toLowerCase().trim()
  const matches = query.length >= 2
    ? AIRPORT_OPTIONS.filter(o =>
        o.label.toLowerCase().includes(query) ||
        o.value.toLowerCase().startsWith(query)
      ).slice(0, 8)
    : []

  return (
    <div ref={containerRef} style={{ position: 'relative' }} data-oltra-control="true">
      <label className="oltra-label">{label}</label>
      <input
        className="oltra-input"
        value={text}
        placeholder="Type 2+ letters…"
        onChange={e => { setText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        spellCheck={false}
      />
      {open && matches.length > 0 && (
        <div className={`oltra-dropdown-panel ${styles.autocompletePanel}`}>
          <div className="oltra-dropdown-list">
            {matches.map(opt => (
              <button
                key={opt.value}
                type="button"
                className="oltra-dropdown-item"
                role="option"
                onPointerDown={e => {
                  e.preventDefault()
                  onChange(opt.value)
                  setText(opt.label)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
