import {
  addDays,
  AGING_BUCKETS,
  blankLine,
  blockerFor,
  countBy,
  customerName,
  dateBlocker,
  fmtDate,
  fmtDateLong,
  fmtIdr,
  fmtIdrShort,
  fromDateInput,
  invoiceTotals,
  isOverdue,
  monthOf,
  newId,
  nextInvoiceCode,
  nowIso,
  receivableAging,
  settleState,
  taxInvoiceNumber,
  toDateInput,
  type AppState,
} from '@artha/fixtures'
import { CUSTOMER_KIND_LABEL, INVOICE_STATUS_LABEL, type CustomerKind, type Invoice, type InvoiceStatus } from '@artha/types'
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
  PillTabs,
  StatCard,
  Switch,
  Textarea,
  toast,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { Ban, CalendarClock, CircleCheck, Download, FileCheck2, FileText, Pencil, Plus, Printer, Receipt, Search, Send, Wallet, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { DocBottom, DocField, DocFields, DocInput, DocNotes, DocSection, DocSelect, DocSummary, DocumentHead, DocumentPickers, DocumentSheet } from '../../components/DocumentSheet'
import { LetterBlock, Signature } from '../../components/Letter'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { downloadCsv } from '../../lib/csv'
import { useAppState, useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { AccountSelect, DocumentLinesEditor, Money, SettleBadge } from './parts'

const STATUSES: InvoiceStatus[] = ['draft', 'issued', 'void']
const KINDS = Object.keys(CUSTOMER_KIND_LABEL) as CustomerKind[]
type Settle = 'unpaid' | 'partial' | 'paid' | 'overdue'
const SETTLES: Settle[] = ['unpaid', 'partial', 'paid', 'overdue']
const SETTLE_LABEL: Record<Settle, string> = { unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid', overdue: 'Overdue' }
const STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = { draft: 'warning', issued: 'success', void: 'muted' }

/** Settle state of an issued invoice, with overdue winning over unpaid and part paid; null for drafts and void. */
const settleOf = (i: Invoice, nowMs: number): Settle | null => {
  if (i.status !== 'issued') return null
  const t = invoiceTotals(i)
  return isOverdue(i.dueDate, t, nowMs) ? 'overdue' : settleState(t)
}

const needsFaktur = (i: Invoice) => i.status === 'issued' && i.taxPct > 0 && !i.taxInvoice

const InvoiceBadge = ({ invoice, nowMs }: { invoice: Invoice; nowMs: number }) =>
  invoice.status === 'issued' ? (
    <SettleBadge totals={invoiceTotals(invoice)} overdue={settleOf(invoice, nowMs) === 'overdue'} />
  ) : (
    <Badge variant={STATUS_VARIANT[invoice.status]}>{INVOICE_STATUS_LABEL[invoice.status]}</Badge>
  )

const customersOf = (s: AppState, kind: CustomerKind) => (kind === 'contact' ? s.contacts : kind === 'account' ? s.accounts : s.partners)

// ---------------------------------------------------------------- list

type View = 'invoices' | 'receipts'

export function InvoicesPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'receipts' ? 'receipts' : 'invoices'
  const q = params.get('q') ?? ''
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const month = monthOf(new Date(now).toISOString())
  const issued = state.invoices.filter((i) => i.status === 'issued')
  const outstanding = issued.reduce((n, i) => n + invoiceTotals(i).balance, 0)
  const overdue = issued.filter((i) => settleOf(i, now) === 'overdue')
  const issuedThisMonth = issued.filter((i) => monthOf(i.date) === month)
  const collected = state.invoices.flatMap((i) => i.receipts).filter((r) => monthOf(r.date) === month).reduce((n, r) => n + r.amount, 0)
  const receiptCount = state.invoices.reduce((n, i) => n + i.receipts.length, 0)
  const settle = params.get('settle') as Settle | null
  const status = params.get('status') as InvoiceStatus | null

  return (
    <div>
      <PageHeader
        title="Receivables"
        description="Sales invoices to buyers, companies and partners, the receipts against them and the faktur pajak for VAT."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label={view === 'receipts' ? 'Search receipts' : 'Search invoices'}
              placeholder={view === 'receipts' ? 'Invoice, customer or reference' : 'Code, customer or faktur'}
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('billing.manage') && (
              <Button asChild>
                <Link to={paths.invoiceNew}>
                  <Plus />
                  New invoice
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={fmtIdrShort(outstanding).replace('Rp ', '')}
          unit="Rp"
          icon={<Wallet />}
          tone="ink"
          hint={`${issued.filter((i) => invoiceTotals(i).balance > 0).length} open invoices`}
          active={view === 'invoices' && status === 'issued' && !settle}
          onClick={() => setParams(status === 'issued' && !settle ? {} : { status: 'issued' }, { replace: true })}
        />
        <StatCard
          label="Overdue"
          value={fmtIdrShort(overdue.reduce((n, i) => n + invoiceTotals(i).balance, 0)).replace('Rp ', '')}
          unit="Rp"
          icon={<CalendarClock />}
          tone={overdue.length ? 'accent' : 'default'}
          hint={`${overdue.length} ${overdue.length === 1 ? 'invoice' : 'invoices'}`}
          active={view === 'invoices' && settle === 'overdue'}
          onClick={() => setParams(settle === 'overdue' ? {} : { settle: 'overdue' }, { replace: true })}
        />
        <StatCard label="Issued this month" value={issuedThisMonth.length} icon={<FileText />} hint={fmtIdrShort(issuedThisMonth.reduce((n, i) => n + invoiceTotals(i).total, 0))} />
        <StatCard label="Collected this month" value={fmtIdrShort(collected).replace('Rp ', '')} unit="Rp" icon={<Receipt />} active={view === 'receipts'} onClick={() => setParams(view === 'receipts' ? {} : { view: 'receipts' }, { replace: true })} />
      </div>

      <PillTabs
        label="Receivables view"
        className="mt-4"
        items={[
          { value: 'invoices', label: 'Invoices', count: state.invoices.length },
          { value: 'receipts', label: 'Receipts', count: receiptCount },
        ]}
        value={view}
        onChange={(v) => setParams(v === 'receipts' ? { view: v } : {}, { replace: true })}
      />

      {view === 'invoices' ? (
        <>
          <InvoiceTable params={params} set={set} clear={() => setParams({}, { replace: true })} onOpen={(i) => navigate(paths.invoice(i.id))} />
          <AgingCard />
        </>
      ) : (
        <ReceiptTable params={params} set={set} clear={() => setParams({ view: 'receipts' }, { replace: true })} />
      )}
    </div>
  )
}

interface TableProps {
  params: URLSearchParams
  set: (key: string, value: string | null) => void
  clear: () => void
}

function InvoiceTable({ params, set, clear, onOpen }: TableProps & { onOpen: (i: Invoice) => void }) {
  const { state } = useAppState()
  const now = useNow()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as InvoiceStatus | null) || null
  const settle = (params.get('settle') as Settle | null) || null
  const kind = (params.get('kind') as CustomerKind | null) || null
  const faktur = params.get('faktur') === '1'

  const name = (i: Invoice) => customerName(state, i)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.invoices.filter((i) => terms.every((t) => `${i.code} ${name(i)} ${i.taxInvoice?.number ?? ''} ${i.memo}`.toLowerCase().includes(t)))
  const match = (i: Invoice, skip: 'status' | 'settle' | 'kind' | 'faktur' | null) =>
    (skip === 'status' || !status || i.status === status) &&
    (skip === 'settle' || !settle || settleOf(i, now) === settle) &&
    (skip === 'kind' || !kind || i.customerKind === kind) &&
    (skip === 'faktur' || !faktur || needsFaktur(i))
  const statusCounts = countBy(searched.filter((i) => match(i, 'status')), (i) => i.status)
  const settleCounts = countBy(searched.filter((i) => match(i, 'settle')), (i) => settleOf(i, now) ?? 'none')
  const kindCounts = countBy(searched.filter((i) => match(i, 'kind')), (i) => i.customerKind)
  const fakturCount = searched.filter((i) => match(i, 'faktur') && needsFaktur(i)).length
  const rows = searched.filter((i) => match(i, null))
  const filters = [q, status, settle, kind, faktur].filter(Boolean).length

  const columns: Column<Invoice>[] = [
    {
      id: 'code',
      header: 'Invoice',
      sortValue: (i) => i.code,
      cell: (i) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{i.code}</div>
          <div className="truncate text-sm">{name(i)}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
            <InvoiceBadge invoice={i} nowMs={now} />
            <span className="text-xs text-muted">Due {fmtDate(i.dueDate)}</span>
          </div>
        </div>
      ),
    },
    { id: 'kind', header: 'Customer', hideBelow: 'xl', sortValue: (i) => i.customerKind, cell: (i) => <span className="text-xs text-muted">{CUSTOMER_KIND_LABEL[i.customerKind]}</span> },
    { id: 'date', header: 'Date', hideBelow: 'lg', sortValue: (i) => i.date, cell: (i) => <span className="text-xs text-muted">{fmtDate(i.date)}</span> },
    { id: 'due', header: 'Due', hideBelow: 'md', sortValue: (i) => i.dueDate, cell: (i) => <span className={`text-xs ${settleOf(i, now) === 'overdue' ? 'font-semibold text-accent' : 'text-muted'}`}>{fmtDate(i.dueDate)}</span> },
    { id: 'total', header: 'Total', align: 'right', hideBelow: 'sm', sortValue: (i) => invoiceTotals(i).total, cell: (i) => <Money value={invoiceTotals(i).total} className="text-sm" /> },
    {
      id: 'balance',
      header: 'Balance',
      align: 'right',
      sortValue: (i) => (i.status === 'issued' ? invoiceTotals(i).balance : 0),
      cell: (i) => (i.status === 'issued' ? <Money value={invoiceTotals(i).balance} dash className="text-sm font-semibold" /> : <span className="text-muted">–</span>),
    },
    {
      id: 'faktur',
      header: 'Faktur',
      hideBelow: 'xl',
      sortValue: (i) => i.taxInvoice?.number ?? '',
      cell: (i) => (i.taxInvoice ? <span className="font-mono text-xs">{i.taxInvoice.number}</span> : needsFaktur(i) ? <Badge variant="warning">Needed</Badge> : <span className="text-muted">–</span>),
    },
    { id: 'badge', header: 'Status', hideBelow: 'md', sortValue: (i) => settleOf(i, now) ?? i.status, cell: (i) => <InvoiceBadge invoice={i} nowMs={now} /> },
  ]

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {INVOICE_STATUS_LABEL[s]}
            </Chip>
          ))}
          <Chip active={faktur} count={fakturCount} onClick={() => set('faktur', faktur ? null : '1')}>
            Needs faktur
          </Chip>
        </ChipRow>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          {SETTLES.map((s) => (
            <Chip key={s} active={settle === s} count={settleCounts[s] ?? 0} onClick={() => set('settle', settle === s ? null : s)}>
              {SETTLE_LABEL[s]}
            </Chip>
          ))}
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
              {CUSTOMER_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.invoices.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(i) => i.id}
          rowLabel={(i) => i.code}
          onRowClick={onOpen}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}|${settle}|${kind}|${faktur}`}
          rowClassName={(i) => (settleOf(i, now) === 'overdue' ? 'bg-accent-soft/40' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching invoices" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No invoices yet" description="Bill a buyer, company or partner to start." />
            )
          }
        />
      </div>
    </>
  )
}

function AgingCard() {
  const { state } = useAppState()
  const now = useNow()
  const { parties, totals, total } = receivableAging(state, now)
  const exportCsv = () =>
    downloadCsv(`receivable-aging-${toDateInput(new Date(now).toISOString())}`, [
      ['Customer', ...AGING_BUCKETS, 'Total'],
      ...parties.map((p) => [p.party, ...p.buckets, p.total]),
      ['Total', ...totals, total],
    ])
  return (
    <Card className="mt-4" id="aging">
      <CardHeader
        action={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!parties.length} title={parties.length ? undefined : 'Nothing is owed, so there is nothing to export.'}>
            <Download />
            Export CSV
          </Button>
        }
      >
        <CardTitle>Receivable aging</CardTitle>
        <p className="mt-1 text-sm text-muted">Open balances on issued invoices by days past due.</p>
      </CardHeader>
      <CardContent>
        {parties.length ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  {AGING_BUCKETS.map((b) => (
                    <th key={b} className="py-2 pl-3 text-right font-semibold">
                      {b}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parties.map((p) => (
                  <tr key={p.party}>
                    <td className="max-w-[14rem] truncate py-2.5 pr-3 font-medium">{p.party}</td>
                    {p.buckets.map((v, n) => (
                      <td key={n} className={`py-2.5 pl-3 text-right ${n >= 2 && v ? 'text-accent' : ''}`}>
                        <Money value={v} dash />
                      </td>
                    ))}
                    <td className="py-2.5 pl-3 text-right font-semibold">
                      <Money value={p.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink font-semibold">
                  <td className="py-2.5 pr-3">Total</td>
                  {totals.map((v, n) => (
                    <td key={n} className="py-2.5 pl-3 text-right">
                      <Money value={v} dash />
                    </td>
                  ))}
                  <td className="py-2.5 pl-3 text-right">
                    <Money value={total} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState compact title="Nothing is owed" description="Every issued invoice is paid in full." />
        )}
      </CardContent>
    </Card>
  )
}

interface ReceiptRow {
  id: string
  date: string
  amount: number
  cashAccountId: string
  reference: string
  journalId: string
  invoice: Invoice
}

function ReceiptTable({ params, set, clear }: TableProps) {
  const { state } = useAppState()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const account = params.get('account') || null
  const all: ReceiptRow[] = state.invoices.flatMap((invoice) => invoice.receipts.map((r) => ({ ...r, invoice })))
  const accountName = (id: string) => state.glAccounts.find((a) => a.id === id)?.name ?? 'Unknown account'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = all.filter((r) => terms.every((t) => `${r.invoice.code} ${customerName(state, r.invoice)} ${r.reference}`.toLowerCase().includes(t)))
  const accountCounts = countBy(searched, (r) => r.cashAccountId)
  const rows = searched.filter((r) => !account || r.cashAccountId === account)
  const filters = [q, account].filter(Boolean).length

  const columns: Column<ReceiptRow>[] = [
    { id: 'date', header: 'Date', sortValue: (r) => r.date, cell: (r) => <span className="text-xs text-muted">{fmtDate(r.date)}</span> },
    {
      id: 'invoice',
      header: 'Invoice',
      sortValue: (r) => r.invoice.code,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{r.invoice.code}</div>
          <div className="truncate text-sm">{customerName(state, r.invoice)}</div>
        </div>
      ),
    },
    { id: 'account', header: 'Into', hideBelow: 'md', sortValue: (r) => accountName(r.cashAccountId), cell: (r) => <span className="text-sm">{accountName(r.cashAccountId)}</span> },
    { id: 'reference', header: 'Reference', hideBelow: 'lg', cell: (r) => <span className="font-mono text-xs text-muted">{r.reference || '–'}</span> },
    {
      id: 'journal',
      header: 'Journal',
      hideBelow: 'xl',
      cell: (r) => {
        const j = state.journals.find((x) => x.id === r.journalId)
        return j ? <CodeLink to={paths.journal(j.id)} code={j.code} /> : <span className="text-muted">–</span>
      },
    },
    { id: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.amount, cell: (r) => <Money value={r.amount} className="text-sm font-semibold" /> },
  ]

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!account} count={searched.length} onClick={() => set('account', null)}>
            All accounts
          </Chip>
          {Object.keys(accountCounts).map((id) => (
            <Chip key={id} active={account === id} count={accountCounts[id]} onClick={() => set('account', account === id ? null : id)}>
              {accountName(id)}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {all.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          rowLabel={(r) => `Receipt for ${r.invoice.code}`}
          onRowClick={(r) => navigate(paths.invoice(r.invoice.id))}
          initialSort={{ id: 'date', desc: true }}
          resetPageKey={`${q}|${account}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching receipts" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No receipts yet" description="Record a receipt from an issued invoice." />
            )
          }
        />
      </div>
    </>
  )
}

