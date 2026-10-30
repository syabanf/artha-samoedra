import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Bill, Invoice } from '@artha/types'
import { FIXTURE_NOW } from './clock'
import {
  accountBalance,
  balanceSheet,
  buildCashTx,
  cashFlow,
  incomeStatement,
  invoiceTotals,
  receivableAging,
  trialBalance,
  yearRange,
} from './finance'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, actions: AppAction[], by = 'usr-7') => actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)
const gl = (code: string) => `gl-${code}`
const oct = (d: number) => new Date(2026, 9, d, 10).toISOString()

test('the seeded books balance', () => {
  const s = seedState()
  assert.equal(balanceSheet(s, AT).difference, 0)
  const tb = trialBalance(s, yearRange(2026).from, AT)
  const debit = tb.reduce((n, r) => n + r.debit, 0)
  const credit = tb.reduce((n, r) => n + r.credit, 0)
  assert.equal(debit, credit)
  const { closing } = cashFlow(s, yearRange(2026).from, AT)
  const cash = s.glAccounts.filter((a) => a.isCash).reduce((n, a) => n + accountBalance(s, a.id, AT), 0)
  assert.equal(closing, cash)
})

test('a journal must balance and land in an open period', () => {
  const s = seedState()
  const lines = [
    { accountId: gl('5-2400'), debit: 1_000_000, credit: 0, memo: '' },
    { accountId: gl('1-1100'), debit: 0, credit: 900_000, memo: '' },
  ]
  const base = { id: 'jnl-t', code: '', date: oct(29), memo: 'Test', source: 'manual' as const, ref: null, lines, status: 'draft' as const, reversalOf: null, voidReason: '', postedAt: null, createdBy: '', createdAt: AT }
  const saved = run(s, [{ type: 'journals/save', journal: base }])
  assert.match(blockerFor(saved, { type: 'journals/post', id: 'jnl-t' })!, /must be equal/)
  const fixed = run(saved, [{ type: 'journals/save', journal: { ...saved.journals[0], lines: [lines[0], { ...lines[1], credit: 1_000_000 }] } }, { type: 'journals/post', id: 'jnl-t' }])
  assert.equal(fixed.journals.find((j) => j.id === 'jnl-t')?.status, 'posted')
  // March is closed.
  const march = { ...base, id: 'jnl-m', date: new Date(2026, 2, 3, 10).toISOString(), lines: [lines[0], { ...lines[1], credit: 1_000_000 }] }
  const inMarch = run(s, [{ type: 'journals/save', journal: march }])
  assert.match(blockerFor(inMarch, { type: 'journals/post', id: 'jnl-m' })!, /March 2026 period is closed/)
})

test('a paid booking fee posts an auto-journal, unless its mapping is off', () => {
  const s = seedState()
  const before = s.journals.length
  const paid = run(s, [{ type: 'payments/markPaid', id: 'pay-2', reference: 'VA 1' }])
  const j = paid.journals[0]
  assert.equal(paid.journals.length, before + 1)
  assert.equal(j.source, 'auto')
  assert.equal(j.ref?.id, 'pay-2')
  assert.equal(accountBalance(paid, gl('2-1300'), AT) - accountBalance(s, gl('2-1300'), AT), 20_000_000)
  const off = run(s, [
    { type: 'autoJournals/update', id: 'ajm-booking_fee_paid', patch: { enabled: false } },
    { type: 'payments/markPaid', id: 'pay-2', reference: 'VA 1' },
  ])
  assert.equal(off.journals.length, before)
})

test('a paid settlement books the commission and the partner shares', () => {
  const s = seedState()
  const paid = run(s, [{ type: 'settlements/markPaid', id: 'stl-1' }])
  const j = paid.journals[0]
  const st = paid.settlements.find((x) => x.id === 'stl-1')!
  assert.equal(j.ref?.kind, 'settlement')
  assert.equal(j.lines.find((l) => l.accountId === gl('4-1100'))?.credit, st.commission)
  const shares = st.lines.some((l) => (l.kind === 'partner' || l.kind === 'other') && l.amount > 0)
  assert.deepEqual(j.events, shares ? ['settlement_collected', 'partner_share_paid'] : ['settlement_collected'])
  assert.equal(balanceSheet(paid, AT).difference, 0)
})

test('cash transactions post a journal and transfers stay between cash accounts', () => {
  const s = seedState()
  const draft = { kind: 'transfer' as const, date: oct(29), accountId: gl('1-1200'), counterAccountId: gl('5-2400'), amount: 1_000_000, memo: 'Move', reference: '' }
  assert.match(blockerFor(s, { type: 'cash/record', tx: buildCashTx(s, draft, AT, 'usr-7') })!, /another cash or bank account/)
  const tx = buildCashTx(s, { ...draft, counterAccountId: gl('1-1100') }, AT, 'usr-7')
  const next = run(s, [{ type: 'cash/record', tx }])
  assert.equal(accountBalance(next, gl('1-1100'), AT) - accountBalance(s, gl('1-1100'), AT), 1_000_000)
  assert.equal(next.journals[0].id, tx.journalId)
  const rec = { id: 'rcn-t', accountId: gl('1-1200'), statementDate: AT, statementBalance: 0, journalIds: [tx.journalId], createdBy: 'usr-7', createdAt: AT }
  const done = run(next, [{ type: 'cash/reconcile', reconciliation: rec }])
  assert.match(blockerFor(done, { type: 'cash/reconcile', reconciliation: { ...rec, id: 'rcn-u' } })!, /already reconciled/)
})

