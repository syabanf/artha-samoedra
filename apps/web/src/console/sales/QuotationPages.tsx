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
  isOpenDeal,
  needsApproval,
  netPrice,
  newId,
  nextQuotationCode,
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
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
  Textarea,
  type BadgeVariant,
  cn,
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
import { CircleCheck, CircleX, FileText, Percent, Plus, Printer, RotateCcw, Search, Send, ShieldCheck, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { DocBottom, DocField, DocFields, DocInput, DocNotes, DocSection, DocSelect, DocSummary, DocumentHead, DocumentPickers, DocumentSheet } from '../../components/DocumentSheet'
import { Signature } from '../../components/Letter'
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

/** The next step for a quotation, shown only to roles that may take it. `revise` adds a link to the revision page. */
export function QuotationActions({ q, revise }: { q: Quotation; revise?: boolean }) {
  const { can } = useAuth()
  const act = useAct()
  const manage = can('deal.manage')
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
      {manage && revise && REVISABLE.includes(q.status) && (
        <Button size="sm" variant="ghost" asChild>
          <Link to={paths.quotationRevise(q.id)}>Revise</Link>
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the quotation as a document

const REVISABLE: QuotationStatus[] = ['draft', 'pending_approval', 'approved', 'sent']
const PLANS = Object.keys(PAYMENT_PLAN_LABEL) as PaymentPlan[]

type Terms = Pick<Quotation, 'listPrice' | 'discountPct' | 'bookingFee' | 'paymentPlan' | 'validUntil' | 'notes'>
interface QuoteDraft {
  listPrice: string
  discountPct: string
  bookingFee: string
  paymentPlan: PaymentPlan
  validUntil: string
  notes: string
}

/** The inputs a paper shows in place of text; errors are already held back until the first submit. */
interface QuoteEdit {
  f: QuoteDraft
  set: (k: keyof QuoteDraft) => (e: { target: { value: string } }) => void
  errors: Partial<Record<keyof QuoteDraft | 'deal', string>>
  onListingPrice: (price: number) => void
}

/** Letterhead, buyer and property rows, the property line and the price summary, as text or as inputs. */
function QuotationPaper({
  deal,
  number,
  date,
  terms,
  edit,
  children,
  ...props
}: {
  deal: Deal | undefined
  number: string
  date: string
  terms: Terms
  edit?: QuoteEdit
  children?: ReactNode
  id?: string
}) {
  const { state } = useAppState()
  const buyer = state.contacts.find((c) => c.id === deal?.contactId)
  const listing = state.listings.find((l) => l.id === deal?.listingId)
  const owner = state.users.find((u) => u.id === deal?.ownerId)
  const net = netPrice(terms)

  return (
    <DocumentSheet {...props}>
      <DocumentHead company={state.company} title="Quotation" number={number} />
      <DocFields
        left={
          <>
            <DocField label="Property">{listing?.title ?? deal?.title ?? '–'}</DocField>
            <DocField label="Client" required={!!edit} error={edit?.errors.deal}>
              {buyer?.name ?? (edit ? <span className="font-normal text-muted">Pick a deal above</span> : '–')}
            </DocField>
            <DocField label="Agent">{owner?.name ?? '–'}</DocField>
            <DocField label="Phone">{buyer?.phone || '–'}</DocField>
            <DocField label="Email">{buyer?.email || '–'}</DocField>
          </>
        }
        right={
          <>
            <DocField label="Date">{fmtDateLong(date)}</DocField>
            <DocField label="Valid until" required={!!edit} error={edit?.errors.validUntil}>
              {edit ? <DocInput type="date" value={edit.f.validUntil} onChange={edit.set('validUntil')} /> : fmtDateLong(terms.validUntil)}
            </DocField>
            <DocField label="Payment plan" required={!!edit}>
              {edit ? (
                <DocSelect value={edit.f.paymentPlan} onChange={edit.set('paymentPlan')}>
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {PAYMENT_PLAN_LABEL[p]}
                    </option>
                  ))}
                </DocSelect>
              ) : (
                PAYMENT_PLAN_LABEL[terms.paymentPlan]
              )}
            </DocField>
            <DocField label="Booking fee" error={edit?.errors.bookingFee}>
              {edit ? <DocInput value={edit.f.bookingFee} onChange={edit.set('bookingFee')} placeholder="50 million" /> : fmtIdr(terms.bookingFee)}
            </DocField>
            <DocField label="Location">{listing?.address ?? '–'}</DocField>
            <DocField label="Deal">{deal ? <CodeLink to={paths.deal(deal.id)} code={deal.code} /> : '–'}</DocField>
          </>
        }
      />

      <DocSection
        title="Property price"
        actions={
          edit &&
          listing && (
            <Button type="button" variant="outline" size="sm" onClick={() => edit.onListingPrice(listing.price)}>
              <RotateCcw />
              Use listing price
            </Button>
          )
        }
      >
        <div className="hidden grid-cols-[minmax(0,1fr)_10rem_6rem_10rem] gap-3 border-b border-border pb-2 text-xs font-semibold text-muted sm:grid print:grid">
          <span>Description</span>
          <span className="text-right">List price</span>
          <span className="text-right">Discount</span>
          <span className="text-right">Price after discount</span>
        </div>
        <div className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_6rem_10rem] sm:items-start print:grid-cols-[minmax(0,1fr)_10rem_6rem_10rem]">
          <div className="col-span-2 min-w-0 text-sm sm:col-span-1 print:col-span-1">
            <div className="font-semibold">{listing?.title ?? deal?.title ?? 'No property yet'}</div>
            {listing && <div className="font-mono text-xs text-muted">{listing.code}</div>}
          </div>
          <LineCell label="List price">
            {edit ? (
              <>
                <DocInput aria-label="List price" aria-invalid={!!edit.errors.listPrice || undefined} value={edit.f.listPrice} onChange={edit.set('listPrice')} placeholder="2.5 B" className="text-right" />
                <div className="mt-1 text-right text-xs text-muted">{terms.listPrice ? fmtIdr(terms.listPrice) : 'For example 2.5 B'}</div>
              </>
            ) : (
              fmtIdr(terms.listPrice)
            )}
          </LineCell>
          <LineCell label="Discount">
            {edit ? (
              <div className="flex items-baseline gap-1">
                <DocInput aria-label="Discount in percent" aria-invalid={!!edit.errors.discountPct || undefined} inputMode="decimal" value={edit.f.discountPct} onChange={edit.set('discountPct')} className="text-right" />
                <span className="text-sm text-muted">%</span>
              </div>
            ) : (
              fmtPercent(terms.discountPct)
            )}
          </LineCell>
          <LineCell label="Price after discount" className="col-span-2 sm:col-span-1 print:col-span-1">
            <span className="font-semibold">{fmtIdr(net)}</span>
          </LineCell>
        </div>
        {edit && (edit.errors.listPrice || edit.errors.discountPct) && (
          <p className="text-sm text-danger">{[edit.errors.listPrice, edit.errors.discountPct].filter(Boolean).join(' ')}</p>
        )}
      </DocSection>

      <DocBottom
        notes={
          <DocNotes label="Notes for this quotation">
            {edit ? (
              <Textarea aria-label="Notes for this quotation" className="min-h-24" value={edit.f.notes} onChange={edit.set('notes')} placeholder="Printed on the letter, for example what the price includes" />
            ) : (
              <p className="whitespace-pre-line text-sm">{terms.notes || <span className="text-muted">No notes.</span>}</p>
            )}
          </DocNotes>
        }
        summary={
          <DocSummary
            rows={[
              { label: 'List price', value: fmtIdr(terms.listPrice) },
              { label: <><Percent className="size-4" />Discount {fmtPercent(terms.discountPct)}</>, value: `- ${fmtIdr(terms.listPrice - net)}`, tone: 'warning' },
              { label: 'Price after discount', value: fmtIdr(net), tone: 'total' },
              { label: 'Booking fee due on signing', value: fmtIdr(terms.bookingFee), tone: 'info' },
              { label: 'Balance after booking fee', value: fmtIdr(net - terms.bookingFee) },
            ]}
          />
        }
      />
      {children}
    </DocumentSheet>
  )
}