// ---------------------------------------------------------------- the invoice as a document

/** Link, phone, email and place of the customer an invoice bills. */
const customerOf = (s: AppState, inv: Invoice) => {
  if (inv.customerKind === 'contact') {
    const c = s.contacts.find((x) => x.id === inv.customerId)
    return { to: c && paths.contact(c.id), phone: c?.phone, email: c?.email, place: c?.city }
  }
  if (inv.customerKind === 'account') {
    const a = s.accounts.find((x) => x.id === inv.customerId)
    return { to: a && paths.account(a.id), phone: a?.phone, email: undefined, place: [a?.industry, a?.city].filter(Boolean).join(', ') }
  }
  const p = s.partners.find((x) => x.id === inv.customerId)
  return { to: p && paths.partner(p.id), phone: p?.phone, email: p?.email, place: p?.city }
}

/** The inputs an invoice paper shows in place of text. */
interface InvoiceEdit {
  patch: (p: Partial<Invoice>) => void
  linesError?: string
}

/** Letterhead, bill-to and date rows, the lines and the totals, as text or as inputs. */
function InvoicePaper({ inv, number, edit, overdue, stamp, children }: { inv: Invoice; number: string; edit?: InvoiceEdit; overdue?: boolean; stamp?: ReactNode; children?: ReactNode }) {
  const { state } = useAppState()
  const totals = invoiceTotals(inv)
  const customer = customerOf(state, inv)
  const deal = state.deals.find((d) => d.id === inv.dealId)
  const listing = state.listings.find((l) => l.id === inv.listingId)
  const agent = state.users.find((u) => u.id === deal?.ownerId)
  const journal = state.journals.find((j) => j.id === inv.journalId)
  const vat = state.financeSettings.vatPct
  const days = Math.round((Date.parse(inv.dueDate) - Date.parse(inv.date)) / 86_400_000)
  const name = inv.customerId ? customerName(state, inv) : null
  const issued = inv.status === 'issued'

  return (
    <DocumentSheet>
      <DocumentHead company={state.company} title={inv.taxPct ? 'Tax invoice' : 'Invoice'} number={number} stamp={stamp} />
      <DocFields
        left={
          <>
            <DocField label="Listing">
              {edit ? (
                <DocSelect value={inv.listingId ?? ''} onChange={(e) => edit.patch({ listingId: e.target.value || null })}>
                  <option value="">No listing</option>
                  {state.listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.title}
                    </option>
                  ))}
                </DocSelect>
              ) : listing ? (
                <Link to={paths.listing(listing.id)} className="hover:text-accent">
                  {listing.title}
                </Link>
              ) : (
                '–'
              )}
            </DocField>
            <DocField label="Bill to" required={!!edit}>
              {!name ? (
                <span className="font-normal text-muted">Pick a customer above</span>
              ) : customer.to && !edit ? (
                <Link to={customer.to} className="hover:text-accent">
                  {name}
                </Link>
              ) : (
                name
              )}
            </DocField>
            <DocField label="Customer kind">{CUSTOMER_KIND_LABEL[inv.customerKind]}</DocField>
            <DocField label="Agent">{agent?.name ?? '–'}</DocField>
            <DocField label="Phone">{customer.phone || '–'}</DocField>
            <DocField label="Email">{customer.email || '–'}</DocField>
            {inv.taxInvoice && <DocField label="Buyer NPWP">{inv.taxInvoice.buyerTaxId}</DocField>}
          </>
        }
        right={
          <>
            <DocField label="Invoice date" required={!!edit}>
              {edit ? <DocInput type="date" value={toDateInput(inv.date)} onChange={(e) => e.target.value && edit.patch({ date: fromDateInput(e.target.value) })} /> : fmtDateLong(inv.date)}
            </DocField>
            <DocField label="Due date" required={!!edit}>
              {edit ? (
                <DocInput type="date" value={toDateInput(inv.dueDate)} onChange={(e) => e.target.value && edit.patch({ dueDate: fromDateInput(e.target.value) })} />
              ) : (
                <span className={overdue ? 'text-accent' : undefined}>{fmtDateLong(inv.dueDate)}</span>
              )}
            </DocField>
            <DocField label="Terms">{days > 0 ? `Net ${days} days` : 'Due on receipt'}</DocField>
            <DocField label="Location">{customer.place || '–'}</DocField>
            <DocField label="Deal">{deal ? <CodeLink to={paths.deal(deal.id)} code={deal.code} /> : '–'}</DocField>
            {!edit && inv.taxPct > 0 && <DocField label="Faktur pajak">{inv.taxInvoice ? <span className="font-mono text-xs">{inv.taxInvoice.number}</span> : 'Not issued'}</DocField>}
            {!edit && <DocField label="Journal">{journal ? <CodeLink to={paths.journal(journal.id)} code={journal.code} /> : 'Posts on issue'}</DocField>}
          </>
        }
      />

      <DocSection title="Lines">
        {edit ? (
          <DocumentLinesEditor lines={inv.lines} onChange={(lines) => edit.patch({ lines })} taxPct={inv.taxPct} accountTypes={['revenue']} error={edit.linesError} showTotals={false} />
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-semibold">Description</th>
                <th className="hidden w-14 py-2 pl-3 text-right font-semibold sm:table-cell print:table-cell">Qty</th>
                <th className="hidden w-32 py-2 pl-3 text-right font-semibold sm:table-cell print:table-cell">Unit price</th>
                <th className="w-32 py-2 pl-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className="break-words py-2.5 pr-3">
                    {l.description}
                    <div className="text-xs text-muted sm:hidden print:hidden">
                      {l.qty} × {fmtIdr(l.unitPrice)}
                    </div>
                  </td>
                  <td className="hidden py-2.5 pl-3 text-right tabular-nums sm:table-cell print:table-cell">{l.qty}</td>
                  <td className="hidden py-2.5 pl-3 text-right sm:table-cell print:table-cell">
                    <Money value={l.unitPrice} />
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <Money value={l.qty * l.unitPrice} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DocSection>

      <DocBottom
        notes={
          <DocNotes label="Notes for this invoice">
            {edit ? (
              <Textarea aria-label="Notes for this invoice" className="min-h-24" value={inv.memo} onChange={(e) => edit.patch({ memo: e.target.value })} placeholder="Printed under the lines, for example the payment reference" />
            ) : (
              <p className="whitespace-pre-line text-sm">{inv.memo || <span className="text-muted">No notes.</span>}</p>
            )}
          </DocNotes>
        }
        summary={
          <DocSummary
            rows={[
              { label: 'Subtotal', value: <Money value={totals.subtotal} /> },
              {
                label: edit ? (
                  <>
                    <Switch checked={inv.taxPct > 0} onCheckedChange={(on) => edit.patch({ taxPct: on ? vat : 0 })} label={`Charge PPN at ${vat}%`} />
                    PPN {inv.taxPct ? `${inv.taxPct}%` : 'off'}
                  </>
                ) : (
                  `PPN ${inv.taxPct}%`
                ),
                value: <Money value={totals.tax} />,
                tone: 'info',
              },
              { label: 'Total', value: <Money value={totals.total} />, tone: 'total' },
              ...(issued
                ? [
                    { label: 'Paid', value: <Money value={totals.paid} /> },
                    { label: 'Balance due', value: <Money value={totals.balance} className="font-bold" /> },
                  ]
                : []),
            ]}
          />
        }
      />
      {children}
    </DocumentSheet>
  )
}

