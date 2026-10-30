import { contactByPhone, newId, nowIso, type AppState } from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Dialog, DialogFooter, EmptyState, FormField, Input, NativeSelect, PageHeader, Switch, toast } from '@artha/ui'
import { LEAD_SOURCE_LABEL, type LeadForm, type LeadSource } from '@artha/types'
import { Copy, ExternalLink, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'
import { NoAccess } from '../../components/NoAccess'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const sourceOf = (s: AppState, phone: string) => contactByPhone(s, phone)?.source

/** Inquiries whose contact came from a lead form and asked about the form's listing. */
const submissions = (s: AppState, f: LeadForm) => s.inquiries.filter((i) => i.formId === f.id)

export function FormsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const [editing, setEditing] = useState<LeadForm | 'new' | null>(null)
  if (!can('campaign.manage')) return <NoAccess />

  const copy = (f: LeadForm) => {
    const url = `${window.location.origin}${paths.publicForm(f.slug)}`
    navigator.clipboard
      .writeText(url)
      .then(() => toast('Link copied', { tone: 'success', description: url }))
      .catch(() => toast('Could not copy the link', { tone: 'danger', description: url }))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lead forms"
        description="Public sign-up pages for open houses and briefs. Each submission becomes an inquiry and a contact with source Lead form."
        className="mb-2"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            New form
          </Button>
        }
      />
      {state.leadForms.length === 0 ? (
        <Card>
          <EmptyState title="No lead forms yet" description="Create a form and share its link in ads or on social media." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.leadForms.map((f) => {
            const listing = state.listings.find((l) => l.id === f.listingId)
            const n = submissions(state, f).length
            return (
              <Card key={f.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold">{f.name}</h2>
                    <p className="truncate text-xs text-muted">{listing ? `${listing.code} · ${listing.title}` : 'No listing'}</p>
                  </div>
                  <Switch
                    checked={f.active}
                    label={`${f.name} accepts submissions`}
                    onCheckedChange={(on) => act({ type: 'forms/upsert', form: { ...f, active: on } }, on ? 'Form opened' : 'Form closed', f.name)}
                  />
                </div>
                <p className="mt-3 flex-1 text-sm text-body">{f.headline}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!f.active && <Badge variant="outline">Closed</Badge>}
                  {f.askBudget && <Badge variant="muted">Asks budget</Badge>}
                  {f.askVisitDate && <Badge variant="muted">Asks visit date</Badge>}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-surface-2 py-1.5 pl-3 pr-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{paths.publicForm(f.slug)}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Copy link to ${f.name}`} onClick={() => copy(f)}>
                    <Copy />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Open ${f.name}`} asChild>
                    <a href={paths.publicForm(f.slug)} target="_blank" rel="noreferrer">
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm">
                    <span className="font-semibold tabular-nums">{n}</span> <span className="text-muted">{n === 1 ? 'submission' : 'submissions'}</span>
                  </span>
                  <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditing(f)}>
                    <Pencil />
                    Edit
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <AttributionCard />
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing === 'new' ? 'New lead form' : `Edit ${editing?.name ?? ''}`}
        description="Name and WhatsApp number are always asked. Turn on the extra questions you need."
      >
        {editing && <FormForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function AttributionCard() {
  const { state } = useAppState()
  const won = new Set(state.stages.filter((s) => s.kind === 'won').map((s) => s.id))
  const rows = (Object.keys(LEAD_SOURCE_LABEL) as LeadSource[])
    .map((src) => ({
      src,
      inquiries: state.inquiries.filter((i) => sourceOf(state, i.phone) === src).length,
      won: state.deals.filter((d) => won.has(d.stageId) && state.contacts.find((c) => c.id === d.contactId)?.source === src).length,
    }))
    .sort((a, b) => b.inquiries - a.inquiries || b.won - a.won)
  const max = Math.max(1, ...rows.map((r) => Math.max(r.inquiries, r.won)))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attribution</CardTitle>
        <p className="text-xs text-muted">Inquiries and won deals by the source of the contact.</p>
        <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-chart-muted" />
            Inquiries
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent" />
            Won deals
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div key={r.src} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <span className="truncate">{LEAD_SOURCE_LABEL[r.src]}</span>
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-chart-muted" style={{ width: `${(r.inquiries / max) * 100}%` }} />
              <div className="h-2 rounded-full bg-accent" style={{ width: `${(r.won / max) * 100}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs text-muted tabular-nums">
              {r.inquiries} · {r.won} won
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function FormForm({ editing, onDone }: { editing: LeadForm | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [f, setF] = useState<LeadForm>(
    editing ?? { id: newId('frm'), name: '', slug: '', headline: '', listingId: null, askBudget: true, askVisitDate: false, active: true, createdAt: nowIso() },
  )
  const [slugTouched, setSlugTouched] = useState(!!editing)
  const [tried, setTried] = useState(false)
  const taken = state.leadForms.some((x) => x.slug === f.slug && x.id !== f.id)
  const errors = {
    name: f.name.trim() ? null : 'Name the form.',
    slug: !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug) ? 'Use lowercase letters, numbers and dashes.' : taken ? 'Another form uses this link.' : null,
    headline: f.headline.trim().length >= 10 ? null : 'Write a headline of at least 10 characters.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        if (act({ type: 'forms/upsert', form: { ...f, name: f.name.trim(), headline: f.headline.trim() } }, 'Form saved', paths.publicForm(f.slug))) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={show(errors.name)} hint="Only the team sees this">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} placeholder="Sentul open house" />
        </FormField>
        <FormField label="Link" required error={show(errors.slug)} hint={paths.publicForm(f.slug || 'your-link')}>
          <Input
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true)
              setF({ ...f, slug: e.target.value.toLowerCase() })
            }}
            inputClassName="font-mono"
          />
        </FormField>
        <FormField label="Headline" required error={show(errors.headline)} className="sm:col-span-2">
          <Input value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} placeholder="Register for the Sentul open house" />
        </FormField>
        <FormField label="Listing" hint="Optional. Shows a summary on the form." className="sm:col-span-2">
          <NativeSelect value={f.listingId ?? ''} onChange={(e) => setF({ ...f, listingId: e.target.value || null })}>
            <option value="">No listing</option>
            {state.listings
              .filter((l) => l.status === 'active' || l.status === 'reserved' || l.id === f.listingId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.title}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.askBudget} label="Ask for a budget" onCheckedChange={(on) => setF({ ...f, askBudget: on })} />
          Ask for a budget
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.askVisitDate} label="Ask for a preferred visit date" onCheckedChange={(on) => setF({ ...f, askVisitDate: on })} />
          Ask for a preferred visit date
        </label>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 sm:col-span-2">
          <span className="text-sm">Accept submissions</span>
          <Switch checked={f.active} label="Accept submissions" onCheckedChange={(on) => setF({ ...f, active: on })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save form</Button>
      </DialogFooter>
    </form>
  )
}
