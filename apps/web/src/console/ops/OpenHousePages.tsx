import { addDays, blockerFor, fmtAgo, fmtDateLong, fmtDateTime, fmtTime, newId, nowIso, slugify, toMs } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
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
  ProgressBar,
  StatCard,
  Switch,
  toast,
  type Column,
} from '@artha/ui'
import { PUBLIC_LISTING_STATUSES, type OpenHouse, type OpenHouseRegistration } from '@artha/types'
import { CalendarDays, Copy, ExternalLink, Pencil, Plus, Search, UserCheck, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { fromLocalInput, toLocalInput } from './VisitPages'

// ---------------------------------------------------------------- shared bits

type When = 'upcoming' | 'past' | 'draft'
const WHEN_LABEL: Record<When, string> = { upcoming: 'Upcoming', past: 'Past', draft: 'Not published' }
const whenOf = (o: OpenHouse, now: number): When => (!o.published ? 'draft' : toMs(o.endAt) < now ? 'past' : 'upcoming')
const fill = (o: OpenHouse) => (o.capacity ? (o.registrations.length / o.capacity) * 100 : 0)

function usePlaceName() {
  const { state } = useAppState()
  return (o: Pick<OpenHouse, 'listingId' | 'projectId'>) => {
    const listing = state.listings.find((l) => l.id === o.listingId)
    if (listing) return `${listing.code} · ${listing.title}`
    return state.projects.find((p) => p.id === o.projectId)?.name ?? 'No place set'
  }
}

const PublishedBadge = ({ o, now }: { o: OpenHouse; now: number }) => {
  const when = whenOf(o, now)
  return <Badge variant={when === 'upcoming' ? 'success' : when === 'past' ? 'muted' : 'warning'}>{WHEN_LABEL[when]}</Badge>
}

// ---------------------------------------------------------------- dialog

function OpenHouseDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; editing: OpenHouse | null; onSaved?: (o: OpenHouse) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit ${editing.title}` : 'New open house'}
      description="Buyers register on the public page until the seats run out. Unpublished events stay hidden."
    >
      <OpenHouseForm
        editing={editing}
        onDone={(o) => {
          onOpenChange(false)
          if (o) onSaved?.(o)
        }}
      />
    </Dialog>
  )
}

function OpenHouseForm({ editing, onDone }: { editing: OpenHouse | null; onDone: (o: OpenHouse | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [slugTouched, setSlugTouched] = useState(!!editing)
  const defaultStart = () => {
    const d = new Date(addDays(nowIso(), 7))
    d.setHours(10, 0, 0, 0)
    return d.toISOString()
  }
  const start = editing?.startAt ?? defaultStart()
  const [f, setF] = useState({
    title: editing?.title ?? '',
    slug: editing?.slug ?? '',
    place: editing?.listingId ? `l:${editing.listingId}` : editing?.projectId ? `p:${editing.projectId}` : '',
    startAt: toLocalInput(start),
    endAt: toLocalInput(editing?.endAt ?? new Date(toMs(start) + 4 * 3_600_000).toISOString()),
    capacity: String(editing?.capacity ?? 20),
    hostId: editing?.hostId ?? '',
    published: editing?.published ?? false,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const slug = slugify(f.slug)
  const capacity = Number(f.capacity)
  const listings = state.listings.filter((l) => PUBLIC_LISTING_STATUSES.includes(l.status) || `l:${l.id}` === f.place)
  const errors = {
    title: f.title.trim().length >= 3 ? null : 'Enter a title.',
    slug: slug ? null : 'Enter the link name.',
    place: f.place ? null : 'Choose the listing or project.',
    startAt: f.startAt ? null : 'Pick the start.',
    endAt: f.endAt ? null : 'Pick the end.',
    capacity: Number.isInteger(capacity) && capacity >= (editing?.registrations.length ?? 1) && capacity > 0 ? null : `Enter at least ${Math.max(1, editing?.registrations.length ?? 1)} seats.`,
    hostId: f.hostId ? null : 'Choose the host.',
  }
  const openHouse: OpenHouse | null =
    f.startAt && f.endAt
      ? {
          id: editing?.id ?? newId('oh'),
          registrations: editing?.registrations ?? [],
          createdAt: editing?.createdAt ?? nowIso(),
          slug,
          title: f.title.trim(),
          listingId: f.place.startsWith('l:') ? f.place.slice(2) : null,
          projectId: f.place.startsWith('p:') ? f.place.slice(2) : null,
          startAt: fromLocalInput(f.startAt),
          endAt: fromLocalInput(f.endAt),
          capacity,
          hostId: f.hostId,
          published: f.published,
        }
      : null
  const blocker = openHouse ? blockerFor(state, { type: 'openHouses/upsert', openHouse }) : null
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean) || !openHouse) return
        if (act({ type: 'openHouses/upsert', openHouse }, editing ? 'Open house updated' : 'Open house created', openHouse.title)) onDone(openHouse)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Title" required error={show(errors.title)} className="sm:col-span-2">
          <Input
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })}
            placeholder="Sentul family house open day"
          />
        </FormField>
        <FormField label="Link" required error={show(errors.slug)} hint={slug ? paths.openHousePublic(slug) : undefined} className="sm:col-span-2">
          <Input
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true)
              setF({ ...f, slug: e.target.value })
            }}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Place" required error={show(errors.place)} className="sm:col-span-2">
          <NativeSelect value={f.place} onChange={set('place')} className={f.place ? '' : '[&_select]:text-muted'}>
            <option value="">Choose a listing or project</option>
            <optgroup label="Listings">
              {listings.map((l) => (
                <option key={l.id} value={`l:${l.id}`}>
                  {l.code} · {l.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="Projects">
              {state.projects.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </NativeSelect>
        </FormField>
        <FormField label="Starts" required error={show(errors.startAt)}>
          <Input type="datetime-local" value={f.startAt} onChange={set('startAt')} />
        </FormField>
        <FormField label="Ends" required error={show(errors.endAt)}>
          <Input type="datetime-local" value={f.endAt} onChange={set('endAt')} />
        </FormField>
        <FormField label="Seats" required error={show(errors.capacity)}>
          <Input type="number" inputMode="numeric" min={1} value={f.capacity} onChange={set('capacity')} />
        </FormField>
        <FormField label="Host" required error={show(errors.hostId)}>
          <NativeSelect value={f.hostId} onChange={set('hostId')} className={f.hostId ? '' : '[&_select]:text-muted'}>
            <option value="">Choose agent</option>
            {state.users
              .filter((u) => u.status === 'active' || u.id === f.hostId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4 sm:col-span-2">
          <div className="min-w-0 text-sm">
            <div className="font-medium">Published</div>
            <div className="text-xs text-muted">Shows the public page and opens registration.</div>
          </div>
          <Switch label="Published" checked={f.published} onCheckedChange={(v) => setF({ ...f, published: v })} />
        </div>
      </div>
      {blocker && (
        <p role="status" className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-foreground">
          {blocker}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create open house'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- list

export function OpenHousesPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const placeName = usePlaceName()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const q = params.get('q') ?? ''
  const when = (params.get('when') as When | null) || null
  const hostId = params.get('host') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const hostName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '–'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (o: OpenHouse) => terms.every((t) => `${o.title} ${o.slug} ${placeName(o)}`.toLowerCase().includes(t)) && (!hostId || o.hostId === hostId)
  const base = state.openHouses.filter(matches)
  const rows = base.filter((o) => !when || whenOf(o, now) === when)
  const filters = [q, when, hostId].filter(Boolean).length
  const hosts = state.users.filter((u) => state.openHouses.some((o) => o.hostId === u.id))
  const upcoming = state.openHouses.filter((o) => whenOf(o, now) === 'upcoming')
  const past = state.openHouses.filter((o) => toMs(o.endAt) < now)
  const pastRegs = past.flatMap((o) => o.registrations)
  const attendance = pastRegs.length ? Math.round((pastRegs.filter((r) => r.attended).length / pastRegs.length) * 100) : 0

  const columns: Column<OpenHouse>[] = [
    {
      id: 'title',
      header: 'Open house',
      sortValue: (o) => o.title,
      cell: (o) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{o.title}</div>
          <div className="truncate text-xs text-muted">{placeName(o)}</div>
          <div className="mt-1 text-xs text-muted md:hidden">{fmtDateTime(o.startAt)}</div>
          <div className="mt-1.5 sm:hidden">
            <PublishedBadge o={o} now={now} />
          </div>
        </div>
      ),
    },
    {
      id: 'when',
      header: 'Date',
      hideBelow: 'md',
      sortValue: (o) => o.startAt,
      cell: (o) => (
        <span className="whitespace-nowrap text-sm">
          {fmtDateTime(o.startAt)}
          <span className="text-muted"> to {fmtTime(o.endAt)}</span>
        </span>
      ),
    },
    { id: 'host', header: 'Host', hideBelow: 'xl', sortValue: (o) => hostName(o.hostId), cell: (o) => <span className="text-sm">{hostName(o.hostId)}</span> },
    {
      id: 'seats',
      header: 'Registered',
      hideBelow: 'lg',
      sortValue: fill,
      cell: (o) => (
        <div className="w-36">
          <div className="text-xs tabular-nums">
            <span className="font-semibold">{o.registrations.length}</span>
            <span className="text-muted"> of {o.capacity}</span>
          </div>
          <ProgressBar value={fill(o)} tone={o.registrations.length >= o.capacity ? 'accent' : 'ink'} className="mt-1" />
        </div>
      ),
    },
    { id: 'state', header: 'State', hideBelow: 'sm', align: 'right', cell: (o) => <PublishedBadge o={o} now={now} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Open houses"
        description="Viewing days open to the public. Share the link, then tick off who came on the day."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search open houses"
              placeholder="Title, link or place"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('visit.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New open house
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Upcoming" value={upcoming.length} icon={<CalendarDays />} tone="ink" active={when === 'upcoming'} onClick={() => set('when', when === 'upcoming' ? null : 'upcoming')} />
        <StatCard label="Registered for upcoming" value={upcoming.reduce((n, o) => n + o.registrations.length, 0)} icon={<Users />} />
        <StatCard label="Seats left" value={upcoming.reduce((n, o) => n + Math.max(0, o.capacity - o.registrations.length), 0)} icon={<Users />} tone="info" />
        <StatCard label="Past attendance" value={`${attendance}%`} icon={<UserCheck />} tone="success" hint="Registered guests who came" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!when} count={base.length} onClick={() => set('when', null)}>
            All
          </Chip>
          {(Object.keys(WHEN_LABEL) as When[]).map((w) => (
            <Chip key={w} active={when === w} count={base.filter((o) => whenOf(o, now) === w).length} onClick={() => set('when', when === w ? null : w)}>
              {WHEN_LABEL[w]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by host" value={hostId ?? ''} onChange={(e) => set('host', e.target.value)}>
          <option value="">All hosts</option>
          {hosts.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.openHouses.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(o) => o.id}
          rowLabel={(o) => o.title}
          onRowClick={(o) => navigate(paths.openHouse(o.id))}
          initialSort={{ id: 'when', desc: true }}
          resetPageKey={`${q}|${when}|${hostId}`}
          rowClassName={(o) => (whenOf(o, now) === 'past' ? 'opacity-70' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching open houses" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No open houses yet" description="Plan a viewing day for a listing or a project." />
            )
          }
        />
      </div>
      <OpenHouseDialog open={creating} onOpenChange={setCreating} editing={null} onSaved={(o) => navigate(paths.openHouse(o.id))} />
    </div>
  )
}

// ---------------------------------------------------------------- detail

type Attended = 'yes' | 'no'

export function OpenHouseDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const placeName = usePlaceName()
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const [attended, setAttended] = useState<Attended | null>(null)
  const o = state.openHouses.find((x) => x.id === id)
  if (!o) {
    return (
      <Card>
        <EmptyState title="Open house not found" description="This open house may have been removed." action={<BackButton fallback={paths.openHouses} />} />
      </Card>
    )
  }
  const manage = can('visit.manage')
  const host = state.users.find((u) => u.id === o.hostId)
  const listing = state.listings.find((l) => l.id === o.listingId)
  const project = state.projects.find((p) => p.id === o.projectId)
  const publicPath = paths.openHousePublic(o.slug)
  const came = o.registrations.filter((r) => r.attended).length
  const seatsLeft = Math.max(0, o.capacity - o.registrations.length)

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = o.registrations.filter((r) => terms.every((t) => `${r.name} ${r.phone}`.toLowerCase().includes(t)))
  const rows = base.filter((r) => !attended || r.attended === (attended === 'yes'))
  const filters = [q, attended].filter(Boolean).length
  const clear = () => {
    setQ('')
    setAttended(null)
  }

  const copyLink = async () => {
    const url = `${window.location.origin}${publicPath}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied', { tone: 'success', description: url })
    } catch {
      toast('Could not copy the link', { tone: 'danger', description: url })
    }
  }

  const columns: Column<OpenHouseRegistration>[] = [
    {
      id: 'name',
      header: 'Guest',
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{r.name}</div>
          <div className="font-mono text-xs text-muted sm:hidden">{r.phone}</div>
        </div>
      ),
    },
    { id: 'phone', header: 'WhatsApp', hideBelow: 'sm', cell: (r) => <span className="font-mono text-xs">{r.phone}</span> },
    { id: 'at', header: 'Registered', hideBelow: 'md', sortValue: (r) => r.at, cell: (r) => <span className="text-xs text-muted">{fmtAgo(r.at)}</span> },
    {
      id: 'attended',
      header: 'Came',
      align: 'right',
      sortValue: (r) => Number(r.attended),
      cell: (r) =>
        manage ? (
          <span className="inline-flex justify-end">
            <Checkbox
              label={`${r.name} came`}
              checked={r.attended}
              onCheckedChange={(v) => act({ type: 'openHouses/attend', id: o.id, registrationId: r.id, attended: v }, v ? 'Marked as came' : 'Marked as not came', r.name)}
            />
          </span>
        ) : r.attended ? (
          <Badge variant="success">Came</Badge>
        ) : (
          <span className="text-xs text-muted">Not yet</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.openHouses} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-xs font-semibold text-muted">{publicPath}</div>
          <h1 className="text-2xl font-bold tracking-tight">{o.title}</h1>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Button variant="outline" onClick={copyLink}>
            <Copy />
            Copy public link
          </Button>
          {o.published && (
            <Button variant="outline" asChild>
              <Link to={publicPath} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open public page
              </Link>
            </Button>
          )}
          {manage && (
            <Button onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card variant="ink" className="p-6">
        <div className="flex flex-wrap gap-1.5">
          <PublishedBadge o={o} now={now} />
          {host && <Badge className="bg-white/10 text-white">Host: {host.name}</Badge>}
        </div>
        <div className="mt-5 text-3xl font-bold tracking-tight tabular-nums">
          {fmtTime(o.startAt)} to {fmtTime(o.endAt)}
        </div>
        <div className="text-sm text-on-ink-muted">{fmtDateLong(o.startAt)}</div>
        <div className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="min-w-0 rounded-2xl bg-white/5 p-3">
            <div className="text-xs text-on-ink-muted">Place</div>
            {listing || project ? (
              <Link to={listing ? paths.listing(listing.id) : paths.project(project!.id)} className="block truncate font-semibold hover:underline">
                {placeName(o)}
              </Link>
            ) : (
              <span className="font-semibold">{placeName(o)}</span>
            )}
          </div>
          <div className="min-w-0 rounded-2xl bg-white/5 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-on-ink-muted">Seats</span>
              <span className="text-xs tabular-nums">
                <span className="font-semibold">{o.registrations.length}</span> of {o.capacity}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, fill(o))}%` }} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Registered" value={o.registrations.length} icon={<Users />} />
        <StatCard label="Came" value={came} icon={<UserCheck />} tone="success" />
        <StatCard label="Seats left" value={seatsLeft} icon={<CalendarDays />} tone={seatsLeft ? 'info' : 'accent'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registrations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              variant="soft"
              icon={<Search />}
              aria-label="Search guests"
              placeholder="Name or number"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full sm:w-60"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQ('')}><X /></Button> : undefined}
            />
            <ChipRow className="flex-1">
              <Chip active={!attended} count={base.length} onClick={() => setAttended(null)}>
                All
              </Chip>
              <Chip active={attended === 'yes'} count={base.filter((r) => r.attended).length} onClick={() => setAttended(attended === 'yes' ? null : 'yes')}>
                Came
              </Chip>
              <Chip active={attended === 'no'} count={base.filter((r) => !r.attended).length} onClick={() => setAttended(attended === 'no' ? null : 'no')}>
                Not yet
              </Chip>
            </ChipRow>
            {filters > 0 && (
              <span className="text-xs text-muted tabular-nums">
                {rows.length} of {o.registrations.length}
                <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
                  Clear {filters} {filters === 1 ? 'filter' : 'filters'}
                </Button>
              </span>
            )}
          </div>
          <div className="mt-3">
            <DataTable
              rows={rows}
              columns={columns}
              getRowKey={(r) => r.id}
              rowLabel={(r) => r.name}
              initialSort={{ id: 'at', desc: false }}
              resetPageKey={`${q}|${attended}`}
              empty={
                filters ? (
                  <EmptyState compact title="No matching guests" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
                ) : (
                  <EmptyState compact title="No registrations yet" description={o.published ? 'Share the public link to fill the seats.' : 'Publish the open house to open registration.'} />
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <OpenHouseDialog open={editing} onOpenChange={setEditing} editing={o} />
    </div>
  )
}
