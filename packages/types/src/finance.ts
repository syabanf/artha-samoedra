/** Finance and accounting: general ledger, cash and bank, payables, receivables, budgets. Amounts are rupiah. */

export type GlAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export const GL_ACCOUNT_TYPE_LABEL: Record<GlAccountType, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
}

/** Where a cash movement against this account lands on the cash flow statement. */
export type CashFlowGroup = 'operating' | 'investing' | 'financing'
export const CASH_FLOW_GROUP_LABEL: Record<CashFlowGroup, string> = {
  operating: 'Operating',
  investing: 'Investing',
  financing: 'Financing',
}

export interface GlAccount {
  id: string
  /** Dotted code such as 1-1200, unique. */
  code: string
  name: string
  type: GlAccountType
  /** Cash and bank accounts take cash in, cash out, transfers and reconciliation. */
  isCash: boolean
  /** Bank name and account number, for cash accounts that are bank accounts. */
  bank: string
  cashFlow: CashFlowGroup
  /** Balance on the first day of the first fiscal year, in the account's normal direction. */
  opening: number
  active: boolean
  /** Control accounts the ledger posts to on its own (receivables, payables, tax, retained earnings) cannot be deleted. */
  system: boolean
}

export type PeriodStatus = 'open' | 'closed'
export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = { open: 'Open', closed: 'Closed' }

export interface FiscalYear {
  id: string
  year: number
  status: PeriodStatus
  /** The journal that moved the year's profit to retained earnings. */
  closingJournalId: string | null
  closedAt: string | null
  closedBy: string | null
}

export interface FiscalPeriod {
  id: string
  /** YYYY-MM */
  month: string
  year: number
  status: PeriodStatus
  closedAt: string | null
  closedBy: string | null
}

export type JournalSource = 'manual' | 'auto' | 'cash' | 'payable' | 'receivable' | 'inventory' | 'closing'
export const JOURNAL_SOURCE_LABEL: Record<JournalSource, string> = {
  manual: 'Manual',
  auto: 'Auto-journal',
  cash: 'Cash and bank',
  payable: 'Payables',
  receivable: 'Receivables',
  inventory: 'Inventory',
  closing: 'Year-end close',
}

export type JournalStatus = 'draft' | 'posted' | 'void'
export const JOURNAL_STATUS_LABEL: Record<JournalStatus, string> = { draft: 'Draft', posted: 'Posted', void: 'Void' }

export interface JournalLine {
  accountId: string
  debit: number
  credit: number
  memo: string
}

export interface JournalEntry {
  id: string
  /** JV-26-0001 */
  code: string
  /** ISO date the entry counts on. */
  date: string
  memo: string
  source: JournalSource
  /** The record that produced the entry: a payment, statement, settlement, cash transaction, bill or invoice. */
  ref: { kind: string; id: string; label: string } | null
  lines: JournalLine[]
  status: JournalStatus
  /** Auto-journals only: the mapped events the entry posted. */
  events?: AutoJournalEvent[]
  /** Set on the entry that reverses another. */
  reversalOf: string | null
  voidReason: string
  postedAt: string | null
  createdBy: string
  createdAt: string
}

/** Events in other modules that post a journal on their own. */
export type AutoJournalEvent =
  | 'booking_fee_paid'
  | 'down_payment_paid'
  | 'deposit_paid'
  | 'refund_paid'
  | 'commission_statement_paid'
  | 'settlement_collected'
  | 'partner_share_paid'
  | 'payroll_paid'
export const AUTO_JOURNAL_EVENT_LABEL: Record<AutoJournalEvent, string> = {
  booking_fee_paid: 'Booking fee received',
  down_payment_paid: 'Down payment received',
  deposit_paid: 'Rental deposit received',
  refund_paid: 'Refund paid to a buyer',
  commission_statement_paid: 'Agent commission statement paid',
  settlement_collected: 'Commission collected on a closed sale',
  partner_share_paid: 'Partner and other party shares paid out',
  payroll_paid: 'Payroll paid',
}