/** One cell of the property line, with its own label on phones where the header row is hidden. */
const LineCell = ({ label, className, children }: { label: string; className?: string; children: ReactNode }) => (
  <div className={cn('min-w-0 text-sm tabular-nums sm:text-right print:text-right', className)}>
    <div className="text-xs text-muted sm:hidden print:hidden">{label}</div>
    {children}
  </div>
)

// ---------------------------------------------------------------- editor: new quotation and revision

export function QuotationEditorPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const revising = id ? state.quotations.find((x) => x.id === id) : undefined
  if (!can('deal.manage')) return <NoAccess action={<BackButton fallback={paths.quotations} />} />
  if (id && !revising) {
    return (
      <Card>
        <EmptyState pageTitle title="Quotation not found" description="This quotation may have been removed." action={<BackButton fallback={paths.quotations} />} />
      </Card>
    )
  }
  if (revising && !REVISABLE.includes(revising.status)) {
    return (
      <Card>
        <EmptyState
          title="Only an open quotation can be revised"
          description={`${revising.code} is ${QUOTATION_STATUS_LABEL[revising.status].toLowerCase()}.`}
          action={
            <Button variant="outline" asChild>
              <Link to={paths.quotation(revising.id)}>Open quotation</Link>
            </Button>
          }
        />
      </Card>
    )
  }
  return <QuotationEditor key={id ?? 'new'} revising={revising} />
}

