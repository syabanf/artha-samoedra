import {
  addDays,
  blockerFor,
  canSeeFolder,
  childFolders,
  countBy,
  currentVersion,
  DATAROOM_MAX_BYTES,
  DAY,
  fileVersions,
  filesIn,
  fmtDate,
  fmtDateTime,
  fmtFileSize,
  folderDepartments,
  folderPath,
  folderTreeIds,
  fromDateInput,
  newId,
  newShareCode,
  newShareToken,
  nowIso,
  SHARE_MAX_DAYS,
  shareFiles,
  toDateInput,
  toMs,
  type AppAction,
} from '@artha/fixtures'
import { SHARE_PURPOSE_LABEL, type DataFile, type DataFolder, type SharePurpose } from '@artha/types'
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
  cn,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  Switch,
  Textarea,
  toast,
  type Column,
} from '@artha/ui'
import { ChevronRight, Copy, Download, Folder, FolderInput, FolderOpen, FolderPlus, Link2, Pencil, Share2, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { SearchBox } from '../../components/SearchBox'
import { useSetParam } from '../../lib/useSetParam'
import { useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { FilterCaption, filteredEmpty } from '../../components/FilterCaption'
import { FileGlyph, FilePreview, FileSize, FolderSelect, ShareStatusBadge } from './parts'

type FileKind = 'pdf' | 'word' | 'image' | 'other'
const KIND_LABEL: Record<FileKind, string> = { pdf: 'PDF', word: 'Word', image: 'Images', other: 'Other' }
const kindOf = (mime: string): FileKind => (mime === 'application/pdf' ? 'pdf' : /word/.test(mime) ? 'word' : mime.startsWith('image/') ? 'image' : 'other')

/** Who may see and change what: the folder rules plus the three dataroom permissions. */
function useAccess() {
  const { state } = useScoped()
  const user = useUser()
  const { can } = useAuth()
  const manage = can('dataroom.manage')
  const sees = (id: string) => canSeeFolder(state, user.id, id, manage)
  return { manage, share: can('dataroom.share'), sees, visibleChildren: (parentId: string | null) => childFolders(state, parentId).filter((f) => sees(f.id)) }
}

/** Newest version in the chain the file belongs to. */
const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const copy = (text: string, what: string) => {
  navigator.clipboard?.writeText(text)
  toast(`${what} copied`, { tone: 'success' })
}

// ---------------------------------------------------------------- folder page

export function DataroomPage() {
  const { id } = useParams()
  // A fresh view per folder, so a file selection never leaks into the next folder.
  return <FolderView key={id ?? 'root'} id={id ?? null} />
}

type FolderDialog = 'new' | 'edit' | 'remove' | 'upload' | null
type ShareTarget = { folder: DataFolder } | { files: DataFile[] }

function FolderView({ id }: { id: string | null }) {
  const { state, actorName } = useScoped()
  const access = useAccess()
  const { params, set, clear } = useSetParam()
  const [dialog, setDialog] = useState<FolderDialog>(null)
  const [moving, setMoving] = useState<DataFile | null>(null)
  const [sharing, setSharing] = useState<ShareTarget | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const q = params.get('q') ?? ''
  const kind = (params.get('type') ?? '') as FileKind | ''

  const folder = id ? state.dataFolders.find((f) => f.id === id) : undefined
  if (id && !folder) {
    return (
      <div>
        <PageHeader title="Folder not found" />
        <Card>
          <EmptyState title="This folder is gone" description="Someone may have removed it or moved its files elsewhere." action={<Button variant="outline" asChild><Link to={paths.dataroom}>Open the dataroom</Link></Button>} />
        </Card>
      </div>
    )
  }
  if (folder && !access.sees(folder.id)) {
    return (
      <div>
        <PageHeader title="Restricted folder" />
        <NoAccess description="Your department is not on this folder's access list. Ask a dataroom manager to add it." />
      </div>
    )
  }

  // At the root the table lists every file you may open; inside a folder, its own files, or its whole tree while searching.
  const scopeFolders = folder ? (q ? folderTreeIds(state, folder.id).filter(access.sees) : [folder.id]) : state.dataFolders.map((f) => f.id).filter(access.sees)
  const scope = new Set(scopeFolders)
  const all = state.dataFiles.filter((f) => !f.replacedBy && scope.has(f.folderId))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = all.filter((f) => terms.every((w) => `${f.name} ${f.note}`.toLowerCase().includes(w)))
  const kindCounts = countBy(searched, (f) => kindOf(f.mime))
  const rows = searched.filter((f) => !kind || kindOf(f.mime) === kind)
  const filters = [q, kind].filter(Boolean).length
  const showFolder = !folder || !!q
  const pickedFiles = rows.filter((f) => picked.includes(f.id))
  const togglePick = (fid: string) => setPicked(picked.includes(fid) ? picked.filter((x) => x !== fid) : [...picked, fid])
  const folderName = (fid: string) => state.dataFolders.find((f) => f.id === fid)?.name ?? 'Unknown folder'

  const columns: Column<DataFile>[] = [
    ...(access.share
      ? [
          {
            id: 'pick',
            header: <span className="sr-only">Select</span>,
            width: '40px',
            cell: (f: DataFile) => <Checkbox checked={picked.includes(f.id)} onCheckedChange={() => togglePick(f.id)} label={`Select ${f.name}`} />,
          },
        ]
      : []),
    {
      id: 'name',
      header: 'Name',
      sortValue: (f) => f.name,
      cell: (f) => (
        <div className="flex min-w-0 max-w-72 items-center gap-3">
          <FileGlyph file={f} className="size-9" />
          <div className="min-w-0">
            <Link to={paths.dataFile(f.id)} className="block truncate font-semibold hover:text-accent">
              {f.name}
            </Link>
            {showFolder && <div className="truncate text-xs text-muted">{folderName(f.folderId)}</div>}
          </div>
        </div>
      ),
    },
    { id: 'version', header: 'Version', hideBelow: 'sm', sortValue: (f) => f.version, cell: (f) => <span className="tabular-nums">v{f.version}</span> },
    { id: 'size', header: 'Size', align: 'right', hideBelow: 'sm', sortValue: (f) => f.size, cell: (f) => <FileSize bytes={f.size} /> },
    { id: 'by', header: 'Uploaded by', hideBelow: 'md', sortValue: (f) => actorName(f.uploadedBy), cell: (f) => actorName(f.uploadedBy) },
    { id: 'at', header: 'Date', hideBelow: 'md', sortValue: (f) => f.uploadedAt, cell: (f) => <span className="whitespace-nowrap">{fmtDate(f.uploadedAt)}</span> },
    ...(access.manage
      ? [
          {
            id: 'move',
            header: <span className="sr-only">Move</span>,
            cell: (f: DataFile) => (
              <Button variant="outline" size="sm" aria-label={`Move ${f.name}`} onClick={() => setMoving(f)}>
                <FolderInput />
                <span className="hidden sm:inline">Move</span>
              </Button>
            ),
          },
        ]
      : []),
  ]

  const removeBlocker = folder ? blockerFor(state, { type: 'folders/remove', id: folder.id }) : null

  return (
    <div>
      {folder && <Breadcrumbs folder={folder} />}
      <PageHeader
        title={folder?.name ?? 'Dataroom'}
        description={folder ? folder.description || undefined : 'Property, legal, HR and finance files in one place. You see the folders your department may open.'}
        actions={
          <>
            {folder && access.share && (
              <Button variant="outline" onClick={() => setSharing({ folder })}>
                <Share2 />
                Share folder
              </Button>
            )}
            {access.manage && (
              <Button variant="outline" onClick={() => setDialog('new')}>
                <FolderPlus />
                New folder
              </Button>
            )}
            {folder && access.manage && (
              <>
                <Button variant="outline" onClick={() => setDialog('edit')}>
                  <Pencil />
                  Edit
                </Button>
                <Button variant="danger" disabled={!!removeBlocker} title={removeBlocker ?? undefined} onClick={() => setDialog('remove')}>
                  <Trash2 />
                  Remove
                </Button>
                <Button onClick={() => setDialog('upload')}>
                  <Upload />
                  Upload
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="hidden h-fit p-3 lg:block">
          <nav aria-label="Folders">
            <Link to={paths.dataroom} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold hover:bg-surface', !folder && 'bg-surface text-accent')}>
              <FolderOpen className="size-4 shrink-0" />
              All folders
            </Link>
            <FolderTree parentId={null} currentId={folder?.id ?? null} />
          </nav>
        </Card>

        <div className="min-w-0 space-y-4">
          <JumpToFolder currentId={folder?.id ?? ''} />
          {folder && <FolderFacts folder={folder} />}
          <SubfolderCards parentId={folder?.id ?? null} />
          {!folder && <LinkedFoldersCard />}

          <section aria-labelledby="files-title" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="files-title" className="text-base font-semibold">
                {folder ? (q ? 'Files in this folder and below' : 'Files') : 'All files you can open'}
              </h2>
              <SearchBox value={q} onChange={(v) => set('q', v)} label="Search files" placeholder="File name or note" />
            </div>
            <ChipRow>
              <Chip active={!kind} count={searched.length} onClick={() => set('type', null)}>
                All
              </Chip>
              {(Object.keys(KIND_LABEL) as FileKind[])
                .filter((k) => kindCounts[k] || kind === k)
                .map((k) => (
                  <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('type', kind === k ? null : k)}>
                    {KIND_LABEL[k]}
                  </Chip>
                ))}
            </ChipRow>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              {pickedFiles.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{pickedFiles.length} selected</span>
                  <Button size="sm" onClick={() => setSharing({ files: pickedFiles })}>
                    <Share2 />
                    Share files
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
                    Clear selection
                  </Button>
                </div>
              ) : (
                <span />
              )}
              <FilterCaption shown={rows.length} total={all.length} filters={filters} onClear={() => clear()} />
            </div>
            <div className="mt-2">
              <DataTable
                rows={rows}
                columns={columns}
                getRowKey={(f) => f.id}
                rowLabel={(f) => f.name}
                initialSort={folder ? { id: 'name', desc: false } : { id: 'at', desc: true }}
                resetPageKey={`${q}|${kind}`}
                pageSize={15}
                empty={filteredEmpty(
                  filters,
                  () => clear(),
                  'files',
                  <EmptyState compact icon={<Folder />} title="No files here yet" description={folder && access.manage ? 'Upload the first file with the Upload button.' : 'Files appear here once someone uploads them.'} />,
                )}
              />
            </div>
          </section>
        </div>
      </div>

      {access.manage && (
        <>
          <Dialog open={dialog === 'new' || dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)} size="lg" title={dialog === 'edit' ? `Edit ${folder?.name}` : 'New folder'} description="Departments decide who opens the folder. Dataroom managers see every folder.">
            {(dialog === 'new' || dialog === 'edit') && <FolderForm editing={dialog === 'edit' ? (folder ?? null) : null} parentId={folder?.id ?? null} onDone={() => setDialog(null)} />}
          </Dialog>
          <Dialog open={dialog === 'upload'} onOpenChange={(o) => !o && setDialog(null)} title="Upload a file" description={`Files up to ${fmtFileSize(DATAROOM_MAX_BYTES)}. A file with the same name in the folder becomes its next version.`}>
            {dialog === 'upload' && folder && <UploadForm folderId={folder.id} onDone={() => setDialog(null)} />}
          </Dialog>
          {folder && <RemoveFolderDialog open={dialog === 'remove'} onOpenChange={(o) => !o && setDialog(null)} folder={folder} />}
          <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)} title={moving ? `Move ${moving.name}` : 'Move file'} description="The file moves with all its older versions.">
            {moving && <MoveForm file={moving} onDone={() => setMoving(null)} />}
          </Dialog>
        </>
      )}
      {access.share && <ShareDialog target={sharing} onClose={() => setSharing(null)} onCreated={() => setPicked([])} />}
    </div>
  )
}

