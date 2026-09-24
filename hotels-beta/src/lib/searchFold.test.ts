import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldForSearch, foldedContains, storedSpellings } from './searchFold.ts'

/* The one rule for matching typed text against stored text (Ulrik,
 * 2026-09-24): case, accents, dashes, hyphens and punctuation carry no
 * meaning, and common abbreviations stand for their full word. */

test('accents, dashes and case fold away', () => {
  assert.equal(foldForSearch('Hôtel du Cap Eden-Roc'), foldForSearch('hotel du cap-eden-roc'))
  assert.equal(foldForSearch('Zürich'), 'zurich')
  assert.equal(foldForSearch('Saint-Tropez – Ramatuelle'), 'saint tropez ramatuelle')
  assert.equal(foldForSearch("L'Ami Jean"), 'lami jean')
  assert.equal(foldForSearch('Bill & Coo'), 'bill and coo')
})

test('abbreviations are spelled out on both sides', () => {
  assert.equal(foldForSearch('St Tropez'), foldForSearch('Saint-Tropez'))
  assert.equal(foldForSearch('St. Moritz'), 'saint moritz')
  assert.equal(foldForSearch('Ste-Maxime'), 'sainte maxime')
  assert.equal(foldForSearch('Mt Kenya'), 'mount kenya')
  // A word that merely starts with an abbreviation is left alone.
  assert.equal(foldForSearch('Stresa'), 'stresa')
  // Brands with single letters are not expanded.
  assert.equal(foldForSearch('W Barcelona'), 'w barcelona')
})

test('contains matches whole words only', () => {
  assert.ok(foldedContains('Hôtel du Cap Eden-Roc', 'Hotel du Cap-Eden-Roc'))
  assert.ok(foldedContains('Hôtel du Cap Eden-Roc', 'eden roc'))
  assert.ok(!foldedContains('Rocco Forte Hotel de Russie', 'roc'))
  assert.ok(!foldedContains('Anything', ''))
})

test('stored spellings are found for any way of typing them', () => {
  const cities = ['Saint-Tropez', 'Ramatuelle', 'Zürich', 'Paris']
  assert.deepEqual(storedSpellings('st tropez', cities), ['Saint-Tropez'])
  assert.deepEqual(storedSpellings('ZURICH', cities), ['Zürich'])
  assert.deepEqual(storedSpellings('Rome', cities), [])
})