function QuotationEditor({ revising }: { revising?: Quotation }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const deal = state.deals.find((d) => d.id === (revising?.dealId ?? params.get('deal')))
  const branchOf = (d: Deal) => state.users.find((u) => u.id === d.ownerId)?.branchId
  const [branchId, setBranchId] = useState(() => (deal && branchOf(deal)) ?? '')
  const deals = state.deals.filter((d) => d.id === deal?.id || (isOpenDeal(state, d) && (!branchId || branchOf(d) === branchId)))
  const listingPrice = (d: Deal | undefined) => state.listings.find((l) => l.id === d?.listingId)?.price ?? d?.value ?? 0
  const [tried, setTried] = useState(false)
  const [f, setF] = useState<QuoteDraft>({
    listPrice: priceInput(revising?.listPrice ?? listingPrice(deal)),
    discountPct: String(revising?.discountPct ?? 0),
    bookingFee: priceInput(revising?.bookingFee ?? 50_000_000),
    paymentPlan: revising?.paymentPlan ?? 'cash',
    validUntil: toDateInput(addDays(nowIso(), 14)),
    notes: revising?.notes ?? '',
  })
  const set = (k: keyof QuoteDraft) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const terms: Terms = {
    listPrice: readPrice(f.listPrice) ?? 0,
    discountPct: Number(f.discountPct),
    bookingFee: readPrice(f.bookingFee) ?? 0,
    paymentPlan: f.paymentPlan,
    validUntil: f.validUntil ? fromDateInput(f.validUntil) : '',
    notes: f.notes.trim(),
  }
  const errors = {
    deal: deal ? null : 'Pick the deal this quotation is for.',
    listPrice: terms.listPrice > 0 ? null : 'Enter the list price, for example 2.5 B.',
    discountPct: f.discountPct.trim() !== '' && terms.discountPct >= 0 && terms.discountPct <= 30 ? null : 'Discount must be between 0% and 30%.',
    bookingFee: terms.bookingFee < netPrice(terms) ? null : 'The booking fee must be below the price after discount.',
    validUntil: terms.validUntil && terms.validUntil > nowIso() ? null : 'Pick a date after today.',
  }
  const shown = Object.fromEntries(Object.entries(errors).map(([k, m]) => [k, tried && m ? m : undefined])) as QuoteEdit['errors']

  const pickDeal = (dealId: string) => {
    setParams(dealId ? { deal: dealId } : {}, { replace: true })
    setF({ ...f, listPrice: priceInput(listingPrice(state.deals.find((d) => d.id === dealId))) })
  }
  const lockedTitle = revising ? `A revision stays on ${deal?.code ?? 'its deal'}.` : undefined
  const back = revising ? paths.quotation(revising.id) : deal ? paths.deal(deal.id) : paths.quotations

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!deal || Object.values(errors).some(Boolean)) return
        const quotation: Quotation = {
          ...terms,
          id: newId('quo'),
          code: '',
          dealId: deal.id,
          version: 0,
          status: 'draft',
          approvedBy: null,
          createdBy: user.id,
          createdAt: nowIso(),
          sentAt: null,
        }
        if (act({ type: 'quotations/create', quotation }, revising ? 'Revision saved as a draft' : 'Quotation saved as a draft', deal.code)) {
          navigate(paths.quotation(quotation.id), { replace: true })
        }
      }}
    >
      <BackButton fallback={back} />
      <PageHeader
        title={revising ? `Revise ${revising.code}` : 'New quotation'}
        description={
          revising
            ? 'The revision becomes a new version and replaces every open version of this deal.'
            : `Fill in the letter as the buyer will read it. A discount above ${APPROVAL_DISCOUNT_PCT}% needs a manager's approval before you can send it.`
        }
      />
      <DocumentPickers>
        <FormField label="Deal" required error={shown.deal} className="sm:col-span-2">
          <NativeSelect value={deal?.id ?? ''} onChange={(e) => pickDeal(e.target.value)} disabled={!!revising} title={lockedTitle}>
            <option value="">Pick an open deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Branch" hint={revising ? undefined : 'Narrows the deals to agents of this branch'}>
          <NativeSelect value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!!revising} title={lockedTitle}>
            <option value="">All branches</option>
            {state.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </DocumentPickers>

      <QuotationPaper
        deal={deal}
        number={nextQuotationCode(state)}
        date={nowIso()}
        terms={terms}
        edit={{ f, set, errors: shown, onListingPrice: (price) => setF({ ...f, listPrice: priceInput(price) }) }}
      />

      {needsApproval(terms) && (
        <Banner tone="warning" title="Needs approval" className="print:hidden">
          A discount above {APPROVAL_DISCOUNT_PCT}% goes to a manager before it can be sent.
        </Banner>
      )}
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={() => navigate(back)}>
          Cancel
        </Button>
        <Button type="submit">{revising ? 'Save revision' : 'Save draft'}</Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- list

export function QuotationsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
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
          <>
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
            {can('deal.manage') && (
              <Button asChild>
                <Link to={paths.quotationNew()}>
                  <Plus />
                  New quotation
                </Link>
              </Button>
            )}
          </>
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
              <EmptyState compact title="No quotations yet" description="Start one from a deal page or with New quotation." />
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
  const q = state.quotations.find((x) => x.id === id)
  if (!q) {
    return (
      <Card>
        <EmptyState pageTitle title="Quotation not found" description="This quotation may have been removed." action={<BackButton fallback={paths.quotations} />} />
      </Card>
    )
  }
  const deal = state.deals.find((d) => d.id === q.dealId)
  const buyer = state.contacts.find((c) => c.id === deal?.contactId)

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
          {deal && <QuotationActions q={q} revise />}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
        </div>
      </div>
      <Card className="p-4 print:hidden">
        <QuotationLifecycle q={q} />
      </Card>

      <QuotationPaper id="booking-letter" deal={deal} number={`${q.code} v${q.version}`} date={q.createdAt} terms={q}>
        <div className="border-t border-border px-5 py-5 sm:px-8">
          <p className="text-xs text-muted">
            The booking fee holds the property for the buyer until the valid-until date and counts toward the price after discount. This offer lapses after that date.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
            <Signature role="Buyer" name={buyer?.name ?? ''} />
            <Signature role={`For ${state.company.name}`} name={actorName(q.approvedBy ?? q.createdBy)} />
          </div>
        </div>
      </QuotationPaper>
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
