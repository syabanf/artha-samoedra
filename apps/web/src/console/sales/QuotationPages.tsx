import {
  addDays,
  APPROVAL_DISCOUNT_PCT,
  countBy,
  fmtDate,
  fmtDateLong,
  fmtIdr,
  fmtIdrShort,
  fmtPercent,
  fromDateInput,
  needsApproval,
  netPrice,
  newId,
  nowIso,
  toDateInput,
} from '@artha/fixtures'
import {
  Badge,
  Banner,
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
  NativeSelect,
  PageHeader,
  StatCard,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import {
  PAYMENT_PLAN_LABEL,
  QUOTATION_STATUS_LABEL,
  type Deal,
  type PaymentPlan,
  type Quotation,
  type QuotationStatus,
} from '@artha/types'
import { CircleCheck, CircleX, FileText, Printer, Search, Send, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { LetterBlock, LetterHead, LetterRow, Signature } from '../../components/Letter'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { priceInput, readPrice } from '../../lib/price'
import { useAppState, useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'

// ---------------------------------------------------------------- shared bits

const STATUSES: QuotationStatus[] = ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'superseded']

const STATUS_VARIANT: Record<QuotationStatus, BadgeVariant> = {
  draft: 'muted',
  pending_approval: 'warning',
  approved: 'info',
  sent: 'ink',
  accepted: 'success',
  rejected: 'danger',
  superseded: 'outline',
}

export const QuotationStatusBadge = ({ status }: { status: QuotationStatus }) => (
  <Badge variant={STATUS_VARIANT[status]}>{QUOTATION_STATUS_LABEL[status]}</Badge>
)

/** Reads 2.5 B, 850 M or plain digits. */

/** Draft, approval when the discount needs it, approved, sent, accepted. */
export function QuotationLifecycle({ q }: { q: Quotation }) {
  const flow: QuotationStatus[] = needsApproval(q) ? ['draft', 'pending_approval', 'approved', 'sent', 'accepted'] : ['draft', 'approved', 'sent', 'accepted']
  const at = flow.indexOf(q.status)
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" aria-label="Quotation progress">
      {flow.map((s, i) => (
        <li key={s} aria-current={s === q.status ? 'step' : undefined} className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${at >= 0 && i <= at ? 'bg-ink' : 'bg-silver'}`} />
          <span className={s === q.status ? 'font-semibold text-foreground' : 'text-muted'}>{QUOTATION_STATUS_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  )
}

/** The next step for a quotation, shown only to roles that may take it. */
export function QuotationActions({ q, onRevise }: { q: Quotation; onRevise?: () => void }) {
  const { can } = useAuth()
  const act = useAct()
  const manage = can('deal.manage')
  const open = q.status !== 'accepted' && q.status !== 'rejected' && q.status !== 'superseded'
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {manage && q.status === 'draft' && (
        <Button
          size="sm"
          onClick={() =>
            act({ type: 'quotations/submit', id: q.id }, needsApproval(q) ? 'Sent for approval' : 'Quotation approved', needsApproval(q) ? `${q.code} waits for a manager` : `${q.code} is ready to send`)
          }
        >
          {needsApproval(q) ? 'Submit for approval' : 'Finalize'}
        </Button>
      )}
      {can('deal.approve') && q.status === 'pending_approval' && (
        <>
          <Button size="sm" onClick={() => act({ type: 'quotations/approve', id: q.id }, 'Quotation approved', q.code)}>
            <ShieldCheck />
            Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => act({ type: 'quotations/reject', id: q.id }, 'Quotation rejected', q.code)}>
            Reject
          </Button>
        </>
      )}
      {manage && q.status === 'approved' && (
        <Button size="sm" onClick={() => act({ type: 'quotations/send', id: q.id }, 'Quotation sent', `${q.code} went to the buyer`)}>
          <Send />
          Send to buyer
        </Button>
      )}
      {manage && q.status === 'sent' && (
        <>
          <Button size="sm" onClick={() => act({ type: 'quotations/respond', id: q.id, accepted: true }, 'Buyer accepted', q.code)}>
            <CircleCheck />
            Buyer accepted
          </Button>
          <Button size="sm" variant="outline" onClick={() => act({ type: 'quotations/respond', id: q.id, accepted: false }, 'Buyer declined', q.code)}>
            <CircleX />
            Buyer declined
          </Button>
        </>
      )}
      {manage && open && onRevise && (
        <Button size="sm" variant="ghost" onClick={onRevise}>
          Revise
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- quotation dialog

export function QuotationDialog({
  open,
  onOpenChange,
  deal,
  revising,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  deal: Deal
  revising: Quotation | null
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={revising ? `Revise ${revising.code}` : `New quotation for ${deal.code}`}
      description={
        revising
          ? 'The revision becomes a new version and replaces every open version of this deal.'
          : `A discount above ${APPROVAL_DISCOUNT_PCT}% needs a manager's approval before you can send it.`
      }
    >
      <QuotationForm deal={deal} revising={revising} onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

function QuotationForm({ deal, revising, onDone }: { deal: Deal; revising: Quotation | null; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const listing = state.listings.find((l) => l.id === deal.listingId)
  const [f, setF] = useState({
    listPrice: priceInput(revising?.listPrice ?? listing?.price ?? deal.value),
    discountPct: String(revising?.discountPct ?? 0),
    bookingFee: priceInput(revising?.bookingFee ?? 50_000_000),
    paymentPlan: revising?.paymentPlan ?? ('cash' as PaymentPlan),
    validUntil: toDateInput(addDays(nowIso(), 14)),
    notes: revising?.notes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const listPrice = readPrice(f.listPrice) ?? 0
  const discountPct = Number(f.discountPct)
  const bookingFee = readPrice(f.bookingFee) ?? 0
  const net = netPrice({ listPrice, discountPct })
  const errors = {
    listPrice: listPrice > 0 ? null : 'Enter the list price, for example 2.5 B.',
    discountPct: f.discountPct.trim() !== '' && discountPct >= 0 && discountPct <= 30 ? null : 'Discount must be between 0% and 30%.',
    bookingFee: bookingFee < net ? null : 'The booking fee must be below the net price.',
    validUntil: f.validUntil && fromDateInput(f.validUntil) > nowIso() ? null : 'Pick a date after today.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const quotation: Quotation = {
          id: newId('quo'),
          code: '',
          dealId: deal.id,
          version: 0,
          listPrice,
          discountPct,
          bookingFee,
          paymentPlan: f.paymentPlan,
          validUntil: fromDateInput(f.validUntil),
          notes: f.notes.trim(),
          status: 'draft',
          approvedBy: null,
          createdBy: user.id,
          createdAt: nowIso(),
          sentAt: null,
        }
        if (act({ type: 'quotations/create', quotation }, revising ? 'Revision saved as a draft' : 'Quotation saved as a draft', deal.code)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="List price" required error={show(errors.listPrice)} hint={listPrice ? fmtIdr(listPrice) : 'For example 2.5 B or 850 M'}>
          <Input value={f.listPrice} onChange={set('listPrice')} placeholder="2.5 B" />
        </FormField>
        <FormField label="Discount" required error={show(errors.discountPct)} hint="In percent, up to 30">
          <Input inputMode="decimal" value={f.discountPct} onChange={set('discountPct')} />
        </FormField>
        <FormField label="Booking fee" error={show(errors.bookingFee)} hint={bookingFee ? fmtIdr(bookingFee) : 'Paid to hold the unit'}>
          <Input value={f.bookingFee} onChange={set('bookingFee')} placeholder="50 M" />
        </FormField>
        <FormField label="Payment plan" required>
          <NativeSelect value={f.paymentPlan} onChange={set('paymentPlan')}>
            {(Object.keys(PAYMENT_PLAN_LABEL) as PaymentPlan[]).map((p) => (
              <option key={p} value={p}>
                {PAYMENT_PLAN_LABEL[p]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Valid until" required error={show(errors.validUntil)}>
          <Input type="date" value={f.validUntil} onChange={set('validUntil')} />
        </FormField>
        <div className="flex flex-col justify-end rounded-2xl bg-surface-2 p-3">
          <div className="text-xs text-muted">Net price</div>
          <div className="text-lg font-bold tabular-nums">{fmtIdr(net)}</div>
        </div>
        <FormField label="Notes" hint="Optional, printed on the letter" className="sm:col-span-2">
          <Textarea className="min-h-20" value={f.notes} onChange={set('notes')} />
        </FormField>
      </div>
      {needsApproval({ discountPct }) && (
        <Banner tone="warning" title="Needs approval" className="mt-4">
          A discount above {APPROVAL_DISCOUNT_PCT}% goes to a manager before it can be sent.
        </Banner>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{revising ? 'Save revision' : 'Save draft'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- list

export function QuotationsPage() {
  const { state } = useAppState()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as QuotationStatus | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const dealOf = (x: Quotation) => state.deals.find((d) => d.id === x.dealId)
  const buyerOf = (x: Quotation) => state.contacts.find((c) => c.id === dealOf(x)?.contactId)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (x: Quotation) => terms.every((t) => `${x.code} ${dealOf(x)?.code} ${dealOf(x)?.title} ${buyerOf(x)?.name}`.toLowerCase().includes(t))
  const searched = state.quotations.filter(matches)
  const rows = searched.filter((x) => !status || x.status === status)
  const counts = countBy(searched, (x) => x.status)
  const filters = [q, status].filter(Boolean).length
  const all = countBy(state.quotations, (x) => x.status)
  const expired = (x: Quotation) => (x.status === 'approved' || x.status === 'sent') && Date.parse(x.validUntil) < now

  const columns: Column<Quotation>[] = [
    {
      id: 'code',
      header: 'Quotation',
      sortValue: (x) => x.code,
      cell: (x) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">
            {x.code} <span className="text-muted">v{x.version}</span>
          </div>
          <div className="truncate text-sm">{dealOf(x)?.title ?? 'Deal removed'}</div>
          <div className="mt-1.5 sm:hidden">
            <QuotationStatusBadge status={x.status} />
          </div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (x) => STATUSES.indexOf(x.status), cell: (x) => <QuotationStatusBadge status={x.status} /> },
    { id: 'buyer', header: 'Buyer', hideBelow: 'md', sortValue: (x) => buyerOf(x)?.name ?? '', cell: (x) => <span className="text-sm">{buyerOf(x)?.name ?? '–'}</span> },
    { id: 'discount', header: 'Discount', hideBelow: 'lg', align: 'right', sortValue: (x) => x.discountPct, cell: (x) => <span className="text-sm tabular-nums">{fmtPercent(x.discountPct)}</span> },
    {
      id: 'valid',
      header: 'Valid until',
      hideBelow: 'lg',
      sortValue: (x) => x.validUntil,
      cell: (x) => <span className={`text-xs ${expired(x) ? 'font-semibold text-accent' : 'text-muted'}`}>{fmtDate(x.validUntil)}</span>,
    },
    { id: 'net', header: 'Net price', align: 'right', sortValue: (x) => netPrice(x), cell: (x) => <span className="font-semibold tabular-nums">{fmtIdrShort(netPrice(x))}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Price offers and booking letters for each deal. A revision replaces the open version."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search quotations"
            placeholder="Code, deal or buyer"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Drafts" value={all.draft ?? 0} icon={<FileText />} active={status === 'draft'} onClick={() => set('status', status === 'draft' ? null : 'draft')} />
        <StatCard label="Needs approval" value={all.pending_approval ?? 0} icon={<ShieldCheck />} tone={all.pending_approval ? 'warning' : 'default'} active={status === 'pending_approval'} onClick={() => set('status', status === 'pending_approval' ? null : 'pending_approval')} />
        <StatCard label="With the buyer" value={all.sent ?? 0} icon={<Send />} tone="ink" active={status === 'sent'} onClick={() => set('status', status === 'sent' ? null : 'sent')} />
        <StatCard label="Accepted" value={all.accepted ?? 0} icon={<CircleCheck />} tone="success" active={status === 'accepted'} onClick={() => set('status', status === 'accepted' ? null : 'accepted')} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {QUOTATION_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.quotations.length}
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
          getRowKey={(x) => x.id}
          rowLabel={(x) => x.code}
          onRowClick={(x) => navigate(paths.quotation(x.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}`}
          rowClassName={(x) => (x.status === 'superseded' ? 'opacity-60' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching quotations" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No quotations yet" description="Create one from a deal page." />
            )
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- detail: printable booking letter

export function QuotationDetailPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const [revising, setRevising] = useState(false)
  const q = state.quotations.find((x) => x.id === id)
  if (!q) {
    return (
      <Card>
        <EmptyState title="Quotation not found" description="This quotation may have been removed." action={<BackButton fallback={paths.quotations} />} />
      </Card>
    )
  }
  const deal = state.deals.find((d) => d.id === q.dealId)
  const buyer = state.contacts.find((c) => c.id === deal?.contactId)
  const listing = state.listings.find((l) => l.id === deal?.listingId)
  const company = state.company
  const net = netPrice(q)
  const signer = actorName(q.approvedBy ?? q.createdBy)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.quotations} />
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">
            {q.code} v{q.version}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Booking letter</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <QuotationStatusBadge status={q.status} />
            {deal && <CodeLink to={paths.deal(deal.id)} code={deal.code} />}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {deal && <QuotationActions q={q} onRevise={() => setRevising(true)} />}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
        </div>
      </div>
      <Card className="p-4 print:hidden">
        <QuotationLifecycle q={q} />
      </Card>

      <Card id="booking-letter" className="mx-auto max-w-3xl p-6 sm:p-10 print:max-w-none print:border-0 print:p-0">
        <LetterHead company={company} />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-bold">Price quotation and booking letter</div>
            <div className="font-mono text-xs text-muted">
              {q.code} · version {q.version}
            </div>
          </div>
          <div className="text-sm text-muted">{fmtDateLong(q.createdAt)}</div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LetterBlock title="Buyer">
            <div className="font-semibold">{buyer?.name ?? '–'}</div>
            {buyer?.phone && <div>{buyer.phone}</div>}
            {buyer?.email && <div>{buyer.email}</div>}
          </LetterBlock>
          <LetterBlock title="Property">
            {listing ? (
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
          <LetterRow label="List price" value={fmtIdr(q.listPrice)} />
          <LetterRow label={`Discount ${fmtPercent(q.discountPct)}`} value={`- ${fmtIdr(q.listPrice - net)}`} />
          <LetterRow label="Net price" value={fmtIdr(net)} strong />
          <LetterRow label="Booking fee" value={fmtIdr(q.bookingFee)} />
          <LetterRow label="Balance after booking fee" value={fmtIdr(net - q.bookingFee)} />
          <LetterRow label="Payment plan" value={PAYMENT_PLAN_LABEL[q.paymentPlan]} />
          <LetterRow label="Valid until" value={fmtDateLong(q.validUntil)} />
        </dl>

        {q.notes && <p className="mt-4 whitespace-pre-line text-sm">{q.notes}</p>}
        <p className="mt-4 text-xs text-muted">
          The booking fee holds the property for the buyer until the valid-until date and counts toward the net price. This offer lapses after that date.
        </p>

        <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
          <Signature role="Buyer" name={buyer?.name ?? ''} />
          <Signature role={`For ${company.name}`} name={signer} />
        </div>
      </Card>
      {deal && <QuotationDialog open={revising} onOpenChange={setRevising} deal={deal} revising={q} />}
    </div>
  )
}


// ---------------------------------------------------------------- approvals

export function ApprovalsPage() {
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const [q, setQ] = useState('')
  if (!can('deal.approve')) {
    return <NoAccess description="Approving discounts needs the deal approval permission." />
  }
  const pending = state.quotations.filter((x) => x.status === 'pending_approval')
  const dealOf = (x: Quotation) => state.deals.find((d) => d.id === x.dealId)
  const buyerOf = (x: Quotation) => state.contacts.find((c) => c.id === dealOf(x)?.contactId)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = pending.filter((x) => terms.every((t) => `${x.code} ${dealOf(x)?.title} ${buyerOf(x)?.name} ${actorName(x.createdBy)}`.toLowerCase().includes(t)))

  return (
    <div>
      <PageHeader
        title="Approvals"
        description={`Quotations with a discount above ${APPROVAL_DISCOUNT_PCT}% wait here. Approve to let the agent send it, or reject to send it back.`}
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search approvals"
            placeholder="Code, deal, buyer or agent"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQ('')}><X /></Button> : undefined}
          />
        }
      />
      {q && (
        <div className="mb-2 text-xs text-muted tabular-nums">
          {rows.length} of {pending.length}
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => setQ('')}>
            Clear filters
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <Card>
          {q ? (
            <EmptyState compact title="No matching quotations" description="Change the search or clear it." action={<Button variant="outline" size="sm" onClick={() => setQ('')}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={<ShieldCheck />} title="Nothing waits for approval" description="New requests show up here when an agent submits a large discount." />
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((x) => (
            <ApprovalCard key={x.id} q={x} deal={dealOf(x)} buyer={buyerOf(x)?.name ?? '–'} requestedBy={actorName(x.createdBy)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovalCard({ q, deal, buyer, requestedBy }: { q: Quotation; deal: Deal | undefined; buyer: string; requestedBy: string }) {
  const net = netPrice(q)
  return (
    <Card>
      <CardHeader action={<Badge variant="warning">{fmtPercent(q.discountPct)} off</Badge>}>
        <CardTitle className="min-w-0">
          <Link to={paths.quotation(q.id)} className="font-mono text-xs font-semibold hover:text-accent">
            {q.code} v{q.version}
          </Link>
          <span className="block truncate text-base">{deal?.title ?? 'Deal removed'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Fact label="Buyer" value={buyer} />
          <Fact label="Requested by" value={requestedBy} />
          <Fact label="List price" value={fmtIdrShort(q.listPrice)} />
          <Fact label="Net price" value={fmtIdrShort(net)} />
          <Fact label="Discount given" value={fmtIdrShort(q.listPrice - net)} />
          <Fact label="Payment plan" value={PAYMENT_PLAN_LABEL[q.paymentPlan]} />
        </dl>
        {q.notes && <p className="rounded-2xl bg-surface-2 p-3 text-sm">{q.notes}</p>}
        <QuotationActions q={q} />
      </CardContent>
    </Card>
  )
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-2xl bg-surface-2 p-3">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="truncate font-semibold tabular-nums">{value}</dd>
  </div>
)
