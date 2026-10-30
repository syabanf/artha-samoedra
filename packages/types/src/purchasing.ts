/** Purchasing and inventory for office, marketing and open house supplies. Amounts are rupiah. */
import type { ApprovalStep } from './hr'

export interface ItemCategory {
  id: string
  name: string
  /** Ledger account an issue, scrap or count loss of these items is charged to. */
  expenseAccountId: string
}

/** Unit of measure, such as pcs, ream or box. */
export interface Uom {
  id: string
  code: string
  name: string
}

export interface Item {
  id: string
  /** SKU-0001 */
  sku: string
  name: string
  categoryId: string
  uomId: string
  /** Total on hand across warehouses below this is low stock. */
  minStock: number
  reorderQty: number
  description: string
  active: boolean
}

export interface Warehouse {
  id: string
  code: string
  name: string
  branchId: string
  active: boolean
}

export type StockMoveKind = 'opening' | 'receipt' | 'issue' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'count' | 'scrap' | 'return'
export const STOCK_MOVE_KIND_LABEL: Record<StockMoveKind, string> = {
  opening: 'Opening stock',
  receipt: 'Goods receipt',
  issue: 'Issued',
  adjustment: 'Adjustment',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  count: 'Stock count',
  scrap: 'Scrapped',
  return: 'Returned to vendor',
}

export interface StockMove {
  id: string
  itemId: string
  warehouseId: string
  /** Positive in, negative out. */
  qty: number
  /** Cost per unit the move is valued at: purchase price on receipt, moving average on the way out. */
  unitCost: number
  kind: StockMoveKind
  /** The receipt, return, count, transfer or department issue it belongs to. */
  ref: { kind: string; id: string; label: string } | null
  /** Department a stock issue goes to. */
  departmentId: string | null
  note: string
  journalId: string | null
  at: string
  by: string
}

export type StockCountStatus = 'draft' | 'posted'

/** Stock opname: a counted warehouse whose differences post as count moves. */
export interface StockCount {
  id: string
  /** OPN-26-0001 */
  code: string
  warehouseId: string
  status: StockCountStatus
  lines: { itemId: string; systemQty: number; countedQty: number | null }[]
  note: string
  createdAt: string
  postedAt: string | null
  by: string
}

export type PrStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'ordered' | 'cancelled'
export const PR_STATUS_LABEL: Record<PrStatus, string> = {
  draft: 'Draft',
  pending: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  ordered: 'Ordered',
  cancelled: 'Cancelled',
}

export interface PurchaseRequest {
  id: string
  /** PR-26-0001 */
  code: string
  requesterId: string
  departmentId: string
  neededBy: string
  reason: string
  lines: { id: string; itemId: string; qty: number; estPrice: number; note: string }[]
  status: PrStatus
  steps: ApprovalStep[]
  poId: string | null
  createdBy: string
  createdAt: string
}

export type PoStatus = 'draft' | 'sent' | 'partial' | 'received' | 'closed' | 'cancelled'
export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Draft',
  sent: 'Sent to vendor',
  partial: 'Part received',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export interface PoLine {
  id: string
  itemId: string
  qty: number
  unitPrice: number
  /** Accepted into stock across receipts. */
  receivedQty: number
  rejectedQty: number
  returnedQty: number
  billedQty: number
  /** Billed units later returned and covered by a vendor credit. */
  creditedQty: number
}

export interface PurchaseOrder {
  id: string
  /** PO-26-0001 */
  code: string
  vendorId: string
  warehouseId: string
  prIds: string[]
  orderDate: string
  expectedDate: string
  lines: PoLine[]
  taxPct: number
  terms: string
  note: string
  status: PoStatus
  /** Delivery tracking the vendor shares once the order ships. */
  shipping: { carrier: string; tracking: string; shippedAt: string | null } | null
  sentAt: string | null
  billIds: string[]
  createdBy: string
  createdAt: string
}

export type QcResult = 'passed' | 'partial' | 'failed'
export const QC_RESULT_LABEL: Record<QcResult, string> = { passed: 'Passed', partial: 'Part rejected', failed: 'Rejected' }

export interface GoodsReceipt {
  id: string
  /** GR-26-0001 */
  code: string
  poId: string
  /** The vendor's delivery order number. */
  deliveryNote: string
  receivedAt: string
  lines: { poLineId: string; accepted: number; rejected: number; qcNote: string }[]
  journalId: string | null
  by: string
}

export interface PurchaseReturn {
  id: string
  /** RET-26-0001 */
  code: string
  poId: string
  reason: string
  lines: { poLineId: string; qty: number }[]
  creditId: string | null
  journalId: string | null
  at: string
  by: string
}

export interface VendorCredit {
  id: string
  /** CN-26-0001 */
  code: string
  vendorId: string
  returnId: string | null
  amount: number
  date: string
  applied: { billId: string; amount: number; at: string; journalId: string }[]
}

export interface VendorPrice {
  id: string
  vendorId: string
  itemId: string
  price: number
  minQty: number
  leadDays: number
  validFrom: string
  validTo: string | null
}

export interface PurchasingSettings {
  /** Requests at or above this total also need the Finance level. */
  financeApprovalAbove: number
  /** Requests at or above this total also need the Director. */
  directorApprovalAbove: number
  directorUserId: string
  inventoryAccountId: string
  /** Goods received not invoiced: receipts credit it, vendor bills clear it. */
  grniAccountId: string
  defaultWarehouseId: string
}
