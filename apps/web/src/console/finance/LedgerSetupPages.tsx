import { accountLabel, blockerFor, fmtDateTime, fmtIdr, incomeStatement, monthLabel, monthOf, yearRange } from '@artha/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogFooter,
  FormField,
  Input,
  KeyValue,
  PageHeader,
  Switch,
  cn,
  type BadgeVariant,
} from '@artha/ui'
import {
  AUTO_JOURNAL_EVENT_LABEL,
  type AutoJournalMapping,
  PERIOD_STATUS_LABEL,
  type AutoJournalEvent,
  type FinanceSettings,
  type FiscalYear,
  type GlAccountType,
  type PeriodStatus,
} from '@artha/types'
import { CalendarPlus, Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { CodeLink, paths } from '../../components/links'
import { useAppState, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { AccountSelect, Money } from './parts'
import { SubTabs } from '../../components/SubTabs'

const SETUP_TABS = [
  { to: paths.periods, label: 'Fiscal periods' },
  { to: paths.autoJournals, label: 'Auto-journals' },
  { to: paths.financeSettings, label: 'Finance settings' },
]

const STATUS_VARIANT: Record<PeriodStatus, BadgeVariant> = { open: 'success', closed: 'muted' }
const PeriodBadge = ({ status }: { status: PeriodStatus }) => <Badge variant={STATUS_VARIANT[status]}>{PERIOD_STATUS_LABEL[status]}</Badge>

// ---------------------------------------------------------------- fiscal periods

export function PeriodsPage() {
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const [closing, setClosing] = useState<FiscalYear | null>(null)
  const manage = can('period.close')
  const years = [...state.fiscalYears].sort((a, b) => b.year - a.year)
  const nextYear = Math.max(...state.fiscalYears.map((y) => y.year)) + 1
  const openBlocker = blockerFor(state, { type: 'years/open', year: nextYear })

  return (
    <div>
      <SubTabs items={SETUP_TABS} />
      <PageHeader
        title="Fiscal periods"
        description="Close each month once its entries are final. Nothing posts into a closed period; closing the year moves its profit to retained earnings."
        actions={
          manage && (
            <Button disabled={!!openBlocker} title={openBlocker ?? undefined} onClick={() => act({ type: 'years/open', year: nextYear }, `Fiscal year ${nextYear} opened`, 'Twelve periods are ready for entries.')}>
              <CalendarPlus />
              Open {nextYear}
            </Button>
          )
        }
      />
      <div className="space-y-4">
        {years.map((y) => {
          const periods = state.periods.filter((p) => p.year === y.year).sort((a, b) => a.month.localeCompare(b.month))
          const closeBlocker = blockerFor(state, { type: 'years/close', id: y.id })
          const closingJournal = y.closingJournalId ? state.journals.find((j) => j.id === y.closingJournalId) : undefined
          return (
            <Card key={y.id}>
              <CardHeader
                action={
                  manage &&
                  y.status === 'open' && (
                    <Button variant="secondary" disabled={!!closeBlocker} title={closeBlocker ?? undefined} onClick={() => setClosing(y)}>
                      <Lock />
                      Close year
                    </Button>
                  )
                }
              >
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Fiscal year {y.year}
                  <PeriodBadge status={y.status} />
                </CardTitle>
                <p className="text-sm text-muted">
                  {y.status === 'closed' ? (
                    <>
                      Closed {y.closedAt ? fmtDateTime(y.closedAt) : ''}
                      {y.closedBy ? ` by ${actorName(y.closedBy)}` : ''}
                      {closingJournal && (
                        <>
                          {' '}with <CodeLink to={paths.journal(closingJournal.id)} code={closingJournal.code} />
                        </>
                      )}
                    </>
                  ) : (
                    `${periods.filter((p) => p.status === 'closed').length} of ${periods.length} periods closed`
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {periods.map((p) => {
                    const action = p.status === 'open' ? ({ type: 'periods/close', id: p.id } as const) : ({ type: 'periods/reopen', id: p.id } as const)
                    const blocker = blockerFor(state, action)
                    const drafts = state.journals.filter((j) => j.status === 'draft' && monthOf(j.date) === p.month).length
                    return (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{monthLabel(p.month)}</div>
                          <div className="text-xs text-muted">
                            {p.status === 'closed' && p.closedAt ? `Closed ${fmtDateTime(p.closedAt)}${p.closedBy ? ` by ${actorName(p.closedBy)}` : ''}` : 'Open for entries'}
                            {drafts > 0 && (
                              <>
                                {' · '}
                                <Link to={`${paths.journals}?status=draft&period=${p.month}`} className="font-semibold text-warning hover:underline">
                                  {drafts} {drafts === 1 ? 'draft' : 'drafts'}
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                        <PeriodBadge status={p.status} />
                        {manage && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!blocker}
                            title={blocker ?? undefined}
                            onClick={() => act(action, p.status === 'open' ? `${monthLabel(p.month)} closed` : `${monthLabel(p.month)} reopened`)}
                          >
                            {p.status === 'open' ? <Lock /> : <LockOpen />}
                            {p.status === 'open' ? 'Close' : 'Reopen'}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <Dialog open={!!closing} onOpenChange={(v) => !v && setClosing(null)} size="lg" title={`Close fiscal year ${closing?.year ?? ''}?`} description="This closing entry zeroes every revenue and expense account and moves the net income to retained earnings.">
        {closing && <CloseYearPreview year={closing} onDone={() => setClosing(null)} />}
      </Dialog>
    </div>
  )
}

function CloseYearPreview({ year, onDone }: { year: FiscalYear; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const { from, to } = yearRange(year.year)
  const { revenue, expense, netIncome } = incomeStatement(state, from, to)
  const retained = state.financeSettings.retainedEarningsAccountId
  const rows = [
    ...revenue.map((r) => ({ id: r.account.id, debit: Math.max(r.amount, 0), credit: Math.max(-r.amount, 0) })),
    ...expense.map((r) => ({ id: r.account.id, debit: Math.max(-r.amount, 0), credit: Math.max(r.amount, 0) })),
    { id: retained, debit: Math.max(-netIncome, 0), credit: Math.max(netIncome, 0) },
  ]
  const blocker = blockerFor(state, { type: 'years/close', id: year.id })
  return (
    <div className="space-y-4">
      <Banner tone={netIncome >= 0 ? 'success' : 'warning'} title={`${netIncome >= 0 ? 'Net income' : 'Net loss'} ${fmtIdr(Math.abs(netIncome))}`}>
        Lands in {accountLabel(state, retained)} on 31 December {year.year}. The year cannot reopen once closed.
      </Banner>
      <div className="max-h-80 overflow-y-auto rounded-2xl bg-surface-2 p-2">
        <ul className="divide-y divide-border text-sm">
          <li className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-2 px-2 py-2 text-xs font-semibold text-muted">
            <span>Account</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
          </li>
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-2 px-2 py-2">
              <span className={cn('truncate', r.id === retained && 'font-semibold')}>{accountLabel(state, r.id)}</span>
              <Money value={r.debit} dash className="text-right" />
              <Money value={r.credit} dash className="text-right" />
            </li>
          ))}
        </ul>
      </div>
      {blocker && <p className="text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={!!blocker}
          title={blocker ?? undefined}
          onClick={() => {
            if (act({ type: 'years/close', id: year.id }, `Fiscal year ${year.year} closed`, `${fmtIdr(Math.abs(netIncome))} moved to retained earnings`)) onDone()
          }}
        >
          <Lock />
          Post closing entry
        </Button>
      </DialogFooter>
    </div>
  )
}

// ---------------------------------------------------------------- auto-journals

export function AutoJournalsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('ledger.manage')
  const events = Object.keys(AUTO_JOURNAL_EVENT_LABEL) as AutoJournalEvent[]
  const counts: Partial<Record<AutoJournalEvent, number>> = {}
  for (const j of state.journals) {
    if (j.source !== 'auto' || j.status === 'void') continue
    for (const e of j.events ?? []) counts[e] = (counts[e] ?? 0) + 1
  }
  const total = state.journals.filter((j) => j.source === 'auto' && j.status !== 'void').length

  return (
    <div>
      <SubTabs items={SETUP_TABS} />
      <PageHeader
        title="Auto-journals"
        description="Money that turns paid elsewhere posts to the ledger on its own. Pick the accounts each event debits and credits."
        actions={
          <Button variant="outline" asChild>
            <Link to={`${paths.journals}?source=auto`}>See {total} auto-journals</Link>
          </Button>
        }
      />
      <div className="space-y-3">
        {events.map((event) => {
          const m = state.autoJournals.find((x) => x.event === event)
          const count = counts[event] ?? 0
          if (!m) {
            return (
              <Card key={event} className="p-5">
                <div className="text-sm font-semibold">{AUTO_JOURNAL_EVENT_LABEL[event]}</div>
                <p className="mt-1 text-sm text-muted">No mapping exists for this event yet.</p>
              </Card>
            )
          }
          const update = (patch: Partial<Omit<AutoJournalMapping, 'id' | 'event'>>, label: string) =>
            act({ type: 'autoJournals/update', id: m.id, patch }, label, AUTO_JOURNAL_EVENT_LABEL[event])
          return (
            <Card key={event} className={cn('p-5', !m.enabled && 'opacity-80')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{AUTO_JOURNAL_EVENT_LABEL[event]}</div>
                  <Link to={`${paths.journals}?source=auto`} className="text-xs text-muted hover:underline">
                    {count} {count === 1 ? 'journal' : 'journals'} posted
                  </Link>
                </div>
                {manage ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={m.enabled} onCheckedChange={(enabled) => update({ enabled }, enabled ? 'Auto-journal turned on' : 'Auto-journal turned off')} label={`Post ${AUTO_JOURNAL_EVENT_LABEL[event]} automatically`} />
                    {m.enabled ? 'On' : 'Off'}
                  </label>
                ) : (
                  <Badge variant={m.enabled ? 'success' : 'muted'}>{m.enabled ? 'On' : 'Off'}</Badge>
                )}
              </div>
              {manage ? (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Debit">
                    <AccountSelect value={m.debitAccountId} onChange={(debitAccountId) => update({ debitAccountId }, 'Debit account saved')} />
                  </FormField>
                  <FormField label="Credit">
                    <AccountSelect value={m.creditAccountId} onChange={(creditAccountId) => update({ creditAccountId }, 'Credit account saved')} />
                  </FormField>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  <div className="min-w-0 truncate">
                    <span className="text-muted">Debit </span>
                    {accountLabel(state, m.debitAccountId)}
                  </div>
                  <div className="min-w-0 truncate">
                    <span className="text-muted">Credit </span>
                    {accountLabel(state, m.creditAccountId)}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- finance settings

type ControlKey = 'receivableAccountId' | 'payableAccountId' | 'vatInAccountId' | 'vatOutAccountId' | 'retainedEarningsAccountId' | 'defaultCashAccountId'

const CONTROLS: { key: ControlKey; label: string; hint: string; types?: GlAccountType[]; cash?: boolean }[] = [
  { key: 'receivableAccountId', label: 'Receivables', hint: 'Issued invoices debit this account', types: ['asset'] },
  { key: 'payableAccountId', label: 'Payables', hint: 'Posted bills credit this account', types: ['liability'] },
  { key: 'vatInAccountId', label: 'Input VAT', hint: 'VAT on bills', types: ['asset'] },
  { key: 'vatOutAccountId', label: 'Output VAT', hint: 'VAT on invoices', types: ['liability'] },
  { key: 'retainedEarningsAccountId', label: 'Retained earnings', hint: 'Year-end close moves profit here', types: ['equity'] },
  { key: 'defaultCashAccountId', label: 'Default cash account', hint: 'Preselected on new receipts and payments', cash: true },
]

export function FinanceSettingsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const f = state.financeSettings
  const left = Math.max(f.taxInvoiceLast - f.taxInvoiceNext + 1, 0)

  return (
    <div>
      <SubTabs items={SETUP_TABS} />
      <PageHeader title="Finance settings" description="The VAT rate, the control accounts the ledger posts to on its own, and the faktur pajak range from the tax office." />
      {can('ledger.manage') ? (
        <SettingsForm key={JSON.stringify(f)} settings={f} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <KeyValue
            size="lg"
            items={[
              { label: 'VAT rate', value: `${f.vatPct}%` },
              ...CONTROLS.map((c) => ({ label: c.label, value: accountLabel(state, f[c.key]) })),
            ]}
          />
          <KeyValue
            size="lg"
            items={[
              { label: 'Faktur prefix', value: <span className="font-mono">{f.taxInvoicePrefix}</span> },
              { label: 'Next serial', value: <span className="tabular-nums">{f.taxInvoiceNext}</span> },
              { label: 'Last serial', value: <span className="tabular-nums">{f.taxInvoiceLast}</span> },
              { label: 'Numbers left', value: <span className="tabular-nums">{left}</span> },
            ]}
          />
        </div>
      )}
    </div>
  )
}

function SettingsForm({ settings }: { settings: FinanceSettings }) {
  const { state } = useAppState()
  const act = useAct()
  const [f, setF] = useState({ ...settings, vatPct: String(settings.vatPct), taxInvoiceNext: String(settings.taxInvoiceNext), taxInvoiceLast: String(settings.taxInvoiceLast) })
  const patch: Partial<FinanceSettings> = {
    ...f,
    vatPct: Number(f.vatPct) || 0,
    taxInvoicePrefix: f.taxInvoicePrefix.trim(),
    taxInvoiceNext: Number(f.taxInvoiceNext) || 0,
    taxInvoiceLast: Number(f.taxInvoiceLast) || 0,
  }
  const blocker = blockerFor(state, { type: 'financeSettings/update', patch })
  const left = Math.max((patch.taxInvoiceLast ?? 0) - (patch.taxInvoiceNext ?? 0) + 1, 0)
  const num = (k: 'vatPct' | 'taxInvoiceNext' | 'taxInvoiceLast') => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        act({ type: 'financeSettings/update', patch }, 'Finance settings saved')
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tax and control accounts</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="VAT rate (PPN)" hint="Percent, applied to new bills and invoices" className="sm:col-span-2">
              <Input inputMode="decimal" value={f.vatPct} onChange={num('vatPct')} right={<span className="pr-3 text-sm text-muted">%</span>} className="sm:max-w-40" />
            </FormField>
            {CONTROLS.map((c) => (
              <FormField key={c.key} label={c.label} hint={c.hint}>
                <AccountSelect value={f[c.key]} onChange={(id) => setF({ ...f, [c.key]: id })} types={c.types} cash={c.cash} />
              </FormField>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Faktur pajak range</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Prefix" hint="Printed before the eight-digit serial" className="sm:col-span-2">
              <Input value={f.taxInvoicePrefix} onChange={(e) => setF({ ...f, taxInvoicePrefix: e.target.value })} inputClassName="font-mono" />
            </FormField>
            <FormField label="Next serial">
              <Input inputMode="numeric" value={f.taxInvoiceNext} onChange={num('taxInvoiceNext')} inputClassName="tabular-nums" />
            </FormField>
            <FormField label="Last serial">
              <Input inputMode="numeric" value={f.taxInvoiceLast} onChange={num('taxInvoiceLast')} inputClassName="tabular-nums" />
            </FormField>
            <div className="rounded-2xl bg-surface-2 p-4 text-sm sm:col-span-2">
              <div className="text-muted">Numbers left</div>
              <div className={cn('text-2xl font-bold tabular-nums', left === 0 ? 'text-danger' : left < 20 && 'text-warning')}>{left}</div>
              <div className="mt-1 truncate font-mono text-xs text-muted">
                Next: {patch.taxInvoicePrefix}
                {String(patch.taxInvoiceNext).padStart(8, '0')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {blocker && <p className="text-sm text-danger">{blocker}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setF({ ...settings, vatPct: String(settings.vatPct), taxInvoiceNext: String(settings.taxInvoiceNext), taxInvoiceLast: String(settings.taxInvoiceLast) })}>
          Reset
        </Button>
        <Button type="submit" disabled={!!blocker} title={blocker ?? undefined}>
          Save settings
        </Button>
      </div>
    </form>
  )
}
