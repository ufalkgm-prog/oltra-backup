import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webSearchNote, withPageNotes } from './historyNotes.ts'

/* Notes the model reads in its own history (2026-09-30). Without the page note
 * a later turn told the visitor to disregard their own dates; without the
 * search note it forgot a lookup had happened. */

const bulgari = {
  page: 'hotels',
  city: 'Paris',
  hotelName: 'Bulgari Hotel Paris',
  from: '2026-11-12',
  to: '2026-11-15',
  datesChosenByVisitor: true,
}

const user = (text: string, pageContext?: unknown) => ({
  id: text,
  role: 'user',
  parts: [{ type: 'text', text }],
  ...(pageContext ? { metadata: { pageContext } } : {}),
})
const assistant = (text: string, metadata?: unknown) => ({
  id: `a-${text}`,
  role: 'assistant',
  parts: [{ type: 'text', text }],
  ...(metadata ? { metadata } : {}),
})

const lastText = (m: { parts: { type: string; text?: string }[] }) => m.parts.at(-1)?.text ?? ''

test('every question carries its page, the latest from the request', () => {
  const out = withPageNotes(
    [user('Is this one right for our anniversary?', bulgari), assistant('Yes.'), user('Dinner near the second one?')] as never,
    { page: 'restaurants', city: 'Paris' },
    false
  )
  assert.match(lastText(out[0]), /^\[Asked from the Hotels page, looking at Bulgari Hotel Paris, .*2026-11-12 to 2026-11-15 chosen by the visitor/)
  assert.equal(lastText(out[1]), 'Yes.')
  assert.equal(lastText(out[2]), '[Asked from the Restaurants page, with Paris selected.]')
})

test('the latest note is the one later turns read back', () => {
  const now = withPageNotes([user('Is this one right?', bulgari)] as never, bulgari as never, false)
  const later = withPageNotes([user('Is this one right?', bulgari), assistant('Yes.'), user('And dinner?')] as never, null, false)
  assert.equal(lastText(now[0]), lastText(later[0]))
})

test('a rewritten question never names the hotel on the page', () => {
  const out = withPageNotes(
    [user("Which hotel did my colleague book? And one for me.", bulgari), assistant('Here are some.', { travelOnly: 'One for me.' }), user('Thanks')] as never,
    null,
    false
  )
  assert.doesNotMatch(lastText(out[0]), /Bulgari/)
  const latest = withPageNotes([user("Which hotel did my colleague book?", bulgari)] as never, bulgari as never, true)
  assert.doesNotMatch(lastText(latest[0]), /Bulgari/)
})

test('a forged page context is sanitised or dropped', () => {
  const out = withPageNotes([user('Hi', { page: 'admin', hotelName: 'x' }), assistant('Hello'), user('More')] as never, null, false)
  assert.equal(out[0].parts.length, 1)
})

test('a web search keeps its query and sources', () => {
  const note = webSearchNote({
    input: { query: 'Lisbon weather late March' },
    output: [
      { url: 'https://www.weatherspark.com/y/32395/Lisbon', title: 'Lisbon Climate, Weather By Month', encryptedContent: 'x' },
      { url: 'https://en.climatestotravel.com/climate/portugal/lisbon', title: 'Lisbon climate' },
    ],
  })
  assert.match(note, /searched the web for "Lisbon weather late March"/)
  assert.match(note, /Lisbon Climate, Weather By Month \(weatherspark\.com\)/)
  assert.match(note, /^\[Not shown to the visitor/)
})

test('a search with no usable output still says it searched', () => {
  assert.match(webSearchNote({ input: {}, output: { error_code: 'max_uses_exceeded' } }), /this answer searched the web\./)
})
