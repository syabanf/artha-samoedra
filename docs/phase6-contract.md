# Phase 6 contract: purchasing and inventory

`docs/roadmap.md` → "Phase 6" lists the scope. Production, recipes and BOM are left out (decided 2026-10-30). Read `docs/frontend-conventions.md` (including "Finance pages") and the "Hooks and helpers", "Copy these pages for shape" and "Rules every page follows" sections of `docs/phase2-contract.md`. For shape, copy:
- `console/finance/PayablePages.tsx` (list, editor and detail)
- `console/people/RequestPages.tsx` (approval flow with `ApprovalTrail`)
- `console/finance/ReportPages.tsx` (reports with CSV and print)

## What exists for this phase

- **Types:** `packages/types/src/purchasing.ts` and the label maps in it. Suppliers are the finance `vendors`; three supply vendors are added.
- **State keys:**
  - Catalogue: `itemCategories, uoms, items, warehouses, vendorPrices`
  - Stock: `stockMoves, stockCounts`
  - Buying: `purchaseRequests, purchaseOrders, goodsReceipts, purchaseReturns, vendorCredits`
  - Settings: `purchasingSettings`

  The seed holds:
  - 16 supply items in four store rooms, with opening stock on 1 January
  - 7 requests in every state
  - 4 orders: draft, sent and shipping, part received and late, received and billed
  - 2 receipts, one with a QC rejection
  - a return that made vendor credit CN-26-0001
  - a posted September count and a Bandung count in progress
  - price lists
- **Store module** `packages/fixtures/src/purchasing.ts`. Every action, blocker and helper is done and tested in `purchasing.test.ts`. Pages dispatch and read.
  - **Actions:** see `PurchasingAction`.
  - **Stock:** `onHand(s, itemId, warehouseId?)`, `stockByWarehouse`, `averageCost` (moving average), `stockValue`, `lowStock`, `stockCard(s, itemId, warehouseId?, from?, to?)`, `valuation`, `itemName`, `uomOf`, `fmtQty`.
  - **Buying:**
    - Requests: `prTotal`, `prSteps`, `prsAwaiting(s, userId, canApprove)`.
    - Orders: `poTotals`, `outstanding`, `billable`, `returnable`, `isPoLate`, `buildPoFromRequests(s, prIds, vendorId, at, by)`.
    - Prices and credits: `bestPrice`, `priceHistory`, `creditLeft`, `supplierPerformance`.
    - Codes: `nextPrCode`, `nextPoCode`, `nextReceiptCode`, `nextReturnCode`, `nextCountCode`, `nextSku`. `currentStep` comes from HR.
  - **Ledger:** every stock move with value posts an `inventory` journal in Finance.
    - **Receipts:** debit Inventory 1-1700, credit Goods received not invoiced 2-1700.
    - **Issues, scrap, losses:** go to the item category's expense account.
    - **Returns:** debit GRNI, credit Inventory.
    - **Billing an order (`pos/bill`):** posts a Finance bill against GRNI.
    - **Billed units sent back:** become a vendor credit, which `credits/apply` takes off a bill.
- **Permissions:**
  - `purchase.view`: every page.
  - `purchase.request`: raise requests.
  - `purchase.approve`: the Finance level. Manager and Director levels name their user.
  - `purchase.order`: orders, receiving, returns, billing, credits, suppliers and prices.
  - `inventory.manage`: items, warehouses, stock moves, counts and settings.

  Hide what a role cannot do.
- **Routes** are registered under `/console/purchasing` with `PurchasingLayout`, whose tabs are Overview, Requests, Orders, Receiving, Suppliers, Inventory and Reports. Paths are in `components/links.tsx`.
- **Shared parts:**
  - `console/purchasing/parts.tsx`: `ItemSelect`, `WarehouseSelect`, `VendorSelect`, `Qty`, `PrStatusBadge`, `PoStatusBadge` (shows Late), `QcBadge`, `qcResult`.
  - `components/SubTabs.tsx`
  - `lib/useSetParam.ts`: URL filters.
  - `Money` from `console/finance/parts.tsx`
  - `PersonCell`, `EmployeeSelect` and `ApprovalTrail` from `console/people/parts.tsx`
  - `components/Letter.tsx` for printing
