import {
  addDays,
  blockerFor,
  countBy,
  DAY,
  fmtAgo,
  fmtDate,
  fmtDateTime,
  fromDateInput,
  nowIso,
  SHARE_MAX_DAYS,
  shareEvents,
  shareFiles,
  shareStatus,
  shareSummary,
  toDateInput,
  toMs,
  type AppState,
} from '@artha/fixtures'
import { SHARE_EVENT_LABEL, SHARE_PURPOSE_LABEL, SHARE_STATUS_LABEL, type ShareLink, type SharePurpose, type ShareStatus } from '@artha/types'
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
  KeyValue,
  Kicker,
  PageHeader,
  StatCard,
  toast,
  type Column,
} from '@artha/ui'
import { Ban, CalendarClock, CalendarPlus, Copy, Eye, Link2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { SearchBox } from '../../components/SearchBox'
import { useSetParam } from '../../lib/useSetParam'
import { useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { FilterCaption, filteredEmpty } from '../../components/FilterCaption'
import { FileGlyph, FileSize, ShareStatusBadge } from './parts'

const STATUSES: ShareStatus[] = ['active', 'expired', 'revoked']
const PURPOSES = Object.keys(SHARE_PURPOSE_LABEL) as SharePurpose[]

/** The folder name, or how many files were picked. */
const sharedWhat = (s: AppState, l: ShareLink) => {
  if (l.folderId) return s.dataFolders.find((f) => f.id === l.folderId)?.name ?? 'Removed folder'
  return l.fileIds.length === 1 ? (s.dataFiles.find((f) => f.id === l.fileIds[0])?.name ?? '1 file') : `${l.fileIds.length} files`
}

const copyText = (text: string, what: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => toast(`${what} copied`, { tone: 'success', description: text }))
    .catch(() => toast(`Could not copy the ${what.toLowerCase()}`, { tone: 'danger', description: text }))

// ---------------------------------------------------------------- list

export function ShareLinksPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  if (!can('dataroom.share')) return <NoAccess description="Share links need the dataroom.share permission. Ask an admin to add it to your role." />

  const q = params.get('q') ?? ''
  const status = (params.get('status') as ShareStatus | null) || null
  const purpose = (params.get('purpose') as SharePurpose | null) || null
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const statusOf = (l: ShareLink) => shareStatus(l, now)
  const searched = state.shareLinks.filter((l) => terms.every((w) => `${l.recipientName} ${l.email} ${sharedWhat(state, l)}`.toLowerCase().includes(w)))
  const byPurpose = searched.filter((l) => !purpose || l.purpose === purpose)
  const statusCounts = countBy(byPurpose, statusOf)
  const purposeCounts = countBy(searched.filter((l) => !status || statusOf(l) === status), (l) => l.purpose)
  const rows = byPurpose.filter((l) => !status || statusOf(l) === status)
  const filters = [q, status, purpose].filter(Boolean).length

  const weekAgo = new Date(now - 7 * DAY).toISOString()
  const active = state.shareLinks.filter((l) => statusOf(l) === 'active')
  const openedThisWeek = new Set(state.shareEvents.filter((e) => e.kind === 'opened' && e.at >= weekAgo).map((e) => e.linkId)).size
  const expiringSoon = active.filter((l) => toMs(l.expiresAt) - now <= 7 * DAY).length
  const revoked = state.shareLinks.filter((l) => statusOf(l) === 'revoked').length

  const columns: Column<ShareLink>[] = [
    {
      id: 'recipient',
      header: 'Recipient',
      sortValue: (l) => l.recipientName,
      cell: (l) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{l.recipientName}</div>
          <div className="truncate text-xs text-muted">{l.email}</div>
        </div>
      ),
    },
    { id: 'what', header: 'Shared', hideBelow: 'md', sortValue: (l) => sharedWhat(state, l), cell: (l) => <span className="line-clamp-2 text-sm">{sharedWhat(state, l)}</span> },
    { id: 'purpose', header: 'Purpose', hideBelow: 'lg', sortValue: (l) => l.purpose, cell: (l) => <Badge variant="muted">{SHARE_PURPOSE_LABEL[l.purpose]}</Badge> },
    { id: 'status', header: 'Status', sortValue: statusOf, cell: (l) => <ShareStatusBadge link={l} /> },
    { id: 'expires', header: 'Expires', hideBelow: 'sm', sortValue: (l) => l.expiresAt, cell: (l) => <span className="whitespace-nowrap text-sm">{fmtDate(l.expiresAt)}</span> },
    {
      id: 'use',
      header: 'Opens · downloads',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (l) => shareSummary(state, l.id).opens,
      cell: (l) => {
        const s = shareSummary(state, l.id)
        return (
          <span className="text-sm">
            {s.opens} · {s.downloads}
          </span>
        )
      },
    },
    {
      id: 'seen',
      header: 'Last seen',
      hideBelow: 'xl',
      sortValue: (l) => shareSummary(state, l.id).lastSeen ?? '',
      cell: (l) => {
        const seen = shareSummary(state, l.id).lastSeen
        return <span className="whitespace-nowrap text-sm text-muted">{seen ? fmtAgo(seen) : 'Not yet'}</span>
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Share links"
        description="Links that send dataroom folders or files to people outside the company. Each recipient opens theirs with their email and a 6-digit code."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={<SearchBox value={q} onChange={(v) => set('q', v)} label="Search share links" placeholder="Recipient, email or folder" />}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Active" value={active.length} icon={<Link2 />} tone="ink" active={status === 'active'} onClick={() => set('status', status === 'active' ? null : 'active')} />
        <StatCard label="Opened this week" value={openedThisWeek} icon={<Eye />} hint="In the last 7 days" />
        <StatCard label="Expiring in 7 days" value={expiringSoon} icon={<CalendarClock />} tone={expiringSoon ? 'warning' : 'default'} />
        <StatCard label="Revoked" value={revoked} icon={<Ban />} active={status === 'revoked'} onClick={() => set('status', status === 'revoked' ? null : 'revoked')} />
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ChipRow className="flex-1">
            <Chip active={!status} count={byPurpose.length} onClick={() => set('status', null)}>
              All
            </Chip>
            {STATUSES.map((s) => (
              <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
                {SHARE_STATUS_LABEL[s]}
              </Chip>
            ))}
          </ChipRow>
          <FilterCaption shown={rows.length} total={state.shareLinks.length} filters={filters} onClear={() => clear()} />
        </div>
        <ChipRow aria-label="Purpose">
          {PURPOSES.map((p) => (
            <Chip key={p} variant="default" active={purpose === p} count={purposeCounts[p] ?? 0} onClick={() => set('purpose', purpose === p ? null : p)}>
              {SHARE_PURPOSE_LABEL[p]}
            </Chip>
          ))}
        </ChipRow>
      </div>
      <div className="mt-3">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(l) => l.id}
          rowLabel={(l) => l.recipientName}
          onRowClick={(l) => navigate(paths.shareLink(l.id))}
          initialSort={{ id: 'expires', desc: true }}
          resetPageKey={`${q}|${status}|${purpose}`}
          empty={filteredEmpty(
            filters,
            () => clear(),
            'share links',
            <EmptyState
              compact
              title="No share links yet"
              description="Open a folder in the dataroom and choose Share to send it to a notary, bank or buyer."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to={paths.dataroom}>Open the dataroom</Link>
                </Button>
              }
            />,
          )}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function ShareLinkPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [open, setOpen] = useState<'revoke' | 'extend' | null>(null)
  if (!can('dataroom.share')) return <NoAccess description="Share links need the dataroom.share permission. Ask an admin to add it to your role." />

  const l = state.shareLinks.find((x) => x.id === id)
  if (!l) {
    return (
      <Card>
        <EmptyState pageTitle title="Share link not found" description="The link may have been removed." action={<BackButton fallback={paths.shareLinks} />} />
      </Card>
    )
  }

  const status = shareStatus(l, now)
  const url = `${window.location.origin}${paths.sharePublic(l.token)}`
  const files = shareFiles(state, l)
  const events = shareEvents(state, l.id)
  const summary = shareSummary(state, l.id)
  const folder = l.folderId ? state.dataFolders.find((f) => f.id === l.folderId) : undefined
  const fileName = (fid: string | null) => (fid ? state.dataFiles.find((f) => f.id === fid)?.name : undefined)
  const revokeBlocker = blockerFor(state, { type: 'shareLinks/revoke', id: l.id })
  const close = (v: boolean) => !v && setOpen(null)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.shareLinks} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Kicker>Share link · {SHARE_PURPOSE_LABEL[l.purpose]}</Kicker>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{l.recipientName}</h1>
          <p className="mt-1 break-all text-sm text-muted">{l.email}</p>
        </div>
        {!l.revokedAt && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setOpen('extend')}>
              <CalendarPlus />
              Extend
            </Button>
            <Button variant="danger" disabled={!!revokeBlocker} title={revokeBlocker ?? undefined} onClick={() => setOpen('revoke')}>
              <Ban />
              Revoke
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <ShareStatusBadge link={l} />
            <Badge className="bg-white/10 text-white">{l.allowDownload ? 'View and download' : 'View only'}</Badge>
          </div>
          <div className="mt-5 text-xs text-on-ink-muted">Link</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-2xl bg-white/5 px-3 py-2.5 text-sm">{url}</code>
            <Button variant="onInk" size="icon" aria-label="Copy link" onClick={() => copyText(url, 'Link')}>
              <Copy />
            </Button>
          </div>
          <div className="mt-4 text-xs text-on-ink-muted">Access code</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded-2xl bg-white/5 px-3 py-2.5 text-xl font-bold tracking-[0.3em] tabular-nums">{l.code}</code>
            <Button variant="onInk" size="icon" aria-label="Copy access code" onClick={() => copyText(l.code, 'Code')}>
              <Copy />
            </Button>
          </div>
          <p className="mt-4 text-xs text-on-ink-muted">In production the recipient gets the code by email, apart from the link. The demo shows it here so you can open the link yourself.</p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
            {[
              ['Opens', summary.opens],
              ['Views', summary.views],
              ['Downloads', summary.downloads],
            ].map(([label, n]) => (
              <div key={label} className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-on-ink-muted">{label}</div>
                <div className="text-lg font-semibold tabular-nums">{n}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              items={[
                { label: 'Shared', value: folder ? <Link to={paths.dataFolder(folder.id)} className="font-semibold hover:underline">{folder.name}</Link> : sharedWhat(state, l) },
                { label: 'Purpose', value: SHARE_PURPOSE_LABEL[l.purpose] },
                { label: 'Expires', value: status === 'expired' ? `Expired ${fmtDate(l.expiresAt)}` : fmtDate(l.expiresAt) },
                { label: 'Revoked', value: l.revokedAt ? fmtDateTime(l.revokedAt) : '', hidden: !l.revokedAt },
                { label: 'Message', value: l.message || '–' },
                { label: 'Sent by', value: `${actorName(l.createdBy)} · ${fmtDate(l.createdAt)}` },
                { label: 'Last seen', value: summary.lastSeen ? fmtAgo(summary.lastSeen) : 'Not opened yet' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Files in this share ({files.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.length === 0 && <EmptyState compact title="No files" description="The shared folder is empty or its files were removed." />}
            {files.map((f) => (
              <Link
                key={f.id}
                to={paths.dataFile(f.id)}
                className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <FileGlyph file={f} className="bg-card" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{f.name}</span>
                  <span className="block text-xs text-muted">
                    Version {f.version} · <FileSize bytes={f.size} />
                  </span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access log</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className={e.kind === 'code_failed' || e.kind === 'revoked' ? 'mt-1.5 size-2 shrink-0 rounded-full bg-danger' : 'mt-1.5 size-2 shrink-0 rounded-full bg-silver'} />
                  <span className="min-w-0">
                    {SHARE_EVENT_LABEL[e.kind]}
                    {fileName(e.fileId) && <span className="text-muted">: {fileName(e.fileId)}</span>}
                    <span className="block text-xs text-muted">{fmtDateTime(e.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open === 'revoke'} onOpenChange={close} title="Revoke this link?" description={`${l.recipientName} can no longer open it. To share again, send a new link.`}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(null)}>
            Keep the link
          </Button>
          <Button
            variant="danger"
            onClick={() => act({ type: 'shareLinks/revoke', id: l.id }, 'Link revoked', `${l.recipientName} can no longer open it`) && setOpen(null)}
          >
            <Ban />
            Revoke
          </Button>
        </DialogFooter>
      </Dialog>
      <Dialog open={open === 'extend'} onOpenChange={close} title="Extend the link" description={`Pick a new expiry date, at most ${SHARE_MAX_DAYS} days from today.`}>
        {open === 'extend' && <ExtendForm link={l} onDone={() => setOpen(null)} />}
      </Dialog>
    </div>
  )
}

function ExtendForm({ link, onDone }: { link: ShareLink; onDone: () => void }) {
  const act = useAct()
  const today = nowIso()
  const min = toDateInput(addDays(today, 1))
  const max = toDateInput(addDays(today, SHARE_MAX_DAYS - 1))
  const suggested = toDateInput(addDays(toMs(link.expiresAt) > toMs(today) ? link.expiresAt : today, 14))
  const [value, setValue] = useState(suggested > max ? max : suggested)
  const [tried, setTried] = useState(false)
  const error = !value ? 'Pick a date.' : value < min ? 'Pick a date after today.' : value > max ? `A link can last ${SHARE_MAX_DAYS} days at most.` : null

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (error) return
        const expiresAt = fromDateInput(value)
        if (act({ type: 'shareLinks/extend', id: link.id, expiresAt }, 'Link extended', `It now expires on ${fmtDate(expiresAt)}`)) onDone()
      }}
    >
      <FormField label="New expiry date" required error={tried ? (error ?? undefined) : undefined} hint={`Now ${fmtDate(link.expiresAt)}`}>
        <Input type="date" min={min} max={max} value={value} onChange={(e) => setValue(e.target.value)} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">
          <CalendarPlus />
          Extend
        </Button>
      </DialogFooter>
    </form>
  )
}
