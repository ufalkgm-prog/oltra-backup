import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEnglishLabels, englishLabelExpression } from './englishLabels.ts'

/* Every expression below is a real `text-field` taken from MapTiler's
 * streets-v4 style on 2026-09-21, not an invented one — the point of the pass
 * is that it handles the shapes that style actually ships. */

const ENGLISH_FIRST = ['coalesce', ['get', 'name:en'], ['get', 'name']]

test('the legacy "{name}" token becomes an English preference', () => {
  // 22 of the 54 label layers: Ocean labels, Food, Sport, Tree name…
  assert.deepEqual(englishLabelExpression('{name}'), ENGLISH_FIRST)
})

test('a layer that already prefers English is left exactly as it was', () => {
  const before = ['coalesce', ['get', 'name:en'], ['get', 'name']]
  assert.deepEqual(englishLabelExpression(before), before)
})

test('running the pass twice changes nothing the second time', () => {
  const once = englishLabelExpression('{name}')
  assert.deepEqual(englishLabelExpression(once), once)
})

test('coalesce(name, "") gains the English name in front', () => {
  // Ferry terminal, Subway station, Railway station.
  assert.deepEqual(englishLabelExpression(['coalesce', ['get', 'name'], '']), [
    'coalesce',
    ENGLISH_FIRST,
    '',
  ])
})

test('a backwards coalesce(name, name:en) ends up English first', () => {
  /* State labels z7 and z9 had the local name first and English only as a
   * fallback, which is the opposite of what it looks like. */
  const fixed = englishLabelExpression(['coalesce', ['get', 'name'], ['get', 'name:en']])
  assert.deepEqual(fixed, ['coalesce', ENGLISH_FIRST, ['get', 'name:en']])
  // The first thing consulted is now the English name.
  assert.deepEqual((fixed as unknown[])[1], ENGLISH_FIRST)
})

test('airport labels keep their IATA code at low zoom', () => {
  /* The case that rules out rewriting the whole text-field: wrapping this in
   * an English preference would show the airport's name at every zoom and
   * lose the code the low zooms are there to show. Only the inner name moves. */
  const before = [
    'step',
    ['zoom'],
    ['coalesce', ['get', 'iata'], ['get', 'icao'], ''],
    12,
    ['coalesce', ['get', 'name'], ['get', 'iata'], ['get', 'icao'], ''],
  ]
  const after = englishLabelExpression(before) as unknown[]

  // The low-zoom branch is untouched.
  assert.deepEqual(after[2], ['coalesce', ['get', 'iata'], ['get', 'icao'], ''])
  // The high-zoom branch prefers English.
  assert.deepEqual(after[4], [
    'coalesce',
    ENGLISH_FIRST,
    ['get', 'iata'],
    ['get', 'icao'],
    '',
  ])
})

test('state labels keep their abbreviation at the zooms that use one', () => {
  const before = [
    'step',
    ['zoom'],
    ['get', 'abbrev'],
    4,
    ['coalesce', ['get', 'name'], ['get', 'name:en']],
  ]
  const after = englishLabelExpression(before) as unknown[]
  assert.deepEqual(after[2], ['get', 'abbrev'])
  assert.deepEqual(after[4], ['coalesce', ENGLISH_FIRST, ['get', 'name:en']])
})

test('fields that carry no name are not touched', () => {
  for (const field of ['{ref}', '{number}', '{name:en}', ['to-string', ['get', 'ref']]]) {
    assert.deepEqual(englishLabelExpression(field), field)
  }
})

test('a mixed template is left alone rather than half-parsed', () => {
  assert.deepEqual(englishLabelExpression('{ref} {name}'), '{ref} {name}')
})

test('the transport layer keeps its blank-label rule', () => {
  const before = [
    'case',
    ['match', ['get', 'subclass'], ['charging_station', 'bicycle_parking'], true, false],
    '',
    ['get', 'name'],
  ]
  assert.deepEqual(englishLabelExpression(before), [
    'case',
    ['match', ['get', 'subclass'], ['charging_station', 'bicycle_parking'], true, false],
    '',
    ENGLISH_FIRST,
  ])
})

test('applyEnglishLabels rewrites only the layers that change', () => {
  const written: { layer: string; value: unknown }[] = []
  const map = {
    getStyle: () => ({
      layers: [
        { id: 'Food', layout: { 'text-field': '{name}' } },
        { id: 'Sea labels', layout: { 'text-field': ENGLISH_FIRST } },
        { id: 'Road shields', layout: { 'text-field': '{ref}' } },
        { id: 'Building number', layout: { 'text-field': '{number}' } },
        { id: 'Water', layout: {} },
        { id: 'Background' },
      ],
    }),
    setLayoutProperty: (layer: string, _property: string, value: unknown) =>
      void written.push({ layer, value }),
  }

  applyEnglishLabels(map)

  assert.deepEqual(
    written.map((entry) => entry.layer),
    ['Food']
  )
  assert.deepEqual(written[0].value, ENGLISH_FIRST)
})

test('one layer refusing its expression does not stop the rest', () => {
  const written: string[] = []
  const map = {
    getStyle: () => ({
      layers: [
        { id: 'bad', layout: { 'text-field': '{name}' } },
        { id: 'good', layout: { 'text-field': '{name}' } },
      ],
    }),
    setLayoutProperty: (layer: string) => {
      if (layer === 'bad') throw new Error('nope')
      written.push(layer)
    },
  }

  applyEnglishLabels(map)
  assert.deepEqual(written, ['good'])
})

test('a style with no layers yet is survivable', () => {
  assert.doesNotThrow(() =>
    applyEnglishLabels({ getStyle: () => undefined, setLayoutProperty: () => {} })
  )
})
