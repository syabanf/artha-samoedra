import type {
  AutoJournalEvent,
  AutoJournalMapping,
  Bill,
  Budget,
  CashFlowGroup,
  CashTransaction,
  DocumentLine,
  FinanceSettings,
  FiscalYear,
  GlAccount,
  GlAccountType,
  Invoice,
  JournalEntry,
  JournalLine,
  JournalSource,
  Reconciliation,
  Vendor,
} from '@artha/types'
import { PAYMENT_KIND_LABEL } from '@artha/types'
import { toMs } from './clock'
import { billLines, cashLines, invoiceLines, yearPeriods } from './finance'
import { PAYMENTS } from './seed-ops'
import { OPENING_STOCK_VALUE, PO_BILLS, PURCHASING_JOURNALS } from './seed-purchasing'

const FINANCE_USER = 'usr-7'

// ---------------------------------------------------------------- chart of accounts

const TYPE_BY_DIGIT: Record<string, GlAccountType> = { '1': 'asset', '2': 'liability', '3': 'equity', '4': 'revenue', '5': 'expense' }

/** code, name, opening, flags: c = cash, s = system; cash flow group when not operating. */
const accountRows: [string, string, number, string, CashFlowGroup?, string?][] = [
  ['1-1100', 'Petty cash', 15_000_000, 'c'],
  ['1-1200', 'Bank BCA operating', 2_400_000_000, 'c', undefined, 'BCA 0291 8877 01'],
  ['1-1300', 'Bank Mandiri escrow', 850_000_000, 'c', undefined, 'Mandiri 124 000 7788 9'],
  ['1-1400', 'Accounts receivable', 180_000_000, 's'],
  ['1-1500', 'Input VAT', 0, 's'],
  ['1-1600', 'Prepaid expenses', 60_000_000, ''],
  ['1-1700', 'Inventory, supplies', OPENING_STOCK_VALUE, ''],
  ['1-2100', 'Office equipment', 420_000_000, '', 'investing'],
  ['1-2200', 'Accumulated depreciation', -95_000_000, '', 'investing'],
  ['2-1100', 'Accounts payable', 120_000_000, 's'],
  ['2-1200', 'Output VAT', 35_000_000, 's'],
  ['2-1300', 'Customer booking deposits', 300_000_000, ''],
  ['2-1400', 'Rental deposits held', 60_000_000, ''],
  ['2-1500', 'Commission payable', 0, ''],
  ['2-1600', 'Income tax payable', 45_000_000, ''],
  ['2-1700', 'Goods received not invoiced', 0, 's'],
  ['2-2100', 'Bank loan', 600_000_000, '', 'financing'],
  ['3-1100', 'Share capital', 2_000_000_000, '', 'financing'],
  ['3-1200', 'Retained earnings', 670_000_000 + OPENING_STOCK_VALUE, 's', 'financing'],
  ['4-1100', 'Sales commission revenue', 0, ''],
  ['4-1200', 'Rental management fees', 0, ''],
  ['4-1300', 'Marketing fee income', 0, ''],
  ['4-1400', 'Interest income', 0, ''],
  ['5-1100', 'Agent commissions', 0, ''],
  ['5-1200', 'Partner and co-broker shares', 0, ''],
  ['5-2100', 'Salaries and benefits', 0, ''],
  ['5-2200', 'Office rent', 0, ''],
  ['5-2300', 'Portal and online ads', 0, ''],
  ['5-2400', 'Photography and content', 0, ''],
  ['5-2500', 'Printing and signage', 0, ''],
  ['5-2600', 'Utilities and internet', 0, ''],
  ['5-2700', 'Depreciation', 0, ''],
  ['5-2800', 'Bank charges', 0, ''],
  ['5-2900', 'Office supplies used', 0, ''],
]

const gl = (code: string) => `gl-${code}`

export const GL_ACCOUNTS: GlAccount[] = accountRows.map(([code, name, opening, flags, cashFlow, bank]) => ({
  id: gl(code),
  code,
  name,
  type: TYPE_BY_DIGIT[code[0]],
  isCash: flags.includes('c'),
  bank: bank ?? '',
  cashFlow: cashFlow ?? 'operating',
  opening,
  active: true,
  system: flags.includes('s'),
}))

