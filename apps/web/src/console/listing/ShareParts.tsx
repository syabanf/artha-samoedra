import { defaultShare, fmtIdr, fmtIdrShort, fmtPercent, newParty, partyRule, SETTLEMENT_STATUS_LABEL, settlementFor, SHARE_PARTY_LABEL, shareAmounts, shareBlocker, type PartyAmount } from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogFooter, EmptyState, FormField, Input, NativeSelect } from '@artha/ui'
import type { Listing, ProfitShare, ShareParty, SharePartyKind } from '@artha/types'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { readPrice } from '../../lib/price'
import { useScoped } from '../../state/store'
import { useAct, type DialogProps } from '../dialogs'

/** Bar and dot tones per party kind; a second party of the same kind reuses the tone. */
export const PARTY_TONE: Record<SharePartyKind, string> = {
  company: 'bg-accent',
  agent: 'bg-ink',
  partner: 'bg-chart-muted',
  other: 'bg-info',
}

/** Names a party for display: the user, the partner, the named party, or the rule for an empty reference. */
export function usePartyName() {
  const { state, partnerName } = useScoped()
  return (p: ShareParty, listing: Listing) => {
    switch (p.kind) {
      case 'company':
        return state.company.name
      case 'agent':
        return p.refId ? (state.users.find((u) => u.id === p.refId)?.name ?? 'Unknown agent') : 'Deal owner'
      case 'partner':
        return partnerName(p.refId ?? listing.partnerId)
      case 'other':
        return p.name || 'Unnamed party'
    }
  }
}

/** A stacked bar of the parties' amounts. */
export function SplitBar({ parts, label, className = 'h-2.5' }: { parts: PartyAmount[]; label: string; className?: string }) {
  const total = parts.reduce((n, p) => n + p.amount, 0)
  return (
    <div className={`flex overflow-hidden rounded-full bg-surface-2 ${className}`} role="img" aria-label={label}>
      {total > 0 && parts.map((p) => <div key={p.party.id} className={`${PARTY_TONE[p.party.kind]} border-r border-card last:border-r-0`} style={{ width: `${(p.amount / total) * 100}%` }} />)}
    </div>
  )
}

