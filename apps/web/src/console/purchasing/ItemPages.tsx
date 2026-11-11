import {
  accountLabel,
  averageCost,
  blockerFor,
  bestPrice,
  countBy,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  lowStock,
  newId,
  nextSku,
  nowIso,
  onHand,
  outstanding,
  priceHistory,
  stockByWarehouse,
  stockCard,
  uomOf,
  type AppState,
} from '@artha/fixtures'
import { STOCK_MOVE_KIND_LABEL, type Item, type ItemCategory, type PurchasingSettings, type Uom, type Warehouse } from '@artha/types'
import {
  Badge,
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
  Switch,
  Textarea,
  type Column,
} from '@artha/ui'
import { ArrowLeftRight, Download, Pencil, Plus, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { SubTabs } from '../../components/SubTabs'
import { downloadCsv } from '../../lib/csv'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'
import { AccountSelect, Money } from '../finance/parts'
import { PoStatusBadge, Qty, WarehouseSelect } from './parts'
import { INVENTORY_TABS, MoveForm, MoveRef, MOVE_VARIANT, rangeIso } from './StockPages'
import { SearchBox } from '../../components/SearchBox'
import { FilterCaption, filteredEmpty } from '../../components/FilterCaption'

const categoryName = (s: AppState, id: string) => s.itemCategories.find((c) => c.id === id)?.name ?? '–'
const vendorName = (s: AppState, id: string) => s.vendors.find((v) => v.id === id)?.name ?? 'Unknown supplier'
const digits = (v: string) => v.replace(/\D/g, '')

// ---------------------------------------------------------------- items

type ItemShow = 'active' | 'inactive' | 'low'

export function ItemsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const show = (params.get('show') as ItemShow | null) || null
  const manage = can('inventory.manage')

  const low = new Set(lowStock(state).map((l) => l.item.id))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.items.filter((i) => terms.every((w) => `${i.sku} ${i.name} ${i.description}`.toLowerCase().includes(w)))
  const matches = (i: Item, s: ItemShow) => (s === 'active' ? i.active : s === 'inactive' ? !i.active : low.has(i.id))
  const inCategory = searched.filter((i) => !category || i.categoryId === category)
  const showCounts = { active: inCategory.filter((i) => matches(i, 'active')).length, inactive: inCategory.filter((i) => matches(i, 'inactive')).length, low: inCategory.filter((i) => matches(i, 'low')).length }
  const inShow = searched.filter((i) => !show || matches(i, show))
  const catCounts = countBy(inShow, (i) => i.categoryId)
  const rows = inShow.filter((i) => !category || i.categoryId === category)
  const filters = [q, category, show].filter(Boolean).length
  const value = (i: Item) => onHand(state, i.id) * averageCost(state, i.id)

  const columns: Column<Item>[] = [
    {
      id: 'name',
      header: 'Item',
      sortValue: (i) => i.name,
      cell: (i) => (
        <div className="min-w-0 max-w-64">
          <div className="font-mono text-xs text-muted">{i.sku}</div>
          <div className="truncate font-semibold">{i.name}</div>
          {!i.active && <Badge variant="muted" className="mt-1">Inactive</Badge>}
        </div>
      ),
    },
    { id: 'category', header: 'Category', hideBelow: 'md', sortValue: (i) => categoryName(state, i.categoryId), cell: (i) => <span className="text-sm">{categoryName(state, i.categoryId)}</span> },
    { id: 'uom', header: 'Unit', hideBelow: 'lg', cell: (i) => <span className="text-sm">{uomOf(state, i.id)}</span> },
    {
      id: 'onHand',
      header: 'On hand',
      align: 'right',
      sortValue: (i) => onHand(state, i.id),
      cell: (i) => <Qty itemId={i.id} qty={onHand(state, i.id)} className={low.has(i.id) ? 'font-semibold text-danger' : 'font-semibold'} />,
    },
    { id: 'min', header: 'Minimum', align: 'right', hideBelow: 'sm', sortValue: (i) => i.minStock, cell: (i) => <span className="tabular-nums">{i.minStock}</span> },
    { id: 'cost', header: 'Avg cost', align: 'right', hideBelow: 'lg', sortValue: (i) => averageCost(state, i.id), cell: (i) => <Money value={averageCost(state, i.id)} dash /> },
    { id: 'value', header: 'Value', align: 'right', hideBelow: 'md', sortValue: value, cell: (i) => <Money value={value(i)} dash /> },
    ...(manage
      ? [
          {
            id: 'edit',
            header: <span className="sr-only">Edit</span>,
            cell: (i: Item) => (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${i.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(i)
                }}
              >
                <Pencil />
              </Button>
            ),
          },
        ]
      : []),
  ]

  const exportCsv = () =>
    downloadCsv('items', [
      ['SKU', 'Name', 'Category', 'Unit', 'On hand', 'Minimum', 'Reorder qty', 'Average cost', 'Value', 'Active'],
      ...rows.map((i) => [i.sku, i.name, categoryName(state, i.categoryId), uomOf(state, i.id), onHand(state, i.id), i.minStock, i.reorderQty, averageCost(state, i.id), Math.round(value(i)), i.active ? 'Yes' : 'No']),
    ])

  return (
    <div>
      <PageHeader
        title="Items"
        description="Supplies the company buys and keeps in its store rooms. Open an item for its stock card and prices."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search items" placeholder="Name, SKU or description" />
            <Button variant="outline" disabled={!rows.length} title={rows.length ? undefined : 'Nothing to export.'} onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus />
                New item
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={INVENTORY_TABS} />
      <ChipRow>
        <Chip active={!category} count={inShow.length} onClick={() => set('category', null)}>
          All
        </Chip>
        {state.itemCategories.map((c) => (
          <Chip key={c.id} active={category === c.id} count={catCounts[c.id] ?? 0} onClick={() => set('category', category === c.id ? null : c.id)}>
            {c.name}
          </Chip>
        ))}
      </ChipRow>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={show === 'active'} count={showCounts.active} onClick={() => set('show', show === 'active' ? null : 'active')}>
            Active
          </Chip>
          <Chip active={show === 'low'} count={showCounts.low} onClick={() => set('show', show === 'low' ? null : 'low')}>
            Below minimum
          </Chip>
          <Chip active={show === 'inactive'} count={showCounts.inactive} onClick={() => set('show', show === 'inactive' ? null : 'inactive')}>
            Inactive
          </Chip>
        </ChipRow>
        <FilterCaption shown={rows.length} total={state.items.length} filters={filters} onClear={() => clear()} />
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(i) => i.id}
          rowLabel={(i) => i.name}
          onRowClick={(i) => navigate(paths.item(i.id))}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={`${q}|${category}|${show}`}
          pageSize={20}
          empty={filteredEmpty(filters, () => clear(), 'items', <EmptyState compact title="No items yet" description="Add the supplies you keep in stock." />)}
        />
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New item'} description="Below the minimum, the item shows as low stock with a reorder suggestion.">
        {editing && <ItemForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function ItemForm({ editing, onDone }: { editing: Item | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: editing?.name ?? '',
    categoryId: editing?.categoryId ?? '',
    uomId: editing?.uomId ?? '',
    minStock: String(editing?.minStock ?? 0),
    reorderQty: String(editing?.reorderQty ?? 0),
    description: editing?.description ?? '',
    active: editing?.active ?? true,
  })
  const item: Item = {
    id: editing?.id ?? newId('itm'),
    sku: editing?.sku ?? nextSku(state),
    name: f.name.trim(),
    categoryId: f.categoryId,
    uomId: f.uomId,
    minStock: Number(f.minStock) || 0,
    reorderQty: Number(f.reorderQty) || 0,
    description: f.description.trim(),
    active: f.active,
  }
  const blocker = blockerFor(state, { type: 'items/upsert', item })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'items/upsert', item }, editing ? 'Item saved' : 'Item added', `${item.sku} · ${item.name}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="A4 copy paper 80 gsm" />
        </FormField>
        <FormField label="SKU" hint={editing ? undefined : 'Given automatically'}>
          <Input value={item.sku} readOnly inputClassName="font-mono" />
        </FormField>
        <FormField label="Category" required>
          <NativeSelect value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">Pick a category</option>
            {state.itemCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Unit" required>
          <NativeSelect value={f.uomId} onChange={(e) => setF({ ...f, uomId: e.target.value })}>
            <option value="">Pick a unit</option>
            {state.uoms.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.code})
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Minimum stock" hint="Across every warehouse">
          <Input inputMode="numeric" value={f.minStock} onChange={(e) => setF({ ...f, minStock: digits(e.target.value) })} />
        </FormField>
        <FormField label="Reorder quantity" hint="Suggested on a new request">
          <Input inputMode="numeric" value={f.reorderQty} onChange={(e) => setF({ ...f, reorderQty: digits(e.target.value) })} />
        </FormField>
        <FormField label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </FormField>
      </div>
      {editing && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <span>
            <span className="block font-semibold">Active</span>
            <span className="text-xs text-muted">Inactive items drop out of new requests and orders.</span>
          </span>
          <Switch label="Active" checked={f.active} onCheckedChange={(active) => setF({ ...f, active })} />
        </label>
      )}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save item' : 'Add item'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- item detail

export function ItemDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const { params, set } = useSetParam()
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const item = state.items.find((i) => i.id === id)
  if (!item) {
    return (
      <Card>
        <EmptyState pageTitle title="Item not found" description="This item may have been removed." action={<BackButton fallback={paths.items} />} />
      </Card>
    )
  }
  const manage = can('inventory.manage')
  const total = onHand(state, item.id)
  const cost = averageCost(state, item.id)
  const isLow = item.active && total < item.minStock
  const warehouse = params.get('warehouse') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const range = rangeIso(from, to)
  const card = stockCard(state, item.id, warehouse || undefined, range.from, range.to)
  const history = priceHistory(state, item.id)
  const at = nowIso()
  const prices = state.vendorPrices.filter((p) => p.itemId === item.id).sort((a, b) => a.price - b.price)
  const best = bestPrice(state, item.id, Math.max(item.reorderQty, 1), at)
  const openOrders = state.purchaseOrders.flatMap((po) =>
    po.status === 'sent' || po.status === 'partial' ? po.lines.filter((l) => l.itemId === item.id && outstanding(l) > 0).map((line) => ({ po, line })) : [],
  )

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.items} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{item.sku}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">{item.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{categoryName(state, item.categoryId)}</Badge>
            {!item.active && <Badge variant="muted">Inactive</Badge>}
            {isLow && (
              <Badge variant="danger" dot>
                Below minimum
              </Badge>
            )}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {manage && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
          )}
          {manage && total > 0 && (
            <Button variant="outline" onClick={() => setMoving(true)}>
              <ArrowLeftRight />
              Move stock
            </Button>
          )}
          {can('purchase.request') && item.active && (
            <Button asChild>
              <Link to={`${paths.prNew}?item=${item.id}&qty=${item.reorderQty || 1}`}>
                <ShoppingCart />
                Raise request
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="text-xs text-on-ink-muted">On hand</div>
          <div className="mt-1 text-3xl font-bold tracking-tight">
            <Qty itemId={item.id} qty={total} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Value</div>
              <div className="font-semibold">{fmtIdrShort(total * cost)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Average cost</div>
              <Money value={cost} className="font-semibold" />
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Minimum</div>
              <div className={`font-semibold tabular-nums ${isLow ? 'text-accent' : ''}`}>{item.minStock}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Reorder</div>
              <div className="font-semibold tabular-nums">{item.reorderQty}</div>
            </div>
          </div>
          {item.description && <p className="mt-4 text-sm text-on-ink-muted">{item.description}</p>}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By warehouse</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {stockByWarehouse(state, item.id)
                .filter((r) => r.warehouse.active || r.qty)
                .map(({ warehouse: w, qty }) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <button type="button" className="min-w-0 truncate text-left font-semibold hover:text-accent" onClick={() => set('warehouse', w.id)}>
                      {w.name}
                    </button>
                    <Qty itemId={item.id} qty={qty} className={qty ? '' : 'text-muted'} />
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          action={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <WarehouseSelect value={warehouse} onChange={(v) => set('warehouse', v || null)} placeholder="All warehouses" aria-label="Stock card warehouse" className="col-span-2 sm:w-52" />
              <Input type="date" aria-label="From" value={from} onChange={(e) => set('from', e.target.value || null)} className="min-w-0 sm:w-40" />
              <Input type="date" aria-label="To" value={to} onChange={(e) => set('to', e.target.value || null)} className="min-w-0 sm:w-40" />
            </div>
          }
        >
          <CardTitle>Stock card</CardTitle>
          <p className="text-xs text-muted">{warehouse ? 'Moves in this warehouse, with transfers.' : 'Moves in every warehouse. Transfers between them cancel out and are left out.'}</p>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between border-b border-border pb-2 text-sm">
            <span className="text-muted">Opening balance</span>
            <Qty itemId={item.id} qty={card.opening} className="font-semibold" />
          </div>
          {card.rows.length === 0 ? (
            <EmptyState compact title="No moves in this range" description="Widen the dates or pick another warehouse." />
          ) : (
            <ul className="divide-y divide-border">
              {[...card.rows].reverse().map(({ move: m, balance }) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={MOVE_VARIANT[m.kind]}>{STOCK_MOVE_KIND_LABEL[m.kind]}</Badge>
                      {m.ref && <MoveRef move={m} />}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {fmtDate(m.at)}
                      {!warehouse && ` · ${state.warehouses.find((w) => w.id === m.warehouseId)?.code ?? ''}`}
                      {m.note && ` · ${m.note}`}
                    </div>
                  </div>
                  <Qty itemId={item.id} qty={m.qty} className={`w-24 text-right ${m.qty < 0 ? 'text-danger' : 'font-semibold'}`} />
                  <span className="w-24 text-right text-xs text-muted tabular-nums">Bal {balance.toLocaleString('id-ID')}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted">Closing balance</span>
            <Qty itemId={item.id} qty={card.closing} className="font-semibold" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Supplier prices ({prices.length})</CardTitle>
            {best && <p className="text-xs text-muted">Best today for {item.reorderQty || 1}: {fmtIdr(best.price)} from {vendorName(state, best.vendorId)}</p>}
          </CardHeader>
          <CardContent>
            {prices.length === 0 ? (
              <EmptyState compact title="No price list yet" description="Add supplier prices on the Price list page." />
            ) : (
              <ul className="divide-y divide-border">
                {prices.map((p) => {
                  const expired = !!p.validTo && p.validTo < at
                  return (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link to={paths.supplier(p.vendorId)} className="block truncate font-semibold hover:text-accent">
                          {vendorName(state, p.vendorId)}
                        </Link>
                        <div className="text-xs text-muted">
                          From {p.minQty} · {p.leadDays} days lead · {fmtDate(p.validFrom)}
                          {p.validTo ? ` to ${fmtDate(p.validTo)}` : ' onwards'}
                        </div>
                      </div>
                      {best?.id === p.id && <Badge variant="success">Best</Badge>}
                      {expired && <Badge variant="muted">Expired</Badge>}
                      <Money value={p.price} className="font-semibold" />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Price history ({history.length})</CardTitle>
            <p className="text-xs text-muted">What the item cost on each sent order, newest first.</p>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <EmptyState compact title="Never ordered" description="Prices appear once an order with this item is sent." />
            ) : (
              <ul className="divide-y divide-border">
                {history.map((h) => (
                  <li key={`${h.po.id}-${h.price}-${h.qty}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <CodeLink to={paths.po(h.po.id)} code={h.po.code} />
                      <div className="truncate text-xs text-muted">
                        {fmtDate(h.at)} · {vendorName(state, h.po.vendorId)} · <Qty itemId={item.id} qty={h.qty} />
                      </div>
                    </div>
                    <Money value={h.price} className="font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open orders ({openOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {openOrders.length === 0 ? (
            <EmptyState compact title="Nothing on order" description="Sent orders still waiting for this item show here." />
          ) : (
            <ul className="divide-y divide-border">
              {openOrders.map(({ po, line }) => (
                <li key={line.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CodeLink to={paths.po(po.id)} code={po.code} />
                      <PoStatusBadge po={po} />
                    </div>
                    <div className="truncate text-xs text-muted">
                      {vendorName(state, po.vendorId)} · expected {fmtDate(po.expectedDate)}
                    </div>
                  </div>
                  <span className="text-xs text-muted">
                    <Qty itemId={item.id} qty={outstanding(line)} className="font-semibold text-foreground" /> to come of {line.qty}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing} onOpenChange={setEditing} title={`Edit ${item.name}`} description="Below the minimum, the item shows as low stock with a reorder suggestion.">
        {editing && <ItemForm editing={item} onDone={() => setEditing(false)} />}
      </Dialog>
      <Dialog open={moving} onOpenChange={setMoving} title={`Move ${item.name}`} description="Stock leaves at moving average cost and posts an inventory journal.">
        {moving && <MoveForm item={item} initialWarehouse={warehouse} onDone={() => setMoving(false)} />}
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------- settings

type Editing = { kind: 'category'; row: ItemCategory | null } | { kind: 'uom'; row: Uom | null } | { kind: 'warehouse'; row: Warehouse | null } | null

export function PurchasingSettingsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const [editing, setEditing] = useState<Editing>(null)
  if (!can('inventory.manage')) return <NoAccess description="Purchasing settings need the inventory.manage permission." />
  const close = () => setEditing(null)
  const branch = (id: string) => state.branches.find((b) => b.id === id)?.name ?? '–'
  const editButton = (label: string, onClick: () => void) => (
    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${label}`} onClick={onClick}>
      <Pencil />
    </Button>
  )
  const addButton = (label: string, onClick: () => void) => (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Plus />
      {label}
    </Button>
  )

  return (
    <div>
      <PageHeader title="Purchasing settings" description="Item categories, units, store rooms and the totals that send a request to Finance or the Director." />
      <SubTabs items={INVENTORY_TABS} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ThresholdsCard />
        <Card>
          <CardHeader action={addButton('Add category', () => setEditing({ kind: 'category', row: null }))}>
            <CardTitle>Categories ({state.itemCategories.length})</CardTitle>
            <p className="text-xs text-muted">An issue, scrap or count loss is charged to the category's expense account.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {state.itemCategories.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted">{accountLabel(state, c.expenseAccountId)}</div>
                  </div>
                  <span className="text-xs text-muted tabular-nums">{state.items.filter((i) => i.categoryId === c.id).length} items</span>
                  {editButton(c.name, () => setEditing({ kind: 'category', row: c }))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader action={addButton('Add warehouse', () => setEditing({ kind: 'warehouse', row: null }))}>
            <CardTitle>Warehouses ({state.warehouses.length})</CardTitle>
            <p className="text-xs text-muted">Store rooms that hold stock. A warehouse with stock cannot be closed.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {state.warehouses.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      <span className="font-mono text-xs text-muted">{w.code}</span> {w.name}
                    </div>
                    <div className="truncate text-xs text-muted">{branch(w.branchId)}</div>
                  </div>
                  {!w.active && <Badge variant="muted">Closed</Badge>}
                  {state.purchasingSettings.defaultWarehouseId === w.id && <Badge variant="info">Default</Badge>}
                  {editButton(w.name, () => setEditing({ kind: 'warehouse', row: w }))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader action={addButton('Add unit', () => setEditing({ kind: 'uom', row: null }))}>
            <CardTitle>Units ({state.uoms.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {state.uoms.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="w-16 font-mono text-xs font-semibold">{u.code}</span>
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {editButton(u.name, () => setEditing({ kind: 'uom', row: u }))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editing?.kind === 'category'} onOpenChange={(o) => !o && close()} title={editing?.row ? `Edit ${editing.row.name}` : 'New category'}>
        {editing?.kind === 'category' && <CategoryForm editing={editing.row} onDone={close} />}
      </Dialog>
      <Dialog open={editing?.kind === 'uom'} onOpenChange={(o) => !o && close()} title={editing?.row ? `Edit ${editing.row.name}` : 'New unit'}>
        {editing?.kind === 'uom' && <UomForm editing={editing.row} onDone={close} />}
      </Dialog>
      <Dialog open={editing?.kind === 'warehouse'} onOpenChange={(o) => !o && close()} title={editing?.row ? `Edit ${editing.row.name}` : 'New warehouse'}>
        {editing?.kind === 'warehouse' && <WarehouseForm editing={editing.row} onDone={close} />}
      </Dialog>
    </div>
  )
}

function ThresholdsCard() {
  const { state } = useAppState()
  const act = useAct()
  const p = state.purchasingSettings
  const [f, setF] = useState({ finance: String(p.financeApprovalAbove), director: String(p.directorApprovalAbove), directorUserId: p.directorUserId, defaultWarehouseId: p.defaultWarehouseId })
  const patch: Partial<PurchasingSettings> = {
    financeApprovalAbove: Number(f.finance) || 0,
    directorApprovalAbove: Number(f.director) || 0,
    directorUserId: f.directorUserId,
    defaultWarehouseId: f.defaultWarehouseId,
  }
  const changed = (Object.keys(patch) as (keyof PurchasingSettings)[]).some((k) => patch[k] !== p[k])
  const blocker = !f.directorUserId ? 'Pick the Director.' : !f.defaultWarehouseId ? 'Pick the default warehouse.' : blockerFor(state, { type: 'purchasingSettings/update', patch })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approvals and defaults</CardTitle>
        <p className="text-xs text-muted">Every request goes to the requester's manager first. Totals at or above these amounts add Finance and then the Director.</p>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!blocker) act({ type: 'purchasingSettings/update', patch }, 'Purchasing settings saved')
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Finance approval from" hint={fmtIdr(patch.financeApprovalAbove ?? 0)}>
              <Input inputMode="numeric" value={f.finance} onChange={(e) => setF({ ...f, finance: digits(e.target.value) })} />
            </FormField>
            <FormField label="Director approval from" hint={fmtIdr(patch.directorApprovalAbove ?? 0)}>
              <Input inputMode="numeric" value={f.director} onChange={(e) => setF({ ...f, director: digits(e.target.value) })} />
            </FormField>
            <FormField label="Director">
              <NativeSelect value={f.directorUserId} onChange={(e) => setF({ ...f, directorUserId: e.target.value })}>
                <option value="">Pick a user</option>
                {state.users
                  .filter((u) => u.status === 'active' || u.id === f.directorUserId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
            <FormField label="Default warehouse" hint="New orders deliver here">
              <WarehouseSelect value={f.defaultWarehouseId} onChange={(defaultWarehouseId) => setF({ ...f, defaultWarehouseId })} />
            </FormField>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {changed && blocker && <p className="mr-auto text-sm text-danger">{blocker}</p>}
            <Button type="submit" disabled={!changed || !!blocker} title={blocker ?? (changed ? undefined : 'Nothing has changed.')}>
              Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FormButtons({ onDone, label }: { onDone: () => void; label: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>
        Cancel
      </Button>
      <Button type="submit">{label}</Button>
    </DialogFooter>
  )
}

function CategoryForm({ editing, onDone }: { editing: ItemCategory | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [category, setCategory] = useState<ItemCategory>(editing ?? { id: newId('icat'), name: '', expenseAccountId: '' })
  const row = { ...category, name: category.name.trim() }
  const blocker = blockerFor(state, { type: 'itemCategories/upsert', category: row })
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act({ type: 'itemCategories/upsert', category: row }, editing ? 'Category saved' : 'Category added', row.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Name" required>
          <Input value={category.name} onChange={(e) => setCategory({ ...category, name: e.target.value })} placeholder="Office supplies" />
        </FormField>
        <FormField label="Expense account" required hint="Charged when stock is issued, scrapped or lost">
          <AccountSelect types={['expense']} value={category.expenseAccountId} onChange={(expenseAccountId) => setCategory({ ...category, expenseAccountId })} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <FormButtons onDone={onDone} label={editing ? 'Save category' : 'Add category'} />
    </form>
  )
}

function UomForm({ editing, onDone }: { editing: Uom | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [uom, setUom] = useState<Uom>(editing ?? { id: newId('uom'), code: '', name: '' })
  const row = { ...uom, code: uom.code.trim(), name: uom.name.trim() }
  const blocker = blockerFor(state, { type: 'uoms/upsert', uom: row })
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act({ type: 'uoms/upsert', uom: row }, editing ? 'Unit saved' : 'Unit added', row.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Code" required>
          <Input value={uom.code} onChange={(e) => setUom({ ...uom, code: e.target.value })} placeholder="box" inputClassName="font-mono" />
        </FormField>
        <FormField label="Name" required>
          <Input value={uom.name} onChange={(e) => setUom({ ...uom, name: e.target.value })} placeholder="Box" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <FormButtons onDone={onDone} label={editing ? 'Save unit' : 'Add unit'} />
    </form>
  )
}

function WarehouseForm({ editing, onDone }: { editing: Warehouse | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [w, setW] = useState<Warehouse>(editing ?? { id: newId('wh'), code: '', name: '', branchId: '', active: true })
  const row = { ...w, code: w.code.trim().toUpperCase(), name: w.name.trim() }
  const blocker = !w.branchId ? 'Pick the branch the warehouse belongs to.' : blockerFor(state, { type: 'warehouses/upsert', warehouse: row })
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act({ type: 'warehouses/upsert', warehouse: row }, editing ? 'Warehouse saved' : 'Warehouse added', row.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Code" required>
          <Input value={w.code} onChange={(e) => setW({ ...w, code: e.target.value })} placeholder="MDN" inputClassName="font-mono uppercase" />
        </FormField>
        <FormField label="Branch" required>
          <NativeSelect value={w.branchId} onChange={(e) => setW({ ...w, branchId: e.target.value })}>
            <option value="">Pick a branch</option>
            {state.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Name" required className="sm:col-span-2">
          <Input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} placeholder="Medan store room" />
        </FormField>
      </div>
      {editing && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <span>
            <span className="block font-semibold">Open</span>
            <span className="text-xs text-muted">A closed warehouse drops out of new orders and moves.</span>
          </span>
          <Switch label="Open" checked={w.active} onCheckedChange={(active) => setW({ ...w, active })} />
        </label>
      )}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <FormButtons onDone={onDone} label={editing ? 'Save warehouse' : 'Add warehouse'} />
    </form>
  )
}