export const FINANCE_SETTINGS: FinanceSettings = {
  vatPct: 11,
  receivableAccountId: gl('1-1400'),
  payableAccountId: gl('2-1100'),
  vatOutAccountId: gl('2-1200'),
  vatInAccountId: gl('1-1500'),
  retainedEarningsAccountId: gl('3-1200'),
  defaultCashAccountId: gl('1-1200'),
  taxInvoicePrefix: '010.000-26.',
  taxInvoiceNext: 3,
  taxInvoiceLast: 500,
}

const mappingRows: [AutoJournalEvent, string, string][] = [
  ['booking_fee_paid', '1-1300', '2-1300'],
  ['down_payment_paid', '1-1300', '2-1300'],
  ['deposit_paid', '1-1200', '2-1400'],
  ['refund_paid', '2-1300', '1-1300'],
  ['commission_statement_paid', '5-1100', '1-1200'],
  ['settlement_collected', '1-1200', '4-1100'],
  ['partner_share_paid', '5-1200', '1-1200'],
  ['payroll_paid', '5-2100', '1-1200'],
]

export const AUTO_JOURNALS: AutoJournalMapping[] = mappingRows.map(([event, debit, credit]) => ({
  id: `ajm-${event}`,
  event,
  debitAccountId: gl(debit),
  creditAccountId: gl(credit),
  enabled: true,
}))

/** 2026 is the first fiscal year; January to August are closed. */
export const FISCAL_YEARS: FiscalYear[] = [{ id: 'fy-2026', year: 2026, status: 'open', closingJournalId: null, closedAt: null, closedBy: null }]
export const PERIODS = yearPeriods(2026, 8)

// ---------------------------------------------------------------- journals

const day = (month: number, d: number) => new Date(2026, month - 1, d, 10).toISOString()
const dr = (code: string, amount: number, memo = ''): JournalLine => ({ accountId: gl(code), debit: amount, credit: 0, memo })
const cr = (code: string, amount: number, memo = ''): JournalLine => ({ accountId: gl(code), debit: 0, credit: amount, memo })

interface Draft {
  id: string
  date: string
  memo: string
  source: JournalSource
  ref: JournalEntry['ref']
  lines: JournalLine[]
  status?: JournalEntry['status']
  events?: AutoJournalEvent[]
}

const drafts: Draft[] = []
const journal = (d: Draft) => {
  drafts.push(d)
  return d.id
}

// Ten months of recurring entries, January to October 2026.
const commission = [312, 285, 401, 356, 472, 390, 518, 446, 380, 425]
const ads = [28, 31, 36, 33, 42, 38, 47, 44, 39, 41]
const salaryBump = [0, 0, 0, 4, 4, 4, 4, 9, 9, 9]
for (let m = 1; m <= 10; m++) {
  const mm = String(m).padStart(2, '0')
  const rev = commission[m - 1] * 1_000_000
  journal({ id: `jnl-rent-${mm}`, date: day(m, 1), memo: `Office rent ${mm}/2026`, source: 'manual', ref: null, lines: [dr('5-2200', 45_000_000), cr('1-1200', 45_000_000)] })
  journal({ id: `jnl-com-${mm}`, date: day(m, 15), memo: `Sales commissions collected ${mm}/2026`, source: 'manual', ref: null, lines: [dr('1-1200', rev), cr('4-1100', rev)] })
  journal({ id: `jnl-mgt-${mm}`, date: day(m, 20), memo: `Rental management fees ${mm}/2026`, source: 'manual', ref: null, lines: [dr('1-1200', (36 + m) * 1_000_000), cr('4-1200', (36 + m) * 1_000_000)] })
  journal({ id: `jnl-sal-${mm}`, date: day(m, 25), memo: `Payroll ${mm}/2026`, source: 'manual', ref: null, lines: [dr('5-2100', (182 + salaryBump[m - 1]) * 1_000_000), cr('1-1200', (182 + salaryBump[m - 1]) * 1_000_000)] })
  journal({ id: `jnl-agt-${mm}`, date: day(m, 27), memo: `Agent commissions ${mm}/2026`, source: 'manual', ref: null, lines: [dr('5-1100', Math.round(rev * 0.3)), cr('1-1200', Math.round(rev * 0.3))] })
  journal({ id: `jnl-dep-${mm}`, date: day(m, 28), memo: `Depreciation ${mm}/2026`, source: 'manual', ref: null, lines: [dr('5-2700', 7_000_000), cr('1-2200', 7_000_000)] })
  journal({ id: `jnl-int-${mm}`, date: day(m, 28), memo: `Escrow interest and bank charges ${mm}/2026`, source: 'manual', ref: null, lines: [dr('1-1300', 2_100_000), dr('5-2800', 350_000), cr('4-1400', 2_100_000), cr('1-1200', 350_000)] })
  if (m <= 8) {
    journal({ id: `jnl-ads-${mm}`, date: day(m, 10), memo: `Portal and online ads ${mm}/2026`, source: 'manual', ref: null, lines: [dr('5-2300', ads[m - 1] * 1_000_000), cr('1-1200', ads[m - 1] * 1_000_000)] })
    journal({ id: `jnl-utl-${mm}`, date: day(m, 5), memo: `Electricity and internet ${mm}/2026`, source: 'manual', ref: null, lines: [dr('5-2600', 6_500_000), cr('1-1200', 6_500_000)] })
  }
}
journal({ id: 'jnl-tax-q1', date: day(4, 30), memo: 'Corporate income tax installment Q1', source: 'manual', ref: null, lines: [dr('2-1600', 45_000_000), cr('1-1200', 45_000_000)] })
journal({ id: 'jnl-loan-06', date: day(6, 30), memo: 'Bank loan principal repayment', source: 'manual', ref: null, lines: [dr('2-2100', 100_000_000), cr('1-1200', 100_000_000)] })
journal({ id: 'jnl-eqp-07', date: day(7, 14), memo: 'Laptops for the Bali office', source: 'manual', ref: null, lines: [dr('1-2100', 64_000_000), cr('1-1200', 64_000_000)] })
journal({ id: 'jnl-bonus-10', date: day(10, 29), memo: 'Accrue Q3 sales team bonus', source: 'manual', ref: null, lines: [dr('5-2100', 38_000_000), cr('2-1500', 38_000_000)], status: 'draft' })

