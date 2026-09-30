import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyCorrections, checkPresentation, correctionsFromOutput, returnedIds } from './presentGuard.ts'

/* The model test (2026-09-29/30) presented a hotel id no search had returned,
 * wrote a "placeholder" line for an id it did not present, and gave a family
 * of four dated cards with no room count. presentResults' execute now checks
 * the answer against what the tools returned, and the panel applies the
 * corrections before drawing. */

const toolResult = (value: string) => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: 'x', toolName: 'searchHotels', output: { type: 'text', value } }],
})

const history = [
  { role: 'user', content: 'Family week in Mallorca' },
  toolResult('<untrusted-data source="myoltra-hotels">\n{"hotels":[{"id":2023,"name":"A"},{"id":1538,"name":"B"}],"noRoomsForTheseDates":[{"id":1515,"name":"C"}]}\n</untrusted-data>'),
  toolResult('<untrusted-data source="availability">\n{"hotels":[{"id":1423,"available":true}]}\n</untrusted-data>'),
  toolResult('<untrusted-data source="myoltra-restaurants">\n{"nearHotelId":1318,"restaurants":[{"id":2250,"name":"D"}]}\n</untrusted-data>'),
]

test('ids come from every tool result, earlier turns included', () => {
  assert.deepEqual([...returnedIds(history)].sort(), [1318, 1423, 1515, 1538, 2023, 2250].sort())
})

test('an answer built from returned ids needs nothing', () => {
  const known = returnedIds(history)
  assert.equal(checkPresentation({ framing: 'x', hotelIds: [2023, 1538], rationales: [{ id: 2023, reason: 'r' }] }, known), null)
})

test('an id no search returned is dropped with its line', () => {
  const known = returnedIds(history)
  const input = {
    framing: 'x',
    hotelIds: [2023, 2138],
    rationales: [
      { id: 2023, reason: 'pools' },
      { id: 2138, reason: 'St. Regis' },
    ],
  }
  const c = checkPresentation(input, known)
  assert.deepEqual(c, { unknownIds: [2138] })
  const out = applyCorrections(input, c)
  assert.deepEqual(out.hotelIds, [2023])
  assert.deepEqual(out.rationales, [{ id: 2023, reason: 'pools' }])
})

test('a line for a property not presented is dropped', () => {
  const known = returnedIds(history)
  const input = { framing: 'x', hotelIds: [2023], rationales: [{ id: 2023, reason: 'r' }, { id: 1538, reason: 'placeholder' }] }
  const c = checkPresentation(input, known)
  assert.deepEqual(c, { strayRationaleIds: [1538] })
  assert.deepEqual(applyCorrections(input, c).rationales, [{ id: 2023, reason: 'r' }])
})

test('the hotel open on the page counts as known', () => {
  const known = returnedIds([])
  known.add(1500)
  assert.equal(checkPresentation({ framing: 'x', hotelIds: [1500] }, known), null)
})

test('a family of four with dates and no rooms loses the dates and is asked', () => {
  const known = returnedIds(history)
  const input = {
    framing: 'x',
    hotelIds: [2023],
    followUp: 'Shall I add flights?',
    stay: { checkIn: '2027-03-27', checkOut: '2027-04-03', adults: 2, kids: 2 },
  }
  const c = checkPresentation(input, known)
  assert.equal(c?.roomsAsked, true)
  assert.equal(c?.followUp, 'How many rooms would you need?')
  const out = applyCorrections(input, c)
  assert.equal(out.stay?.checkIn, undefined)
  assert.equal(out.stay?.adults, 2)
  assert.equal(out.followUp, 'How many rooms would you need?')
})

test('a rooms question already asked is kept', () => {
  const c = checkPresentation(
    { framing: 'x', followUp: 'How many rooms for the four of you?', stay: { checkIn: '2027-03-27', checkOut: '2027-04-03', adults: 2, kids: 2 } },
    new Set()
  )
  assert.equal(c?.roomsAsked, true)
  assert.equal(c?.followUp, undefined)
})

test('a party that fits one room, or a room count given, keeps its dates', () => {
  assert.equal(checkPresentation({ framing: 'x', stay: { checkIn: '2027-03-27', checkOut: '2027-04-03', adults: 2, kids: 1 } }, new Set()), null)
  assert.equal(checkPresentation({ framing: 'x', stay: { checkIn: '2027-03-27', checkOut: '2027-04-03', adults: 2, kids: 2, rooms: 1 } }, new Set()), null)
})

test('an answer stored before corrections existed is drawn as written', () => {
  assert.equal(correctionsFromOutput('shown'), null)
  const input = { framing: 'x', hotelIds: [1] }
  assert.equal(applyCorrections(input, correctionsFromOutput('shown')), input)
})
