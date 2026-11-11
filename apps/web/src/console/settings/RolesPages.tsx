import { ADMIN_ROLE, countBy, newId, roleRemoveBlocker } from '@artha/fixtures'
import { Badge, Button, Card, Checkbox, DataTable, EmptyState, FormField, Input, PageHeader, type Column } from '@artha/ui'
import { PERMISSION_GROUPS, PERMISSIONS, type Permission, type RoleDef } from '@artha/types'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

export function RolesPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const users = countBy(state.users, (u) => u.roleId)
  const columns: Column<RoleDef>[] = [
    {
      id: 'name',
      header: 'Role',
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {r.name}
            {r.system && <Badge variant="muted"><Lock />System</Badge>}
          </div>
          <div className="truncate text-xs text-muted">{r.description}</div>
        </div>
      ),
    },
    { id: 'perms', header: 'Permissions', align: 'right', hideBelow: 'sm', sortValue: (r) => r.permissions.length, cell: (r) => `${r.permissions.length} of ${PERMISSIONS.length}` },
    { id: 'users', header: 'Users', align: 'right', sortValue: (r) => users[r.id] ?? 0, cell: (r) => users[r.id] ?? 0 },
  ]
  return (
    <div>
      <PageHeader
        title="Roles"
        description="A role is a set of permissions. View permissions also decide which menu items appear."
        actions={can('roles.manage') && <Button onClick={() => navigate(paths.role('new'))}><Plus />New role</Button>}
      />
      <DataTable rows={state.roles} columns={columns} getRowKey={(r) => r.id} rowLabel={(r) => r.name} onRowClick={(r) => navigate(paths.role(r.id))} pageSize={0} />
    </div>
  )
}

export function RoleDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const existing = state.roles.find((r) => r.id === id)
  if (id !== 'new' && !existing) {
    return (
      <Card>
        <EmptyState pageTitle title="Role not found" action={<BackButton fallback={paths.roles} />} />
      </Card>
    )
  }
  const role = existing ?? { id: newId('rol'), name: '', description: '', permissions: ['dashboard.view'] as Permission[], system: false }
  return <RoleEditor key={role.id} saved={role} isNew={!existing} />
}

function RoleEditor({ saved, isNew }: { saved: RoleDef; isNew: boolean }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const [r, setR] = useState(saved)
  const [tried, setTried] = useState(false)
  const readOnly = !can('roles.manage') || r.id === ADMIN_ROLE
  const has = (p: Permission) => r.permissions.includes(p)
  const toggle = (p: Permission, on: boolean) => setR({ ...r, permissions: on ? [...r.permissions, p] : r.permissions.filter((x) => x !== p) })
  const setGroup = (keys: Permission[], on: boolean) =>
    setR({ ...r, permissions: on ? [...new Set([...r.permissions, ...keys])] : r.permissions.filter((x) => !keys.includes(x)) })
  const dirty = JSON.stringify(r) !== JSON.stringify(saved)
  const holders = state.users.filter((u) => u.roleId === r.id)
  const removeBlocker = isNew ? null : roleRemoveBlocker(state, saved)
  const nameError = tried && !r.name.trim() ? 'Give the role a name.' : undefined

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.roles} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{isNew ? 'New role' : saved.name}</h1>
          <p className="text-sm text-muted">
            {r.permissions.length} of {PERMISSIONS.length} permissions · {holders.length} {holders.length === 1 ? 'user' : 'users'}
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {!isNew && (
              <Button
                variant="danger"
                disabled={!!removeBlocker}
                title={removeBlocker ?? undefined}
                onClick={() => {
                  if (act({ type: 'roles/remove', id: saved.id }, 'Role deleted', saved.name)) navigate(paths.roles)
                }}
              >
                <Trash2 />
                Delete
              </Button>
            )}
            <Button
              disabled={!dirty && !isNew}
              onClick={() => {
                setTried(true)
                if (!r.name.trim()) return
                if (act({ type: 'roles/upsert', role: r }, isNew ? 'Role created' : 'Role saved', r.name) && isNew) navigate(paths.role(r.id), { replace: true })
              }}
            >
              {isNew ? 'Create role' : 'Save changes'}
            </Button>
          </div>
        )}
      </div>
      {r.id === ADMIN_ROLE && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Locked:</span> the Admin role keeps every permission so someone can always manage the console.
        </Card>
      )}
      {!readOnly && removeBlocker && !saved.system && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot delete yet:</span> {removeBlocker}
        </Card>
      )}

      <Card className="p-5">
        <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Name" required error={nameError}>
            <Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
          </FormField>
          <FormField label="Description" hint="Shown on the sign-in screen and in the user form">
            <Input value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} />
          </FormField>
        </fieldset>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PERMISSION_GROUPS.map((g) => {
          const keys = g.items.map(([k]) => k) as Permission[]
          const all = keys.every(has)
          return (
            <Card key={g.module} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{g.module}</h2>
                {!readOnly && (
                  <Button variant="ghost" size="sm" onClick={() => setGroup(keys, !all)}>
                    {all ? 'Clear' : 'Select all'}
                  </Button>
                )}
              </div>
              <ul className="mt-3 space-y-2.5">
                {g.items.map(([key, label]) => (
                  <li key={key} className="flex items-center gap-3 text-sm">
                    <Checkbox checked={has(key)} onCheckedChange={(on) => toggle(key, on)} label={label} disabled={readOnly} />
                    <span className="min-w-0 flex-1">{label}</span>
                    <span className="font-mono text-[11px] text-muted">{key}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