// ---------------------------------------------------------------- cash and bank (September and October)

const cashRows: [CashTransaction['kind'], number, number, string, string, number, string, string][] = [
  ['out', 9, 5, '1-1200', '5-2600', 6_800_000, 'PLN and Biznet, September', 'BCA 0905-2211'],
  ['out', 9, 10, '1-1200', '5-2300', 39_000_000, 'Meta and Google ads, September', 'BCA 0910-4410'],
  ['transfer', 9, 2, '1-1200', '1-1100', 5_000_000, 'Top up petty cash', 'BCA 0902-0012'],
  ['out', 9, 18, '1-1100', '5-2500', 2_750_000, 'Open house banners, Serpong', 'Kwitansi 118'],
  ['in', 9, 22, '1-1200', '4-1300', 18_000_000, 'Event sponsorship from Bank BTN', 'BCA 0922-7781'],
  ['out', 10, 5, '1-1200', '5-2600', 6_900_000, 'PLN and Biznet, October', 'BCA 1005-2211'],
  ['out', 10, 10, '1-1200', '5-2300', 41_000_000, 'Meta and Google ads, October', 'BCA 1010-4410'],
  ['transfer', 10, 2, '1-1200', '1-1100', 5_000_000, 'Top up petty cash', 'BCA 1002-0012'],
  ['out', 10, 16, '1-1100', '5-2500', 3_100_000, 'Brochure reprint, Simatupang Sky Suites', 'Kwitansi 131'],
  ['out', 10, 23, '1-1100', '5-2400', 1_200_000, 'Drone permit fee', 'Kwitansi 137'],
]

const cashCount: Record<string, number> = {}
const CASH_PREFIX = { in: 'CI', out: 'CO', transfer: 'TR' } as const

export const CASH_TRANSACTIONS: CashTransaction[] = cashRows
  .map(([kind, m, d, account, counter, amount, memo, reference], i) => {
    cashCount[kind] = (cashCount[kind] ?? 0) + 1
    const tx: CashTransaction = {
      id: `cash-${i + 1}`,
      code: `${CASH_PREFIX[kind]}-26-${String(cashCount[kind]).padStart(4, '0')}`,
      kind,
      date: day(m, d),
      accountId: gl(account),
      counterAccountId: gl(counter),
      amount,
      memo,
      reference,
      journalId: `jnl-cash-${i + 1}`,
      createdBy: FINANCE_USER,
      createdAt: day(m, d),
    }
    journal({ id: tx.journalId, date: tx.date, memo, source: 'cash', ref: { kind: 'cash', id: tx.id, label: tx.code }, lines: cashLines(tx) })
    return tx
  })
  .reverse()

