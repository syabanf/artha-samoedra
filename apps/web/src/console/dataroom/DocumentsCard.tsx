import { canSeeFolder, fmtAgo, folderStats, foldersForDeal, foldersForListing } from '@artha/fixtures'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@artha/ui'
import { FolderLock } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { useScoped } from '../../state/store'
import { FileSize } from './parts'

/** Dataroom folders tied to a listing or a deal, for the record's detail page. Hidden without `dataroom.view`. */
export function DocumentsCard({ listingId, dealId }: { listingId?: string; dealId?: string }) {
  const { state } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  if (!can('dataroom.view')) return null
  const manage = can('dataroom.manage')
  const tied = listingId ? foldersForListing(state, listingId) : dealId ? foldersForDeal(state, dealId) : []
  const folders = tied.filter((f) => canSeeFolder(state, user.id, f.id, manage))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents ({folders.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {folders.length === 0 ? (
          <EmptyState
            compact
            icon={<FolderLock />}
            title="No dataroom folder yet"
            description={manage ? `Create a folder in the dataroom and tie it to this ${listingId ? 'listing' : 'deal'}.` : 'Certificates and closing files appear here once a folder is tied to this record.'}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((f) => {
              const s = folderStats(state, f.id)
              return (
                <Link
                  key={f.id}
                  to={paths.dataFolder(f.id)}
                  className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-muted">
                    <FolderLock className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{f.name}</span>
                    <span className="block text-xs text-muted">
                      {s.files} {s.files === 1 ? 'file' : 'files'} · <FileSize bytes={s.bytes} />
                      {s.updatedAt && ` · ${fmtAgo(s.updatedAt)}`}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
