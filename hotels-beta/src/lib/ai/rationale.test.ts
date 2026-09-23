import { test } from 'node:test'
import assert from 'node:assert/strict'
import { panelText } from './rationale.ts'

/* A restaurant is never a "room" in the panel (2026-09-23): the model called
 * two lunch places "well-run rooms" with the rule already in the prompt. The
 * rewrite runs only on text about restaurants alone, and must leave the rooms
 * that are real features untouched. */

test('restaurants called rooms become places', () => {
  assert.equal(
    panelText('Four in Copenhagen: two easy, well-run rooms for lunch.', { restaurantsOnly: true }),
    'Four in Copenhagen: two easy, well-run places for lunch.'
  )
  assert.equal(panelText('A grand room for a last night.', { restaurantsOnly: true }), 'A grand place for a last night.')
  assert.equal(panelText('Rooms worth dressing for.', { restaurantsOnly: true }), 'Places worth dressing for.')
  assert.equal(panelText('Two serious kitchens.', { restaurantsOnly: true }), 'Two serious places.')
})

test('real rooms and kitchens survive', () => {
  for (const text of [
    'A vaulted dining room in Indre By.',
    'A private room seats twelve.',
    "Book the chef's table room.",
    'An open kitchen and a wine room.',
    'The kitchen leans Japanese.',
  ]) {
    assert.equal(panelText(text, { restaurantsOnly: true }), text)
  }
})

test('hotel text is never rewritten', () => {
  const text = 'Two rooms side by side, sea-facing rooms on the upper floors.'
  assert.equal(panelText(text), text)
})
