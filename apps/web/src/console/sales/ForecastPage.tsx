import { fmtIdr, fmtIdrShort, fmtPercent, forecast, newId } from '@artha/fixtures'
import { Button, DataTable, Dialog, DialogFooter, EmptyState, FormField, Input, NativeSelect, PageHeader, PillTabs, ProgressBar, StatCard, type Column } from '@artha/ui'
import type { SalesTarget } from '@artha/types'
import { Crosshair, Target, TrendingUp, Trophy } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Avatar } from './DealPages'
import { priceInput, readPrice } from '../../lib/price'

interface Row {
  userId: string
  name: string
  target: number
  won: number
  weighted: number
  open: number
}

const pad = (n: number) => String(n).padStart(2, '0')
/** This month and the next two, as YYYY-MM. */
const upcomingMonths = (now: number) => {
  const d = new Date(now)
  return [0, 1, 2].map((i) => {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1)
    return `${m.getFullYear()}-${pad(m.getMonth() + 1)}`
  })
}
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0)

export function ForecastPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<{ userId: string; month: string } | null>(null)
  const months = upcomingMonths(now)
  const month = months.includes(params.get('month') ?? '') ? params.get('month')! : months[0]
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id

  const byOwner = forecast(state, month)
  const targets = state.targets.filter((t) => t.month === month)
  const agentIds = new Set([
    ...state.users.filter((u) => u.status === 'active' && u.roleId === 'rol-sales').map((u) => u.id),
    ...targets.map((t) => t.userId),
    ...byOwner.keys(),
  ])
  const rows: Row[] = [...agentIds].map((userId) => ({
    userId,
    name: userName(userId),
    target: targets.find((t) => t.userId === userId)?.amount ?? 0,
    ...(byOwner.get(userId) ?? { won: 0, weighted: 0, open: 0 }),
  }))
  const sum = (k: keyof Omit<Row, 'userId' | 'name'>) => rows.reduce((total, r) => total + r[k], 0)
  const totals = { target: sum('target'), won: sum('won'), weighted: sum('weighted') }
  const manage = can('target.manage')

  const columns: Column<Row>[] = [
    {
      id: 'agent',
      header: 'Agent',
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={r.name} />
          <span className="truncate text-sm font-semibold">{r.name}</span>
        </span>
      ),
    },
    { id: 'target', header: 'Target', align: 'right', hideBelow: 'sm', sortValue: (r) => r.target, cell: (r) => <span className="tabular-nums">{r.target ? fmtIdrShort(r.target) : '–'}</span> },
    { id: 'won', header: 'Won', align: 'right', sortValue: (r) => r.won, cell: (r) => <span className="font-semibold tabular-nums">{fmtIdrShort(r.won)}</span> },
    { id: 'weighted', header: 'Weighted pipeline', align: 'right', hideBelow: 'md', sortValue: (r) => r.weighted, cell: (r) => <span className="tabular-nums">{fmtIdrShort(r.weighted)}</span> },
    {
      id: 'attainment',
      header: 'Attainment',
      hideBelow: 'sm',
      width: '28%',
      sortValue: (r) => pct(r.won, r.target),
      cell: (r) =>
        r.target ? (
          <div className="min-w-0">
            <ProgressBar value={pct(r.won, r.target)} tone={r.won >= r.target ? 'success' : 'ink'} />
            <div className="mt-1 text-[11px] text-muted tabular-nums">
              {fmtPercent(pct(r.won, r.target), 0)} won, {fmtPercent(pct(r.won + r.weighted, r.target), 0)} with pipeline
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted">No target</span>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Forecast"
        description="Won value and probability-weighted pipeline per agent against the monthly target."
        actions={
          manage && (
            <Button onClick={() => setEditing({ userId: '', month })}>
              <Target />
              Set target
            </Button>
          )
        }
      />
      <PillTabs
        label="Month"
        value={month}
        onChange={(m) => setParams(m === months[0] ? {} : { month: m }, { replace: true })}
        items={months.map((m) => ({ value: m, label: monthLabel(m) }))}
        className="mb-4"
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Target" value={fmtIdrShort(totals.target)} icon={<Crosshair />} />
        <StatCard label="Won" value={fmtIdrShort(totals.won)} icon={<Trophy />} tone="success" />
        <StatCard label="Weighted pipeline" value={fmtIdrShort(totals.weighted)} icon={<TrendingUp />} tone="info" hint="Open value times stage probability" />
        <StatCard label="Attainment" value={fmtPercent(pct(totals.won, totals.target), 0)} icon={<Target />} tone="ink" hint={`${fmtPercent(pct(totals.won + totals.weighted, totals.target), 0)} with pipeline`} />
      </div>
      <div className="mt-4">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.userId}
          rowLabel={(r) => r.name}
          onRowClick={manage ? (r) => setEditing({ userId: r.userId, month }) : undefined}
          initialSort={{ id: 'won', desc: true }}
          resetPageKey={month}
          empty={<EmptyState compact title="No agents to forecast" description="Set a target or add a deal closing this month." />}
        />
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title="Set a sales target"
        description="One target per agent per month. Saving again replaces the amount."
      >
        {editing && <TargetForm initial={editing} months={months} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function TargetForm({ initial, months, onDone }: { initial: { userId: string; month: string }; months: string[]; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const existing = (userId: string, month: string) => state.targets.find((t) => t.userId === userId && t.month === month)
  const amountOf = (userId: string, month: string) => {
    const t = existing(userId, month)
    return t ? priceInput(t.amount) : ''
  }
  const [f, setF] = useState({ ...initial, amount: amountOf(initial.userId, initial.month) })
  const amount = readPrice(f.amount)
  const errors = {
    userId: f.userId ? null : 'Choose the agent.',
    amount: amount && amount > 0 ? null : 'Enter the target, for example 8 B.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const pick = (userId: string, month: string) => setF({ userId, month, amount: amountOf(userId, month) || f.amount })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const target: SalesTarget = { id: existing(f.userId, f.month)?.id ?? newId('tgt'), userId: f.userId, month: f.month, amount: amount! }
        const name = state.users.find((u) => u.id === f.userId)?.name ?? ''
        if (act({ type: 'targets/set', target }, 'Target saved', `${name}, ${monthLabel(f.month)}: ${fmtIdrShort(amount!)}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Agent" required error={show(errors.userId)}>
          <NativeSelect value={f.userId} onChange={(e) => pick(e.target.value, f.month)} className={f.userId ? '' : '[&_select]:text-muted'}>
            <option value="">Choose agent</option>
            {state.users
              .filter((u) => u.status === 'active')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        <FormField label="Month" required>
          <NativeSelect value={f.month} onChange={(e) => pick(f.userId, e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Target" required error={show(errors.amount)} hint={amount ? fmtIdr(amount) : 'Won deal value, for example 8 B'} className="sm:col-span-2">
          <Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="8 B" />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save target</Button>
      </DialogFooter>
    </form>
  )
}