/** Profit-sharing card on the listing detail page. */
export function ShareCard({ listing: l }: { listing: Listing }) {
  const { state } = useScoped()
  const { can } = useAuth()
  const nameOf = usePartyName()
  const [open, setOpen] = useState(false)
  const share = state.profitShares.find((p) => p.listingId === l.id)
  const amounts = share ? shareAmounts(share, l) : null
  const settlement = settlementFor(state, l.id)
  const summary = amounts ? amounts.parties.map((p) => `${nameOf(p.party, l)} ${fmtIdr(p.amount)}`).join(', ') : ''
  return (
    <>
      <Card>
        <CardHeader
          action={
            can('share.manage') && (
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                {share ? 'Edit scheme' : 'Set profit sharing'}
              </Button>
            )
          }
        >
          <CardTitle>Profit sharing</CardTitle>
        </CardHeader>
        <CardContent>
          {share && amounts ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-x-2">
                <span className="text-3xl font-bold tracking-tight tabular-nums">{fmtIdrShort(amounts.commission)}</span>
                <span className="pb-1 text-sm font-semibold text-muted">
                  {share.commissionMode === 'fixed' ? 'fixed fee' : `commission ${fmtPercent(share.commissionPct)}`}
                </span>
              </div>
              <SplitBar parts={amounts.parties} label={summary} />
              <ul className="divide-y divide-border text-sm">
                {amounts.parties.map((p) => (
                  <li key={p.party.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${PARTY_TONE[p.party.kind]}`} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{nameOf(p.party, l)}</span>
                        <span className="block text-xs text-muted">
                          {SHARE_PARTY_LABEL[p.party.kind]} · {partyRule(p.party)}
                          {p.party.mode === 'percent' && amounts.parties.some((x) => x.party.mode === 'fixed') ? ' of the rest' : ''}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{fmtIdr(p.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">Calculated from the {l.soldPrice ? 'sold price' : 'asking price'} {fmtIdr(amounts.basis)}.</p>
              {share.note && <p className="text-xs text-muted">{share.note}</p>}
              {settlement && (
                <Link
                  to={`${paths.settlements}?id=${settlement.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm hover:bg-surface"
                >
                  <span className="min-w-0">
                    Settlement <span className="font-mono text-xs font-semibold">{settlement.code}</span>
                  </span>
                  <Badge variant={settlement.status === 'paid' ? 'success' : 'warning'}>{SETTLEMENT_STATUS_LABEL[settlement.status]}</Badge>
                </Link>
              )}
            </div>
          ) : (
            <EmptyState compact title="No profit sharing scheme yet" description="A default scheme is created when the listing is approved." />
          )}
        </CardContent>
      </Card>
      <ShareDialog open={open} onOpenChange={setOpen} editing={share ?? null} listing={l} />
    </>
  )
}

// ---------------------------------------------------------------- scheme dialog

export function ShareDialog({ open, onOpenChange, editing, listing }: DialogProps<ProfitShare> & { listing: Listing }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Profit sharing ${listing.code}`}
      description="Fixed amounts come off the commission first. Percentage parties split the rest and must total 100%."
    >
      <ShareForm editing={editing} listing={listing} onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

/** Party rows keep the typed text, so "1.5 M" or "12," survive until the next keystroke. */
interface PartyDraft {
  party: ShareParty
  text: string
}

/** Spells out million and billion: readPrice reads a bare "25 M" as 25 billion. */
const amountInput = (n: number) => (n >= 1e9 ? `${n / 1e9} billion` : n >= 1e6 ? `${n / 1e6} million` : n ? String(n) : '')
const toDraft = (p: ShareParty): PartyDraft => ({ party: p, text: p.mode === 'fixed' ? amountInput(p.value) : String(p.value) })
const num = (v: string) => Number(v.replace(',', '.')) || 0
const readValue = (mode: ShareParty['mode'], text: string) => (mode === 'fixed' ? (readPrice(text) ?? 0) : num(text))

function ShareForm({ editing, listing, onDone }: { editing: ProfitShare | null; listing: Listing; onDone: () => void }) {
  const act = useAct()
  const { state, partnerName } = useScoped()
  const nameOf = usePartyName()
  const [base] = useState(() => editing ?? defaultShare(listing.id))
  const [mode, setMode] = useState(base.commissionMode)
  const [pct, setPct] = useState(String(base.commissionPct))
  const [fee, setFee] = useState(amountInput(base.commissionFixed))
  const [rows, setRows] = useState<PartyDraft[]>(() => base.parties.map(toDraft))
  const [note, setNote] = useState(base.note)

  const agents = state.users.filter((u) => u.status === 'active' && state.roles.find((r) => r.id === u.roleId)?.permissions.includes('deal.manage'))
  const share: ProfitShare = {
    ...base,
    commissionMode: mode,
    commissionPct: num(pct),
    commissionFixed: readPrice(fee) ?? 0,
    parties: rows.map((r) => ({ ...r.party, value: readValue(r.party.mode, r.text) })),
    note: note.trim(),
  }
  const basis = listing.soldPrice ?? listing.price
  const blocker = shareBlocker(share, basis)
  const amt = shareAmounts(share, listing)
  const pctTotal = share.parties.filter((p) => p.mode === 'percent').reduce((n, p) => n + p.value, 0)

  const patch = (i: number, next: Partial<ShareParty>, text?: string) =>
    setRows(rows.map((r, n) => (n === i ? { party: { ...r.party, ...next }, text: text ?? r.text } : r)))
  const setKind = (i: number, kind: SharePartyKind) => patch(i, { kind, refId: null, name: '' })
  const setRule = (i: number, m: ShareParty['mode']) => patch(i, { mode: m }, '')

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const what = mode === 'fixed' ? `fixed fee ${fmtIdr(share.commissionFixed)}` : `commission ${fmtPercent(share.commissionPct)}`
        if (!blocker && act({ type: 'profitShares/upsert', share }, 'Profit sharing scheme saved', `${listing.code} · ${what} · ${share.parties.length} parties`)) onDone()
      }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Commission">
            <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as ProfitShare['commissionMode'])}>
              <option value="percent">Percent of the deal price</option>
              <option value="fixed">Fixed fee</option>
            </NativeSelect>
          </FormField>
          {mode === 'percent' ? (
            <FormField label="Rate" hint="Above 0% and at most 10%">
              <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} right={<span className="pr-2 text-sm">%</span>} />
            </FormField>
          ) : (
            <FormField label="Fee" hint={share.commissionFixed ? fmtIdr(share.commissionFixed) : 'For example 150 million'}>
              <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="150 million" />
            </FormField>
          )}
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium">
            <span>Parties</span>
            <span className={`text-xs tabular-nums ${Math.abs(pctTotal - 100) > 0.001 ? 'text-accent-strong' : 'text-muted'}`}>Percentages total {fmtPercent(pctTotal, 2)}</span>
          </legend>
          <ul className="space-y-2">
            {rows.map((r, i) => {
              const p = r.party
              return (
                <li key={p.id} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_6.5rem_7rem_auto] sm:items-center">
                  <NativeSelect aria-label="Party type" value={p.kind} onChange={(e) => setKind(i, e.target.value as SharePartyKind)}>
                    {(Object.keys(SHARE_PARTY_LABEL) as SharePartyKind[]).map((k) => (
                      <option key={k} value={k}>
                        {SHARE_PARTY_LABEL[k]}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="col-span-2 min-w-0 sm:col-span-1 max-sm:order-first">
                    {p.kind === 'agent' && (
                      <NativeSelect aria-label="Agent" value={p.refId ?? ''} onChange={(e) => patch(i, { refId: e.target.value || null })}>
                        <option value="">Deal owner at closing</option>
                        {agents.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                    {p.kind === 'partner' && (
                      <NativeSelect aria-label="Partner" value={p.refId ?? ''} onChange={(e) => patch(i, { refId: e.target.value || null })}>
                        <option value="">Listing partner ({partnerName(listing.partnerId)})</option>
                        {state.partners
                          .filter((x) => x.id !== listing.partnerId)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </NativeSelect>
                    )}
                    {p.kind === 'other' && <Input aria-label="Party name" placeholder="Co-broker or notary" value={p.name} onChange={(e) => patch(i, { name: e.target.value })} />}
                    {p.kind === 'company' && <div className="truncate px-1 text-sm font-medium">{state.company.name}</div>}
                  </div>
                  <NativeSelect aria-label="Share rule" value={p.mode} onChange={(e) => setRule(i, e.target.value as ShareParty['mode'])}>
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed Rp</option>
                  </NativeSelect>
                  <Input
                    aria-label={p.mode === 'fixed' ? 'Amount in rupiah' : 'Percent of the rest'}
                    inputMode="decimal"
                    value={r.text}
                    placeholder={p.mode === 'fixed' ? '25 million' : '0'}
                    onChange={(e) => patch(i, {}, e.target.value)}
                    right={p.mode === 'percent' ? <span className="pr-2 text-sm">%</span> : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="justify-self-end"
                    aria-label={`Remove ${nameOf(p, listing)}`}
                    onClick={() => setRows(rows.filter((_, n) => n !== i))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, toDraft(newParty('other', 'fixed'))])}>
              <Plus />
              Add fixed party
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, toDraft(newParty('partner'))])}>
              <Plus />
              Add percentage party
            </Button>
          </div>
        </fieldset>

        <FormField label="Note" hint="Optional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
      {blocker ? (
        <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{blocker}</p>
      ) : (
        <div className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">
          <div className="text-xs text-muted">
            Simulated from the {listing.soldPrice ? 'sold price' : 'asking price'} {fmtIdr(amt.basis)}
          </div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 tabular-nums">
            <span>Commission</span>
            <span className="text-right font-semibold">{fmtIdr(amt.commission)}</span>
            {amt.parties.map((p) => (
              <div key={p.party.id} className="contents">
                <span className="truncate text-muted">{nameOf(p.party, listing)}</span>
                <span className="text-right">{fmtIdr(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!blocker} title={blocker ?? undefined}>
          Save profit sharing
        </Button>
      </DialogFooter>
    </form>
  )
}
