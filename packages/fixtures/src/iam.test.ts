import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PERMISSIONS } from '@artha/types'
import { FIXTURE_NOW } from './clock'
import { ADMIN_ROLE, fillTemplate, templateVariables, userCan } from './iam'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, action: AppAction, by = 'usr-1') => reduce(s, { action, meta: { by, at: AT } })

test('permissions come from the role record', () => {
  const s = seedState()
  assert.ok(userCan(s, 'usr-1', 'audit.view'))
  assert.ok(!userCan(s, 'usr-2', 'settings.view'))
  assert.ok(userCan(s, 'usr-3', 'content.manage'))
  assert.ok(!userCan(s, 'usr-9', 'listing.view'), 'a disabled user can do nothing')

  const role = s.roles.find((r) => r.id === 'rol-sales')!
  const s1 = run(s, { type: 'roles/upsert', role: { ...role, permissions: [...role.permissions, 'audit.view'] } })
  assert.ok(userCan(s1, 'usr-2', 'audit.view'))
})

test('the last active admin cannot lose admin rights', () => {
  const s = seedState()
  const move: AppAction = { type: 'users/update', id: 'usr-1', patch: { roleId: 'rol-sales' } }
  assert.equal(blockerFor(s, move), 'Keep at least one active admin.')
  assert.equal(blockerFor(s, { type: 'users/setStatus', id: 'usr-1', status: 'disabled' }), 'Keep at least one active admin.')
  const s1 = run(s, { type: 'users/update', id: 'usr-6', patch: { roleId: ADMIN_ROLE } })
  assert.equal(blockerFor(s1, move), null)
})

test('roles and branches in use cannot be deleted', () => {
  const s = seedState()
  assert.equal(blockerFor(s, { type: 'roles/remove', id: 'rol-sales' }), 'System roles cannot be deleted.')
  assert.match(blockerFor(s, { type: 'roles/remove', id: 'rol-finance' })!, /1 user still has this role/)
  assert.equal(blockerFor(s, { type: 'branches/remove', id: 'brn-jkt' }), 'The head office cannot be deleted.')
  assert.match(blockerFor(s, { type: 'branches/remove', id: 'brn-sby' })!, /2 users work at this branch/)
  const admin = s.roles.find((r) => r.id === ADMIN_ROLE)!
  assert.equal(
    blockerFor(s, { type: 'roles/upsert', role: { ...admin, permissions: admin.permissions.slice(1) } }),
    'The Admin role keeps every permission.',
  )
  assert.equal(admin.permissions.length, PERMISSIONS.length)
})

test('invites need a unique email', () => {
  const s = seedState()
  const user = { ...s.users[1], id: 'usr-new', email: 'DIMAS@arthasamoedra.id' }
  assert.equal(blockerFor(s, { type: 'users/invite', user }), 'Another user already uses this email.')
})

test('every action leaves a field-level audit entry', () => {
  const s = seedState()
  const s1 = run(s, { type: 'listings/update', id: 'lst-1', patch: { price: 6_500_000_000 } }, 'usr-2')
  const entry = s1.audit[0]
  assert.equal(entry.entity, 'Listing')
  assert.equal(entry.label, 'AS-0001')
  assert.equal(entry.by, 'usr-2')
  assert.deepEqual(
    entry.changes.find((c) => c.field === 'price'),
    { field: 'price', from: '6850000000', to: '6500000000' },
  )

  const s2 = run(s1, { type: 'company/update', patch: { phone: '021-555-0000' } })
  assert.equal(s2.audit[0].entity, 'Company')
  assert.equal(s2.audit[0].changes[0].to, '021-555-0000')

  const s3 = run(s2, { type: 'roles/remove', id: 'rol-sales' })
  assert.equal(s3, s2, 'a refused action changes nothing, audit included')
})

test('templates fill their variables', () => {
  const body = 'Hi {{name}}, {{listing}} is live. {{missing}}'
  assert.deepEqual(templateVariables(body), ['name', 'listing', 'missing'])
  assert.equal(fillTemplate(body, { name: 'Sri', listing: 'AS-0003' }), 'Hi Sri, AS-0003 is live. {{missing}}')
})
