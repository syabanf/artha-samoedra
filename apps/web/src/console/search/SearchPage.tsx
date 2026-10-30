import {
  queryWords,
  SEARCH_KIND_LABEL,
  SEARCH_KIND_NEEDS,
  SEARCH_KINDS,
  type SearchKind,
} from '@artha/fixtures'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  EmptyState,
  IconTile,
  PageHeader,
} from '@artha/ui'
import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { SearchBox } from '../../components/SearchBox'
import { useSetParam } from '../../lib/useSetParam'
import { groupHits, Highlight, hitPath, KIND_ICON, useSearchHits } from './parts'

const PREVIEW = 8

export function SearchPage() {
  const { params, set } = useSetParam()
  const { can } = useAuth()
  const q = params.get('q') ?? ''
  const asked = params.get('kind') as SearchKind | null
  const hits = useSearchHits(q)

  const byKind = groupHits(hits)
  const kinds = SEARCH_KINDS.filter((k) => byKind.has(k))
  const kind = asked && byKind.has(asked) ? asked : null
  const shown = kind ? [kind] : kinds
  const searchable = SEARCH_KINDS.filter((k) => can(SEARCH_KIND_NEEDS[k]))
  const words = queryWords(q)

  return (
    <>
      <PageHeader
        title="Search"
        description="Every record you may open, ranked by code first, then name, then other details."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          value={q}
          onChange={(v) => set('q', v)}
          label="Search the console"
          placeholder="Name, code, phone or email"
        />
        {q && (
          <span className="text-xs text-muted tabular-nums" role="status">
            {hits.length} {hits.length === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      {kinds.length > 1 && (
        <ChipRow className="mb-4" aria-label="Filter by record type">
          <Chip active={!kind} count={hits.length} onClick={() => set('kind', null)}>
            All
          </Chip>
          {kinds.map((k) => (
            <Chip key={k} active={kind === k} count={byKind.get(k)!.length} onClick={() => set('kind', k)}>
              {SEARCH_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
      )}

      {!q.trim() ? (
        <Card>
          <EmptyState
            title="Type a word to search"
            description={`You can search ${searchable.map((k) => SEARCH_KIND_LABEL[k].toLowerCase()).join(', ') || 'nothing yet: your role has no record pages'}.`}
          />
        </Card>
      ) : !hits.length ? (
        <Card>
          <EmptyState
            icon={<SearchX />}
            title={`Nothing matches “${q.trim()}”`}
            description={
              <>
                Every word has to match. Try fewer words, the start of a name, or a record code such as{' '}
                <span className="whitespace-nowrap">AS-0004</span> or{' '}
                <span className="whitespace-nowrap">PR-26-0001</span>.
              </>
            }
            action={
              words.length > 1 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {words.map((w) => (
                    <Button key={w} variant="outline" size="sm" onClick={() => set('q', w)}>
                      Search “{w}”
                    </Button>
                  ))}
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => set('q', null)}>
                  Clear search
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((k) => {
            const rows = byKind.get(k)!
            const visible = kind ? rows : rows.slice(0, PREVIEW)
            const Icon = KIND_ICON[k]
            return (
              <Card key={k} aria-labelledby={`search-${k}`} role="region">
                <CardHeader
                  className="pb-2"
                  action={
                    !kind && rows.length > PREVIEW ? (
                      <Button variant="ghost" size="sm" onClick={() => set('kind', k)}>
                        Show all {rows.length}
                      </Button>
                    ) : undefined
                  }
                >
                  <CardTitle id={`search-${k}`}>
                    {SEARCH_KIND_LABEL[k]}{' '}
                    <span className="font-normal text-muted tabular-nums">{rows.length}</span>
                  </CardTitle>
                </CardHeader>
                <ul className="px-2 pb-2">
                  {visible.map((h) => (
                    <li key={h.id}>
                      <Link
                        to={hitPath(h)}
                        className="flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
                      >
                        <IconTile size="sm" className="shrink-0">
                          <Icon />
                        </IconTile>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            <Highlight text={h.title} query={q} />
                          </span>
                          <span className="block truncate text-xs text-muted">
                            <Highlight text={h.subtitle} query={q} />
                          </span>
                        </span>
                        {h.code && (
                          <span className="hidden shrink-0 font-mono text-xs text-muted sm:block">
                            <Highlight text={h.code} query={q} />
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
