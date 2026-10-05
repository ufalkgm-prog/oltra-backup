import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collapseFareBrands, type FlightLeg, type Itinerary } from './itinerary.ts'

/* One row per physical flight, at its cheapest fare (2026-10-05). */

function leg(id: string, fareBrand = ''): FlightLeg {
  return { id, fareBrand } as unknown as FlightLeg
}

function itinerary(id: string, priceEur: number, slices: FlightLeg[]): Itinerary {
  return {
    id,
    offerId: id,
    slices,
    outbound: slices[0],
    inbound: slices[1],
    priceEur,
    currency: 'EUR',
    score: 0,
  }
}

test('two fare brands of one journey become the cheaper one', () => {
  const out = collapseFareBrands([
    itinerary('plus', 780, [leg('SK501@0805#Plus', 'Plus'), leg('SK502@1020#Plus', 'Plus')]),
    itinerary('light', 560, [leg('SK501@0805#Light', 'Light'), leg('SK502@1020#Light', 'Light')]),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'light')
  assert.equal(out[0].outbound.id, 'SK501@0805')
  assert.equal(out[0].inbound?.id, 'SK502@1020')
  assert.equal(out[0].outbound.fareBrand, 'Light')
})

test('a different return is a different journey, under one departure row', () => {
  const out = collapseFareBrands([
    itinerary('a', 560, [leg('SK501@0805#Light'), leg('SK502@1020#Light')]),
    itinerary('b', 780, [leg('SK501@0805#Plus'), leg('SK504@1840#Plus')]),
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].outbound.id, out[1].outbound.id)
})

test('first-arrival order is kept, and a one-way has no inbound', () => {
  const out = collapseFareBrands([
    itinerary('x', 300, [leg('BA1@0700')]),
    itinerary('y', 200, [leg('SK1@0900#Go')]),
    itinerary('x2', 250, [leg('BA1@0700#Flex')]),
  ])
  assert.deepEqual(out.map(it => it.id), ['x2', 'y'])
  assert.equal(out[0].inbound, undefined)
})
