import type {
  ApprovalStep,
  Bill,
  GoodsReceipt,
  Item,
  ItemCategory,
  JournalLine,
  PoLine,
  PurchaseOrder,
  PurchaseRequest,
  PurchaseReturn,
  PurchasingSettings,
  StockCount,
  StockMove,
  StockMoveKind,
  Uom,
  Vendor,
  VendorCredit,
  VendorPrice,
  Warehouse,
} from '@artha/types'
import { DAY, toMs } from './clock'
import { buildJournal, dateBlocker, financeApply, nextBillCode } from './finance'
import { fmtIdr, fmtNumber, newId, nextCode } from './format'
import { currentStep } from './hr'
import { patchById, upsert } from './rows'
import type { AppAction, AppState } from './store'

export type PurchasingAction =
  | { type: 'itemCategories/upsert'; category: ItemCategory }
  | { type: 'uoms/upsert'; uom: Uom }
  | { type: 'items/upsert'; item: Item }
  | { type: 'warehouses/upsert'; warehouse: Warehouse }
  | { type: 'vendorPrices/upsert'; price: VendorPrice }
  | { type: 'vendorPrices/remove'; id: string }
  /** CSV import: rows match vendors by name, the rest are added. */
  | { type: 'suppliers/import'; vendors: Vendor[] }
  | { type: 'stock/issue'; itemId: string; warehouseId: string; qty: number; departmentId: string; note: string }
  /** `qty` is positive to add stock, negative to take it out. */
  | { type: 'stock/adjust'; itemId: string; warehouseId: string; qty: number; note: string }
  | { type: 'stock/transfer'; itemId: string; fromId: string; toId: string; qty: number; note: string }
  | { type: 'stock/scrap'; itemId: string; warehouseId: string; qty: number; note: string }
  | { type: 'counts/create'; count: StockCount }
  | { type: 'counts/save'; id: string; lines: StockCount['lines'] }
  | { type: 'counts/post'; id: string }
  | { type: 'prs/save'; pr: PurchaseRequest }
  | { type: 'prs/submit'; id: string }
  | { type: 'prs/decide'; id: string; decision: 'approved' | 'rejected'; note: string; by: string }
  | { type: 'prs/cancel'; id: string }
  | { type: 'pos/save'; po: PurchaseOrder }
  | { type: 'pos/send'; id: string }
  | { type: 'pos/ship'; id: string; shipping: NonNullable<PurchaseOrder['shipping']> }
  | { type: 'pos/cancel'; id: string }
  /** Short-closes a part-received order, or closes a received one. */
  | { type: 'pos/close'; id: string }
  /** Turns received, unbilled units into a posted vendor bill against goods received not invoiced. */
  | { type: 'pos/bill'; id: string; billId: string; vendorRef: string; date: string }
  | { type: 'receipts/create'; receipt: GoodsReceipt }
  | { type: 'returns/create'; ret: PurchaseReturn }
  | { type: 'credits/apply'; id: string; billId: string; amount: number }
  | { type: 'purchasingSettings/update'; patch: Partial<PurchasingSettings> }

const PREFIXES = ['itemCategories/', 'uoms/', 'items/', 'warehouses/', 'vendorPrices/', 'suppliers/', 'stock/', 'counts/', 'prs/', 'pos/', 'receipts/', 'returns/', 'credits/', 'purchasingSettings/']
export const isPurchasingAction = (a: AppAction): a is PurchasingAction => PREFIXES.some((p) => a.type.startsWith(p))

// ---------------------------------------------------------------- stock

export const itemName = (s: Pick<AppState, 'items'>, id: string) => s.items.find((i) => i.id === id)?.name ?? 'Unknown item'
export const uomOf = (s: Pick<AppState, 'items' | 'uoms'>, itemId: string) => s.uoms.find((u) => u.id === s.items.find((i) => i.id === itemId)?.uomId)?.code ?? 'pcs'
export const fmtQty = (s: Pick<AppState, 'items' | 'uoms'>, itemId: string, qty: number) => `${fmtNumber(qty, 2)} ${uomOf(s, itemId)}`

/** On hand for one warehouse, or every warehouse when left out. */
export const onHand = (s: Pick<AppState, 'stockMoves'>, itemId: string, warehouseId?: string) =>
  s.stockMoves.filter((m) => m.itemId === itemId && (!warehouseId || m.warehouseId === warehouseId)).reduce((n, m) => n + m.qty, 0)

export const stockByWarehouse = (s: Pick<AppState, 'stockMoves' | 'warehouses'>, itemId: string) =>
  s.warehouses.map((w) => ({ warehouse: w, qty: onHand(s, itemId, w.id) }))

const byTime = (a: StockMove, b: StockMove) => a.at.localeCompare(b.at)

/** Moving average cost across warehouses: receipts and additions re-weigh it, outflows leave it as it is. */
export const averageCost = (s: Pick<AppState, 'stockMoves'>, itemId: string, asOf?: string) => {
  let qty = 0
  let value = 0
  let avg = 0
  for (const m of s.stockMoves.filter((x) => x.itemId === itemId && (!asOf || x.at <= asOf)).sort(byTime)) {
    if (m.kind === 'transfer_in' || m.kind === 'transfer_out') continue
    if (m.qty > 0) {
      value += m.qty * m.unitCost
      qty += m.qty
      avg = qty > 0 ? value / qty : m.unitCost
    } else {
      qty += m.qty
      value = qty * avg
    }
  }
  return Math.round(avg)
}