// ---------------------------------------------------------------- vendors and bills

export const VENDORS: Vendor[] = [
  { id: 'vnd-1', code: 'VND-001', name: 'PT Rumah123 Media', taxId: '015938274062000', phone: '021-2985-7000', email: 'billing@rumah123.com', bankAccount: 'BCA 5210 334 455', termsDays: 14, active: true },
  { id: 'vnd-2', code: 'VND-002', name: 'Lensa Properti Studio', taxId: '', phone: '0812-8811-4040', email: 'halo@lensaproperti.id', bankAccount: 'BRI 0341 0100 2233 507', termsDays: 7, active: true },
  { id: 'vnd-3', code: 'VND-003', name: 'CV Cetak Kilat', taxId: '029384756123000', phone: '021-7654-321', email: 'order@cetakkilat.co.id', bankAccount: 'Mandiri 117 000 4455 2', termsDays: 30, active: true },
  { id: 'vnd-4', code: 'VND-004', name: 'PT Gedung Simatupang Prima', taxId: '017766554433000', phone: '021-7880-1100', email: 'tenant@gsp.co.id', bankAccount: 'BNI 0812 334 556', termsDays: 30, active: true },
  { id: 'vnd-5', code: 'VND-005', name: 'Biznet Networks', taxId: '021133557799000', phone: '1500-988', email: 'corporate@biznetnetworks.com', bankAccount: 'BCA 0353 0977 11', termsDays: 14, active: true },
]

const line = (id: string, description: string, code: string, unitPrice: number, qty = 1): DocumentLine => ({ id, description, accountId: gl(code), qty, unitPrice })

const billRows: Omit<Bill, 'journalId' | 'createdBy' | 'createdAt'>[] = [
  { id: 'bil-1', code: 'BILL-26-0001', vendorId: 'vnd-5', vendorRef: 'BZN/08/77120', date: day(8, 1), dueDate: day(8, 15), lines: [line('bl-1', 'Dedicated internet, August', '5-2600', 4_200_000)], taxPct: 11, memo: '', status: 'posted', payments: [] },
  { id: 'bil-2', code: 'BILL-26-0002', vendorId: 'vnd-1', vendorRef: 'R123/INV/2609/0411', date: day(9, 3), dueDate: day(9, 17), lines: [line('bl-2', 'Premier listing package, September', '5-2300', 32_000_000)], taxPct: 11, memo: '', status: 'posted', payments: [{ id: 'bp-1', date: day(9, 16), amount: 35_520_000, cashAccountId: gl('1-1200'), reference: 'BCA 0916-8812', journalId: 'jnl-bp-1' }] },
  { id: 'bil-3', code: 'BILL-26-0003', vendorId: 'vnd-1', vendorRef: 'R123/INV/2610/0388', date: day(9, 28), dueDate: day(10, 12), lines: [line('bl-3', 'Premier listing package, October', '5-2300', 32_000_000), line('bl-4', 'Homepage spotlight, 2 weeks', '5-2300', 4_000_000)], taxPct: 11, memo: '', status: 'posted', payments: [] },
  { id: 'bil-4', code: 'BILL-26-0004', vendorId: 'vnd-2', vendorRef: 'LPS-1021', date: day(10, 13), dueDate: day(10, 20), lines: [line('bl-5', 'Photo and drone shoot', '5-2400', 2_500_000, 5)], taxPct: 0, memo: 'Five listings in Serpong and BSD.', status: 'posted', payments: [{ id: 'bp-2', date: day(10, 19), amount: 5_000_000, cashAccountId: gl('1-1200'), reference: 'BCA 1019-0031', journalId: 'jnl-bp-2' }] },
  { id: 'bil-5', code: 'BILL-26-0005', vendorId: 'vnd-3', vendorRef: 'CK/2610/112', date: day(10, 16), dueDate: day(11, 15), lines: [line('bl-6', 'Site boards 3 x 2 m', '5-2500', 1_400_000, 6)], taxPct: 11, memo: '', status: 'posted', payments: [] },
  { id: 'bil-6', code: 'BILL-26-0006', vendorId: 'vnd-3', vendorRef: '', date: day(10, 29), dueDate: day(11, 28), lines: [line('bl-7', 'Tri-fold brochures, 2,000 pcs', '5-2500', 3_200, 2000)], taxPct: 11, memo: 'Quote only; post when the goods arrive.', status: 'draft', payments: [] },
]

