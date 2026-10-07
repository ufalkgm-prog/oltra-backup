import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimsMemberChange, panelText, plainDashes } from './rationale.ts'

/* "I've moved your Ski 2027 stay…" (2026-09-30): a claim to have changed saved
 * data. Caught so the panel can say nothing was changed; the check only runs on
 * turns that read the member's trips or favourites. */
test('a claim to have changed saved data is caught', () => {
  for (const text of [
    "I've moved your Ski 2027 stay at La Sivolière to 1–8 March.",
    'I’ve added The Peninsula to your France trip.',
    'I have updated your favourites.',
    'I removed the Ritz from your trip.',
  ]) {
    assert.equal(claimsMemberChange(text), true, text)
  }
})

test('offers and plain answers are not claims', () => {
  for (const text of [
    'La Sivolière has rooms for 1–8 March.',
    'SAVE TO TRIP on the hotel will record the new dates.',
    'Shall I check another week?',
    'The trip was moved to March last year.',
  ]) {
    assert.equal(claimsMemberChange(text), false, text)
  }
})

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

test('a hotel never has its own ski school', () => {
  assert.equal(panelText('Ski-in ski-out with ski school for the children.'), 'Ski-in ski-out near a ski school for the children.')
  assert.equal(panelText('With its own ski school and a kids club.'), 'Near a ski school and a kids club.')
  for (const text of [
    'With a ski school nearby for the children.',
    'A ski school in the resort, which the hotel can arrange.',
    'with ski school close by',
  ]) {
    assert.equal(panelText(text), text)
  }
})

test('hotel text is never rewritten', () => {
  const text = 'Two rooms side by side, sea-facing rooms on the upper floors.'
  assert.equal(panelText(text), text)
})

/* No long dashes in the panel (Ulrik, 2026-10-07). */
test('long dashes become plain hyphens, list markers stay at the line start', () => {
  assert.equal(plainDashes('Le Bristol — courtyard garden'), 'Le Bristol - courtyard garden')
  assert.equal(plainDashes('two rooms—both near the port'), 'two rooms - both near the port')
  assert.equal(plainDashes('— first\n— second'), '- first\n- second')
  assert.equal(panelText('Lake Como — the quiet shore.'), 'Lake Como - the quiet shore.')
  assert.equal(panelText('A plain-hyphen line - unchanged.'), 'A plain-hyphen line - unchanged.')
})
