import {
  buildListing,
  defaultShare,
  fmtIdr,
  nowIso,
  type AppAction,
} from '@artha/fixtures'
import { Button, Dialog, DialogFooter, FormField, Input, NativeSelect, Textarea, toast } from '@artha/ui'
import {
  ASSET_TYPE_LABEL,
  ASSET_TYPES,
  DEAL_TYPE_LABEL,
  type AssetType,
  type DealType,
  type Listing,
} from '@artha/types'
import { useState } from 'react'
import { useUser } from '../auth/auth'
import { priceInput, readPrice } from '../lib/price'
import { useAppState } from '../state/store'

/** Dispatch as the signed-in user; a refused action ends in a danger toast with the blocker. */
export function useAct() {
  const { dispatch } = useAppState()
  const user = useUser()
  return (action: AppAction, success: string, description?: string) => {
    const blocker = dispatch(action, user.id)
    if (blocker) toast('Could not save', { tone: 'danger', description: blocker })
    else toast(success, { tone: 'success', description })
    return !blocker
  }
}

export interface DialogProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: T | null
}


// ---------------------------------------------------------------- listing

export function ListingDialog({ open, onOpenChange, editing, onSaved }: DialogProps<Listing> & { onSaved?: (l: Listing) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit ${editing.code}` : 'New listing'}
      description={
        editing ? 'Code and partner stay fixed. Changes go live on the website while the listing is active.' : 'Listings from the internal team go active and live on the website right away.'
      }
    >
      <ListingForm editing={editing} onDone={(saved) => { onOpenChange(false); if (saved) onSaved?.(saved) }} />
    </Dialog>
  )
}

function ListingForm({ editing, onDone }: { editing: Listing | null; onDone: (l: Listing | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    title: editing?.title ?? '',
    type: (editing?.type ?? 'rumah') as AssetType,
    deal: (editing?.deal ?? 'jual') as DealType,
    partnerId: editing?.partnerId ?? '',
    city: editing?.city ?? '',
    district: editing?.district ?? '',
    price: editing ? priceInput(editing.price) : '',
    landArea: editing ? String(editing.landArea) : '',
    buildingArea: editing?.buildingArea ? String(editing.buildingArea) : '',
    bedrooms: editing?.bedrooms ? String(editing.bedrooms) : '',
    certificate: editing?.certificate ?? 'SHM',
    highlights: editing?.highlights.join(', ') ?? '',
    description: editing?.description ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const price = readPrice(f.price)
  const errors = {
    title: f.title.trim().length < 10 ? 'Write a title of at least 10 characters.' : null,
    partnerId: f.partnerId ? null : 'Choose the partner who owns the asset.',
    city: f.city.trim() ? null : 'Enter the city.',
    district: f.district.trim() ? null : 'Enter the district.',
    price: price && price >= 10_000_000 ? null : 'Enter a price, for example 2.5 B or 850 M.',
    landArea: Number(f.landArea) > 0 ? null : 'Enter the land area in m².',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const data = {
          title: f.title.trim(),
          type: f.type,
          deal: f.deal,
          partnerId: f.partnerId,
          city: f.city.trim(),
          district: f.district.trim(),
          address: `${f.district.trim()}, ${f.city.trim()}`,
          price: price!,
          landArea: Number(f.landArea),
          buildingArea: Number(f.buildingArea) || null,
          bedrooms: Number(f.bedrooms) || null,
          certificate: f.certificate.trim().toUpperCase(),
          highlights: f.highlights.split(',').map((h) => h.trim()).filter(Boolean),
          description: f.description.trim() || `${f.title.trim()} in ${f.district}, ${f.city}.`,
        }
        if (editing) {
          act({ type: 'listings/update', id: editing.id, patch: data }, 'Listing updated', editing.code)
          onDone({ ...editing, ...data })
          return
        }
        const listing = buildListing(state, { ...data, photo: null, status: 'active', source: 'internal' }, nowIso())
        act({ type: 'listings/create', listing }, 'Listing created', `${listing.code} is live on the website`)
        act({ type: 'profitShares/upsert', share: defaultShare(listing.id) }, 'Default profit sharing scheme created')
        onDone(listing)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Ad title" required error={show(errors.title)} className="sm:col-span-2">
          <Input value={f.title} onChange={set('title')} placeholder="2-storey house near the station" />
        </FormField>
        <FormField label="Asset type" required>
          <NativeSelect value={f.type} onChange={set('type')}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Transaction" required>
          <NativeSelect value={f.deal} onChange={set('deal')}>
            {(['jual', 'sewa'] as DealType[]).map((d) => (
              <option key={d} value={d}>
                {DEAL_TYPE_LABEL[d]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Owning partner" required error={show(errors.partnerId)} className="sm:col-span-2">
          {editing ? (
            <Input readOnly value={state.partners.find((p) => p.id === editing.partnerId)?.name ?? ''} />
          ) : (
            <NativeSelect value={f.partnerId} onChange={set('partnerId')} className={f.partnerId ? '' : '[&_select]:text-muted'}>
              <option value="">Choose partner</option>
              {state.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="City" required error={show(errors.city)}>
          <Input value={f.city} onChange={set('city')} placeholder="Bandung" />
        </FormField>
        <FormField label="District" required error={show(errors.district)}>
          <Input value={f.district} onChange={set('district')} placeholder="Coblong" />
        </FormField>
        <FormField
          label={f.deal === 'sewa' ? 'Rent per year' : 'Sale price'}
          required
          error={show(errors.price)}
          hint={price ? fmtIdr(price) : 'For example 2.5 B or 850 M'}
        >
          <Input value={f.price} onChange={set('price')} placeholder="2.5 B" />
        </FormField>
        <FormField label="Certificate">
          <Input value={f.certificate} onChange={set('certificate')} placeholder="SHM" />
        </FormField>
        <FormField label="Land area" required error={show(errors.landArea)} hint="In m²">
          <Input inputMode="decimal" value={f.landArea} onChange={set('landArea')} />
        </FormField>
        <FormField label="Building area" hint="Leave empty for vacant land">
          <Input inputMode="decimal" value={f.buildingArea} onChange={set('buildingArea')} />
        </FormField>
        <FormField label="Bedrooms" hint="Optional">
          <Input inputMode="numeric" value={f.bedrooms} onChange={set('bedrooms')} />
        </FormField>
        <FormField label="Highlights" hint="Separate with commas, up to 3 show on the card">
          <Input value={f.highlights} onChange={set('highlights')} placeholder="Near the toll road, flood-free" />
        </FormField>
        <FormField label="Description" hint="Optional, generated from the title when empty" className="sm:col-span-2">
          <Textarea className="min-h-20" value={f.description} onChange={set('description')} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create listing'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- sold and delist

export function SoldDialog({ open, onOpenChange, listing }: { open: boolean; onOpenChange: (v: boolean) => void; listing: Listing }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={`Mark ${listing.code} as sold`} description="The deal price is the basis for profit sharing. Exclusive rights end automatically.">
      <SoldForm listing={listing} onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

function SoldForm({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const act = useAct()
  const [value, setValue] = useState(priceInput(listing.price))
  const [tried, setTried] = useState(false)
  const price = readPrice(value)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!price) return
        if (act({ type: 'listings/markSold', id: listing.id, soldPrice: price }, 'Listing marked as sold', `${listing.code} · ${fmtIdr(price)}`)) onDone()
      }}
    >
      <FormField label="Deal price" required error={tried && !price ? 'Enter the deal price.' : undefined} hint={price ? fmtIdr(price) : undefined}>
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Mark as sold</Button>
      </DialogFooter>
    </form>
  )
}

export function DelistDialog({ open, onOpenChange, listing }: { open: boolean; onOpenChange: (v: boolean) => void; listing: Listing }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={`Delist ${listing.code}`} description="The listing leaves the website and its exclusive rights end. This action is recorded in the history.">
      <DelistForm listing={listing} onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

function DelistForm({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const act = useAct()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!reason.trim()) return
        if (act({ type: 'listings/delist', id: listing.id, reason: reason.trim() }, 'Listing delisted', listing.code)) onDone()
      }}
    >
      <FormField label="Reason" required error={tried && !reason.trim() ? 'Enter the reason for delisting.' : undefined}>
        <Textarea className="min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Owner already sold it privately" />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary">
          Delist
        </Button>
      </DialogFooter>
    </form>
  )
}
