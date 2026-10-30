import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Permission } from '@artha/types'
import { matchRanges, searchAll, SEARCH_KIND_NEEDS } from './search'
import { seedState } from './store'

const s = seedState()
const only =
  (...ps: Permission[]) =>
  (p: Permission) =>
    ps.includes(p)

test('an exact code match comes first, then titles that start with the query, then title words, then the rest', () => {
  assert.equal(searchAll(s, 'as-0004')[0]?.code, 'AS-0004', 'codes ignore case')

  const hits = searchAll(s, 'warehouse')
  const at = (code: string) => hits.findIndex((h) => h.code === code)
  assert.ok(at('AS-0004') >= 0 && at('AS-0006') >= 0)
  assert.ok(
    at('AS-0004') < at('AS-0006'),
    '"Warehouse with office" starts with the query; "Logistics warehouse" only holds it',
  )
  const firstSubtitleOnly = hits.findIndex((h) => !h.title.toLowerCase().includes('warehouse'))
  if (firstSubtitleOnly >= 0)
    assert.ok(at('AS-0006') < firstSubtitleOnly, 'title matches beat subtitle and keyword matches')
})

test('every word must match, in any order, ignoring case and accents', () => {
  const hits = searchAll(s, 'HOUSE jakarta')
  assert.ok(hits.length > 0)
  assert.ok(hits.some((h) => h.code === 'AS-0001'))
  assert.ok(!hits.some((h) => h.code === 'AS-0007'), 'the Sentul house is not in Jakarta')
  assert.deepEqual(searchAll(s, 'house zzqx'), [], 'one unmatched word drops the hit')
  assert.deepEqual(
    searchAll(s, 'Cíkárang').map((h) => h.id),
    searchAll(s, 'cikarang').map((h) => h.id),
  )
  assert.deepEqual(searchAll(s, '   '), [], 'an empty query returns nothing')
})

test('words match at the start of a word, so "ware" finds warehouses but "are" does not', () => {
  assert.ok(searchAll(s, 'ware').some((h) => h.code === 'AS-0004'))
  assert.ok(!searchAll(s, 'arehouse').some((h) => h.code === 'AS-0004'))
})

test('kind filters and permissions narrow the hits', () => {
  const listings = searchAll(s, 'house', { kinds: ['listing'] })
  assert.ok(listings.length > 0)
  assert.ok(listings.every((h) => h.kind === 'listing'))

  const hits = searchAll(s, 'house', { can: only('deal.view') })
  assert.ok(hits.length > 0)
  assert.ok(hits.every((h) => SEARCH_KIND_NEEDS[h.kind] === 'deal.view'))

  assert.equal(searchAll(s, 'AS-0004', { limit: 2 }).length, 2)
})

test('dataroom hits follow department access', () => {
  const viewer = searchAll(s, 'handbook', { can: only('dataroom.view'), userId: 'usr-2' })
  assert.ok(!viewer.some((h) => h.id === 'dfl-19'), 'a sales agent does not find HR policy files')
  const manager = searchAll(s, 'handbook', { can: only('dataroom.view', 'dataroom.manage'), userId: 'usr-2' })
  assert.ok(manager.some((h) => h.id === 'dfl-19'))
})

test('matchRanges marks each matched word in the original text', () => {
  assert.deepEqual(matchRanges('Cliffside villa in Uluwatu', 'villa ULU'), [
    [10, 15],
    [19, 22],
  ])
  assert.deepEqual(matchRanges('Café Bálí', 'bali'), [[5, 9]], 'accented text keeps its own offsets')
  assert.deepEqual(matchRanges('anything', ''), [])
})