export const stockValue = (s: Pick<AppState, 'stockMoves' | 'items'>, itemId: string, warehouseId?: string) => onHand(s, itemId, warehouseId) * averageCost(s, itemId)

export const lowStock = (s: Pick<AppState, 'items' | 'stockMoves'>) =>
  s.items.filter((i) => i.active && onHand(s, i.id) < i.minStock).map((item) => ({ item, qty: onHand(s, item.id), short: item.minStock - onHand(s, item.id) }))

export interface StockCardRow {
  move: StockMove
  balance: number
}

/** Moves of one item, oldest first, with the running balance; one warehouse or all. */
export const stockCard = (s: Pick<AppState, 'stockMoves'>, itemId: string, warehouseId?: string, from?: string, to?: string) => {
  const moves = s.stockMoves.filter((m) => m.itemId === itemId && (!warehouseId || m.warehouseId === warehouseId)).sort(byTime)
  // Transfers between two warehouses cancel out when every warehouse is shown.
  const shown = warehouseId ? moves : moves.filter((m) => m.kind !== 'transfer_in' && m.kind !== 'transfer_out')
  const opening = shown.filter((m) => from && m.at < from).reduce((n, m) => n + m.qty, 0)
  let balance = opening
  const rows: StockCardRow[] = shown
    .filter((m) => (!from || m.at >= from) && (!to || m.at <= to))
    .map((move) => {
      balance += move.qty
      return { move, balance }
    })
  return { opening, rows, closing: balance }
}

export const valuation = (s: Pick<AppState, 'items' | 'stockMoves' | 'warehouses'>, warehouseId?: string) =>
  s.items
    .map((item) => {
      const qty = onHand(s, item.id, warehouseId)
      const cost = averageCost(s, item.id)
      return { item, qty, cost, value: qty * cost }
    })
    .filter((r) => r.qty !== 0)

// ---------------------------------------------------------------- requests and orders

export const prTotal = (pr: Pick<PurchaseRequest, 'lines'>) => pr.lines.reduce((n, l) => n + l.qty * l.estPrice, 0)

/** The requester's manager, then Finance above the finance threshold, then the Director above theirs. */
export const prSteps = (s: Pick<AppState, 'employees' | 'purchasingSettings'>, requesterId: string, total: number): ApprovalStep[] => {
  const p = s.purchasingSettings
  const e = s.employees.find((x) => x.id === requesterId)
  const manager = s.employees.find((x) => x.id === e?.managerId)
  const step = (label: ApprovalStep['label'], approverId: string | null): ApprovalStep => ({ label, approverId, decision: 'pending', by: null, at: null, note: '' })
  const steps = [
    ...(manager ? [step('Manager', manager.userId)] : []),
    ...(total >= p.financeApprovalAbove ? [step('Finance', null)] : []),
    ...(total >= p.directorApprovalAbove && e?.userId !== p.directorUserId ? [step('Director', p.directorUserId)] : []),
  ]
  return steps.length ? steps : [step('Finance', null)]
}