export const BILLS: Bill[] = [...billRows, ...PO_BILLS]
  .map((b) => {
    const journalId = b.status === 'posted' ? journal({ id: `jnl-${b.id}`, date: b.date, memo: `Bill ${b.code} · ${b.vendorRef}`, source: 'payable', ref: { kind: 'bill', id: b.id, label: b.code }, lines: billLines({ ...b, journalId: null, createdBy: '', createdAt: '' }, FINANCE_SETTINGS) }) : null
    for (const p of b.payments)
      journal({ id: p.journalId, date: p.date, memo: `Payment for bill ${b.code}`, source: 'payable', ref: { kind: 'bill', id: b.id, label: b.code }, lines: [dr('2-1100', p.amount), cr('1-1200', p.amount)] })
    return { ...b, journalId, createdBy: FINANCE_USER, createdAt: b.date }
  })
  .reverse()

// ---------------------------------------------------------------- invoices

const invoiceRows: Omit<Invoice, 'journalId' | 'createdBy' | 'createdAt'>[] = [
  {
    id: 'inv-1', code: 'INV-26-0001', customerKind: 'contact', customerId: 'con-5', dealId: 'del-4', listingId: null, date: day(8, 15), dueDate: day(8, 29),
    lines: [line('il-1', 'Document handling and notary coordination', '4-1300', 7_500_000)], taxPct: 0, memo: '', status: 'issued', taxInvoice: null, receipts: [],
  },
  {
    id: 'inv-2', code: 'INV-26-0002', customerKind: 'account', customerId: 'acc-1', dealId: null, listingId: null, date: day(9, 10), dueDate: day(9, 24),
    lines: [line('il-2', 'Brokerage fee, warehouse lease in Rungkut', '4-1100', 95_000_000)], taxPct: 11, memo: '', status: 'issued', taxInvoice: null, receipts: [],
  },
  {
    id: 'inv-3', code: 'INV-26-0003', customerKind: 'account', customerId: 'acc-3', dealId: null, listingId: null, date: day(9, 30), dueDate: day(10, 14),
    lines: [line('il-3', 'Villa rental management, September', '4-1200', 45_000_000)], taxPct: 11, memo: '', status: 'issued',
    taxInvoice: { number: '010.000-26.00000001', issuedAt: day(9, 30), buyerTaxId: '028877665544000' },
    receipts: [{ id: 'rc-1', date: day(10, 12), amount: 49_950_000, cashAccountId: gl('1-1200'), reference: 'BCA 1012-5530', journalId: 'jnl-rc-1' }],
  },
  {
    id: 'inv-4', code: 'INV-26-0004', customerKind: 'partner', customerId: 'ptn-2', dealId: null, listingId: null, date: day(10, 1), dueDate: day(10, 31),
    lines: [line('il-4', 'Marketing fee, Serpong Green Residence Q3', '4-1300', 150_000_000)], taxPct: 11, memo: 'Per the July marketing agreement.', status: 'issued',
    taxInvoice: { number: '010.000-26.00000002', issuedAt: day(10, 1), buyerTaxId: '031122334455000' },
    receipts: [{ id: 'rc-2', date: day(10, 21), amount: 80_000_000, cashAccountId: gl('1-1200'), reference: 'BCA 1021-1180', journalId: 'jnl-rc-2' }],
  },
  {
    id: 'inv-5', code: 'INV-26-0005', customerKind: 'account', customerId: 'acc-2', dealId: null, listingId: null, date: day(10, 20), dueDate: day(11, 19),
    lines: [line('il-5', 'Brokerage fee, retail space on Jl. Braga', '4-1100', 42_000_000)], taxPct: 11, memo: '', status: 'issued', taxInvoice: null, receipts: [],
  },
  {
    id: 'inv-6', code: 'INV-26-0006', customerKind: 'account', customerId: 'acc-1', dealId: null, listingId: null, date: day(10, 29), dueDate: day(11, 12),
    lines: [line('il-6', 'Brokerage fee, second warehouse unit', '4-1100', 60_000_000)], taxPct: 11, memo: 'Waiting for the signed lease.', status: 'draft', taxInvoice: null, receipts: [],
  },
]