// ---------------------------------------------------------------- editor

/** A fresh draft, or one prefilled from a deal: the buyer, the listing and a commission line at the scheme's rate. */
const draftFor = (s: AppState, dealId: string | null, by: string): Invoice => {
  const date = nowIso()
  const base: Invoice = {
    id: newId('inv'),
    code: '',
    customerKind: 'contact',
    customerId: '',
    dealId: null,
    listingId: null,
    date,
    dueDate: addDays(date, 14),
    lines: [blankLine()],
    taxPct: s.financeSettings.vatPct,
    memo: '',
    status: 'draft',
    journalId: null,
    taxInvoice: null,
    receipts: [],
    createdBy: by,
    createdAt: date,
  }
  const deal = dealId ? s.deals.find((d) => d.id === dealId) : undefined
  if (!deal) return base
  const listing = s.listings.find((l) => l.id === deal.listingId)
  const scheme = s.profitShares.find((p) => p.listingId === deal.listingId)
  const commission = !scheme ? 0 : scheme.commissionMode === 'fixed' ? scheme.commissionFixed : Math.round((deal.value * scheme.commissionPct) / 100)
  const revenue = s.glAccounts.find((a) => a.code === '4-1100')?.id ?? ''
  return {
    ...base,
    customerId: deal.contactId,
    dealId: deal.id,
    listingId: deal.listingId,
    lines: [{ ...blankLine(revenue), description: `Sales commission, ${listing?.title ?? deal.title}`, unitPrice: commission }],
  }
}