- **Storage version** is 12.

## Shared-file rules (four agents run at once)

- Do not edit `packages/*`, the router, `nav.ts`, `links.tsx`, `sections.tsx`, the kit, `components/*`, `lib/*` or another agent's files. Report the exact helper you wanted.
- Every `parts.tsx` is shared: small exact-string edits only, and only for something two agents need.
- Every mutation goes through `useAct()`. Disabled buttons give their `blockerFor` text in `title`, and forms show it after the first submit. A "save, then submit" handler may dispatch twice in a row: the store checks the second action against the first one's result.
- Lists filter: search plus chips with counts, kept in the URL with `useSetParam`.
- Check 1280 and 375 px: no sideways scroll, one h1. Run `pnpm -r typecheck` and `pnpm test` before reporting. Other agents share the browser storage: use your own tab, keep test mutations small, and never reset the demo.

## Agent A: Requests and orders

Own `console/purchasing/RequestPages.tsx` (`PurchaseRequestsPage`, `PurchaseRequestEditorPage`, `PurchaseRequestDetailPage`) and `OrderPages.tsx` (`PurchaseOrdersPage`, `PurchaseOrderEditorPage`, `PurchaseOrderDetailPage`).

- **Requests list:**
  - Tabs: All, Mine, Waiting for me (`prsAwaiting`, with `purchase.approve` for the Finance level).
  - Status chips, department select, search.
  - Columns: code, requester, department, items, estimated total, needed by, current step, status.
  - "Order approved requests": pick approved requests and a vendor, then go to the order editor prefilled through `buildPoFromRequests`. Pass the request ids and vendor in the URL.
- **Request editor:** for drafts.
  - Requester: defaults to `employeeOfUser`; `purchase.order` can pick anyone.
  - Needed by, reason.
  - Lines: item, qty, estimated price (default the best price), note.
  - The estimated total, and the approval levels it will need, previewed with `prSteps` through `ApprovalTrail`.
  - Buttons: "Save draft" and "Submit for approval" (save, then `prs/submit`).
- **Request detail:**
  - Hero, lines, `ApprovalTrail`.
  - Approve and Reject (note required) when the current level is the user's.
  - Cancel. A link to the order once ordered.
- **Orders list:**
  - Stat tiles: draft, open (sent and part received), late, to bill (received units not billed).
  - Status chips (with Late), vendor select, search.
  - Columns: code, vendor, order date, expected, total, received %, status.
- **Order editor:** for drafts.
  - Fields: vendor, warehouse, dates, terms, VAT switch, note, and the linked requests.
  - Lines with item, qty and unit price. Picking an item fills the vendor's best price, and the editor flags a price above the vendor's list.
  - Totals. Buttons: "Save draft" and "Save and send".
- **Order detail:**
  - Ink hero with total and received %.
  - Line table: ordered, received, rejected, returned and billed per line.
  - Receipts, returns, bills and journals, each linking out.
  - Shipping card: carrier, tracking and shipped date, editable while open (`pos/ship`).
  - Actions: Send, Receive goods (link to the receiving page with `?po=`), Bill received goods (a dialog with vendor invoice number and date, dispatching `pos/bill` with `newId('bil')`, then linking to the bill), Close, Cancel.
  - Print: a purchase order letter through `Letter.tsx` with letterhead, vendor, ship-to warehouse, lines, VAT, terms and signature.

## Agent B: Receiving, returns, suppliers

Own `console/purchasing/ReceivingPages.tsx` (`GoodsReceiptsPage`, `GoodsReceiptDetailPage`, `PurchaseReturnsPage`) and `SupplierPages.tsx` (`SuppliersPage`, `SupplierDetailPage`, `PriceListPage`). Use `SubTabs` across Receipts and Returns, and across Suppliers and Price list.

- **Receipts page:**
  - The list: code, order, vendor, delivery note, date, accepted and rejected, QC badge, with search and QC chips.
  - With `purchase.order`, a "Receive goods" panel (`?po=` preselects the order). Pick an open order and enter the delivery note. Each outstanding line shows the ordered and still-to-come amounts with accepted and rejected inputs. Rejected units need a QC note. It dispatches `receipts/create` with `nextReceiptCode`.
