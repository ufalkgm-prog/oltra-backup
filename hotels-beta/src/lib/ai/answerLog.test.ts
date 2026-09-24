import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAnswerLog } from './answerLog.ts'

/* One record per answer for the monitoring agent (2026-09-24). What matters:
 * it never carries the member's question, it records what reached the pages
 * and what the searches used, and a triage reply is logged as a decline. */

const base = {
  memberHash: 'abc123',
  page: 'landing',
  turn: 1,
  model: 'claude-opus-5',
  triageLabel: 'TRAVEL',
  removedKind: null,
  durationMs: 42000.4,
}

test('an answer that presented results', () => {
  const log = buildAnswerLog({
    ...base,
    finishReason: 'tool-calls',
    usage: { inputTokens: 9000, outputTokens: 1200, inputTokenDetails: { cacheReadTokens: 7000 } },
    steps: [
      { toolCalls: [{ toolName: 'searchFlights', input: { origin: 'CPH', destination: 'JFK', adults: 1, cabinClass: 'first' } }] },
      {
        toolCalls: [
          {
            toolName: 'presentResults',
            input: {
              framing: 'One-way on 14 November, first class, for one.',
              flights: [{ origin: 'CPH', destination: 'JFK', departureDate: '2026-11-14', cabin: 'first', details: 'free text' }],
            },
          },
        ],
      },
    ],
  })
  assert.equal(log.presented, true)
  assert.equal(log.flight_count, 1)
  assert.deepEqual(log.tools, ['searchFlights', 'presentResults'])
  assert.equal(log.duration_ms, 42000)
  assert.equal(log.cache_read_tokens, 7000)
  assert.equal(log.framing, 'One-way on 14 November, first class, for one.')
  // No stay passed, but the search's party is on record for comparison.
  assert.equal(log.stay, null)
  assert.equal(log.search_party?.flightAdults, 1)
  // Only named fields are kept from a leg; its free-text details are not.
  assert.deepEqual(log.flights, [{ origin: 'CPH', destination: 'JFK', departureDate: '2026-11-14', cabin: 'first' }])
})

test('a prose answer with nothing presented', () => {
  const log = buildAnswerLog({
    ...base,
    steps: [{ toolCalls: [{ toolName: 'searchHotels', input: { area: 'Bali', stay: { adults: 2, rooms: 1 } } }] }, { text: 'Three I would point you to…' }],
  })
  assert.equal(log.presented, false)
  assert.equal(log.hotel_count, 0)
  assert.equal(log.answer_text, 'Three I would point you to…')
  assert.deepEqual(log.search_party, { adults: 2, rooms: 1 })
})

test('a budget the search used is on record', () => {
  const log = buildAnswerLog({
    ...base,
    steps: [{ toolCalls: [{ toolName: 'searchHotels', input: { city: 'Lisbon', stay: { adults: 2, maxPricePerStay: 2400, currency: 'EUR' } } }] }],
  })
  assert.deepEqual(log.search_party, { adults: 2, maxPricePerStay: 2400, currency: 'EUR' })
})

test('a triage decline is logged as one, with its reply', () => {
  const log = buildAnswerLog({ ...base, triageLabel: 'OTHER', declineReply: "I'm afraid I can only help with travel." })
  assert.equal(log.declined, true)
  assert.equal(log.steps, 0)
  assert.equal(log.answer_text, "I'm afraid I can only help with travel.")
})

test('the record has no field for the question', () => {
  const log = buildAnswerLog({ ...base, steps: [] })
  for (const key of Object.keys(log)) assert.ok(!/question|prompt|message/i.test(key), key)
})
