import { countBy, fmtAgo, fmtDate, initials, newId, nowIso } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  toast,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { USER_STATUS_LABEL, type User, type UserStatus } from '@artha/types'
import { Eye, KeyRound, Search, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

const STATUS_VARIANT: Record<UserStatus, BadgeVariant> = { active: 'success', invited: 'warning', disabled: 'muted' }
const StatusBadge = ({ status }: { status: UserStatus }) => <Badge variant={STATUS_VARIANT[status]}>{USER_STATUS_LABEL[status]}</Badge>


export function UsersPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [inviting, setInviting] = useState(false)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as UserStatus | null) || null
  const roleId = params.get('role') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const roleName = (id: string) => state.roles.find((r) => r.id === id)?.name ?? '–'
  const branchName = (id: string) => state.branches.find((b) => b.id === id)?.name ?? '–'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (u: User) => terms.every((t) => `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(t)) && (!roleId || u.roleId === roleId)
  const rows = state.users.filter((u) => matches(u) && (!status || u.status === status))
  const counts = countBy(state.users.filter(matches), (u) => u.status)
  const filters = [q, status, roleId].filter(Boolean).length

  const columns: Column<User>[] = [
    {
      id: 'name',
      header: 'User',
      sortValue: (u) => u.name,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-on-ink">{initials(u.name)}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{u.name}</div>
            <div className="truncate text-xs text-muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', cell: (u) => <StatusBadge status={u.status} /> },
    { id: 'role', header: 'Role', sortValue: (u) => roleName(u.roleId), cell: (u) => <span className="text-sm">{roleName(u.roleId)}</span> },
    { id: 'branch', header: 'Branch', hideBelow: 'lg', cell: (u) => <span className="text-sm">{branchName(u.branchId)}</span> },
    { id: 'active', header: 'Last active', align: 'right', hideBelow: 'md', sortValue: (u) => u.lastActiveAt, cell: (u) => <span className="text-xs text-muted">{u.lastActiveAt ? fmtAgo(u.lastActiveAt) : 'Never'}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Users"
        description="Everyone who can sign in to the console. A role decides their menus and actions; a branch decides where they work."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search users"
              placeholder="Name, email or phone"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('users.manage') && (
              <Button onClick={() => setInviting(true)}>
                <UserPlus />
                Invite user
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={state.users.filter(matches).length} onClick={() => set('status', null)}>
            All
          </Chip>
          {(['active', 'invited', 'disabled'] as UserStatus[]).map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {USER_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by role" value={roleId ?? ''} onChange={(e) => set('role', e.target.value)}>
          <option value="">All roles</option>
          {state.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.users.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(u) => u.id}
          rowLabel={(u) => u.name}
          onRowClick={(u) => navigate(paths.user(u.id))}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={`${q}|${status}|${roleId}`}
          rowClassName={(u) => (u.status === 'disabled' ? 'opacity-60' : undefined)}
          empty={<EmptyState compact title="No users match" description="Change the search or clear filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />}
        />
      </div>
      <Dialog open={inviting} onOpenChange={setInviting} title="Invite a user" description="They get an email with a link to set a password. Until they accept, they show as Invited.">
        <UserForm editing={null} onDone={(u) => { setInviting(false); if (u) navigate(paths.user(u.id)) }} />
      </Dialog>
    </div>
  )
}

function UserForm({ editing, onDone }: { editing: User | null; onDone: (u: User | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: editing?.name ?? '',
    email: editing?.email ?? '',
    phone: editing?.phone ?? '',
    roleId: editing?.roleId ?? 'rol-sales',
    branchId: editing?.branchId ?? state.branches.find((b) => b.isHead)?.id ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const errors = {
    name: f.name.trim().length < 3 ? 'Enter the full name.' : null,
    email: /^\S+@\S+\.\S+$/.test(f.email.trim()) ? null : 'Enter a valid email address.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const data = { name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), roleId: f.roleId, branchId: f.branchId }
        if (editing) {
          if (act({ type: 'users/update', id: editing.id, patch: data }, 'User updated', data.name)) onDone({ ...editing, ...data })
          return
        }
        const user: User = { ...data, id: newId('usr'), status: 'invited', createdAt: nowIso(), lastActiveAt: null }
        if (act({ type: 'users/invite', user }, 'Invite sent', data.email)) onDone(user)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Full name" required error={show(errors.name)} className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} autoComplete="off" />
        </FormField>
        <FormField label="Email" required error={show(errors.email)}>
          <Input type="email" value={f.email} onChange={set('email')} autoComplete="off" />
        </FormField>
        <FormField label="WhatsApp" hint="Optional">
          <Input inputMode="tel" value={f.phone} onChange={set('phone')} />
        </FormField>
        <FormField label="Role" required>
          <NativeSelect value={f.roleId} onChange={set('roleId')}>
            {state.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Branch" required>
          <NativeSelect value={f.branchId} onChange={set('branchId')}>
            {state.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Send invite'}</Button>
      </DialogFooter>
    </form>
  )
}

export function UserDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can, user: me, impersonate } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const u = state.users.find((x) => x.id === id)
  if (!u) {
    return (
      <Card>
        <EmptyState title="User not found" action={<BackButton fallback={paths.users} />} />
      </Card>
    )
  }
  const role = state.roles.find((r) => r.id === u.roleId)
  const branch = state.branches.find((b) => b.id === u.branchId)
  const activity = state.audit.filter((a) => a.by === u.id).slice(0, 8)
  const manage = can('users.manage')
  const isMe = me?.id === u.id

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.users} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-ink text-sm font-bold text-on-ink">{initials(u.name)}</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{u.name}</h1>
            <p className="text-sm text-muted">{u.email}</p>
          </div>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            {u.status === 'active' && !isMe && (
              <Button
                variant="outline"
                onClick={() => {
                  impersonate(u.id)
                  toast(`Viewing as ${u.name}`, { description: 'Use the banner to switch back.' })
                  navigate(paths.console)
                }}
              >
                <Eye />
                View as
              </Button>
            )}
            {u.status !== 'disabled' && (
              <Button variant="outline" onClick={() => toast(u.status === 'invited' ? 'Invite sent again' : 'Password reset link sent', { tone: 'success', description: u.email })}>
                <KeyRound />
                {u.status === 'invited' ? 'Resend invite' : 'Reset password'}
              </Button>
            )}
            {!isMe &&
              (u.status === 'disabled' ? (
                <Button variant="outline" onClick={() => act({ type: 'users/setStatus', id: u.id, status: 'active' }, 'User enabled', u.name)}>
                  Enable
                </Button>
              ) : (
                <Button variant="danger" onClick={() => act({ type: 'users/setStatus', id: u.id, status: 'disabled' }, 'User disabled', `${u.name} can no longer sign in`)}>
                  Disable
                </Button>
              ))}
            <Button onClick={() => setEditing(true)}>Edit</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <KeyValue
          items={[
            { label: 'Status', value: <StatusBadge status={u.status} /> },
            { label: 'Role', value: role ? <Link to={paths.role(role.id)} className="hover:text-accent">{role.name}</Link> : '–' },
            { label: 'Branch', value: branch?.name ?? '–' },
            { label: 'WhatsApp', value: u.phone ? <span className="font-mono text-xs">{u.phone}</span> : '–' },
            { label: 'Joined', value: fmtDate(u.createdAt) },
            { label: 'Last active', value: u.lastActiveAt ? fmtAgo(u.lastActiveAt) : 'Never' },
          ]}
        />
        <Card>
          <CardHeader action={can('audit.view') && <Button variant="outline" size="sm" asChild><Link to={`${paths.audit}?by=${u.id}`}>Full log</Link></Button>}>
            <CardTitle>Recent changes by {u.name.split(' ')[0]}</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length ? (
              <ol className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="font-medium">{a.entity} {a.label}</span> <span className="text-muted">{a.kind}</span>
                    <span className="block text-xs text-muted">{fmtAgo(a.at)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact title="No changes yet" description="Changes this user makes show up here and in the audit log." />
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={editing} onOpenChange={setEditing} title={`Edit ${u.name}`} description="Changing the role changes the menus and actions they see on their next click.">
        <UserForm editing={u} onDone={() => setEditing(false)} />
      </Dialog>
    </div>
  )
}