/** Requests whose current level waits on this user; never their own. */
export const prsAwaiting = (s: Pick<AppState, 'purchaseRequests' | 'employees'>, userId: string, canApprove: boolean) =>
  s.purchaseRequests
    .filter((r) => {
      const step = currentStep(r)
      if (!step || s.employees.find((e) => e.id === r.requesterId)?.userId === userId) return false
      return step.approverId ? step.approverId === userId : canApprove
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

export const poTotals = (po: Pick<PurchaseOrder, 'lines' | 'taxPct'>) => {
  const subtotal = po.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
  const tax = Math.round((subtotal * po.taxPct) / 100)
  const received = po.lines.reduce((n, l) => n + l.receivedQty * l.unitPrice, 0)
  return { subtotal, tax, total: subtotal + tax, received }
}

export const outstanding = (l: PoLine) => Math.max(l.qty - l.receivedQty, 0)
export const billable = (l: PoLine) => Math.max(l.receivedQty - l.returnedQty - l.billedQty, 0)
export const returnable = (l: PoLine) => l.receivedQty - l.returnedQty

/** Late once the expected date passes with units still outstanding. */
export const isPoLate = (po: PurchaseOrder, nowMs: number) => (po.status === 'sent' || po.status === 'partial') && toMs(po.expectedDate) < nowMs

/** The cheapest valid price for the quantity, from one vendor or any. */
export const bestPrice = (s: Pick<AppState, 'vendorPrices'>, itemId: string, qty: number, at: string, vendorId?: string) =>
  s.vendorPrices
    .filter((p) => p.itemId === itemId && (!vendorId || p.vendorId === vendorId) && p.minQty <= qty && p.validFrom <= at && (!p.validTo || p.validTo >= at))
    .sort((a, b) => a.price - b.price)[0]

/** What the item cost on each sent order, newest first. */
export const priceHistory = (s: Pick<AppState, 'purchaseOrders'>, itemId: string) =>
  s.purchaseOrders
    .filter((po) => po.status !== 'draft' && po.status !== 'cancelled')
    .flatMap((po) => po.lines.filter((l) => l.itemId === itemId).map((l) => ({ po, price: l.unitPrice, qty: l.qty, at: po.orderDate })))
    .sort((a, b) => b.at.localeCompare(a.at))

/** A draft order for one vendor from approved requests: lines merged by item, priced from the vendor's list. */
export const buildPoFromRequests = (s: AppState, prIds: string[], vendorId: string, at: string, by: string): PurchaseOrder => {
  const lines = new Map<string, PoLine>()
  for (const pr of s.purchaseRequests.filter((r) => prIds.includes(r.id))) {
    for (const l of pr.lines) {
      const line = lines.get(l.itemId) ?? { id: newId('pol'), itemId: l.itemId, qty: 0, unitPrice: 0, receivedQty: 0, rejectedQty: 0, returnedQty: 0, billedQty: 0, creditedQty: 0 }
      line.qty += l.qty
      line.unitPrice = bestPrice(s, l.itemId, line.qty, at, vendorId)?.price ?? l.estPrice
      lines.set(l.itemId, line)
    }
  }
  const leads = [...lines.values()].map((l) => bestPrice(s, l.itemId, l.qty, at, vendorId)?.leadDays ?? 7)
  const lead = leads.length ? Math.max(...leads) : 7
  return {
    id: newId('po'),
    code: nextPoCode(s),
    vendorId,
    warehouseId: s.purchasingSettings.defaultWarehouseId,
    prIds,
    orderDate: at,
    expectedDate: new Date(toMs(at) + lead * DAY).toISOString(),
    lines: [...lines.values()],
    taxPct: s.financeSettings.vatPct,
    terms: `Net ${s.vendors.find((v) => v.id === vendorId)?.termsDays ?? 30} days`,
    note: '',
    status: 'draft',
    shipping: null,
    sentAt: null,
    billIds: [],
    createdBy: by,
    createdAt: at,
  }
}

export const nextPrCode = (s: Pick<AppState, 'purchaseRequests'>) => nextCode(s.purchaseRequests.map((x) => x.code), 'PR-26-', 4)
export const nextPoCode = (s: Pick<AppState, 'purchaseOrders'>) => nextCode(s.purchaseOrders.map((x) => x.code), 'PO-26-', 4)
export const nextReceiptCode = (s: Pick<AppState, 'goodsReceipts'>) => nextCode(s.goodsReceipts.map((x) => x.code), 'GR-26-', 4)
export const nextReturnCode = (s: Pick<AppState, 'purchaseReturns'>) => nextCode(s.purchaseReturns.map((x) => x.code), 'RET-26-', 4)
export const nextCountCode = (s: Pick<AppState, 'stockCounts'>) => nextCode(s.stockCounts.map((x) => x.code), 'OPN-26-', 4)
export const nextSku = (s: Pick<AppState, 'items'>) => nextCode(s.items.map((x) => x.sku), 'SKU-', 4)

export const creditLeft = (c: VendorCredit) => c.amount - c.applied.reduce((n, x) => n + x.amount, 0)

// ---------------------------------------------------------------- supplier performance

export const supplierPerformance = (s: Pick<AppState, 'purchaseOrders' | 'goodsReceipts'>, vendorId: string) => {
  const orders = s.purchaseOrders.filter((po) => po.vendorId === vendorId && po.status !== 'draft' && po.status !== 'cancelled')
  const receipts = s.goodsReceipts.filter((r) => orders.some((po) => po.id === r.poId))
  const onTime = receipts.filter((r) => r.receivedAt.slice(0, 10) <= orders.find((po) => po.id === r.poId)!.expectedDate.slice(0, 10)).length
  const accepted = receipts.flatMap((r) => r.lines).reduce((n, l) => n + l.accepted, 0)
  const rejected = receipts.flatMap((r) => r.lines).reduce((n, l) => n + l.rejected, 0)
  const leads = receipts.map((r) => (toMs(r.receivedAt) - toMs(orders.find((po) => po.id === r.poId)!.sentAt ?? r.receivedAt)) / DAY)
  return {
    orders: orders.length,
    spend: orders.reduce((n, po) => n + poTotals(po).total, 0),
    onTimeRate: receipts.length ? onTime / receipts.length : null,
    rejectRate: accepted + rejected ? rejected / (accepted + rejected) : null,
    avgLeadDays: leads.length ? Math.round((leads.reduce((n, x) => n + x, 0) / leads.length) * 10) / 10 : null,
  }
}

// ---------------------------------------------------------------- blockers

const outBlocker = (s: AppState, itemId: string, warehouseId: string, qty: number) => {
  if (!(qty > 0)) return 'Enter a quantity above zero.'
  const have = onHand(s, itemId, warehouseId)
  const w = s.warehouses.find((x) => x.id === warehouseId)
  return have < qty ? `Only ${fmtQty(s, itemId, have)} of ${itemName(s, itemId)} in ${w?.name ?? 'that warehouse'}.` : null
}

const prBlocker = (s: AppState, pr: PurchaseRequest) => {
  if (!s.employees.some((e) => e.id === pr.requesterId && e.status !== 'left')) return 'Pick who needs the goods.'
  if (!pr.lines.length) return 'Add at least one item.'
  if (pr.lines.some((l) => !s.items.some((i) => i.id === l.itemId && i.active))) return 'Pick an active item on every line.'
  if (pr.lines.some((l) => l.qty <= 0)) return 'Quantities must be above zero.'
  if (new Set(pr.lines.map((l) => l.itemId)).size !== pr.lines.length) return 'Each item can appear once. Raise the quantity instead.'
  return pr.reason.trim() ? null : 'Say what the goods are for.'
}

export const purchasingBlocker = (s: AppState, a: PurchasingAction): string | null => {
  switch (a.type) {
    case 'itemCategories/upsert':
      if (!a.category.name.trim()) return 'Name the category.'
      return s.glAccounts.some((g) => g.id === a.category.expenseAccountId && g.type === 'expense') ? null : 'Pick an expense account.'
    case 'uoms/upsert':
      if (!a.uom.code.trim() || !a.uom.name.trim()) return 'Enter a code and a name.'
      return s.uoms.some((u) => u.id !== a.uom.id && u.code.toLowerCase() === a.uom.code.toLowerCase()) ? 'Another unit uses this code.' : null
    case 'items/upsert': {
      const i = a.item
      if (!i.name.trim()) return 'Name the item.'
      if (s.items.some((x) => x.id !== i.id && x.sku === i.sku)) return `SKU ${i.sku} is already in use.`
      if (!s.itemCategories.some((c) => c.id === i.categoryId)) return 'Pick a category.'
      if (!s.uoms.some((u) => u.id === i.uomId)) return 'Pick a unit.'
      if (i.minStock < 0 || i.reorderQty < 0) return 'Minimum stock and reorder quantity cannot be negative.'
      return !i.active && onHand(s, i.id) > 0 ? 'The item still has stock. Issue or scrap it before deactivating.' : null
    }
    case 'warehouses/upsert':
      if (!a.warehouse.name.trim() || !a.warehouse.code.trim()) return 'Enter a code and a name.'
      return !a.warehouse.active && s.items.some((i) => onHand(s, i.id, a.warehouse.id) > 0) ? 'The warehouse still holds stock. Transfer it out first.' : null
    case 'vendorPrices/upsert': {
      const p = a.price
      if (p.price <= 0) return 'Enter a price above Rp 0.'
      if (p.minQty < 1) return 'The minimum quantity is at least 1.'
      if (p.validTo && p.validTo < p.validFrom) return 'The price must end after it starts.'
      return s.vendorPrices.some((x) => x.id !== p.id && x.vendorId === p.vendorId && x.itemId === p.itemId && x.minQty === p.minQty && (!x.validTo || x.validTo >= p.validFrom) && (!p.validTo || p.validTo >= x.validFrom))
        ? 'This vendor already has a price for the item at that quantity in those dates.'
        : null
    }
    case 'vendorPrices/remove':
      return null
    case 'suppliers/import': {
      if (!a.vendors.length) return 'The file has no supplier rows.'
      const bad = a.vendors.find((v) => !v.name.trim() || (v.taxId && !/^\d{15,16}$/.test(v.taxId.replace(/\D/g, ''))))
      return bad ? `Row "${bad.name || '(no name)'}": every supplier needs a name, and an NPWP has 15 or 16 digits.` : null
    }
    case 'stock/issue':
      if (!s.departments.some((d) => d.id === a.departmentId)) return 'Pick the department that takes the goods.'
      return outBlocker(s, a.itemId, a.warehouseId, a.qty)
    case 'stock/adjust':
      if (!a.qty) return 'Enter a quantity to add or remove.'
      if (!a.note.trim()) return 'Say why the stock changes.'
      return a.qty < 0 ? outBlocker(s, a.itemId, a.warehouseId, -a.qty) : null
    case 'stock/transfer':
      if (a.fromId === a.toId) return 'Pick two different warehouses.'
      return outBlocker(s, a.itemId, a.fromId, a.qty)
    case 'stock/scrap':
      if (!a.note.trim()) return 'Say why the goods are scrapped.'
      return outBlocker(s, a.itemId, a.warehouseId, a.qty)
    case 'counts/create':
      if (!a.count.lines.length) return 'The warehouse has no items to count.'
      return s.stockCounts.some((c) => c.warehouseId === a.count.warehouseId && c.status === 'draft') ? 'This warehouse already has a count in progress.' : null
    case 'counts/save':
      if (s.stockCounts.find((c) => c.id === a.id)?.status !== 'draft') return 'Only a count in progress can change.'
      return a.lines.some((l) => l.countedQty !== null && l.countedQty < 0) ? 'Counts cannot be negative.' : null
    case 'counts/post': {
      const c = s.stockCounts.find((x) => x.id === a.id)
      if (c?.status !== 'draft') return 'Only a count in progress can be posted.'
      const left = c.lines.filter((l) => l.countedQty === null).length
      return left ? `Count ${left} more ${left === 1 ? 'item' : 'items'} first.` : null
    }
    case 'prs/save': {
      const old = s.purchaseRequests.find((r) => r.id === a.pr.id)
      if (old && old.status !== 'draft') return 'Only a draft request can be edited.'
      return prBlocker(s, a.pr)
    }
    case 'prs/submit': {
      const pr = s.purchaseRequests.find((r) => r.id === a.id)
      if (pr?.status !== 'draft') return 'Only a draft can be submitted.'
      return prBlocker(s, pr)
    }
    case 'prs/decide': {
      const pr = s.purchaseRequests.find((r) => r.id === a.id)
      const step = pr && currentStep(pr)
      if (!pr || !step) return 'This request is not waiting for a decision.'
      if (s.employees.find((e) => e.id === pr.requesterId)?.userId === a.by) return 'You cannot approve your own request.'
      if (step.approverId && step.approverId !== a.by) return `Waiting for ${s.users.find((u) => u.id === step.approverId)?.name ?? 'the approver'} to decide.`
      return a.decision === 'rejected' && !a.note.trim() ? 'Say why the request is rejected.' : null
    }
    case 'prs/cancel': {
      const st = s.purchaseRequests.find((r) => r.id === a.id)?.status
      return st === 'draft' || st === 'pending' || st === 'approved' ? null : 'An ordered or closed request cannot be cancelled.'
    }
    case 'pos/save': {
      const po = a.po
      const old = s.purchaseOrders.find((x) => x.id === po.id)
      if (old && old.status !== 'draft') return 'Only a draft order can be edited.'
      if (!s.vendors.some((v) => v.id === po.vendorId && v.active)) return 'Pick an active vendor.'
      if (!s.warehouses.some((w) => w.id === po.warehouseId && w.active)) return 'Pick the warehouse that receives the goods.'
      if (!po.lines.length) return 'Add at least one item.'
      if (po.lines.some((l) => l.qty <= 0 || l.unitPrice <= 0)) return 'Quantity and price must be above zero on every line.'
      if (toMs(po.expectedDate) < toMs(po.orderDate)) return 'The expected date cannot come before the order date.'
      const bad = po.prIds.find((id) => {
        const pr = s.purchaseRequests.find((r) => r.id === id)
        return !pr || !(pr.status === 'approved' || (pr.status === 'ordered' && pr.poId === po.id))
      })
      return bad ? `${s.purchaseRequests.find((r) => r.id === bad)?.code ?? 'A request'} is not approved, or another order already covers it.` : null
    }
    case 'pos/send':
      return s.purchaseOrders.find((p) => p.id === a.id)?.status === 'draft' ? null : 'Only a draft order can be sent.'
    case 'pos/ship': {
      const po = s.purchaseOrders.find((p) => p.id === a.id)
      if (po?.status !== 'sent' && po?.status !== 'partial') return 'Only an order on its way can get shipping details.'
      return a.shipping.carrier.trim() ? null : 'Name the carrier.'
    }
    case 'pos/cancel': {
      const po = s.purchaseOrders.find((p) => p.id === a.id)
      if (po?.status !== 'draft' && po?.status !== 'sent') return 'Only a draft or sent order can be cancelled.'
      return po.lines.some((l) => l.receivedQty || l.rejectedQty) ? 'Goods have arrived on this order. Close it instead.' : null
    }
    case 'pos/close': {
      const po = s.purchaseOrders.find((p) => p.id === a.id)
      return po?.status === 'partial' || po?.status === 'received' ? null : 'Only an order with goods received can be closed.'
    }
    case 'pos/bill': {
      const po = s.purchaseOrders.find((p) => p.id === a.id)
      if (!po || po.status === 'draft' || po.status === 'cancelled') return 'Send the order and receive goods first.'
      if (!po.lines.some((l) => billable(l) > 0)) return 'Every received unit is already billed.'
      if (!a.vendorRef.trim()) return "Enter the vendor's invoice number."
      if (s.bills.some((b) => b.vendorId === po.vendorId && b.vendorRef === a.vendorRef.trim() && b.status !== 'void')) return `This vendor's invoice ${a.vendorRef} is already entered.`
      return dateBlocker(s, a.date)
    }
    case 'receipts/create': {
      const r = a.receipt
      const po = s.purchaseOrders.find((p) => p.id === r.poId)
      if (po?.status !== 'sent' && po?.status !== 'partial') return 'Only a sent order can receive goods.'
      if (!r.deliveryNote.trim()) return "Enter the vendor's delivery order number."
      if (!r.lines.some((l) => l.accepted + l.rejected > 0)) return 'Enter what arrived on at least one line.'
      for (const l of r.lines) {
        const line = po.lines.find((x) => x.id === l.poLineId)
        if (!line || l.accepted < 0 || l.rejected < 0) return 'Quantities cannot be negative.'
        if (l.accepted > outstanding(line)) return `${itemName(s, line.itemId)}: only ${fmtQty(s, line.itemId, outstanding(line))} still to come.`
        if (l.rejected && !l.qcNote.trim()) return `Say why ${itemName(s, line.itemId)} failed the check.`
      }
      return null
    }
    case 'returns/create': {
      const r = a.ret
      const po = s.purchaseOrders.find((p) => p.id === r.poId)
      if (!po) return 'Order not found.'
      if (!r.reason.trim()) return 'Say why the goods go back.'
      if (!r.lines.some((l) => l.qty > 0)) return 'Return at least one unit.'
      for (const l of r.lines) {
        const line = po.lines.find((x) => x.id === l.poLineId)
        if (!line || l.qty < 0) return 'Quantities cannot be negative.'
        if (l.qty > returnable(line)) return `${itemName(s, line.itemId)}: only ${fmtQty(s, line.itemId, returnable(line))} was received.`
        const short = outBlocker(s, line.itemId, po.warehouseId, l.qty)
        if (l.qty && short) return short
      }
      return null
    }
    case 'credits/apply': {
      const c = s.vendorCredits.find((x) => x.id === a.id)
      const b = s.bills.find((x) => x.id === a.billId)
      if (!c || !b) return 'Pick a credit and a bill.'
      if (b.status !== 'posted' || b.vendorId !== c.vendorId) return "Apply the credit to a posted bill from the same vendor."
      if (a.amount <= 0) return 'Enter an amount above Rp 0.'
      if (a.amount > creditLeft(c)) return `Only ${fmtIdr(creditLeft(c))} of the credit is left.`
      const balance = b.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0) * (1 + b.taxPct / 100) - b.payments.reduce((n, p) => n + p.amount, 0)
      return a.amount > Math.round(balance) ? `The bill has ${fmtIdr(balance)} open.` : null
    }
    case 'purchasingSettings/update': {
      const p = { ...s.purchasingSettings, ...a.patch }
      if (p.financeApprovalAbove < 0 || p.directorApprovalAbove < 0) return 'Thresholds cannot be negative.'
      return p.directorApprovalAbove < p.financeApprovalAbove ? 'The Director threshold must be at or above the Finance one.' : null
    }
  }
}

// ---------------------------------------------------------------- reducer

const dr = (accountId: string, amount: number, memo = ''): JournalLine => ({ accountId, debit: amount, credit: 0, memo })
const cr = (accountId: string, amount: number, memo = ''): JournalLine => ({ accountId, debit: 0, credit: amount, memo })

/** Appends stock moves and, when lines carry value, the journal that values them. */
const book = (s: AppState, moves: Omit<StockMove, 'id' | 'journalId' | 'at' | 'by'>[], journal: { memo: string; lines: JournalLine[]; ref: StockMove['ref'] } | null, at: string, by: string): AppState => {
  const j = journal && journal.lines.some((l) => l.debit || l.credit) ? buildJournal(s, { date: at, memo: journal.memo, source: 'inventory', ref: journal.ref, lines: journal.lines }, at, by) : null
  const rows: StockMove[] = moves.map((m) => ({ ...m, id: newId('mv'), journalId: j?.id ?? null, at, by }))
  return { ...s, stockMoves: [...rows, ...s.stockMoves], journals: j ? [j, ...s.journals] : s.journals }
}

const expenseOf = (s: AppState, itemId: string) => s.itemCategories.find((c) => c.id === s.items.find((i) => i.id === itemId)?.categoryId)?.expenseAccountId ?? ''

/** One stock move leaving a warehouse at moving average cost, charged to the item's expense account. */
const takeOut = (s: AppState, kind: StockMoveKind, itemId: string, warehouseId: string, qty: number, note: string, departmentId: string | null, at: string, by: string) => {
  const cost = averageCost(s, itemId)
  const p = s.purchasingSettings
  const memo = `${kind === 'issue' ? 'Issued' : kind === 'scrap' ? 'Scrapped' : 'Adjusted'} ${fmtQty(s, itemId, qty)} ${itemName(s, itemId)}`
  return book(
    s,
    [{ itemId, warehouseId, qty: -qty, unitCost: cost, kind, ref: null, departmentId, note }],
    { memo, lines: [dr(expenseOf(s, itemId), qty * cost), cr(p.inventoryAccountId, qty * cost)], ref: { kind: 'item', id: itemId, label: itemName(s, itemId) } },
    at,
    by,
  )
}

const closePrs = (s: AppState, po: PurchaseOrder): AppState => ({ ...s, purchaseRequests: s.purchaseRequests.map((r) => (po.prIds.includes(r.id) ? { ...r, status: 'ordered', poId: po.id } : r)) })

export const purchasingApply = (s: AppState, a: PurchasingAction, at: string, by: string): AppState => {
  const p = s.purchasingSettings
  switch (a.type) {
    case 'itemCategories/upsert':
      return { ...s, itemCategories: upsert(s.itemCategories, a.category) }
    case 'uoms/upsert':
      return { ...s, uoms: upsert(s.uoms, a.uom) }
    case 'items/upsert':
      return { ...s, items: upsert(s.items, a.item) }
    case 'warehouses/upsert':
      return { ...s, warehouses: upsert(s.warehouses, a.warehouse) }
    case 'vendorPrices/upsert':
      return { ...s, vendorPrices: upsert(s.vendorPrices, a.price) }
    case 'vendorPrices/remove':
      return { ...s, vendorPrices: s.vendorPrices.filter((x) => x.id !== a.id) }
    case 'suppliers/import':
      return {
        ...s,
        vendors: a.vendors.reduce((rows, v) => {
          const old = rows.find((x) => x.name.trim().toLowerCase() === v.name.trim().toLowerCase())
          return old ? patchById(rows, old.id, (x) => ({ ...x, taxId: v.taxId || x.taxId, phone: v.phone || x.phone, email: v.email || x.email, bankAccount: v.bankAccount || x.bankAccount, termsDays: v.termsDays })) : [...rows, v]
        }, s.vendors),
      }
    case 'stock/issue':
      return takeOut(s, 'issue', a.itemId, a.warehouseId, a.qty, a.note, a.departmentId, at, by)
    case 'stock/scrap':
      return takeOut(s, 'scrap', a.itemId, a.warehouseId, a.qty, a.note, null, at, by)
    case 'stock/adjust': {
      if (a.qty < 0) return takeOut(s, 'adjustment', a.itemId, a.warehouseId, -a.qty, a.note, null, at, by)
      const cost = averageCost(s, a.itemId)
      return book(
        s,
        [{ itemId: a.itemId, warehouseId: a.warehouseId, qty: a.qty, unitCost: cost, kind: 'adjustment', ref: null, departmentId: null, note: a.note }],
        { memo: `Found ${fmtQty(s, a.itemId, a.qty)} ${itemName(s, a.itemId)}`, lines: [dr(p.inventoryAccountId, a.qty * cost), cr(expenseOf(s, a.itemId), a.qty * cost)], ref: { kind: 'item', id: a.itemId, label: itemName(s, a.itemId) } },
        at,
        by,
      )
    }
    case 'stock/transfer': {
      const cost = averageCost(s, a.itemId)
      const ref = { kind: 'transfer', id: newId('trf'), label: `${s.warehouses.find((w) => w.id === a.fromId)?.code} to ${s.warehouses.find((w) => w.id === a.toId)?.code}` }
      return book(
        s,
        [
          { itemId: a.itemId, warehouseId: a.fromId, qty: -a.qty, unitCost: cost, kind: 'transfer_out', ref, departmentId: null, note: a.note },
          { itemId: a.itemId, warehouseId: a.toId, qty: a.qty, unitCost: cost, kind: 'transfer_in', ref, departmentId: null, note: a.note },
        ],
        null,
        at,
        by,
      )
    }
    case 'counts/create':
      return { ...s, stockCounts: [{ ...a.count, status: 'draft', postedAt: null, createdAt: at, by }, ...s.stockCounts] }
    case 'counts/save':
      return { ...s, stockCounts: patchById(s.stockCounts, a.id, (c) => ({ ...c, lines: a.lines })) }
    case 'counts/post': {
      const c = s.stockCounts.find((x) => x.id === a.id)!
      const ref = { kind: 'count', id: c.id, label: c.code }
      // Differences are taken against stock now, so moves since the count started are not double counted.
      const diffs = c.lines.map((l) => ({ l, diff: (l.countedQty ?? 0) - l.systemQty, cost: averageCost(s, l.itemId) })).filter((x) => x.diff)
      const lines = diffs.flatMap(({ l, diff, cost }) =>
        diff > 0 ? [dr(p.inventoryAccountId, diff * cost), cr(expenseOf(s, l.itemId), diff * cost, itemName(s, l.itemId))] : [dr(expenseOf(s, l.itemId), -diff * cost, itemName(s, l.itemId)), cr(p.inventoryAccountId, -diff * cost)],
      )
      const next = book(
        s,
        diffs.map(({ l, diff, cost }) => ({ itemId: l.itemId, warehouseId: c.warehouseId, qty: diff, unitCost: cost, kind: 'count' as const, ref, departmentId: null, note: c.note })),
        { memo: `Stock count ${c.code}`, lines, ref },
        at,
        by,
      )
      return { ...next, stockCounts: patchById(next.stockCounts, c.id, (x) => ({ ...x, status: 'posted', postedAt: at })) }
    }
    case 'prs/save':
      return { ...s, purchaseRequests: upsert(s.purchaseRequests, { ...a.pr, status: 'draft' }, true) }
    case 'prs/submit':
      return { ...s, purchaseRequests: patchById(s.purchaseRequests, a.id, (r) => ({ ...r, status: 'pending', steps: prSteps(s, r.requesterId, prTotal(r)) })) }
    case 'prs/decide':
      return {
        ...s,
        purchaseRequests: patchById(s.purchaseRequests, a.id, (r) => {
          const i = r.steps.findIndex((st) => st.decision === 'pending')
          const steps = r.steps.map((st, j) => (j === i ? { ...st, decision: a.decision, by: a.by, at, note: a.note } : st))
          return { ...r, steps, status: a.decision === 'rejected' ? 'rejected' : steps.every((st) => st.decision === 'approved') ? 'approved' : 'pending' }
        }),
      }
    case 'prs/cancel':
      return { ...s, purchaseRequests: patchById(s.purchaseRequests, a.id, (r) => ({ ...r, status: 'cancelled' })) }
    case 'pos/save': {
      // Requests dropped from a draft order go back to approved.
      const old = s.purchaseOrders.find((x) => x.id === a.po.id)
      const freed = (old?.prIds ?? []).filter((id) => !a.po.prIds.includes(id))
      const next = { ...s, purchaseOrders: upsert(s.purchaseOrders, { ...a.po, status: 'draft' as const }, true), purchaseRequests: s.purchaseRequests.map((r) => (freed.includes(r.id) ? { ...r, status: 'approved' as const, poId: null } : r)) }
      return closePrs(next, a.po)
    }
    case 'pos/send':
      return { ...s, purchaseOrders: patchById(s.purchaseOrders, a.id, (po) => ({ ...po, status: 'sent', sentAt: at })) }
    case 'pos/ship':
      return { ...s, purchaseOrders: patchById(s.purchaseOrders, a.id, (po) => ({ ...po, shipping: a.shipping })) }
    case 'pos/cancel': {
      const po = s.purchaseOrders.find((x) => x.id === a.id)!
      return {
        ...s,
        purchaseOrders: patchById(s.purchaseOrders, a.id, (x) => ({ ...x, status: 'cancelled' })),
        purchaseRequests: s.purchaseRequests.map((r) => (po.prIds.includes(r.id) ? { ...r, status: 'approved', poId: null } : r)),
      }
    }
    case 'pos/close':
      return { ...s, purchaseOrders: patchById(s.purchaseOrders, a.id, (po) => ({ ...po, status: 'closed' })) }
    case 'pos/bill': {
      const po = s.purchaseOrders.find((x) => x.id === a.id)!
      const vendor = s.vendors.find((v) => v.id === po.vendorId)
      const bill: Bill = {
        id: a.billId,
        code: nextBillCode(s),
        vendorId: po.vendorId,
        vendorRef: a.vendorRef.trim(),
        date: a.date,
        dueDate: new Date(toMs(a.date) + (vendor?.termsDays ?? 30) * DAY).toISOString(),
        lines: po.lines.filter((l) => billable(l) > 0).map((l) => ({ id: newId('ln'), description: `${itemName(s, l.itemId)}, ${po.code}`, accountId: p.grniAccountId, qty: billable(l), unitPrice: l.unitPrice })),
        taxPct: po.taxPct,
        memo: `Billed from ${po.code}`,
        status: 'draft',
        journalId: null,
        payments: [],
        createdBy: by,
        createdAt: at,
      }
      let next = financeApply(s, { type: 'bills/save', bill }, at, by)
      next = financeApply(next, { type: 'bills/post', id: bill.id }, at, by)
      return { ...next, purchaseOrders: patchById(next.purchaseOrders, po.id, (x) => ({ ...x, billIds: [...x.billIds, bill.id], lines: x.lines.map((l) => ({ ...l, billedQty: l.billedQty + billable(l) })) })) }
    }
    case 'receipts/create': {
      const r = a.receipt
      const po = s.purchaseOrders.find((x) => x.id === r.poId)!
      const lineOf = (id: string) => po.lines.find((l) => l.id === id)!
      const ref = { kind: 'receipt', id: r.id, label: r.code }
      const accepted = r.lines.filter((l) => l.accepted > 0)
      const value = accepted.reduce((n, l) => n + l.accepted * lineOf(l.poLineId).unitPrice, 0)
      const next = book(
        s,
        accepted.map((l) => ({ itemId: lineOf(l.poLineId).itemId, warehouseId: po.warehouseId, qty: l.accepted, unitCost: lineOf(l.poLineId).unitPrice, kind: 'receipt' as const, ref, departmentId: null, note: `${po.code} · ${r.deliveryNote}` })),
        { memo: `Goods receipt ${r.code} for ${po.code}`, lines: [dr(p.inventoryAccountId, value), cr(p.grniAccountId, value)], ref },
        at,
        by,
      )
      const lines = po.lines.map((l) => {
        const got = r.lines.find((x) => x.poLineId === l.id)
        return got ? { ...l, receivedQty: l.receivedQty + got.accepted, rejectedQty: l.rejectedQty + got.rejected } : l
      })
      const status = lines.every((l) => l.receivedQty >= l.qty) ? 'received' : 'partial'
      const journalId = value > 0 ? next.journals[0].id : null
      return {
        ...next,
        goodsReceipts: [{ ...r, journalId, receivedAt: r.receivedAt || at, by }, ...next.goodsReceipts],
        purchaseOrders: patchById(next.purchaseOrders, po.id, (x) => ({ ...x, lines, status })),
      }
    }
    case 'returns/create': {
      const r = a.ret
      const po = s.purchaseOrders.find((x) => x.id === r.poId)!
      const lineOf = (id: string) => po.lines.find((l) => l.id === id)!
      const ref = { kind: 'return', id: r.id, label: r.code }
      const back = r.lines.filter((l) => l.qty > 0)
      const value = back.reduce((n, l) => n + l.qty * lineOf(l.poLineId).unitPrice, 0)
      let next = book(
        s,
        back.map((l) => ({ itemId: lineOf(l.poLineId).itemId, warehouseId: po.warehouseId, qty: -l.qty, unitCost: lineOf(l.poLineId).unitPrice, kind: 'return' as const, ref, departmentId: null, note: r.reason })),
        { memo: `Return ${r.code} to the vendor`, lines: [dr(p.grniAccountId, value), cr(p.inventoryAccountId, value)], ref },
        at,
        by,
      )
      const journalId = value > 0 ? next.journals[0].id : null
      // Units already billed and now sent back become a vendor credit, VAT included.
      let creditValue = 0
      const lines = po.lines.map((l) => {
        const qty = back.find((x) => x.poLineId === l.id)?.qty ?? 0
        if (!qty) return l
        const returnedQty = l.returnedQty + qty
        const credit = Math.max(l.billedQty - (l.receivedQty - returnedQty) - l.creditedQty, 0)
        creditValue += credit * l.unitPrice
        return { ...l, returnedQty, creditedQty: l.creditedQty + credit }
      })
      let creditId: string | null = null
      if (creditValue > 0) {
        const credit: VendorCredit = {
          id: newId('vc'),
          code: nextCode(s.vendorCredits.map((c) => c.code), 'CN-26-', 4),
          vendorId: po.vendorId,
          returnId: r.id,
          amount: Math.round(creditValue * (1 + po.taxPct / 100)),
          date: at,
          applied: [],
        }
        creditId = credit.id
        next = { ...next, vendorCredits: [credit, ...next.vendorCredits] }
      }
      return {
        ...next,
        purchaseReturns: [{ ...r, creditId, journalId, at, by }, ...next.purchaseReturns],
        purchaseOrders: patchById(next.purchaseOrders, po.id, (x) => ({ ...x, lines })),
      }
    }
    case 'credits/apply': {
      const c = s.vendorCredits.find((x) => x.id === a.id)!
      const taxPct = s.purchaseOrders.find((po) => po.id === s.purchaseReturns.find((r) => r.id === c.returnId)?.poId)?.taxPct ?? 0
      const net = Math.round(a.amount / (1 + taxPct / 100))
      const j = buildJournal(
        s,
        { date: at, memo: `Vendor credit ${c.code} applied`, source: 'payable', ref: { kind: 'bill', id: a.billId, label: c.code }, lines: [dr(s.financeSettings.payableAccountId, a.amount), cr(p.grniAccountId, net), cr(s.financeSettings.vatInAccountId, a.amount - net, 'Input VAT')] },
        at,
        by,
      )
      return {
        ...s,
        journals: [j, ...s.journals],
        vendorCredits: patchById(s.vendorCredits, c.id, (x) => ({ ...x, applied: [...x.applied, { billId: a.billId, amount: a.amount, at, journalId: j.id }] })),
        bills: patchById(s.bills, a.billId, (b) => ({ ...b, payments: [...b.payments, { id: newId('bp'), date: at, amount: a.amount, cashAccountId: p.grniAccountId, reference: c.code, journalId: j.id }] })),
      }
    }
    case 'purchasingSettings/update':
      return { ...s, purchasingSettings: { ...p, ...a.patch } }
  }
}
