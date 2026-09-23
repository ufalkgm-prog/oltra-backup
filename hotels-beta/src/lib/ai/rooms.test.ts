import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mustAskRooms } from './rooms.ts'

test('one room without asking: up to two guests, one adult with one or two children, two adults with one child', () => {
  assert.equal(mustAskRooms({ adults: 1 }), false)
  assert.equal(mustAskRooms({ adults: 2 }), false)
  assert.equal(mustAskRooms({ adults: 1, kids: 1 }), false)
  assert.equal(mustAskRooms({ adults: 1, kids: 2 }), false)
  assert.equal(mustAskRooms({ adults: 2, kids: 1 }), false)
})

test('any other party of three or more is asked', () => {
  assert.equal(mustAskRooms({ adults: 2, kids: 2 }), true)
  assert.equal(mustAskRooms({ adults: 3 }), true)
  assert.equal(mustAskRooms({ adults: 1, kids: 3 }), true)
  assert.equal(mustAskRooms({ adults: 6 }), true)
})

test('a room count the visitor gave is never asked again', () => {
  assert.equal(mustAskRooms({ adults: 2, kids: 2, rooms: 2 }), false)
  assert.equal(mustAskRooms({ adults: 4, rooms: 1 }), false)
})

test('no stay, nothing to ask', () => {
  assert.equal(mustAskRooms(undefined), false)
})