function Breadcrumbs({ folder }: { folder: DataFolder }) {
  const { state } = useScoped()
  const trail = folderPath(state, folder.id)
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted">
      <Link to={paths.dataroom} className="font-semibold hover:text-accent">
        Dataroom
      </Link>
      {trail.map((f) => (
        <span key={f.id} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3.5 shrink-0" />
          {f.id === folder.id ? (
            <span aria-current="page" className="truncate font-semibold text-foreground">
              {f.name}
            </span>
          ) : (
            <Link to={paths.dataFolder(f.id)} className="truncate hover:text-accent">
              {f.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}

function FolderTree({ parentId, currentId }: { parentId: string | null; currentId: string | null }) {
  const { visibleChildren } = useAccess()
  const folders = visibleChildren(parentId)
  if (!folders.length) return null
  return (
    <ul className={cn('space-y-0.5', parentId && 'ml-3 border-l border-border pl-2')}>
      {folders.map((f) => (
        <li key={f.id}>
          <Link
            to={paths.dataFolder(f.id)}
            aria-current={f.id === currentId ? 'page' : undefined}
            className={cn('flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-surface', f.id === currentId && 'bg-surface font-semibold text-accent')}
          >
            <Folder className="size-4 shrink-0 text-muted" />
            <span className="truncate">{f.name}</span>
          </Link>
          <FolderTree parentId={f.id} currentId={currentId} />
        </li>
      ))}
    </ul>
  )
}

/** The folder tree as a select below lg, where the tree card is hidden. */
function JumpToFolder({ currentId }: { currentId: string }) {
  const navigate = useNavigate()
  return (
    <div className="lg:hidden">
      <FolderSelect aria-label="Go to folder" placeholder="All folders" value={currentId} onChange={(fid) => navigate(fid ? paths.dataFolder(fid) : paths.dataroom)} />
    </div>
  )
}

function FolderFacts({ folder }: { folder: DataFolder }) {
  const { state, listingCode } = useScoped()
  const deps = folderDepartments(state, folder.id)
  const inherited = !folder.departmentIds.length && deps.length > 0
  const deal = folder.dealId ? state.deals.find((d) => d.id === folder.dealId) : undefined
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted">Open to</span>
      {deps.length ? (
        deps.map((d) => (
          <Badge key={d} variant="outline">
            {state.departments.find((x) => x.id === d)?.name ?? d}
          </Badge>
        ))
      ) : (
        <Badge variant="outline">Everyone with dataroom access</Badge>
      )}
      {inherited && <span className="text-muted">(from the parent folder)</span>}
      {folder.listingId && (
        <Link to={paths.listing(folder.listingId)} className="ml-2 font-semibold text-accent hover:underline">
          Listing {listingCode(folder.listingId)}
        </Link>
      )}
      {deal && (
        <Link to={paths.deal(deal.id)} className="ml-2 font-semibold text-accent hover:underline">
          Deal {deal.code}
        </Link>
      )}
    </div>
  )
}

function SubfolderCards({ parentId }: { parentId: string | null }) {
  const { state } = useScoped()
  const { sees, visibleChildren } = useAccess()
  const folders = visibleChildren(parentId)
  if (!folders.length) return null
  const statsOf = (id: string) => {
    const ids = new Set(folderTreeIds(state, id).filter(sees))
    const files = state.dataFiles.filter((f) => ids.has(f.folderId) && !f.replacedBy)
    return { files: files.length, bytes: files.reduce((n, f) => n + f.size, 0), updatedAt: files.reduce<string | null>((m, f) => (!m || f.uploadedAt > m ? f.uploadedAt : m), null) }
  }
  return (
    <section aria-labelledby="folders-title">
      <h2 id="folders-title" className="mb-2 text-base font-semibold">
        {parentId ? 'Subfolders' : 'Folders'}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((f) => {
          const st = statsOf(f.id)
          return (
            <Link key={f.id} to={paths.dataFolder(f.id)} className="group min-w-0 rounded-card bg-card p-4 shadow-card transition-colors hover:bg-surface">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Folder className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold group-hover:text-accent">{f.name}</div>
                  <div className="text-xs text-muted tabular-nums">
                    {st.files} {st.files === 1 ? 'file' : 'files'} · {fmtFileSize(st.bytes)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted">{st.updatedAt ? `Updated ${fmtDate(st.updatedAt)}` : 'No files yet'}</div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/** Root view: folders tied to a listing or a deal, with links to those records. */
function LinkedFoldersCard() {
  const { state, listingCode } = useScoped()
  const { sees } = useAccess()
  const linked = state.dataFolders.filter((f) => (f.listingId || f.dealId) && sees(f.id))
  if (!linked.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Folders for listings and deals</CardTitle>
        <p className="text-xs text-muted">Agents also reach these from the listing or deal page.</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {linked.map((f) => {
            const deal = f.dealId ? state.deals.find((d) => d.id === f.dealId) : undefined
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                <Link to={paths.dataFolder(f.id)} className="flex min-w-0 flex-1 items-center gap-2 font-semibold hover:text-accent">
                  <Folder className="size-4 shrink-0 text-muted" />
                  <span className="truncate">{f.name}</span>
                </Link>
                <span className="flex flex-wrap gap-3 text-xs">
                  {f.listingId && (
                    <Link to={paths.listing(f.listingId)} className="font-semibold text-accent hover:underline">
                      Listing {listingCode(f.listingId)}
                    </Link>
                  )}
                  {deal && (
                    <Link to={paths.deal(deal.id)} className="font-semibold text-accent hover:underline">
                      Deal {deal.code}
                    </Link>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- folder dialogs

function FolderForm({ editing, parentId, onDone }: { editing: DataFolder | null; parentId: string | null; onDone: () => void }) {
  const { state } = useScoped()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    parentId: editing ? (editing.parentId ?? '') : (parentId ?? ''),
    departmentIds: editing?.departmentIds ?? [],
    listingId: editing?.listingId ?? '',
    dealId: editing?.dealId ?? '',
  })
  const folder: DataFolder = {
    id: editing?.id ?? newId('fld'),
    name: f.name,
    description: f.description.trim(),
    parentId: f.parentId || null,
    departmentIds: f.departmentIds,
    listingId: f.listingId || null,
    dealId: f.dealId || null,
    createdBy: editing?.createdBy ?? user.id,
    createdAt: editing?.createdAt ?? nowIso(),
  }
  const blocker = blockerFor(state, { type: 'folders/upsert', folder })
  const nameError = tried && !f.name.trim() ? 'Name the folder.' : undefined
  const toggleDep = (id: string) => setF({ ...f, departmentIds: f.departmentIds.includes(id) ? f.departmentIds.filter((d) => d !== id) : [...f.departmentIds, id] })
  const inherited = f.parentId ? folderDepartments(state, f.parentId) : []
  const depName = (id: string) => state.departments.find((d) => d.id === id)?.name ?? id

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (blocker) return
    if (act({ type: 'folders/upsert', folder }, editing ? 'Folder saved' : 'Folder created', folder.name.trim())) {
      onDone()
      if (!editing) navigate(paths.dataFolder(folder.id))
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField label="Name" required error={nameError}>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="AS-0012 Kemang house" />
      </FormField>
      <FormField label="Description">
        <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-20" placeholder="What goes in this folder" />
      </FormField>
      <FormField label="Inside">
        <FolderSelect value={f.parentId} onChange={(v) => setF({ ...f, parentId: v })} placeholder="Top level" exclude={editing?.id} />
      </FormField>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Departments that open it</legend>
        <p className="mb-2 text-xs text-muted">
          {f.departmentIds.length
            ? 'Only these departments and dataroom managers open the folder.'
            : inherited.length
              ? `None picked, so it follows the parent folder: ${inherited.map(depName).join(', ')}.`
              : 'None picked, so everyone with dataroom access opens it.'}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {state.departments.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
              <Checkbox checked={f.departmentIds.includes(d.id)} onCheckedChange={() => toggleDep(d.id)} label={d.name} />
              <span className="truncate">{d.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Listing" hint="Optional">
          <NativeSelect value={f.listingId} onChange={(e) => setF({ ...f, listingId: e.target.value })}>
            <option value="">No listing</option>
            {state.listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {l.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Deal" hint="Optional">
          <NativeSelect value={f.dealId} onChange={(e) => setF({ ...f, dealId: e.target.value })}>
            <option value="">No deal</option>
            {state.deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} {d.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {tried && blocker && !nameError && <p className="text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save folder' : 'Create folder'}</Button>
      </DialogFooter>
    </form>
  )
}

function RemoveFolderDialog({ open, onOpenChange, folder }: { open: boolean; onOpenChange: (o: boolean) => void; folder: DataFolder }) {
  const act = useAct()
  const navigate = useNavigate()
  const remove = () => {
    if (act({ type: 'folders/remove', id: folder.id }, 'Folder removed', folder.name)) {
      onOpenChange(false)
      navigate(folder.parentId ? paths.dataFolder(folder.parentId) : paths.dataroom)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={`Remove ${folder.name}?`} description="The folder is empty, so nothing else goes with it. This cannot be undone.">
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Keep folder
        </Button>
        <Button variant="danger" onClick={remove}>
          <Trash2 />
          Remove folder
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// ---------------------------------------------------------------- file dialogs

/** Upload into a folder. With `versionOf`, the upload takes that file's name so the store files it as the next version. */
function UploadForm({ folderId, versionOf, onDone }: { folderId: string; versionOf?: DataFile; onDone: (uploadedId?: string) => void }) {
  const { state } = useScoped()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [picked, setPicked] = useState<{ name: string; mime: string; size: number; dataUrl: string } | null>(null)
  const [target, setTarget] = useState(folderId)
  const [note, setNote] = useState('')
  const name = versionOf?.name ?? picked?.name ?? ''
  const file: DataFile = {
    id: newId('dfl'),
    folderId: target,
    name,
    mime: picked?.mime || 'application/octet-stream',
    size: picked?.size ?? 0,
    dataUrl: picked?.dataUrl ?? null,
    version: 1,
    replacedBy: null,
    note: note.trim(),
    uploadedBy: user.id,
    uploadedAt: nowIso(),
  }
  const blocker = picked ? blockerFor(state, { type: 'dataFiles/upload', file }) : 'Choose a file to upload.'
  const replaces = name ? filesIn(state, target).find((f) => f.name.toLowerCase() === name.trim().toLowerCase()) : undefined

  const choose = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0]
    if (!chosen) return setPicked(null)
    // Oversized files keep their size so the store's 1 MB rule shows, without reading them.
    const dataUrl = chosen.size > DATAROOM_MAX_BYTES ? 'data:,' : await readDataUrl(chosen)
    setPicked({ name: chosen.name, mime: chosen.type, size: chosen.size, dataUrl })
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (blocker) return
    if (act({ type: 'dataFiles/upload', file }, replaces ? `Version ${replaces.version + 1} uploaded` : 'File uploaded', name)) onDone(file.id)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {!versionOf && (
        <FormField label="Folder" required>
          <FolderSelect value={target} onChange={setTarget} />
        </FormField>
      )}
      <FormField label="File" required error={tried && blocker ? blocker : undefined} hint={versionOf ? `Saved as ${versionOf.name}, whatever the picked file is called.` : undefined}>
        <Input type="file" onChange={(e) => void choose(e.currentTarget)} />
      </FormField>
      {picked && (
        <p className="text-sm text-muted">
          {fmtFileSize(picked.size)}
          {replaces ? ` · replaces version ${replaces.version} as version ${replaces.version + 1}` : ' · a new file in this folder'}
        </p>
      )}
      <FormField label="Note" hint="Optional. Say what changed or where the original is.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit">
          <Upload />
          Upload
        </Button>
      </DialogFooter>
    </form>
  )
}

function MoveForm({ file, onDone }: { file: DataFile; onDone: () => void }) {
  const { state } = useScoped()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [folderId, setFolderId] = useState('')
  const action: AppAction = { type: 'dataFiles/move', id: file.id, folderId }
  const blocker = blockerFor(state, action)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (blocker) return
    if (act(action, 'File moved', `${file.name} is now in ${state.dataFolders.find((f) => f.id === folderId)?.name}`)) onDone()
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField label="Move to" required error={tried && blocker ? blocker : undefined}>
        <FolderSelect value={folderId} onChange={setFolderId} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">
          <FolderInput />
          Move file
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- share dialog

function ShareDialog({ target, onClose, onCreated }: { target: ShareTarget | null; onClose: () => void; onCreated?: () => void }) {
  const [created, setCreated] = useState<{ token: string; code: string; email: string } | null>(null)
  const close = () => {
    setCreated(null)
    onClose()
  }
  const what = !target ? '' : 'folder' in target ? target.folder.name : target.files.length === 1 ? target.files[0]!.name : `${target.files.length} files`
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={created ? 'Link ready to send' : `Share ${what}`}
      description={created ? 'Send the link and the code separately. In production the code goes to the recipient by email.' : 'The recipient opens the link with their email and a 6-digit code.'}
    >
      {target && !created && (
        <ShareForm
          target={target}
          onCancel={close}
          onCreated={(c) => {
            setCreated(c)
            onCreated?.()
          }}
        />
      )}
      {created && <ShareResult {...created} onClose={close} />}
    </Dialog>
  )
}

function ShareForm({ target, onCancel, onCreated }: { target: ShareTarget; onCancel: () => void; onCreated: (c: { token: string; code: string; email: string }) => void }) {
  const { state } = useScoped()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const today = toDateInput(nowIso())
  const [f, setF] = useState({ recipientName: '', email: '', purpose: 'buyer' as SharePurpose, message: '', expires: toDateInput(addDays(nowIso(), 14)), allowDownload: true })
  const [secret] = useState(() => ({ token: newShareToken(), code: newShareCode(), id: newId('shr') }))
  // The link lasts whole days from now, so 90 days on the picker is exactly the store's limit.
  const days = f.expires ? Math.round((toMs(fromDateInput(f.expires)) - toMs(fromDateInput(today))) / DAY) : 0
  const action: AppAction = {
    type: 'shareLinks/create',
    link: {
      id: secret.id,
      token: secret.token,
      code: secret.code,
      folderId: 'folder' in target ? target.folder.id : null,
      fileIds: 'files' in target ? target.files.map((x) => x.id) : [],
      recipientName: f.recipientName.trim(),
      email: f.email.trim(),
      purpose: f.purpose,
      message: f.message.trim(),
      allowDownload: f.allowDownload,
      expiresAt: addDays(nowIso(), days),
      revokedAt: null,
      createdBy: user.id,
      createdAt: nowIso(),
    },
  }
  const blocker = blockerFor(state, action)
  const errors = tried
    ? {
        recipientName: f.recipientName.trim() ? undefined : 'Enter who receives the link.',
        email: /^\S+@\S+\.\S+$/.test(f.email.trim()) ? undefined : 'Enter a valid email.',
        expires: days <= 0 ? 'Pick a date after today.' : days > SHARE_MAX_DAYS ? `A link can last ${SHARE_MAX_DAYS} days at most.` : undefined,
      }
    : {}
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (blocker) return
    if (act(action, 'Share link created', `For ${f.recipientName.trim()}`)) onCreated({ token: secret.token, code: secret.code, email: f.email.trim() })
  }
  const fieldError = Object.values(errors).some(Boolean)

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {'files' in target && (
        <ul className="max-h-32 space-y-1 overflow-y-auto rounded-2xl bg-surface p-3 text-sm">
          {target.files.map((x) => (
            <li key={x.id} className="truncate">
              {x.name}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Recipient name" required error={errors.recipientName}>
          <Input value={f.recipientName} onChange={(e) => setF({ ...f, recipientName: e.target.value })} placeholder="Notaris Dewi Anggraini" />
        </FormField>
        <FormField label="Email" required error={errors.email}>
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.com" />
        </FormField>
        <FormField label="Purpose">
          <NativeSelect value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value as SharePurpose })}>
            {(Object.keys(SHARE_PURPOSE_LABEL) as SharePurpose[]).map((p) => (
              <option key={p} value={p}>
                {SHARE_PURPOSE_LABEL[p]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Expires on" required error={errors.expires} hint={`Up to ${SHARE_MAX_DAYS} days from today.`}>
          <Input type="date" value={f.expires} min={toDateInput(addDays(nowIso(), 1))} max={toDateInput(addDays(nowIso(), SHARE_MAX_DAYS))} onChange={(e) => setF({ ...f, expires: e.target.value })} />
        </FormField>
      </div>
      <FormField label="Message" hint="Optional. The recipient reads it when they open the link.">
        <Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className="min-h-20" />
      </FormField>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
        <div>
          <div className="font-semibold">Allow download</div>
          <div className="text-xs text-muted">Off means the recipient can only view the files.</div>
        </div>
        <Switch checked={f.allowDownload} onCheckedChange={(v) => setF({ ...f, allowDownload: v })} label="Allow download" />
      </div>
      {tried && blocker && !fieldError && <p className="text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          <Link2 />
          Create link
        </Button>
      </DialogFooter>
    </form>
  )
}

function ShareResult({ token, code, email, onClose }: { token: string; code: string; email: string; onClose: () => void }) {
  const url = `${window.location.origin}${paths.sharePublic(token)}`
  const row = (label: string, value: string, what: string, mono?: boolean) => (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{label}</div>
        <div className={cn('truncate font-semibold', mono && 'font-mono tracking-wider')}>{value}</div>
      </div>
      <Button variant="outline" size="sm" onClick={() => copy(value, what)}>
        <Copy />
        Copy
      </Button>
    </div>
  )
  return (
    <div className="space-y-3">
      {row('Link', url, 'Link')}
      {row(`Code for ${email}`, code, 'Code', true)}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

// ---------------------------------------------------------------- file page

export function DataFilePage() {
  const { id = '' } = useParams()
  const { state, actorName } = useScoped()
  const access = useAccess()
  const act = useAct()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'version' | 'move' | 'remove' | 'share' | null>(null)

  const file = state.dataFiles.find((f) => f.id === id)
  if (!file) {
    return (
      <div>
        <BackButton fallback={paths.dataroom} />
        <PageHeader title="File not found" className="mt-4" />
        <Card>
          <EmptyState title="This file is gone" description="Someone may have removed it." action={<Button variant="outline" asChild><Link to={paths.dataroom}>Open the dataroom</Link></Button>} />
        </Card>
      </div>
    )
  }
  if (!access.sees(file.folderId)) {
    return (
      <div>
        <BackButton fallback={paths.dataroom} />
        <PageHeader title="Restricted file" className="mt-4" />
        <NoAccess description="Your department is not on this file's folder access list." />
      </div>
    )
  }

  const current = currentVersion(state, file.id) ?? file
  const versions = fileVersions(state, current.id)
  const versionIds = new Set(versions.map((v) => v.id))
  const isCurrent = current.id === file.id
  const folder = state.dataFolders.find((f) => f.id === file.folderId)
  const links = state.shareLinks.filter((l) => shareFiles(state, l).some((f) => versionIds.has(f.id)))
  const removeBlocker = blockerFor(state, { type: 'dataFiles/remove', id: current.id })
  const remove = () => {
    if (act({ type: 'dataFiles/remove', id: current.id }, 'File removed', `${current.name} and its older versions`)) navigate(paths.dataFolder(current.folderId))
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.dataFolder(file.folderId)} />
      {folder && <Breadcrumbs folder={folder} />}
      <PageHeader
        className="mb-0"
        title={file.name}
        description={
          <>
            Version {file.version}
            {!isCurrent && (
              <>
                {' '}
                · an older version.{' '}
                <Link to={paths.dataFile(current.id)} className="font-semibold text-accent hover:underline">
                  Open version {current.version}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            {file.dataUrl && (
              <Button variant="outline" asChild>
                <a href={file.dataUrl} download={file.name}>
                  <Download />
                  Download
                </a>
              </Button>
            )}
            {access.share && isCurrent && (
              <Button variant="outline" onClick={() => setDialog('share')}>
                <Share2 />
                Share
              </Button>
            )}
            {access.manage && isCurrent && (
              <>
                <Button variant="outline" onClick={() => setDialog('move')}>
                  <FolderInput />
                  Move
                </Button>
                <Button variant="danger" disabled={!!removeBlocker} title={removeBlocker ?? undefined} onClick={() => setDialog('remove')}>
                  <Trash2 />
                  Remove
                </Button>
                <Button onClick={() => setDialog('version')}>
                  <Upload />
                  New version
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card variant="soft" className="p-4 sm:p-6">
          <FilePreview file={file} />
          {!file.dataUrl && <p className="mt-3 text-center text-xs text-muted">The demo keeps no content for seeded files, so this is a stand-in page.</p>}
        </Card>
        <div className="min-w-0 space-y-4">
          <KeyValue
            items={[
              { label: 'Folder', value: folder ? <Link to={paths.dataFolder(folder.id)} className="font-semibold hover:text-accent">{folder.name}</Link> : 'Unknown folder' },
              { label: 'Type', value: KIND_LABEL[kindOf(file.mime)] },
              { label: 'Size', value: <FileSize bytes={file.size} /> },
              { label: 'Uploaded by', value: actorName(file.uploadedBy) },
              { label: 'Uploaded', value: fmtDateTime(file.uploadedAt) },
              { label: 'Note', value: file.note, hidden: !file.note },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Versions ({versions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {v.id === file.id ? <span className="font-semibold">Version {v.version}</span> : <Link to={paths.dataFile(v.id)} className="font-semibold hover:text-accent">Version {v.version}</Link>}
                        {v.id === current.id && <Badge variant="success">Current</Badge>}
                        {v.id === file.id && v.id !== current.id && <Badge variant="muted">Viewing</Badge>}
                      </div>
                      <div className="text-xs text-muted">
                        {actorName(v.uploadedBy)} · {fmtDate(v.uploadedAt)} · {fmtFileSize(v.size)}
                      </div>
                      {v.note && <div className="mt-0.5 text-xs">{v.note}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Share links ({links.length})</CardTitle>
              <p className="text-xs text-muted">Links that send this file, on its own or with its folder.</p>
            </CardHeader>
            <CardContent>
              {links.length === 0 ? (
                <EmptyState compact icon={<Link2 />} title="Not shared yet" description={access.share && isCurrent ? 'Share it with a buyer, notary or bank with the Share button.' : undefined} />
              ) : (
                <ul className="divide-y divide-border">
                  {links.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        {access.share ? (
                          <Link to={paths.shareLink(l.id)} className="block truncate font-semibold hover:text-accent">
                            {l.recipientName}
                          </Link>
                        ) : (
                          <div className="truncate font-semibold">{l.recipientName}</div>
                        )}
                        <div className="text-xs text-muted">
                          {SHARE_PURPOSE_LABEL[l.purpose]} · {l.folderId ? 'whole folder' : 'picked files'} · expires {fmtDate(l.expiresAt)}
                        </div>
                      </div>
                      <ShareStatusBadge link={l} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {access.manage && (
        <>
          <Dialog open={dialog === 'version'} onOpenChange={(o) => !o && setDialog(null)} title={`New version of ${current.name}`} description={`Files up to ${fmtFileSize(DATAROOM_MAX_BYTES)}. Version ${current.version} stays in the history.`}>
            {dialog === 'version' && (
              <UploadForm
                folderId={current.folderId}
                versionOf={current}
                onDone={(uploadedId) => {
                  setDialog(null)
                  if (uploadedId) navigate(paths.dataFile(uploadedId))
                }}
              />
            )}
          </Dialog>
          <Dialog open={dialog === 'move'} onOpenChange={(o) => !o && setDialog(null)} title={`Move ${current.name}`} description="The file moves with all its older versions.">
            {dialog === 'move' && <MoveForm file={current} onDone={() => setDialog(null)} />}
          </Dialog>
          <Dialog open={dialog === 'remove'} onOpenChange={(o) => !o && setDialog(null)} size="sm" title={`Remove ${current.name}?`} description={`This removes all ${versions.length} ${versions.length === 1 ? 'version' : 'versions'}. It cannot be undone.`}>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Keep file
              </Button>
              <Button variant="danger" onClick={remove}>
                <Trash2 />
                Remove file
              </Button>
            </DialogFooter>
          </Dialog>
        </>
      )}
      {access.share && <ShareDialog target={dialog === 'share' ? { files: [current] } : null} onClose={() => setDialog(null)} />}
    </div>
  )
}

