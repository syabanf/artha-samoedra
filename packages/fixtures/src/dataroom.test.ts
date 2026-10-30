import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIXTURE_NOW } from './clock'
import { canSeeFolder, failedTries, fileVersions, filesIn, folderDepartments, shareFiles, shareStatus, SHARE_MAX_TRIES } from './dataroom'
import { candidateByToken, testsDue } from './hr'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, actions: AppAction[], by = 'usr-1') => actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)

test('folders inherit department access, and managers see everything', () => {
  const s = seedState()
  assert.deepEqual(folderDepartments(s, 'fld-lst-1'), ['dep-mgt', 'dep-sls', 'dep-fin'], 'a listing folder inherits from Property documents')
  assert.ok(canSeeFolder(s, 'usr-2', 'fld-lst-1', false), 'a sales agent opens listing folders')
  assert.ok(!canSeeFolder(s, 'usr-2', 'fld-hr', false), 'but not HR policies')
  assert.ok(canSeeFolder(s, 'usr-2', 'fld-legal', false), 'templates are open to everyone')
  assert.ok(canSeeFolder(s, 'usr-2', 'fld-hr-contracts', true))
})

test('uploading the same name makes a new version and keeps the history', () => {
  let s = seedState()
  const file = { id: 'dfl-t', folderId: 'fld-lst-1', name: 'Floor plan.pdf', mime: 'application/pdf', size: 1000, dataUrl: 'data:application/pdf;base64,AA==', version: 1, replacedBy: null, note: '', uploadedBy: 'usr-2', uploadedAt: '' }
  assert.match(blockerFor(s, { type: 'dataFiles/upload', file: { ...file, size: 2_000_000 } })!, /1 MB/)
  s = run(s, [{ type: 'dataFiles/upload', file }])
  assert.equal(filesIn(s, 'fld-lst-1').find((f) => f.name === 'Floor plan.pdf')?.version, 3)
  assert.deepEqual(fileVersions(s, 'dfl-t').map((f) => f.version), [3, 2, 1])
  assert.match(blockerFor(s, { type: 'folders/remove', id: 'fld-lst-1' })!, /files first/)
})

test('a share link opens with the right email and code, logs wrong tries, and locks after five', () => {
  let s = seedState()
  const link = s.shareLinks.find((l) => l.id === 'shr-1')!
  assert.equal(shareStatus(link, FIXTURE_NOW), 'active')
  assert.equal(shareFiles(s, link).length, 4)
  const open = (code: string): AppAction => ({ type: 'shareLinks/open', id: link.id, email: 'Notaris.Dewi@gmail.com', code })
  s = run(s, Array.from({ length: SHARE_MAX_TRIES }, () => open('000000')))
  assert.equal(failedTries(s, link.id), SHARE_MAX_TRIES)
  assert.match(blockerFor(s, open(link.code))!, /Too many wrong codes/)
  assert.match(blockerFor(s, { type: 'shareLinks/track', id: 'shr-2', kind: 'downloaded', fileId: 'dfl-9' })!, /viewing only/)
  assert.match(blockerFor(s, { type: 'shareLinks/open', id: 'shr-3', email: 'appraisal.bsd@btn.co.id', code: '903377' })!, /expired/)
  assert.match(blockerFor(s, { type: 'shareLinks/open', id: 'shr-4', email: 'rizky.p@gmail.com', code: '220871' })!, /withdrew/)
})

test('a candidate takes an assigned test on the portal and answers the offer', () => {
  let s = seedState()
  const bram = candidateByToken(s, 'cnd-bram-7q4x')!
  assert.deepEqual(testsDue(s, bram).map((t) => t.id), ['tst-num'])
  assert.match(blockerFor(s, { type: 'candidates/takeTest', id: bram.id, testId: 'tst-sales', answers: [1, 0, 1] })!, /already took/)
  s = run(s, [{ type: 'candidates/takeTest', id: bram.id, testId: 'tst-num', answers: [1, 1, 0, 1] }])
  assert.equal(s.candidates.find((c) => c.id === bram.id)!.tests.find((t) => t.testId === 'tst-num')?.score, 75)
  const siska = candidateByToken(s, 'cnd-siska-4h6t')!
  s = run(s, [{ type: 'candidates/respondOffer', id: siska.id, accept: true, note: '' }])
  assert.equal(s.candidates.find((c) => c.id === siska.id)!.offer?.status, 'accepted')
  assert.match(blockerFor(s, { type: 'candidates/respondOffer', id: siska.id, accept: false, note: '' })!, /already accepted/)
  const apply: AppAction = { type: 'candidates/apply', candidate: { ...siska, id: 'cnd-x', email: 'new@mail.com', openingId: 'op-3', token: 'tok-x', cvName: 'cv.pdf' } }
  assert.match(blockerFor(s, apply)!, /no longer taking/)
})
