'use client'

import { useEffect, useRef, useState } from 'react'
import type { AirportOption } from '@/lib/airportOptions'
import { useDropdownDismiss } from '@/lib/useDropdownDismiss'
import styles from './FlightsView.module.css'

type Props = {
  label: string
  value: string
  /** `option` is present whenever the user picked from the list, so callers can
   * remember the airport's label/city without pulling in the full dataset
   * themselves (see the dynamic import below). */
  onChange: (code: string, option?: AirportOption) => void
}

// The generated airport list is ~4k entries / ~300KB of source, and this is
// the only place that needs all of it. Importing it statically put the whole
// thing in the initial bundle of every page that renders a search form,
// including the landing page — where this component is only mounted once the
// home-airport popover is opened. Loading it on mount instead keeps it out of
// the critical path; the module is cached after the first load.
let cachedOptions: AirportOption[] | null = null

export default function AirportAutocomplete({ label, value, onChange }: Props) {
  const [options, setOptions] = useState<AirportOption[] | null>(cachedOptions)
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cachedOptions) return
    let cancelled = false
    import('@/lib/airportOptions').then(mod => {
      cachedOptions = mod.AIRPORT_OPTIONS
      if (!cancelled) setOptions(mod.AIRPORT_OPTIONS)
    })
    return () => { cancelled = true }
  }, [])

  // Falls back to the bare code until the list resolves, so a preselected
  // airport still renders something meaningful on first paint.
  useEffect(() => {
    setText(options?.find(o => o.value === value)?.label ?? value)
  }, [value, options])

  const dismissHoverProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: containerRef,
  })

  // AIRPORT_OPTIONS covers every scheduled-service airport worldwide and is
  // ordered largest-first, so taking the first 8 matches surfaces the major
  // airports for a broad query like "lon" while still finding a small regional
  // field once the query is specific enough. `city` is matched separately from
  // `label` because the label omits the city when the airport's own name
  // already implies it.
  const query = text.toLowerCase().trim()
  const matches = options && query.length >= 2
    ? options.filter(o =>
        o.label.toLowerCase().includes(query) ||
        o.city.toLowerCase().includes(query) ||
        o.value.toLowerCase().startsWith(query)
      ).slice(0, 8)
    : []

  function handleFocus() {
    setText('')
    setOpen(false)
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      data-oltra-control="true"
      {...dismissHoverProps}
    >
      <label className="oltra-label">{label}</label>
      <input
        ref={inputRef}
        className="oltra-input"
        value={text}
        placeholder="Type 2+ letters…"
        onChange={e => { setText(e.target.value); setOpen(e.target.value.trim().length >= 2) }}
        onFocus={handleFocus}
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
                  onChange(opt.value, opt)
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
