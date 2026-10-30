import { needsBedrooms, needsBuilding, partnerDraftErrors, partnerStart, partnerTurn, type PartnerDraft, type TurnInput } from '@artha/fixtures'
import { Button, Card, cn, FOCUS, FormField, Input, Kicker, NativeSelect } from '@artha/ui'
import { ASSET_TYPE_LABEL, ASSET_TYPES, DEAL_TYPE_LABEL, PUBLIC_LISTING_STATUSES, type AssetType, type DealType } from '@artha/types'
import { BellRing, ClipboardCheck, ImagePlus, MessageSquareText, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { JessyChat, useJessyChat } from '../components/JessyChat'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { priceInput, readPrice } from '../lib/price'
import { useAppState } from '../state/store'
import { SiteContainer } from './SiteLayout'

const STEPS = [
  { icon: MessageSquareText, title: 'Tell us about your property', body: 'Jessy asks for the type, location, price, size and paperwork one step at a time.' },
  { icon: ImagePlus, title: 'Add photos and check the details', body: 'Attach up to 4 photos, then confirm every field on a review card before you send it.' },
  { icon: ClipboardCheck, title: 'Our team reviews it', body: 'The listing goes live on the website once the team checks the details, within 24 hours.' },
  { icon: BellRing, title: 'Exclusive rights tracked', body: 'Jessy reminds you and the team before the exclusive period ends.' },
  { icon: Undo2, title: 'Withdraw any time', body: 'Sold it yourself? Type "withdraw listing" and pick the code.' },
]

export function PartnerPage() {
  useDocumentMeta('List your property · Artha Samoedra', 'Owners, agents and developers can list or withdraw a property by chatting with Jessy.')
  const { state } = useAppState()
  const chat = useJessyChat('jessy_partner', partnerStart, partnerTurn)
  return (
    <SiteContainer className="pt-8">
      {/* Phones read heading, chat, steps; desktop puts the chat in the right column beside both. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-1">
          <Kicker>Partner portal</Kicker>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            List a property through one conversation<span className="text-accent">.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted">
            No long forms. Start with your WhatsApp number. Sample registered partner number: 0812-1100-2231.
          </p>
        </div>
        <ol className="order-last space-y-3 lg:order-none lg:col-start-1 lg:row-start-2">

            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-card bg-card p-4 shadow-card">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-body [&_svg]:size-[18px]">
                  <s.icon />
                </span>
                <div>
                  <div className="text-sm font-semibold">
                    <span className="mr-1.5 text-muted tabular-nums">{i + 1}.</span>
                    {s.title}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
        </ol>
        <Card className="flex h-[640px] max-h-[80dvh] flex-col overflow-hidden lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="relative flex size-10 items-center justify-center rounded-full bg-accent-strong text-sm font-bold text-white">
              {state.settings.agentName.charAt(0)}
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success ring-2 ring-card" />
            </span>
            <div>
              <h2 className="text-sm font-bold">{state.settings.agentName} · Partner assistant</h2>
              <p className="text-xs text-muted">List and withdraw properties by chat</p>
            </div>
          </div>
          <JessyChat
            className="flex-1"
            messages={chat.messages}
            typing={chat.typing}
            onSend={chat.send}
            placeholder="Type your answer…"
            renderReview={() => <ListingReviewCard key={chat.messages.length} draft={chat.convo.draft} onSend={chat.send} />}
            renderListingLink={(id, children) => {
              const l = state.listings.find((x) => x.id === id)
              if (!l) return null
              return PUBLIC_LISTING_STATUSES.includes(l.status) ? (
                <Link to={paths.asset(l.slug)} target="_blank" className={cn('block rounded-2xl', FOCUS)}>
                  {children}
                </Link>
              ) : (
                <div className="opacity-70">{children}</div>
              )
            }}
          />
        </Card>
      </div>
    </SiteContainer>
  )
}

const num = (v: string) => Number(v.replace(/[^\d.,]/g, '').replace(',', '.')) || null

/** The structured review step: every field Jessy collected, editable before the partner sends it. */
function ListingReviewCard({ draft, onSend }: { draft: PartnerDraft; onSend: (text: string, input?: TurnInput) => void }) {
  const [type, setType] = useState<AssetType | ''>(draft.type ?? '')
  const [deal, setDeal] = useState<DealType | ''>(draft.deal ?? '')
  const [title, setTitle] = useState(draft.title ?? '')
  const [city, setCity] = useState(draft.city ?? '')
  const [district, setDistrict] = useState(draft.district ?? '')
  const [price, setPrice] = useState(draft.price ? priceInput(draft.price) : '')
  const [land, setLand] = useState(draft.landArea ? String(draft.landArea) : '')
  const [building, setBuilding] = useState(draft.buildingArea ? String(draft.buildingArea) : '')
  const [bedrooms, setBedrooms] = useState(draft.bedrooms ? String(draft.bedrooms) : '')
  const [certificate, setCertificate] = useState(draft.certificate ?? '')
  const [highlights, setHighlights] = useState((draft.highlights ?? []).join(', '))
  const [exclusive, setExclusive] = useState(String(draft.exclusiveDays ?? 0))
  const [photos, setPhotos] = useState(draft.photos ?? [])
  const [tried, setTried] = useState(false)

  const t = type || undefined
  const next: PartnerDraft = {
    type: t,
    deal: deal || undefined,
    title: title.trim(),
    city: city.trim(),
    district: district.trim(),
    price: readPrice(price) ?? undefined,
    landArea: num(land) ?? undefined,
    buildingArea: needsBuilding(t) ? num(building) : null,
    bedrooms: needsBedrooms(t) ? num(bedrooms) : null,
    certificate: certificate.trim().toUpperCase(),
    highlights: highlights.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3),
    exclusiveDays: Number(exclusive) || null,
    photos,
  }
  const errors = tried ? partnerDraftErrors(next) : {}
  const exclusiveOptions = [...new Set([0, 30, 60, 90, draft.exclusiveDays ?? 0])].sort((a, b) => a - b)

  return (
    <form
      noValidate
      className="rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(partnerDraftErrors(next)).length) return
        onSend('Send for review', { draft: next })
      }}
    >
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-4 text-accent" />
        <h3 className="text-sm font-bold">Review your listing</h3>
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
        <FormField label="Type" error={errors.type}>
          <NativeSelect value={type} onChange={(e) => setType(e.target.value as AssetType)}>
            <option value="">Pick a type</option>
            {ASSET_TYPES.map((x) => (
              <option key={x} value={x}>
                {ASSET_TYPE_LABEL[x]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Deal" error={errors.deal}>
          <NativeSelect value={deal} onChange={(e) => setDeal(e.target.value as DealType)}>
            <option value="">Pick one</option>
            {(['jual', 'sewa'] as const).map((x) => (
              <option key={x} value={x}>
                {DEAL_TYPE_LABEL[x]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Headline" error={errors.title} className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="City" error={errors.city}>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label="District" error={errors.district}>
          <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
        </FormField>
        <FormField label={deal === 'sewa' ? 'Price a year' : 'Price'} error={errors.price} className="col-span-2">
          <Input value={price} inputMode="decimal" placeholder="e.g. 2.5 B" onChange={(e) => setPrice(e.target.value)} />
        </FormField>
        <FormField label="Land, m²" error={errors.landArea}>
          <Input value={land} inputMode="decimal" onChange={(e) => setLand(e.target.value)} />
        </FormField>
        {needsBuilding(t) && (
          <FormField label="Building, m²" error={errors.buildingArea}>
            <Input value={building} inputMode="decimal" onChange={(e) => setBuilding(e.target.value)} />
          </FormField>
        )}
        {needsBedrooms(t) && (
          <FormField label="Bedrooms" error={errors.bedrooms}>
            <Input value={bedrooms} inputMode="numeric" onChange={(e) => setBedrooms(e.target.value)} />
          </FormField>
        )}
        <FormField label="Certificate" error={errors.certificate}>
          <Input value={certificate} onChange={(e) => setCertificate(e.target.value)} />
        </FormField>
        <FormField label="Highlights" hint="Up to 3, separated by commas" className="col-span-2">
          <Input value={highlights} onChange={(e) => setHighlights(e.target.value)} />
        </FormField>
        <FormField label="Exclusive rights" className="col-span-2">
          <NativeSelect value={exclusive} onChange={(e) => setExclusive(e.target.value)}>
            {exclusiveOptions.map((d) => (
              <option key={d} value={d}>
                {d ? `${d} days` : 'No exclusive'}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="mt-3">
        <div className="mb-1.5 text-sm font-medium">Photos</div>
        {photos.length ? (
          <ul className="flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <li key={i} className="relative">
                <img src={src} alt={i === 0 ? 'Cover photo' : `Photo ${i + 1}`} className="size-16 rounded-xl object-cover" />
                {i === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-semibold text-on-ink">Cover</span>}
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setPhotos(photos.filter((_, n) => n !== i))}
                  className={cn('absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-card text-body shadow-card [&_svg]:size-3.5', FOCUS)}
                >
                  <X />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">No photos. The team can add them after review.</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onSend('Cancel')}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Send for review
        </Button>
      </div>
    </form>
  )
}
