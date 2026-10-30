import { blockerFor, leadScore, newId, nowIso, segmentMembers } from '@artha/fixtures'
import { Button, Card, Dialog, DialogFooter, EmptyState, FormField, Input, NativeSelect, PageHeader, Switch } from '@artha/ui'
import {
  CONTACT_KIND_LABEL,
  LEAD_SOURCE_LABEL,
  type ContactKind,
  type LeadSource,
  type Segment,
  type SegmentRules,
} from '@artha/types'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { NoAccess } from '../../components/NoAccess'
import { useAuth } from '../../auth/auth'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'

/** Shown in place of a marketing page when the role lacks its permission. */
const EMPTY_RULES: SegmentRules = { kind: null, source: null, city: null, tag: null, minScore: null, excludeOptOut: true }

/** Plain-language summary of the rules that are set. */
const ruleSummary = (r: SegmentRules) => {
  const parts = [
    r.kind && CONTACT_KIND_LABEL[r.kind],
    r.source && LEAD_SOURCE_LABEL[r.source],
    r.city && `In ${r.city}`,
    r.tag && `Tagged ${r.tag}`,
    r.minScore && `Score ${r.minScore}+`,
    r.excludeOptOut && 'Accepts marketing',
  ].filter((p): p is string => !!p)
  return parts.length ? parts : ['Every contact']
}

export function SegmentsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [editing, setEditing] = useState<Segment | 'new' | null>(null)
  if (!can('campaign.manage')) return <NoAccess />

  return (
    <div className="space-y-4">
      <PageHeader
        title="Segments"
        description="Saved groups of contacts that campaigns send to. Membership updates as contacts change."
        className="mb-2"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            New segment
          </Button>
        }
      />
      {state.segments.length === 0 ? (
        <Card>
          <EmptyState title="No segments yet" description="Create a segment to target a campaign." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.segments.map((seg) => {
            const members = segmentMembers(state, seg.rules, now)
            const reachable = members.filter((c) => !c.optOut).length
            const campaigns = state.campaigns.filter((c) => c.segmentId === seg.id).length
            const blocker = blockerFor(state, { type: 'segments/remove', id: seg.id })
            return (
              <Card key={seg.id} className="flex flex-col p-5">
                <h2 className="truncate font-semibold">{seg.name}</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ruleSummary(seg.rules).map((p) => (
                    <span key={p} className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-body">
                      {p}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums">{members.length}</span>
                  <span className="pb-0.5 text-sm text-muted">{members.length === 1 ? 'contact' : 'contacts'}</span>
                </div>
                <p className="mt-1 flex-1 text-xs text-muted">
                  {reachable} accept marketing · used by {campaigns} {campaigns === 1 ? 'campaign' : 'campaigns'}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(seg)}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-accent"
                    aria-label={`Delete ${seg.name}`}
                    disabled={!!blocker}
                    title={blocker ?? undefined}
                    onClick={() => act({ type: 'segments/remove', id: seg.id }, 'Segment deleted', seg.name)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        size="lg"
        title={editing === 'new' ? 'New segment' : `Edit ${editing?.name ?? ''}`}
        description="A contact joins when every rule you set matches. Leave a rule on Any to skip it."
      >
        {editing && <SegmentForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function SegmentForm({ editing, onDone }: { editing: Segment | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const now = useNow()
  const [name, setName] = useState(editing?.name ?? '')
  const [rules, setRules] = useState<SegmentRules>(editing?.rules ?? EMPTY_RULES)
  const [score, setScore] = useState(editing?.rules.minScore ? String(editing.rules.minScore) : '')
  const [tried, setTried] = useState(false)
  const cities = [...new Set(state.contacts.map((c) => c.city).filter(Boolean))].sort()
  const tags = [...new Set(state.contacts.flatMap((c) => c.tags))].sort()
  const minScore = Number(score) || null
  const draft = { ...rules, minScore }
  const members = segmentMembers(state, draft, now)
  const errors = {
    name: name.trim() ? null : 'Name the segment.',
    score: !score || (minScore !== null && minScore >= 0 && minScore <= 100) ? null : 'Enter a score from 0 to 100.',
  }
  const pick = <K extends keyof SegmentRules>(k: K) => (e: { target: { value: string } }) => setRules({ ...rules, [k]: e.target.value || null })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const segment: Segment = { id: editing?.id ?? newId('seg'), name: name.trim(), rules: draft, createdAt: editing?.createdAt ?? nowIso() }
        if (act({ type: 'segments/upsert', segment }, 'Segment saved', `${segment.name} · ${members.length} contacts`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={tried ? (errors.name ?? undefined) : undefined} className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jakarta investors" />
        </FormField>
        <FormField label="Contact type">
          <NativeSelect value={rules.kind ?? ''} onChange={(e) => setRules({ ...rules, kind: (e.target.value || null) as ContactKind | null })}>
            <option value="">Any type</option>
            {(Object.keys(CONTACT_KIND_LABEL) as ContactKind[]).map((k) => (
              <option key={k} value={k}>
                {CONTACT_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Source">
          <NativeSelect value={rules.source ?? ''} onChange={(e) => setRules({ ...rules, source: (e.target.value || null) as LeadSource | null })}>
            <option value="">Any source</option>
            {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="City">
          <NativeSelect value={rules.city ?? ''} onChange={pick('city')}>
            <option value="">Any city</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Tag">
          <NativeSelect value={rules.tag ?? ''} onChange={pick('tag')}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Minimum lead score" hint="0 to 100, empty for any" error={tried ? (errors.score ?? undefined) : undefined}>
          <Input inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, ''))} placeholder="60" />
        </FormField>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 sm:self-end">
          <span className="text-sm">Skip contacts who opted out</span>
          <Switch checked={rules.excludeOptOut} label="Skip contacts who opted out" onCheckedChange={(on) => setRules({ ...rules, excludeOptOut: on })} />
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
        <Users className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0 text-sm">
          <div className="font-semibold tabular-nums">
            {members.length} {members.length === 1 ? 'contact matches' : 'contacts match'}
          </div>
          <div className="truncate text-xs text-muted">
            {members.length
              ? members
                  .slice(0, 5)
                  .map((c) => `${c.name} (${leadScore(state, c, now)})`)
                  .join(', ') + (members.length > 5 ? ` and ${members.length - 5} more` : '')
              : 'Loosen a rule to include more contacts.'}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save segment</Button>
      </DialogFooter>
    </form>
  )
}