export function InvoiceEditorPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const existing = id ? state.invoices.find((i) => i.id === id) : undefined
  if (!can('billing.manage')) return <NoAccess action={<BackButton fallback={paths.invoices} />} />
  if (id && !existing) {
    return (
      <Card>
        <EmptyState title="Invoice not found" description="This invoice may have been removed." action={<BackButton fallback={paths.invoices} />} />
      </Card>
    )
  }
  if (existing && existing.status !== 'draft') {
    return (
      <Card>
        <EmptyState
          title="Only a draft invoice can be edited"
          description={`${existing.code} is ${INVOICE_STATUS_LABEL[existing.status].toLowerCase()}.`}
          action={
            <Button variant="outline" asChild>
              <Link to={paths.invoice(existing.id)}>Open invoice</Link>
            </Button>
          }
        />
      </Card>
    )
  }
  return <InvoiceForm key={id ?? 'new'} existing={existing} />
}

function InvoiceForm({ existing }: { existing?: Invoice }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [inv, setInv] = useState<Invoice>(() => existing ?? draftFor(state, params.get('dealId'), user.id))
  const [tried, setTried] = useState(false)
  const patch = (p: Partial<Invoice>) => setInv({ ...inv, ...p })
  const customers = customersOf(state, inv.customerKind)
  const toSave: Invoice = { ...inv, code: inv.code || nextInvoiceCode(state) }
  const saveAction = { type: 'invoices/save', invoice: toSave } as const
  const blocker = blockerFor(state, saveAction)
  const customerError = inv.customerId ? null : 'Pick a customer.'
  const linesError = tried && blocker && blocker !== customerError ? blocker : undefined
  const back = existing ? paths.invoice(existing.id) : paths.invoices

  /** Fills the buyer, the listing and a commission line from a deal, keeping the dates, PPN and notes. */
  const pullDeal = (dealId: string) => {
    if (!dealId) return patch({ dealId: null })
    const { customerKind, customerId, listingId, lines } = draftFor(state, dealId, user.id)
    patch({ customerKind, customerId, dealId, listingId, lines })
  }

  const save = (issue: boolean) => {
    setTried(true)
    const issueBlocker = issue ? dateBlocker(state, toSave.date) : null
    if (blocker || issueBlocker) {
      if (issueBlocker) toast('Could not issue', { tone: 'danger', description: issueBlocker })
      return
    }
    if (!act(saveAction, issue ? 'Invoice saved' : 'Draft saved', `${toSave.code} · ${customerName(state, toSave)}`)) return
    if (issue) act({ type: 'invoices/issue', id: toSave.id }, 'Invoice issued', `${toSave.code} posted to the ledger`)
    navigate(paths.invoice(toSave.id), { replace: true })
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save(false)
      }}
    >
      <BackButton fallback={back} />
      <PageHeader title={existing ? `Edit ${existing.code}` : 'New invoice'} description="A draft stays off the ledger. Issuing it posts the receivable, the revenue and the PPN." />
      <DocumentPickers>
        <FormField label="Customer kind" required>
          <NativeSelect value={inv.customerKind} onChange={(e) => patch({ customerKind: e.target.value as CustomerKind, customerId: '' })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {CUSTOMER_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Customer" required error={tried ? (customerError ?? undefined) : undefined}>
          <NativeSelect value={inv.customerId} onChange={(e) => patch({ customerId: e.target.value })}>
            <option value="">Pick a {CUSTOMER_KIND_LABEL[inv.customerKind].toLowerCase()}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Pull from deal" hint="Fills the buyer, the listing and a commission line">
          <NativeSelect value={inv.dealId ?? ''} onChange={(e) => pullDeal(e.target.value)}>
            <option value="">No deal</option>
            {state.deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </DocumentPickers>

      <InvoicePaper inv={toSave} number={toSave.code} edit={{ patch, linesError }} />

      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={() => navigate(back)}>
          Cancel
        </Button>
        <Button type="submit" variant="outline">
          Save draft
        </Button>
        <Button type="button" onClick={() => save(true)}>
          <Send />
          Save and issue
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- detail: printable invoice

const STAMP = { accent: 'border-accent text-accent', warning: 'border-warning text-warning', success: 'border-success text-success' }
const Stamp = ({ tone, children }: { tone: keyof typeof STAMP; children: ReactNode }) => (
  <div className={`-rotate-6 rounded-lg border-2 px-3 py-1 text-sm font-extrabold uppercase tracking-widest ${STAMP[tone]}`}>{children}</div>
)

export function InvoiceDetailPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [receiving, setReceiving] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [fakturing, setFakturing] = useState(false)
  const inv = state.invoices.find((x) => x.id === id)
  if (!inv) {
    return (
      <Card>
        <EmptyState title="Invoice not found" description="This invoice may have been removed." action={<BackButton fallback={paths.invoices} />} />
      </Card>
    )
  }
  const totals = invoiceTotals(inv)
  const manage = can('billing.manage')
  const name = customerName(state, inv)
  const deal = state.deals.find((d) => d.id === inv.dealId)
  const listing = state.listings.find((l) => l.id === inv.listingId)
  const journal = state.journals.find((j) => j.id === inv.journalId)
  const settle = settleOf(inv, now)
  const accountName = (accId: string) => state.glAccounts.find((a) => a.id === accId)?.name ?? 'Unknown account'
  const bank = state.glAccounts.find((a) => a.id === state.financeSettings.defaultCashAccountId)

  const issueBlocker = blockerFor(state, { type: 'invoices/issue', id: inv.id })
  const voidBlocker = blockerFor(state, { type: 'invoices/void', id: inv.id })
  const receiveBlocker =
    inv.status !== 'issued'
      ? 'Issue the invoice before recording a receipt.'
      : totals.balance <= 0
        ? 'The invoice is paid in full.'
        : blockerFor(state, { type: 'invoices/receive', id: inv.id, receipt: { id: 'check', date: nowIso(), amount: totals.balance, cashAccountId: state.financeSettings.defaultCashAccountId, reference: '', journalId: 'check' } })
  // A valid-looking NPWP, so the check reports every other reason the faktur cannot go out yet.
  const fakturBlocker = blockerFor(state, { type: 'invoices/taxInvoice', id: inv.id, buyerTaxId: '000000000000000' })

  const customer = customerOf(state, inv)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.invoices} />
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{inv.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">Invoice to {name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <InvoiceBadge invoice={inv} nowMs={now} />
            <span className="text-sm text-muted">{CUSTOMER_KIND_LABEL[inv.customerKind]}</span>
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {manage && inv.status === 'draft' && (
            <>
              <Button variant="outline" asChild>
                <Link to={paths.invoiceEdit(inv.id)}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
              <Button disabled={!!issueBlocker} title={issueBlocker ?? undefined} onClick={() => act({ type: 'invoices/issue', id: inv.id }, 'Invoice issued', `${inv.code} posted to the ledger`)}>
                <Send />
                Issue
              </Button>
            </>
          )}
          {manage && inv.status === 'issued' && (
            <Button disabled={!!receiveBlocker} title={receiveBlocker ?? undefined} onClick={() => setReceiving(true)}>
              <CircleCheck />
              Record receipt
            </Button>
          )}
          {manage && inv.status === 'issued' && inv.taxPct > 0 && !inv.taxInvoice && (
            <Button variant="outline" disabled={!!fakturBlocker} title={fakturBlocker ?? undefined} onClick={() => setFakturing(true)}>
              <FileCheck2 />
              Issue faktur pajak
            </Button>
          )}
          {manage && inv.status !== 'void' && (
            <Button variant="ghost" disabled={!!voidBlocker} title={voidBlocker ?? undefined} onClick={() => setVoiding(true)}>
              <Ban />
              Void
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
        </div>
      </div>

      <Card variant="ink" className="p-6 print:hidden">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0">
            <div className="text-xs text-on-ink-muted">{inv.status === 'issued' ? 'Balance due' : 'Invoice total'}</div>
            <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{fmtIdr(inv.status === 'issued' ? totals.balance : totals.total)}</div>
            <div className="mt-1 text-xs text-on-ink-muted">
              {inv.status === 'issued' ? `${fmtIdr(totals.paid)} received of ${fmtIdr(totals.total)}` : inv.status === 'draft' ? 'Draft, not on the ledger yet' : 'Void, reversed off the ledger'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Customer</div>
              {customer.to ? (
                <Link to={customer.to} className="block truncate font-semibold hover:underline">
                  {name}
                </Link>
              ) : (
                <div className="truncate font-semibold">{name}</div>
              )}
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Due</div>
              <div className={`font-semibold ${settle === 'overdue' ? 'text-accent' : ''}`}>{fmtDate(inv.dueDate)}</div>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Faktur pajak</div>
              <div className="truncate font-mono text-xs font-semibold">{inv.taxInvoice?.number ?? (inv.taxPct ? 'Not issued' : 'No VAT')}</div>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Journal</div>
              {journal ? (
                <Link to={paths.journal(journal.id)} className="font-mono text-xs font-semibold hover:underline">
                  {journal.code}
                </Link>
              ) : (
                <div className="text-xs">Posts on issue</div>
              )}
            </div>
          </div>
        </div>
        {(deal || listing) && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-ink-muted">
            {deal && (
              <Link to={paths.deal(deal.id)} className="hover:underline">
                Deal {deal.code} · {deal.title}
              </Link>
            )}
            {listing && (
              <Link to={paths.listing(listing.id)} className="hover:underline">
                Listing {listing.code}
              </Link>
            )}
          </div>
        )}
      </Card>

      {inv.status === 'void' && (
        <Banner tone="neutral" title="This invoice is void" className="print:hidden">
          Its journal was voided, so it no longer counts toward receivables or revenue.
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem] print:block">
        <InvoicePaper
          inv={inv}
          number={inv.code}
          overdue={settle === 'overdue'}
          stamp={
            inv.status !== 'issued' ? (
              <Stamp tone={inv.status === 'void' ? 'accent' : 'warning'}>{INVOICE_STATUS_LABEL[inv.status]}</Stamp>
            ) : settle === 'paid' ? (
              <Stamp tone="success">Paid</Stamp>
            ) : undefined
          }
        >
          <div className="grid grid-cols-1 gap-4 border-t border-border px-5 py-5 sm:grid-cols-2 sm:px-8">
            <LetterBlock title="Pay to">
              {bank ? (
                <>
                  <div className="font-semibold">{state.company.legalName || state.company.name}</div>
                  <div>{bank.bank || bank.name}</div>
                </>
              ) : (
                <div>Ask us for the bank details.</div>
              )}
              <div className="mt-1 text-xs text-muted">Quote {inv.code} with the transfer.</div>
            </LetterBlock>
            <div className="text-sm">
              <Signature role={`For ${state.company.name}`} name={actorName(inv.createdBy)} />
            </div>
          </div>
        </InvoicePaper>

        <div className="space-y-4 print:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
            </CardHeader>
            <CardContent>
              {inv.receipts.length ? (
                <ul className="divide-y divide-border text-sm">
                  {inv.receipts.map((r) => {
                    const j = state.journals.find((x) => x.id === r.journalId)
                    return (
                      <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="font-medium">{fmtDate(r.date)}</div>
                          <div className="truncate text-xs text-muted">
                            {accountName(r.cashAccountId)}
                            {r.reference && ` · ${r.reference}`}
                          </div>
                          {j && <CodeLink to={paths.journal(j.id)} code={j.code} />}
                        </div>
                        <Money value={r.amount} className="font-semibold" />
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState compact title="No receipts yet" description={inv.status === 'issued' ? 'Record the money when it lands in the bank.' : 'Receipts start once the invoice is issued.'} />
              )}
            </CardContent>
          </Card>
          {inv.taxInvoice && (
            <Card>
              <CardHeader>
                <CardTitle>Faktur pajak</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="font-mono text-xs font-semibold">{inv.taxInvoice.number}</div>
                <div className="text-muted">Buyer NPWP {inv.taxInvoice.buyerTaxId}</div>
                <div className="text-muted">Issued {fmtDate(inv.taxInvoice.issuedAt)}</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={receiving} onOpenChange={setReceiving} title={`Record receipt for ${inv.code}`} description={`${fmtIdr(totals.balance)} is still open.`}>
        {receiving && <ReceiveForm invoice={inv} onDone={() => setReceiving(false)} />}
      </Dialog>
      <Dialog open={fakturing} onOpenChange={setFakturing} title="Issue faktur pajak" description={`Output VAT of ${fmtIdr(totals.tax)} on ${inv.code}.`}>
        {fakturing && <FakturForm invoice={inv} onDone={() => setFakturing(false)} />}
      </Dialog>
      <Dialog open={voiding} onOpenChange={setVoiding} title={`Void ${inv.code}?`} description={inv.status === 'issued' ? 'Its journal is voided, so the receivable and the revenue leave the ledger.' : 'The draft stays on record as void.'}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setVoiding(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (act({ type: 'invoices/void', id: inv.id }, 'Invoice voided', inv.code)) setVoiding(false)
            }}
          >
            Void invoice
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function ReceiveForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const balance = invoiceTotals(invoice).balance
  const [f, setF] = useState({ date: toDateInput(nowIso()), cashAccountId: state.financeSettings.defaultCashAccountId, amount: String(balance), reference: '' })
  const [tried, setTried] = useState(false)
  const [ids] = useState(() => ({ id: newId('rc'), journalId: newId('jnl') }))
  const amount = Number(f.amount.replace(/\D/g, '')) || 0
  const action = {
    type: 'invoices/receive',
    id: invoice.id,
    receipt: { ...ids, date: f.date ? fromDateInput(f.date) : nowIso(), amount, cashAccountId: f.cashAccountId, reference: f.reference.trim() },
  } as const
  const blocker = blockerFor(state, action)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, 'Receipt recorded', `${fmtIdr(amount)} on ${invoice.code}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date" required>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </FormField>
        <FormField label="Into account" required>
          <AccountSelect value={f.cashAccountId} onChange={(cashAccountId) => setF({ ...f, cashAccountId })} types={['asset']} cash />
        </FormField>
        <FormField label="Amount" required hint={amount ? fmtIdr(amount) : 'Digits only'}>
          <Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
        </FormField>
        <FormField label="Reference" hint="Bank transfer number">
          <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} inputClassName="font-mono" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-3 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record receipt</Button>
      </DialogFooter>
    </form>
  )
}

function FakturForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [npwp, setNpwp] = useState('')
  const [tried, setTried] = useState(false)
  const action = { type: 'invoices/taxInvoice', id: invoice.id, buyerTaxId: npwp } as const
  const blocker = blockerFor(state, action)
  const f = state.financeSettings
  const number = taxInvoiceNumber(f)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, 'Faktur pajak issued', `${number} on ${invoice.code}`)) onDone()
      }}
    >
      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="text-xs text-muted">This faktur takes the number</div>
        <div className="mt-1 break-all font-mono text-lg font-semibold">{number}</div>
        <div className="mt-1 text-xs text-muted">{f.taxInvoiceLast - f.taxInvoiceNext} numbers left in the range after this one.</div>
      </div>
      <FormField label="Buyer's NPWP" required className="mt-4" error={tried ? (blocker ?? undefined) : undefined} hint="15 or 16 digits, as on the buyer's tax card">
        <Input inputMode="numeric" value={npwp} onChange={(e) => setNpwp(e.target.value)} inputClassName="font-mono" placeholder="0000000000000000" />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Issue faktur pajak</Button>
      </DialogFooter>
    </form>
  )
}
