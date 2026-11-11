import { addDays, countBy, fmtDate, fmtDateLong, fmtDateTime, fmtIdr, fmtIdrShort, fromDateInput, journalFor, newId, nowIso, nowMs, toDateInput } from '@artha/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import {
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  type Payment,
  type PaymentKind,
  type PaymentMethod,
  type PaymentStatus,
} from '@artha/types'
import { Ban, CircleCheck, Clock, Plus, Printer, Search, Undo2, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { LetterBlock, LetterHead, LetterRow, Signature } from '../../components/Letter'
import { CodeLink, paths } from '../../components/links'
import { priceInput, readPrice } from '../../lib/price'
import { useAppState, useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'

const STATUSES: PaymentStatus[] = ['pending', 'paid', 'expired', 'refunded']
const KINDS = Object.keys(PAYMENT_KIND_LABEL) as PaymentKind[]
const REQUEST_KINDS = KINDS.filter((k) => k !== 'refund')
const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]

const STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = { pending: 'warning', paid: 'success', expired: 'muted', refunded: 'outline' }

const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge variant={STATUS_VARIANT[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>

const signedAmount = (p: Payment) => (p.kind === 'refund' ? `- ${fmtIdr(p.amount)}` : fmtIdr(p.amount))

// ---------------------------------------------------------------- list

export function PaymentsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [requesting, setRequesting] = useState(false)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as PaymentStatus | null) || null
  const kind = (params.get('kind') as PaymentKind | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const dealOf = (p: Payment) => state.deals.find((d) => d.id === p.dealId)
  const buyerOf = (p: Payment) => state.contacts.find((c) => c.id === p.contactId)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.payments.filter((p) => terms.every((t) => `${p.code} ${p.reference} ${dealOf(p)?.code} ${dealOf(p)?.title} ${buyerOf(p)?.name}`.toLowerCase().includes(t)))
  const statusCounts = countBy(searched.filter((p) => !kind || p.kind === kind), (p) => p.status)
  const kindCounts = countBy(searched.filter((p) => !status || p.status === status), (p) => p.kind)
  const rows = searched.filter((p) => (!status || p.status === status) && (!kind || p.kind === kind))
  const filters = [q, status, kind].filter(Boolean).length

  const month = new Date(now).toISOString().slice(0, 7)
  const collected = state.payments.filter((p) => p.kind !== 'refund' && p.paidAt?.startsWith(month)).reduce((n, p) => n + p.amount, 0)
  const waiting = state.payments.filter((p) => p.status === 'pending')
  const all = countBy(state.payments, (p) => p.status)
  const refunded = state.payments.filter((p) => p.kind === 'refund').reduce((n, p) => n + p.amount, 0)
  const toggle = (s: PaymentStatus) => set('status', status === s ? null : s)

  const columns: Column<Payment>[] = [
    {
      id: 'code',
      header: 'Payment',
      sortValue: (p) => p.code,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{p.code}</div>
          <div className="truncate text-sm">{buyerOf(p)?.name ?? '–'}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
            <PaymentStatusBadge status={p.status} />
            <span className="text-xs text-muted">{PAYMENT_KIND_LABEL[p.kind]}</span>
          </div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (p) => STATUSES.indexOf(p.status), cell: (p) => <PaymentStatusBadge status={p.status} /> },
    { id: 'kind', header: 'Kind', hideBelow: 'md', sortValue: (p) => p.kind, cell: (p) => <span className="text-sm">{PAYMENT_KIND_LABEL[p.kind]}</span> },
    {
      id: 'deal',
      header: 'Deal',
      hideBelow: 'lg',
      sortValue: (p) => dealOf(p)?.code ?? '',
      cell: (p) => {
        const d = dealOf(p)
        return d ? <CodeLink to={paths.deal(d.id)} code={d.code} /> : <span className="text-muted">–</span>
      },
    },
    { id: 'method', header: 'Method', hideBelow: 'xl', cell: (p) => <span className="text-xs text-muted">{PAYMENT_METHOD_LABEL[p.method]}</span> },
    { id: 'date', header: 'Date', hideBelow: 'lg', sortValue: (p) => p.paidAt ?? p.createdAt, cell: (p) => <span className="text-xs text-muted">{fmtDate(p.paidAt ?? p.createdAt)}</span> },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (p) => (p.kind === 'refund' ? -p.amount : p.amount),
      cell: (p) => <span className={`font-semibold tabular-nums ${p.kind === 'refund' ? 'text-muted' : ''}`}>{p.kind === 'refund' ? `- ${fmtIdrShort(p.amount)}` : fmtIdrShort(p.amount)}</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Booking fees, deposits and down payments. A paid booking fee books the unit and moves the deal to booking."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search payments"
              placeholder="Code, reference, deal or buyer"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('payment.manage') && (
              <Button onClick={() => setRequesting(true)}>
                <Plus />
                Request payment
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Collected this month" value={fmtIdrShort(collected).replace('Rp ', '')} unit="Rp" icon={<Wallet />} tone="ink" active={status === 'paid'} onClick={() => toggle('paid')} />
        <StatCard
          label="Waiting for payment"
          value={waiting.length}
          icon={<Clock />}
          tone={waiting.length ? 'warning' : 'default'}
          hint={waiting.length ? fmtIdrShort(waiting.reduce((n, p) => n + p.amount, 0)) : undefined}
          active={status === 'pending'}
          onClick={() => toggle('pending')}
        />
        <StatCard label="Expired" value={all.expired ?? 0} icon={<Ban />} active={status === 'expired'} onClick={() => toggle('expired')} />
        <StatCard label="Refunded" value={all.refunded ?? 0} icon={<Undo2 />} hint={refunded ? `${fmtIdrShort(refunded)} returned` : undefined} active={status === 'refunded'} onClick={() => toggle('refunded')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => toggle(s)}>
              {PAYMENT_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
              {PAYMENT_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.payments.length}
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
          getRowKey={(p) => p.id}
          rowLabel={(p) => p.code}
          onRowClick={(p) => navigate(paths.payment(p.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}|${kind}`}
          rowClassName={(p) => (p.status === 'pending' ? 'bg-warning-soft/40' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching payments" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No payments yet" description="Request a booking fee from a deal to start." />
            )
          }
        />
      </div>
      <Dialog open={requesting} onOpenChange={setRequesting} size="lg" title="Request payment" description="The buyer gets a virtual account or QRIS code to pay before the deadline. Unpaid requests expire on their own.">
        {requesting && (
          <RequestForm
            onDone={(id) => {
              setRequesting(false)
              if (id) navigate(paths.payment(id))
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

/** A reference the buyer pays to; the mock gateway answers at once. */
const makeReference = (method: PaymentMethod) => {
  const digits = String(nowMs()).slice(-8)
  if (method === 'virtual_account') return `8808 ${digits.slice(0, 4)} ${digits.slice(4)}`
  if (method === 'qris') return `QRIS-${digits}`
  return ''
}

function RequestForm({ onDone }: { onDone: (id: string | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const lostStages = new Set(state.stages.filter((s) => s.kind === 'lost').map((s) => s.id))
  const deals = state.deals.filter((d) => !lostStages.has(d.stageId))
  const quotedFee = (dealId: string) => state.quotations.find((x) => x.dealId === dealId && x.status !== 'superseded' && x.status !== 'rejected')?.bookingFee
  const firstDeal = deals[0]?.id ?? ''
  const [f, setF] = useState({
    dealId: firstDeal,
    kind: 'booking_fee' as PaymentKind,
    amount: priceInput(quotedFee(firstDeal) ?? 0),
    method: 'virtual_account' as PaymentMethod,
    unitId: '',
    expires: toDateInput(addDays(nowIso(), 2)),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const deal = state.deals.find((d) => d.id === f.dealId)
  const units = state.units.filter((u) => u.status === 'available' || u.dealId === f.dealId)
  const amount = readPrice(f.amount) ?? 0
  const online = f.method === 'virtual_account' || f.method === 'qris'
  const errors = {
    dealId: deal ? null : 'Pick the deal this payment belongs to.',
    amount: amount > 0 ? null : 'Enter the amount, for example 50 M.',
    expires: !f.expires ? (online ? 'Online payments need a deadline.' : null) : fromDateInput(f.expires) > nowIso() ? null : 'Pick a date after today.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const projectOf = (projectId: string) => state.projects.find((p) => p.id === projectId)?.name ?? ''

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!deal || Object.values(errors).some(Boolean)) return
        const payment: Payment = {
          id: newId('pay'),
          code: '',
          kind: f.kind,
          dealId: deal.id,
          contactId: deal.contactId,
          unitId: f.unitId || null,
          amount,
          method: f.method,
          status: 'pending',
          reference: makeReference(f.method),
          expiresAt: f.expires ? fromDateInput(f.expires) : null,
          paidAt: null,
          refundOf: null,
          createdBy: '',
          createdAt: nowIso(),
        }
        if (act({ type: 'payments/create', payment }, 'Payment requested', `${fmtIdr(amount)} for ${deal.code}`)) onDone(payment.id)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Deal" required error={show(errors.dealId)} className="sm:col-span-2">
          <NativeSelect
            value={f.dealId}
            onChange={(e) => {
              const fee = quotedFee(e.target.value)
              setF({ ...f, dealId: e.target.value, unitId: '', amount: f.kind === 'booking_fee' && fee ? priceInput(fee) : f.amount })
            }}
          >
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Kind" required>
          <NativeSelect value={f.kind} onChange={set('kind')}>
            {REQUEST_KINDS.map((k) => (
              <option key={k} value={k}>
                {PAYMENT_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Amount" required error={show(errors.amount)} hint={amount ? fmtIdr(amount) : 'For example 50 M'}>
          <Input value={f.amount} onChange={set('amount')} placeholder="50 M" />
        </FormField>
        <FormField label="Method" required>
          <NativeSelect value={f.method} onChange={set('method')}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Pay before" required={online} error={show(errors.expires)} hint={online ? 'The request expires after this date' : 'Optional for transfer and cash'}>
          <Input type="date" value={f.expires} onChange={set('expires')} />
        </FormField>
        <FormField label="Unit" hint="Optional. A paid booking fee books this unit." className="sm:col-span-2">
          <NativeSelect value={f.unitId} onChange={set('unitId')}>
            <option value="">No unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {projectOf(u.projectId)} {u.code} · {u.type} · {fmtIdrShort(u.price)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {online && (
        <Banner tone="info" title={f.method === 'qris' ? 'A QRIS code is created' : 'A virtual account is created'} className="mt-4">
          The buyer pays to it and the payment shows as paid once the bank confirms.
        </Banner>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">Request payment</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- detail: printable receipt

const TITLE: Record<PaymentStatus, string> = { pending: 'Payment request', paid: 'Payment receipt', expired: 'Payment request', refunded: 'Payment receipt' }

const STAMP: Record<PaymentStatus, string> = {
  pending: 'border-warning text-warning',
  paid: 'border-success text-success',
  expired: 'border-silver text-muted',
  refunded: 'border-accent text-accent',
}

export function PaymentDetailPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const [paying, setPaying] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const p = state.payments.find((x) => x.id === id)
  if (!p) {
    return (
      <Card>
        <EmptyState pageTitle title="Payment not found" description="This payment may have been removed." action={<BackButton fallback={paths.payments} />} />
      </Card>
    )
  }
  const deal = state.deals.find((d) => d.id === p.dealId)
  const buyer = state.contacts.find((c) => c.id === p.contactId)
  const unit = state.units.find((u) => u.id === p.unitId)
  const project = unit && state.projects.find((x) => x.id === unit.projectId)
  const listing = state.listings.find((l) => l.id === deal?.listingId)
  const original = p.refundOf ? state.payments.find((x) => x.id === p.refundOf) : undefined
  const refund = state.payments.find((x) => x.refundOf === p.id)
  const manage = can('payment.manage')
  const journal = journalFor(state, 'payment', p.id)
  const isRefund = p.kind === 'refund'
  const title = isRefund ? 'Refund receipt' : TITLE[p.status]

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.payments} />
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{p.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PaymentStatusBadge status={p.status} />
            <span className="text-sm text-muted">{PAYMENT_KIND_LABEL[p.kind]}</span>
            {deal && <CodeLink to={paths.deal(deal.id)} code={deal.code} />}
            {journal && can('finance.view') && <CodeLink to={paths.journal(journal.id)} code={journal.code} />}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {manage && p.status === 'pending' && (
            <Button onClick={() => setPaying(true)}>
              <CircleCheck />
              Mark paid
            </Button>
          )}
          {manage && p.status === 'paid' && !isRefund && (
            <Button variant="danger" onClick={() => setRefunding(true)}>
              <Undo2 />
              Refund
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
        </div>
      </div>

      {original && (
        <Banner tone="neutral" title={`Refund of ${original.code}`} className="print:hidden" actions={<Button variant="outline" size="sm" asChild><Link to={paths.payment(original.id)}>Open original</Link></Button>}>
          {PAYMENT_KIND_LABEL[original.kind]} paid {original.paidAt ? fmtDate(original.paidAt) : ''}, returned to the buyer.
        </Banner>
      )}
      {refund && (
        <Banner tone="warning" title={`Refunded in ${refund.code}`} className="print:hidden" actions={<Button variant="outline" size="sm" asChild><Link to={paths.payment(refund.id)}>Open refund</Link></Button>}>
          {fmtIdr(refund.amount)} returned on {fmtDate(refund.paidAt ?? refund.createdAt)}.
        </Banner>
      )}

      <Card className="mx-auto max-w-3xl p-6 sm:p-10 print:max-w-none print:border-0 print:p-0">
        <LetterHead company={state.company} />
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">{title}</div>
            <div className="font-mono text-xs text-muted">{p.code}</div>
            <div className="mt-1 text-sm text-muted">{fmtDateLong(p.paidAt ?? p.createdAt)}</div>
          </div>
          <div className={`-rotate-6 rounded-lg border-2 px-3 py-1 text-sm font-extrabold uppercase tracking-widest ${STAMP[p.status]}`}>{isRefund ? 'Refunded' : PAYMENT_STATUS_LABEL[p.status]}</div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LetterBlock title={isRefund ? 'Paid to' : 'Received from'}>
            <div className="font-semibold">{buyer?.name ?? '–'}</div>
            {buyer?.phone && <div>{buyer.phone}</div>}
            {buyer?.email && <div>{buyer.email}</div>}
          </LetterBlock>
          <LetterBlock title="Property">
            {unit ? (
              <>
                <div className="font-semibold">{project?.name ?? 'Project'} unit {unit.code}</div>
                <div>{unit.type}</div>
                {project && <div>{project.district}, {project.city}</div>}
              </>
            ) : listing ? (
              <>
                <div className="font-semibold">{listing.title}</div>
                <div className="font-mono text-xs">{listing.code}</div>
                <div>{listing.address}</div>
              </>
            ) : (
              <div>{deal?.title ?? '–'}</div>
            )}
          </LetterBlock>
        </div>

        <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
          <LetterRow label="Payment for" value={original ? `Refund of ${PAYMENT_KIND_LABEL[original.kind].toLowerCase()} ${original.code}` : PAYMENT_KIND_LABEL[p.kind]} />
          <LetterRow label="Deal" value={deal ? `${deal.code} · ${deal.title}` : '–'} />
          <LetterRow label="Amount" value={signedAmount(p)} strong />
          <LetterRow label="Method" value={PAYMENT_METHOD_LABEL[p.method]} />
          {p.reference && <LetterRow label={p.method === 'virtual_account' ? 'Virtual account' : 'Reference'} value={p.reference} />}
          <LetterRow label="Issued" value={fmtDateTime(p.createdAt)} />
          {p.expiresAt && p.status !== 'paid' && <LetterRow label="Pay before" value={fmtDateTime(p.expiresAt)} />}
          {p.paidAt && <LetterRow label={isRefund ? 'Returned on' : 'Paid on'} value={fmtDateTime(p.paidAt)} />}
        </dl>

        <p className="mt-4 text-xs text-muted">
          {p.status === 'pending'
            ? `Pay the exact amount to the ${PAYMENT_METHOD_LABEL[p.method].toLowerCase()} above${p.expiresAt ? ` before ${fmtDateTime(p.expiresAt)}` : ''}. This request lapses after that time.`
            : p.status === 'expired'
              ? 'This request lapsed without payment. Ask the agent for a new one.'
              : isRefund
                ? 'This amount was returned to the buyer by bank transfer.'
                : 'A booking fee holds the property for the buyer and counts toward the price.'}
        </p>

        <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
          <div />
          <Signature role={`For ${state.company.name}`} name={actorName(p.createdBy)} />
        </div>
      </Card>

      <Dialog open={paying} onOpenChange={setPaying} title={`Mark ${p.code} paid`} description="Record the bank or gateway reference that confirms the payment.">
        {paying && <MarkPaidForm payment={p} onDone={() => setPaying(false)} />}
      </Dialog>
      <Dialog open={refunding} onOpenChange={setRefunding} title={`Refund ${p.code}?`} description={`${fmtIdr(p.amount)} goes back to ${buyer?.name ?? 'the buyer'} by bank transfer.${unit?.status === 'booked' ? ` Unit ${unit.code} becomes available again.` : ''}`}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRefunding(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const refundId = newId('pay')
              if (act({ type: 'payments/refund', id: p.id, refundId }, 'Payment refunded', `${fmtIdr(p.amount)} to ${buyer?.name ?? 'the buyer'}`)) {
                setRefunding(false)
                navigate(paths.payment(refundId))
              }
            }}
          >
            Refund
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function MarkPaidForm({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const act = useAct()
  const [reference, setReference] = useState(payment.reference)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (act({ type: 'payments/markPaid', id: payment.id, reference: reference.trim() }, 'Payment recorded', `${payment.code} · ${fmtIdr(payment.amount)}`)) onDone()
      }}
    >
      <FormField label="Reference" hint="Bank transfer number, gateway receipt or cash slip">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} inputClassName="font-mono" />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Mark paid</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- letter pieces, shared with commission statements
