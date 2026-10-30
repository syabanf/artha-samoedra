import { canSeeFolder, childFolders, fmtFileSize, nowMs, shareStatus } from '@artha/fixtures'
import { SHARE_STATUS_LABEL, type DataFile, type ShareLink, type ShareStatus } from '@artha/types'
import { Badge, cn, NativeSelect, type BadgeVariant } from '@artha/ui'
import { FileImage, FileSpreadsheet, FileText, FileType2, type LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useAuth, useUser } from '../../auth/auth'
import { useScoped } from '../../state/store'

const ICONS: [RegExp, LucideIcon][] = [
  [/^image\//, FileImage],
  [/sheet|excel|csv/, FileSpreadsheet],
  [/word/, FileType2],
]
export const fileIcon = (mime: string) => ICONS.find(([re]) => re.test(mime))?.[1] ?? FileText

/** File type icon on a soft tile. */
export function FileGlyph({ file, className }: { file: Pick<DataFile, 'mime'>; className?: string }) {
  const Icon = fileIcon(file.mime)
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted', className)}>
      <Icon className="size-5" />
    </span>
  )
}

export const FileSize = ({ bytes }: { bytes: number }) => <span className="whitespace-nowrap tabular-nums">{fmtFileSize(bytes)}</span>

const SHARE: Record<ShareStatus, BadgeVariant> = { active: 'success', expired: 'muted', revoked: 'danger' }
export function ShareStatusBadge({ link }: { link: ShareLink }) {
  const st = shareStatus(link, nowMs())
  return (
    <Badge variant={SHARE[st]} dot={st === 'active'}>
      {SHARE_STATUS_LABEL[st]}
    </Badge>
  )
}

/** Folders the user may open, indented by depth. `exclude` hides a folder and its subtree (moving a folder into itself). */
export function FolderSelect({
  value,
  onChange,
  placeholder = 'Pick a folder',
  exclude,
  ...props
}: Omit<ComponentProps<typeof NativeSelect>, 'value' | 'onChange'> & { value: string; onChange: (id: string) => void; placeholder?: string; exclude?: string }) {
  const { state } = useScoped()
  const user = useUser()
  const { can } = useAuth()
  const manage = can('dataroom.manage')
  const rows: { id: string; label: string }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childFolders(state, parentId)) {
      if (f.id === exclude || !canSeeFolder(state, user.id, f.id, manage)) continue
      rows.push({ id: f.id, label: `${'  '.repeat(depth)}${f.name}` })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </NativeSelect>
  )
}

/**
 * Seeded files carry no content, so a viewer shows this stand-in page: the file name as a title
 * and grey lines for text. An uploaded image or PDF shows itself instead.
 */
export function FilePreview({ file, className }: { file: DataFile; className?: string }) {
  if (file.dataUrl?.startsWith('data:image/')) return <img src={file.dataUrl} alt={file.name} className={cn('w-full rounded-2xl object-contain', className)} />
  if (file.dataUrl?.startsWith('data:application/pdf')) return <iframe title={file.name} src={file.dataUrl} className={cn('h-[70vh] w-full rounded-2xl bg-card', className)} />
  return (
    <div className={cn('mx-auto aspect-[1/1.414] w-full max-w-md rounded-2xl bg-card p-8 shadow-card', className)} aria-label={`Preview of ${file.name}`} role="img">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Artha Samoedra · Dataroom</div>
      <div className="mt-3 text-lg font-semibold leading-snug">{file.name.replace(/\.[a-z0-9]+$/i, '')}</div>
      <div className="mt-6 space-y-2.5">
        {[100, 92, 96, 70, 0, 100, 88, 94, 60, 0, 100, 76].map((w, i) => (
          <div key={i} className={cn('h-2 rounded-full', w ? 'bg-surface' : 'h-3 bg-transparent')} style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}
