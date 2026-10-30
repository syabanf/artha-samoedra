import type {
  Bill,
  GoodsReceipt,
  Item,
  ItemCategory,
  JournalEntry,
  JournalLine,
  PoLine,
  PurchaseOrder,
  PurchaseRequest,
  PurchaseReturn,
  PurchasingSettings,
  StockCount,
  StockMove,
  Uom,
  Vendor,
  VendorCredit,
  VendorPrice,
  Warehouse,
} from '@artha/types'
import { averageCost, prSteps } from './purchasing'
import { EMPLOYEES } from './seed-hr'

const gl = (code: string) => `gl-${code}`
const d = (month: number, day: number, hour = 10) => new Date(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+07:00`).toISOString()

export const PURCHASING_SETTINGS: PurchasingSettings = {
  financeApprovalAbove: 10_000_000,
  directorApprovalAbove: 50_000_000,
  directorUserId: 'usr-1',
  inventoryAccountId: gl('1-1700'),
  grniAccountId: gl('2-1700'),
  defaultWarehouseId: 'wh-jkt',
}

export const UOMS: Uom[] = [
  ['pcs', 'Pieces'],
  ['pack', 'Pack'],
  ['box', 'Box'],
  ['ream', 'Ream'],
  ['set', 'Set'],
  ['roll', 'Roll'],
].map(([code, name]) => ({ id: `uom-${code}`, code, name }))

export const ITEM_CATEGORIES: ItemCategory[] = [
  { id: 'cat-mkt', name: 'Marketing materials', expenseAccountId: gl('5-2500') },
  { id: 'cat-oh', name: 'Open house kits', expenseAccountId: gl('5-2500') },
  { id: 'cat-office', name: 'Office supplies', expenseAccountId: gl('5-2900') },
  { id: 'cat-it', name: 'IT accessories', expenseAccountId: gl('5-2900') },
  { id: 'cat-pantry', name: 'Pantry', expenseAccountId: gl('5-2900') },
]

export const WAREHOUSES: Warehouse[] = [
  { id: 'wh-jkt', code: 'JKT', name: 'Jakarta store room', branchId: 'brn-jkt', active: true },
  { id: 'wh-bdg', code: 'BDG', name: 'Bandung store room', branchId: 'brn-bdg', active: true },
  { id: 'wh-sby', code: 'SBY', name: 'Surabaya store room', branchId: 'brn-sby', active: true },
  { id: 'wh-dps', code: 'DPS', name: 'Bali store room', branchId: 'brn-dps', active: true },
]

/** name, category, unit, min, reorder, cost, opening stock in JKT, BDG, SBY, DPS */
const itemRows: [string, string, string, number, number, number, [number, number, number, number]][] = [
  ['Site board 3 x 2 m', 'cat-mkt', 'pcs', 4, 6, 1_400_000, [3, 1, 1, 1]],
  ['Tri-fold brochure, pack of 100', 'cat-mkt', 'pack', 10, 20, 320_000, [6, 3, 2, 2]],
  ['Business cards, box of 200', 'cat-mkt', 'box', 6, 10, 85_000, [8, 2, 2, 2]],
  ['X-banner stand', 'cat-mkt', 'pcs', 4, 8, 175_000, [3, 1, 0, 1]],
  ['Window sticker roll', 'cat-mkt', 'roll', 2, 4, 240_000, [4, 1, 1, 0]],
  ['Balloon and ribbon set', 'cat-oh', 'set', 6, 10, 95_000, [9, 2, 2, 2]],
  ['Shoe covers, pack of 50', 'cat-oh', 'pack', 10, 20, 60_000, [14, 4, 3, 4]],
  ['Key lockbox', 'cat-oh', 'pcs', 5, 10, 1_200_000, [4, 1, 1, 1]],
  ['A4 paper 80 gsm', 'cat-office', 'ream', 30, 40, 52_000, [18, 5, 4, 4]],
  ['Printer toner', 'cat-office', 'pcs', 3, 4, 1_250_000, [1, 1, 0, 1]],
  ['Stamp ink', 'cat-office', 'pcs', 4, 6, 25_000, [10, 2, 2, 2]],
  ['Name tag lanyard', 'cat-office', 'pcs', 15, 30, 18_000, [40, 6, 6, 6]],
  ['USB flash drive 64 GB', 'cat-it', 'pcs', 5, 10, 95_000, [14, 2, 1, 1]],
  ['HDMI cable 2 m', 'cat-it', 'pcs', 3, 5, 65_000, [6, 1, 1, 1]],
  ['Bottled water 600 ml, box of 24', 'cat-pantry', 'box', 15, 30, 48_000, [20, 4, 4, 4]],
  ['Coffee beans 1 kg', 'cat-pantry', 'pack', 4, 10, 210_000, [3, 1, 1, 1]],
]

export const ITEMS: Item[] = itemRows.map(([name, categoryId, uom, minStock, reorderQty], i) => ({
  id: `itm-${i + 1}`,
  sku: `SKU-${String(i + 1).padStart(4, '0')}`,
  name,
  categoryId,
  uomId: `uom-${uom}`,
  minStock,
  reorderQty,
  description: '',
  active: true,
}))

const cost = (itemId: string) => itemRows[Number(itemId.split('-')[1]) - 1][5]

export const OPENING_STOCK_VALUE = itemRows.reduce((n, r) => n + r[5] * r[6].reduce((a, b) => a + b, 0), 0)

export const SUPPLIERS: Vendor[] = [
  { id: 'vnd-6', code: 'VND-006', name: 'CV Mitra ATK', taxId: '027766112233000', phone: '021-6230-4411', email: 'sales@mitraatk.co.id', bankAccount: 'BCA 0081 223 344', termsDays: 30, active: true },
  { id: 'vnd-7', code: 'VND-007', name: 'PT Sumber Pantry Nusantara', taxId: '031188776655000', phone: '021-5890-1122', email: 'order@sumberpantry.id', bankAccount: 'Mandiri 126 000 5566 7', termsDays: 14, active: true },
  { id: 'vnd-8', code: 'VND-008', name: 'Toko Elektronik Glodok Jaya', taxId: '', phone: '0812-9911-2288', email: 'glodokjaya@gmail.com', bankAccount: 'BCA 4100 556 778', termsDays: 7, active: true },
]

/** item, vendor, price, min qty, lead days */
const priceRows: [number, string, number, number, number][] = [
  [1, 'vnd-3', 1_400_000, 1, 5], [1, 'vnd-3', 1_300_000, 6, 7],
  [2, 'vnd-3', 320_000, 1, 5], [2, 'vnd-3', 295_000, 20, 6],
  [3, 'vnd-3', 85_000, 1, 3], [4, 'vnd-3', 175_000, 1, 4], [5, 'vnd-3', 240_000, 1, 4],
  [6, 'vnd-6', 95_000, 1, 3], [7, 'vnd-6', 60_000, 1, 3], [8, 'vnd-8', 1_200_000, 1, 5], [8, 'vnd-8', 1_080_000, 20, 10],
  [9, 'vnd-6', 52_000, 1, 2], [9, 'vnd-6', 49_000, 50, 3], [10, 'vnd-6', 1_250_000, 1, 5], [10, 'vnd-8', 1_190_000, 1, 7],
  [11, 'vnd-6', 25_000, 1, 2], [12, 'vnd-6', 18_000, 1, 3], [13, 'vnd-8', 95_000, 1, 3], [14, 'vnd-8', 65_000, 1, 3],
  [15, 'vnd-7', 48_000, 1, 4], [16, 'vnd-7', 210_000, 1, 4],
]

export const VENDOR_PRICES: VendorPrice[] = priceRows.map(([item, vendorId, price, minQty, leadDays], i) => ({
  id: `vp-${i + 1}`,
  vendorId,
  itemId: `itm-${item}`,
  price,
  minQty,
  leadDays,
  validFrom: '2026-01-01T00:00:00+07:00',
  validTo: null,
}))

// ---------------------------------------------------------------- requests

const pr = (id: string, code: string, requesterId: string, reason: string, lines: [number, number][], created: string, decisions: ('approved' | 'rejected')[], extra: Partial<PurchaseRequest> = {}): PurchaseRequest => {
  const e = EMPLOYEES.find((x) => x.id === requesterId)!
  const prLines = lines.map(([item, qty], i) => ({ id: `${id}-l${i + 1}`, itemId: `itm-${item}`, qty, estPrice: cost(`itm-${item}`), note: '' }))
  const total = prLines.reduce((n, l) => n + l.qty * l.estPrice, 0)
  const steps = decisions.length || extra.status !== 'draft' ? prSteps({ employees: EMPLOYEES, purchasingSettings: PURCHASING_SETTINGS }, requesterId, total) : []
  const decided = steps.map((st, i) =>
    decisions[i] ? { ...st, decision: decisions[i], by: st.approverId ?? 'usr-7', at: created, note: decisions[i] === 'rejected' ? 'We still have 14 in stock. Use those first.' : '' } : st,
  )
  const status = decisions.includes('rejected') ? 'rejected' : decided.length && decided.every((st) => st.decision === 'approved') ? 'approved' : 'pending'
  return { id, code, requesterId, departmentId: e.departmentId, neededBy: d(11, 15), reason, lines: prLines, status, steps: decided, poId: null, createdBy: e.userId ?? 'usr-10', createdAt: created, ...extra }
}

export const PURCHASE_REQUESTS: PurchaseRequest[] = [
  pr('pr-7', 'PR-26-0007', 'emp-3', 'New cards with the updated office address', [[3, 4]], d(10, 29), [], { status: 'draft' }),
  pr('pr-6', 'PR-26-0006', 'emp-2', 'Lockboxes so agents can show listings without the owner', [[8, 30]], d(10, 27), ['approved']),
  pr('pr-5', 'PR-26-0005', 'emp-19', 'Flash drives for client presentations', [[13, 20]], d(10, 22), ['rejected']),
  pr('pr-4', 'PR-26-0004', 'emp-15', 'Monthly office supplies for Jakarta', [[9, 40], [10, 4], [11, 6]], d(10, 8), ['approved'], { status: 'ordered', poId: 'po-2' }),
  pr('pr-3', 'PR-26-0003', 'emp-15', 'Pantry restock for November', [[15, 30], [16, 10]], d(10, 22), ['approved'], { status: 'ordered', poId: 'po-3' }),
  pr('pr-2', 'PR-26-0002', 'emp-12', 'Site boards and banners for the Simatupang launch', [[1, 6], [4, 8]], d(10, 28), []),
  pr('pr-1', 'PR-26-0001', 'emp-16', 'Open house kits for the November weekends', [[6, 10], [7, 20]], d(10, 26), ['approved']),
]

// ---------------------------------------------------------------- orders, receipts and stock

const line = (id: string, item: number, qty: number, unitPrice: number, got: Partial<PoLine> = {}): PoLine => ({
  id, itemId: `itm-${item}`, qty, unitPrice, receivedQty: 0, rejectedQty: 0, returnedQty: 0, billedQty: 0, creditedQty: 0, ...got,
})

const po = (p: Omit<PurchaseOrder, 'createdBy' | 'createdAt' | 'billIds' | 'note'> & Partial<PurchaseOrder>): PurchaseOrder => ({ note: '', billIds: [], createdBy: 'usr-10', createdAt: p.orderDate, ...p })

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  po({ id: 'po-4', code: 'PO-26-0004', vendorId: 'vnd-3', warehouseId: 'wh-jkt', prIds: [], orderDate: d(10, 29), expectedDate: d(11, 5), lines: [line('po4-1', 4, 8, 175_000)], taxPct: 11, terms: 'Net 30 days', status: 'draft', shipping: null, sentAt: null }),
  po({
    id: 'po-3', code: 'PO-26-0003', vendorId: 'vnd-7', warehouseId: 'wh-jkt', prIds: ['pr-3'], orderDate: d(10, 24), expectedDate: d(11, 2), taxPct: 11, terms: 'Net 14 days', status: 'sent', sentAt: d(10, 24),
    lines: [line('po3-1', 15, 30, 48_000), line('po3-2', 16, 10, 210_000)],
    shipping: { carrier: 'JNE Trucking', tracking: 'JTR-77812093', shippedAt: d(10, 29) },
  }),
  po({
    id: 'po-2', code: 'PO-26-0002', vendorId: 'vnd-6', warehouseId: 'wh-jkt', prIds: ['pr-4'], orderDate: d(10, 10), expectedDate: d(10, 17), taxPct: 11, terms: 'Net 30 days', status: 'partial', sentAt: d(10, 10), shipping: null,
    lines: [line('po2-1', 9, 40, 52_000, { receivedQty: 40 }), line('po2-2', 10, 4, 1_250_000, { receivedQty: 2, rejectedQty: 1 }), line('po2-3', 11, 6, 25_000)],
  }),
  po({
    id: 'po-1', code: 'PO-26-0001', vendorId: 'vnd-3', warehouseId: 'wh-jkt', prIds: [], orderDate: d(9, 15), expectedDate: d(9, 22), taxPct: 11, terms: 'Net 30 days', status: 'received', sentAt: d(9, 15), shipping: null, billIds: ['bil-7'],
    lines: [line('po1-1', 2, 20, 320_000, { receivedQty: 20, returnedQty: 2, billedQty: 20, creditedQty: 2 }), line('po1-2', 3, 10, 85_000, { receivedQty: 10, billedQty: 10 })],
  }),
]

export const GOODS_RECEIPTS: GoodsReceipt[] = [
  { id: 'gr-2', code: 'GR-26-0002', poId: 'po-2', deliveryNote: 'DO/MA/2610/0457', receivedAt: d(10, 17, 14), lines: [{ poLineId: 'po2-1', accepted: 40, rejected: 0, qcNote: '' }, { poLineId: 'po2-2', accepted: 2, rejected: 1, qcNote: 'Box crushed, toner leaking' }], journalId: 'jnl-gr-2', by: 'usr-10' },
  { id: 'gr-1', code: 'GR-26-0001', poId: 'po-1', deliveryNote: 'SJ-CK-0922', receivedAt: d(9, 22, 11), lines: [{ poLineId: 'po1-1', accepted: 20, rejected: 0, qcNote: '' }, { poLineId: 'po1-2', accepted: 10, rejected: 0, qcNote: '' }], journalId: 'jnl-gr-1', by: 'usr-10' },
]

export const PURCHASE_RETURNS: PurchaseReturn[] = [{ id: 'ret-1', code: 'RET-26-0001', poId: 'po-1', reason: 'Two packs printed with the old phone number', lines: [{ poLineId: 'po1-1', qty: 2 }], creditId: 'vc-1', journalId: 'jnl-ret-1', at: d(10, 2), by: 'usr-10' }]

export const VENDOR_CREDITS: VendorCredit[] = [{ id: 'vc-1', code: 'CN-26-0001', vendorId: 'vnd-3', returnId: 'ret-1', amount: Math.round(2 * 320_000 * 1.11), date: d(10, 2), applied: [] }]

/** The Cetak Kilat bill for PO-26-0001, posted against goods received not invoiced. */
export const PO_BILLS: Omit<Bill, 'journalId' | 'createdBy' | 'createdAt'>[] = [
  {
    id: 'bil-7', code: 'BILL-26-0007', vendorId: 'vnd-3', vendorRef: 'CK/2609/098', date: d(9, 23), dueDate: d(10, 23), taxPct: 11, memo: 'Billed from PO-26-0001', status: 'posted', payments: [],
    lines: [
      { id: 'bl-po1-1', description: 'Tri-fold brochure, pack of 100, PO-26-0001', accountId: gl('2-1700'), qty: 20, unitPrice: 320_000 },
      { id: 'bl-po1-2', description: 'Business cards, box of 200, PO-26-0001', accountId: gl('2-1700'), qty: 10, unitPrice: 85_000 },
    ],
  },
]

type Draft = Pick<JournalEntry, 'id' | 'date' | 'memo' | 'source' | 'ref' | 'lines'>
/** Inventory journals the finance seed numbers with the rest. */
export const PURCHASING_JOURNALS: Draft[] = []
export const STOCK_MOVES: StockMove[] = []

const dr = (accountId: string, amount: number): JournalLine => ({ accountId, debit: amount, credit: 0, memo: '' })
const cr = (accountId: string, amount: number): JournalLine => ({ accountId, debit: 0, credit: amount, memo: '' })
const expense = (itemId: string) => ITEM_CATEGORIES.find((c) => c.id === ITEMS.find((i) => i.id === itemId)!.categoryId)!.expenseAccountId
const name = (itemId: string) => ITEMS.find((i) => i.id === itemId)!.name
let seq = 0
const move = (m: Omit<StockMove, 'id' | 'by'>) => STOCK_MOVES.push({ ...m, id: `mv-${++seq}`, by: 'usr-10' })
const journal = (id: string, date: string, memo: string, ref: Draft['ref'], lines: JournalLine[]) => {
  PURCHASING_JOURNALS.push({ id, date, memo, source: 'inventory', ref, lines })
  return id
}

// Opening stock on 1 January, valued in the ledger's opening balance.
itemRows.forEach((r, i) =>
  WAREHOUSES.forEach((w, k) => {
    if (r[6][k]) move({ itemId: `itm-${i + 1}`, warehouseId: w.id, qty: r[6][k], unitCost: r[5], kind: 'opening', ref: null, departmentId: null, note: 'Opening stock', journalId: null, at: d(1, 1, 8) })
  }),
)

const avg = (itemId: string) => averageCost({ stockMoves: STOCK_MOVES }, itemId)
const onHandAt = (itemId: string, warehouseId: string) => STOCK_MOVES.filter((m) => m.itemId === itemId && m.warehouseId === warehouseId).reduce((n, m) => n + m.qty, 0)
const out = (kind: 'issue' | 'scrap', itemId: string, warehouseId: string, qty: number, at: string, note: string, departmentId: string | null) => {
  const c = avg(itemId)
  const j = journal(`jnl-${kind}-${seq + 1}`, at, `${kind === 'issue' ? 'Issued' : 'Scrapped'} ${qty} ${name(itemId)}`, { kind: 'item', id: itemId, label: name(itemId) }, [dr(expense(itemId), qty * c), cr(gl('1-1700'), qty * c)])
  move({ itemId, warehouseId, qty: -qty, unitCost: c, kind, ref: null, departmentId, note, journalId: j, at })
}

// Stock count in Jakarta on 30 September: three lanyards and one stamp ink missing.
const COUNT_ITEMS = ['itm-9', 'itm-11', 'itm-12', 'itm-13', 'itm-15']
const countLines = COUNT_ITEMS.map((itemId) => ({ itemId, systemQty: onHandAt(itemId, 'wh-jkt'), countedQty: onHandAt(itemId, 'wh-jkt') - (itemId === 'itm-12' ? 3 : itemId === 'itm-11' ? 1 : 0) }))
journal('jnl-opn-1', d(9, 30, 16), 'Stock count OPN-26-0001', { kind: 'count', id: 'opn-1', label: 'OPN-26-0001' }, countLines.flatMap((l) => {
  const diff = l.countedQty - l.systemQty
  return diff ? [dr(expense(l.itemId), -diff * avg(l.itemId)), cr(gl('1-1700'), -diff * avg(l.itemId))] : []
}))
for (const l of countLines) {
  if (l.countedQty !== l.systemQty) move({ itemId: l.itemId, warehouseId: 'wh-jkt', qty: l.countedQty - l.systemQty, unitCost: avg(l.itemId), kind: 'count', ref: { kind: 'count', id: 'opn-1', label: 'OPN-26-0001' }, departmentId: null, note: 'September count', journalId: 'jnl-opn-1', at: d(9, 30, 16) })
}

// PO-26-0001 arrives on 22 September.
journal('jnl-gr-1', d(9, 22, 11), 'Goods receipt GR-26-0001 for PO-26-0001', { kind: 'receipt', id: 'gr-1', label: 'GR-26-0001' }, [dr(gl('1-1700'), 20 * 320_000 + 10 * 85_000), cr(gl('2-1700'), 20 * 320_000 + 10 * 85_000)])
move({ itemId: 'itm-2', warehouseId: 'wh-jkt', qty: 20, unitCost: 320_000, kind: 'receipt', ref: { kind: 'receipt', id: 'gr-1', label: 'GR-26-0001' }, departmentId: null, note: 'PO-26-0001 · SJ-CK-0922', journalId: 'jnl-gr-1', at: d(9, 22, 11) })
move({ itemId: 'itm-3', warehouseId: 'wh-jkt', qty: 10, unitCost: 85_000, kind: 'receipt', ref: { kind: 'receipt', id: 'gr-1', label: 'GR-26-0001' }, departmentId: null, note: 'PO-26-0001 · SJ-CK-0922', journalId: 'jnl-gr-1', at: d(9, 22, 11) })

// Two misprinted brochure packs go back on 2 October.
journal('jnl-ret-1', d(10, 2), 'Return RET-26-0001 to the vendor', { kind: 'return', id: 'ret-1', label: 'RET-26-0001' }, [dr(gl('2-1700'), 640_000), cr(gl('1-1700'), 640_000)])
move({ itemId: 'itm-2', warehouseId: 'wh-jkt', qty: -2, unitCost: 320_000, kind: 'return', ref: { kind: 'return', id: 'ret-1', label: 'RET-26-0001' }, departmentId: null, note: 'Printed with the old phone number', journalId: 'jnl-ret-1', at: d(10, 2) })

out('issue', 'itm-2', 'wh-jkt', 6, d(10, 5), 'Brochures for the Serpong open house', 'dep-sls')
out('issue', 'itm-9', 'wh-jkt', 12, d(10, 12), 'Paper for the Jakarta office', 'dep-hrg')

// PO-26-0002 arrives in part on 17 October: one toner rejected, stamp ink still to come.
const gr2Value = 40 * 52_000 + 2 * 1_250_000
journal('jnl-gr-2', d(10, 17, 14), 'Goods receipt GR-26-0002 for PO-26-0002', { kind: 'receipt', id: 'gr-2', label: 'GR-26-0002' }, [dr(gl('1-1700'), gr2Value), cr(gl('2-1700'), gr2Value)])
move({ itemId: 'itm-9', warehouseId: 'wh-jkt', qty: 40, unitCost: 52_000, kind: 'receipt', ref: { kind: 'receipt', id: 'gr-2', label: 'GR-26-0002' }, departmentId: null, note: 'PO-26-0002 · DO/MA/2610/0457', journalId: 'jnl-gr-2', at: d(10, 17, 14) })
move({ itemId: 'itm-10', warehouseId: 'wh-jkt', qty: 2, unitCost: 1_250_000, kind: 'receipt', ref: { kind: 'receipt', id: 'gr-2', label: 'GR-26-0002' }, departmentId: null, note: 'PO-26-0002 · DO/MA/2610/0457', journalId: 'jnl-gr-2', at: d(10, 17, 14) })

// Brochures move to Bandung for the Dago open house.
const trf = { kind: 'transfer', id: 'trf-1', label: 'JKT to BDG' }
move({ itemId: 'itm-2', warehouseId: 'wh-jkt', qty: -4, unitCost: avg('itm-2'), kind: 'transfer_out', ref: trf, departmentId: null, note: 'Dago open house', journalId: null, at: d(10, 20) })
move({ itemId: 'itm-2', warehouseId: 'wh-bdg', qty: 4, unitCost: avg('itm-2'), kind: 'transfer_in', ref: trf, departmentId: null, note: 'Dago open house', journalId: null, at: d(10, 20) })

out('scrap', 'itm-6', 'wh-jkt', 2, d(10, 21), 'Balloons burst in the hot store room', null)
out('issue', 'itm-15', 'wh-jkt', 8, d(10, 25), 'Pantry, last week of October', 'dep-hrg')
out('issue', 'itm-7', 'wh-jkt', 6, d(10, 26), 'Shoe covers for the Kemang open house', 'dep-sls')

STOCK_MOVES.reverse()

export const STOCK_COUNTS: StockCount[] = [
  {
    id: 'opn-2', code: 'OPN-26-0002', warehouseId: 'wh-bdg', status: 'draft', note: 'Monthly count', createdAt: d(10, 29), postedAt: null, by: 'usr-10',
    lines: ITEMS.filter((i) => onHandAt(i.id, 'wh-bdg') > 0).map((i, k) => ({ itemId: i.id, systemQty: onHandAt(i.id, 'wh-bdg'), countedQty: k < 5 ? onHandAt(i.id, 'wh-bdg') : null })),
  },
  { id: 'opn-1', code: 'OPN-26-0001', warehouseId: 'wh-jkt', status: 'posted', note: 'September count', createdAt: d(9, 30, 9), postedAt: d(9, 30, 16), by: 'usr-10', lines: countLines },
]