- **Receipt detail:** order link, lines with QC notes, the stock moves and the journal, and printing as a receiving report.
- **Returns page:**
  - Returns list.
  - "Return goods": pick a received order, then quantities up to `returnable` and a reason. It dispatches `returns/create`.
  - Vendor credits: amount, left, applied history. "Apply to bill" picks a posted bill of that vendor with a balance (`credits/apply`).
- **Suppliers page:**
  - Vendors with orders, spend, on-time %, reject %, average lead days (`supplierPerformance`) and open bills balance.
  - Search, an active chip, add and edit (`vendors/upsert`).
  - Import CSV (`name,taxId,phone,email,bankAccount,termsDays`) with a preview and template, dispatching `suppliers/import`.
- **Supplier detail:**
  - Profile and performance tiles.
  - Price list for this vendor, with add, edit and remove (`vendorPrices/*`).
  - Orders, bills with balance and payments (vendor payments link to the finance bill to pay), and credits.
- **Price list:**
  - Every vendor price, with item and vendor filters, valid now or all.
  - Per item, the cheapest current price and price history from `priceHistory` as a small line or bar chart.

## Agent C: Items and inventory

Own `console/purchasing/ItemPages.tsx` (`ItemsPage`, `ItemDetailPage`, `PurchasingSettingsPage`) and `StockPages.tsx` (`StockPage`, `StockMovesPage`, `StockCountsPage`, `StockCountDetailPage`). Use `SubTabs` across Stock, Movements, Items, Counts and Settings.

- **Stock page:**
  - Stat tiles: stock value, items below minimum, counts in progress, moves this month.
  - An on-hand matrix (items by warehouses) with low stock highlighted, plus category chips, a warehouse select and search.
  - Actions per row (`inventory.manage`): Issue to department, Adjust (plus or minus, note), Transfer, Scrap (note). Each uses a dialog showing the available amount and dispatching the matching `stock/*` action.
  - A low stock card with "Raise request", which opens the request editor with `?item=` and `qty=reorderQty`. Agent A's editor should read those; tell the integrator if it does not.
- **Movements page:** every move: date, item, warehouse, kind, qty (signed), unit cost, value, reference link, department, by. Kind chips, item and warehouse selects, a date range, and CSV export.
- **Counts:**
  - A list of counts.
  - "Start count" for a warehouse snapshots `systemQty` from `onHand`.
  - **Count detail:** a counted input per line, the difference, and the value at `averageCost`. Save, and Post.
  - Print a count sheet.
- **Items page:** a table with SKU, name, category, unit, on hand, minimum, average cost and value. Category and status chips, search, CSV export. Add and edit (`items/upsert` with `nextSku`).
- **Item detail:** stock by warehouse, the stock card (`stockCard`) with a warehouse select and date range, price history and vendor prices, and open orders for the item.
- **Settings:** categories (with expense account through `AccountSelect` from finance parts), units, warehouses, and approval thresholds (`purchasingSettings/update`).

## Agent D: Overview and reports

Own `console/purchasing/OverviewPage.tsx` (`PurchasingOverviewPage`) and `ReportsPage.tsx` (`PurchasingReportsPage`).

- **Overview:**
  - Ink hero with stock value and spend this month.
  - An accent card for requests waiting for the user.
  - Stat cards: orders to receive (late count), received units to bill, low stock items, open vendor credits.
  - Spend by month (orders sent), as a column chart.
  - Lists: late orders, low stock, latest receipts, top suppliers by spend.
- **Reports** (`?report=` in the URL, with a date range, CSV export and print for each):
  - **PO summary:** orders by vendor and status with totals.
  - **PO detail:** lines with ordered, received, billed and outstanding.
  - **Supplier performance:** on-time %, reject %, lead days and spend.
  - **Stock card:** item and warehouse pickers.
  - **Inventory valuation:** by warehouse and category, at average cost, with the ledger balance of the inventory account for comparison.
  - **Low stock**, with suggested reorder.