export const INVOICES: Invoice[] = invoiceRows
  .map((i) => {
    const journalId = i.status === 'issued' ? journal({ id: `jnl-${i.id}`, date: i.date, memo: `Invoice ${i.code}`, source: 'receivable', ref: { kind: 'invoice', id: i.id, label: i.code }, lines: invoiceLines({ ...i, journalId: null, createdBy: '', createdAt: '' }, FINANCE_SETTINGS) }) : null
    for (const r of i.receipts)
      journal({ id: r.journalId, date: r.date, memo: `Receipt for invoice ${i.code}`, source: 'receivable', ref: { kind: 'invoice', id: i.id, label: i.code }, lines: [dr('1-1200', r.amount), cr('1-1400', r.amount)] })
    return { ...i, journalId, createdBy: FINANCE_USER, createdAt: i.date }
  })
  .reverse()

// ---------------------------------------------------------------- auto-journals for payments already paid

const PAYMENT_EVENT: Record<string, AutoJournalEvent> = { booking_fee: 'booking_fee_paid', down_payment: 'down_payment_paid', deposit: 'deposit_paid', refund: 'refund_paid' }
const PAYMENT_MAPPING: Record<string, [string, string]> = { booking_fee: ['1-1300', '2-1300'], down_payment: ['1-1300', '2-1300'], deposit: ['1-1200', '2-1400'], refund: ['2-1300', '1-1300'] }
for (const p of PAYMENTS) {
  if (p.status !== 'paid' || !p.paidAt) continue
  const [debit, credit] = PAYMENT_MAPPING[p.kind]
  const memo = `${PAYMENT_KIND_LABEL[p.kind]} ${p.code}`
  journal({ id: `jnl-auto-${p.id}`, date: p.paidAt, memo, source: 'auto', ref: { kind: 'payment', id: p.id, label: p.code }, lines: [dr(debit, p.amount, memo), cr(credit, p.amount, memo)], events: [PAYMENT_EVENT[p.kind]] })
}

for (const j of PURCHASING_JOURNALS) journal(j)

// Codes run in date order.
export const JOURNALS: JournalEntry[] = [...drafts]
  .sort((a, b) => toMs(a.date) - toMs(b.date))
  .map((d, i) => ({
    ...d,
    code: `JV-26-${String(i + 1).padStart(4, '0')}`,
    status: d.status ?? 'posted',
    reversalOf: null,
    voidReason: '',
    postedAt: d.status === 'draft' ? null : d.date,
    createdBy: FINANCE_USER,
    createdAt: d.date,
  }))
  .reverse()

// ---------------------------------------------------------------- reconciliation and budgets

/** BCA operating, reconciled to the August statement. */
const bcaThroughAugust = JOURNALS.filter((j) => j.status === 'posted' && toMs(j.date) <= toMs(day(8, 31)) && j.lines.some((l) => l.accountId === gl('1-1200')))
export const RECONCILIATIONS: Reconciliation[] = [
  {
    id: 'rcn-1',
    accountId: gl('1-1200'),
    statementDate: day(8, 31),
    statementBalance: bcaThroughAugust.reduce((n, j) => n + j.lines.filter((l) => l.accountId === gl('1-1200')).reduce((m, l) => m + l.debit - l.credit, 0), 2_400_000_000),
    journalIds: bcaThroughAugust.map((j) => j.id),
    createdBy: FINANCE_USER,
    createdAt: day(9, 4),
  },
]

const budgetRows: [string, number][] = [
  ['4-1100', 420_000_000],
  ['4-1200', 42_000_000],
  ['4-1300', 25_000_000],
  ['5-1100', 125_000_000],
  ['5-2100', 190_000_000],
  ['5-2200', 45_000_000],
  ['5-2300', 40_000_000],
  ['5-2500', 4_000_000],
  ['5-2600', 7_000_000],
]

export const BUDGETS: Budget[] = budgetRows.map(([code, monthly]) => ({ id: `bdg-2026-${code}`, year: 2026, accountId: gl(code), months: Array(12).fill(monthly) }))