export interface AutoJournalMapping {
  id: string
  event: AutoJournalEvent
  debitAccountId: string
  creditAccountId: string
  enabled: boolean
}

export type CashKind = 'in' | 'out' | 'transfer'
export const CASH_KIND_LABEL: Record<CashKind, string> = { in: 'Cash in', out: 'Cash out', transfer: 'Transfer' }

export interface CashTransaction {
  id: string
  /** CI-26-0001, CO-26-0001, TR-26-0001 */
  code: string
  kind: CashKind
  date: string
  /** The cash or bank account money comes into (in), leaves (out) or leaves for a transfer. */
  accountId: string
  /** The offsetting ledger account for in and out; the receiving cash account for a transfer. */
  counterAccountId: string
  amount: number
  memo: string
  reference: string
  journalId: string
  createdBy: string
  createdAt: string
}

export interface Reconciliation {
  id: string
  accountId: string
  statementDate: string
  statementBalance: number
  /** Journals touching the account that the bank statement shows, ticked as cleared. */
  journalIds: string[]
  createdBy: string
  createdAt: string
}

export interface Vendor {
  id: string
  code: string
  name: string
  /** NPWP, 15 or 16 digits. */
  taxId: string
  phone: string
  email: string
  bankAccount: string
  /** Days from the bill date to the due date. */
  termsDays: number
  active: boolean
}

export interface DocumentLine {
  id: string
  description: string
  /** Expense account on a bill, revenue account on an invoice. */
  accountId: string
  qty: number
  unitPrice: number
}

/** A receipt against an invoice or a payment against a bill. */
export interface DocumentPayment {
  id: string
  date: string
  amount: number
  cashAccountId: string
  reference: string
  journalId: string
}

export type BillStatus = 'draft' | 'posted' | 'void'
export const BILL_STATUS_LABEL: Record<BillStatus, string> = { draft: 'Draft', posted: 'Posted', void: 'Void' }

export interface Bill {
  id: string
  /** BILL-26-0001 */
  code: string
  vendorId: string
  /** The vendor's own invoice number. */
  vendorRef: string
  date: string
  dueDate: string
  lines: DocumentLine[]
  /** Input VAT, 0 or the PPN rate. */
  taxPct: number
  memo: string
  status: BillStatus
  journalId: string | null
  payments: DocumentPayment[]
  createdBy: string
  createdAt: string
}

export type CustomerKind = 'contact' | 'account' | 'partner'
export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = { contact: 'Buyer', account: 'Company (B2B)', partner: 'Partner' }

export type InvoiceStatus = 'draft' | 'issued' | 'void'
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { draft: 'Draft', issued: 'Issued', void: 'Void' }

/** Faktur pajak keluaran, numbered from the range the tax office assigned. */
export interface TaxInvoice {
  /** 010.000-26.00000001 */
  number: string
  issuedAt: string
  /** The buyer's NPWP printed on the faktur. */
  buyerTaxId: string
}

export interface Invoice {
  id: string
  /** INV-26-0001 */
  code: string
  customerKind: CustomerKind
  customerId: string
  /** The deal or listing the invoice bills for, when there is one. */
  dealId: string | null
  listingId: string | null
  date: string
  dueDate: string
  lines: DocumentLine[]
  /** Output VAT, 0 or the PPN rate. */
  taxPct: number
  memo: string
  status: InvoiceStatus
  journalId: string | null
  taxInvoice: TaxInvoice | null
  receipts: DocumentPayment[]
  createdBy: string
  createdAt: string
}

export interface Budget {
  id: string
  year: number
  accountId: string
  /** Twelve monthly amounts, January first. */
  months: number[]
}

export interface FinanceSettings {
  /** PPN rate in percent. */
  vatPct: number
  receivableAccountId: string
  payableAccountId: string
  vatOutAccountId: string
  vatInAccountId: string
  retainedEarningsAccountId: string
  /** Where auto-journals and new receipts land when nothing else is picked. */
  defaultCashAccountId: string
  /** Faktur pajak range: the prefix and the next serial. */
  taxInvoicePrefix: string
  taxInvoiceNext: number
  taxInvoiceLast: number
}