test('bills post to payables and payments cannot exceed the balance', () => {
  const s = seedState()
  const posted = run(s, [{ type: 'bills/post', id: 'bil-6' }])
  const bill = posted.bills.find((b) => b.id === 'bil-6') as Bill
  assert.equal(bill.status, 'posted')
  assert.equal(accountBalance(posted, gl('2-1100'), AT) - accountBalance(s, gl('2-1100'), AT), 7_104_000)
  const pay = (amount: number) => ({ id: 'bp-t', date: oct(29), amount, cashAccountId: gl('1-1200'), reference: '', journalId: 'jnl-bp-t' })
  assert.match(blockerFor(posted, { type: 'bills/pay', id: 'bil-6', payment: pay(8_000_000) })!, /more than/)
  const paid = run(posted, [{ type: 'bills/pay', id: 'bil-6', payment: pay(7_104_000) }])
  assert.equal(accountBalance(paid, gl('2-1100'), AT), accountBalance(s, gl('2-1100'), AT))
  assert.match(blockerFor(paid, { type: 'bills/void', id: 'bil-6' })!, /has payments/)
})

test('a faktur pajak takes the next number and needs an NPWP', () => {
  const s = seedState()
  assert.match(blockerFor(s, { type: 'invoices/taxInvoice', id: 'inv-5', buyerTaxId: '123' })!, /15 or 16 digits/)
  assert.match(blockerFor(s, { type: 'invoices/taxInvoice', id: 'inv-1', buyerTaxId: '012345678901234' })!, /no VAT/)
  const next = run(s, [{ type: 'invoices/taxInvoice', id: 'inv-5', buyerTaxId: '01.234.567.8-901.234' }])
  const inv = next.invoices.find((i) => i.id === 'inv-5') as Invoice
  assert.equal(inv.taxInvoice?.number, '010.000-26.00000003')
  assert.equal(inv.taxInvoice?.buyerTaxId, '012345678901234')
  assert.equal(next.financeSettings.taxInvoiceNext, 4)
  assert.match(blockerFor(next, { type: 'invoices/void', id: 'inv-5' })!, /credit note/)
  const received = run(next, [{ type: 'invoices/receive', id: 'inv-5', receipt: { id: 'rc-t', date: oct(29), amount: invoiceTotals(inv).total, cashAccountId: gl('1-1200'), reference: '', journalId: 'jnl-rc-t' } }])
  assert.equal(invoiceTotals(received.invoices.find((i) => i.id === 'inv-5')!).balance, 0)
})

test('receivables age by days past due', () => {
  const s = seedState()
  const { parties, totals } = receivableAging(s, FIXTURE_NOW)
  // INV-26-0001 fell due on 29 August, 62 days ago.
  assert.equal(parties.find((p) => p.party === s.contacts.find((c) => c.id === 'con-5')?.name)?.buckets[3], 7_500_000)
  assert.ok(totals[0] > 0)
})

test('periods close in order and the year close moves profit to retained earnings', () => {
  let s = seedState()
  assert.match(blockerFor(s, { type: 'periods/close', id: 'per-2026-10' })!, /Close September 2026 first/)
  s = run(s, [{ type: 'periods/close', id: 'per-2026-09' }])
  assert.match(blockerFor(s, { type: 'periods/close', id: 'per-2026-10' })!, /draft journal/)
  assert.match(blockerFor(s, { type: 'periods/reopen', id: 'per-2026-08' })!, /Reopen September 2026 first/)
  s = run(s, [{ type: 'journals/void', id: 'jnl-bonus-10', reason: 'Booked next month' }])
  s = run(s, ['10', '11', '12'].map((m) => ({ type: 'periods/close' as const, id: `per-2026-${m}` })))
  assert.match(blockerFor(s, { type: 'years/close', id: 'fy-2026' })!, /Open fiscal year 2027 first/)
  const { netIncome } = incomeStatement(s, yearRange(2026).from, yearRange(2026).to)
  const re = accountBalance(s, gl('3-1200'))
  s = run(s, [{ type: 'years/open', year: 2027 }, { type: 'years/close', id: 'fy-2026' }])
  assert.equal(s.fiscalYears.find((y) => y.year === 2026)?.status, 'closed')
  assert.equal(accountBalance(s, gl('3-1200')) - re, netIncome)
  assert.equal(accountBalance(s, gl('4-1100')), 0)
  assert.equal(balanceSheet(s, yearRange(2026).to).difference, 0)
  assert.equal(incomeStatement(s, yearRange(2026).from, yearRange(2026).to).netIncome, netIncome)
})

test('opening balances must balance and the chart refuses duplicate codes', () => {
  const s = seedState()
  assert.match(blockerFor(s, { type: 'gl/setOpening', balances: { [gl('1-1100')]: 20_000_000 } })!, /off by Rp 5,000,000/)
  const dup = { ...s.glAccounts[0], id: 'gl-new' }
  assert.match(blockerFor(s, { type: 'gl/upsert', account: dup })!, /already in use/)
  assert.match(blockerFor(s, { type: 'gl/remove', id: gl('1-1400') })!, /control account/)
})
