import { addDays, fmtAgo, fmtDateTime, followUpBucket, newId, nowIso, refLabel, type FollowUpBucket } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ChipRow,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  PillTabs,
  type BadgeVariant,
} from '@artha/ui'
import { TASK_KIND_LABEL, type CrmTask, type Ref, type RefType, type TaskKind } from '@artha/types'
import { ListChecks, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'

const BUCKETS: FollowUpBucket[] = ['overdue', 'today', 'upcoming', 'done']
const BUCKET_LABEL: Record<FollowUpBucket, string> = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', done: 'Done' }
const BUCKET_VARIANT: Record<FollowUpBucket, BadgeVariant> = { overdue: 'danger', today: 'warning', upcoming: 'default', done: 'success' }
const TASK_KINDS = Object.keys(TASK_KIND_LABEL) as TaskKind[]

const REF_PATH: Record<RefType, (id: string) => string> = {
  deal: paths.deal,
  contact: paths.contact,
  inquiry: paths.inquiry,
  account: paths.account,
}

const pad = (n: number) => String(n).padStart(2, '0')
/** ISO to the value a datetime-local input expects, in local time. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const tomorrowAtTen = () => {
  const d = new Date(addDays(nowIso(), 1))
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

// ---------------------------------------------------------------- task row

/** One follow-up with a done box; used here and on the deal page. */
export function TaskRow({ task, showRef = true }: { task: CrmTask; showRef?: boolean }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const bucket = followUpBucket(task, now)
  const owner = state.users.find((u) => u.id === task.ownerId)
  const toggle = (done: boolean) =>
    done ? act({ type: 'tasks/complete', id: task.id }, 'Follow-up done', task.title) : act({ type: 'tasks/reopen', id: task.id }, 'Follow-up reopened', task.title)
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
      {can('deal.manage') && <Checkbox checked={!!task.doneAt} onCheckedChange={toggle} label={task.doneAt ? `Reopen ${task.title}` : `Mark ${task.title} as done`} />}
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${task.doneAt ? 'text-muted line-through' : ''}`}>{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <Badge variant={BUCKET_VARIANT[bucket]}>{TASK_KIND_LABEL[task.kind]}</Badge>
          <span className={bucket === 'overdue' ? 'font-semibold text-accent' : undefined}>
            {task.doneAt ? `Done ${fmtAgo(task.doneAt)}` : `Due ${fmtDateTime(task.dueAt)}`}
          </span>
          {owner && <span>· {owner.name}</span>}
          {showRef && task.ref && (
            <Link to={REF_PATH[task.ref.type](task.ref.id)} className="font-semibold text-foreground hover:text-accent">
              · {refLabel(state, task.ref)}
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------- task dialog

export function TaskDialog({ open, onOpenChange, presetRef = null }: { open: boolean; onOpenChange: (open: boolean) => void; presetRef?: Ref | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New follow-up" description="It lands in the owner's follow-up queue and turns overdue after the due time.">
      <TaskForm presetRef={presetRef} onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

function TaskForm({ presetRef, onDone }: { presetRef: Ref | null; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    title: '',
    kind: 'whatsapp' as TaskKind,
    dueAt: toLocalInput(tomorrowAtTen()),
    ownerId: user.id,
    refType: (presetRef?.type ?? 'deal') as 'deal' | 'contact' | 'none',
    refId: presetRef?.id ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const ref: Ref | null = presetRef ?? (f.refType !== 'none' && f.refId ? { type: f.refType, id: f.refId } : null)
  const errors = {
    title: f.title.trim().length >= 3 ? null : 'Describe the follow-up in a few words.',
    dueAt: f.dueAt ? null : 'Pick a due date and time.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const agents = state.users.filter((u) => u.status === 'active')

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const task: CrmTask = {
          id: newId('tsk'),
          title: f.title.trim(),
          kind: f.kind,
          dueAt: new Date(f.dueAt).toISOString(),
          ownerId: f.ownerId,
          ref,
          doneAt: null,
          createdAt: nowIso(),
        }
        if (act({ type: 'tasks/create', task }, 'Follow-up added', `Due ${fmtDateTime(task.dueAt)}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="What to do" required error={show(errors.title)} className="sm:col-span-2">
          <Input value={f.title} onChange={set('title')} placeholder="Send the revised price list" />
        </FormField>
        <FormField label="Type" required>
          <NativeSelect value={f.kind} onChange={set('kind')}>
            {TASK_KINDS.map((k) => (
              <option key={k} value={k}>
                {TASK_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Due" required error={show(errors.dueAt)}>
          <Input type="datetime-local" value={f.dueAt} onChange={set('dueAt')} />
        </FormField>
        <FormField label="Owner" required className="sm:col-span-2">
          <NativeSelect value={f.ownerId} onChange={set('ownerId')}>
            {agents.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {presetRef ? (
          <FormField label="Linked to" className="sm:col-span-2">
            <Input readOnly value={refLabel(state, presetRef)} />
          </FormField>
        ) : (
          <>
            <FormField label="Link to">
              <NativeSelect value={f.refType} onChange={(e) => setF({ ...f, refType: e.target.value as typeof f.refType, refId: '' })}>
                <option value="deal">A deal</option>
                <option value="contact">A contact</option>
                <option value="none">Nothing</option>
              </NativeSelect>
            </FormField>
            {f.refType !== 'none' && (
              <FormField label={f.refType === 'deal' ? 'Deal' : 'Contact'} hint="Optional">
                <NativeSelect value={f.refId} onChange={set('refId')}>
                  <option value="">Choose one</option>
                  {f.refType === 'deal'
                    ? state.deals.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} · {d.title}
                        </option>
                      ))
                    : state.contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                </NativeSelect>
              </FormField>
            )}
          </>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Add follow-up</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- page

export function FollowUpsPage() {
  const { state } = useAppState()
  const user = useUser()
  const { can } = useAuth()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const q = params.get('q') ?? ''
  const everyone = params.get('who') === 'all'
  const tab = (params.get('tab') as FollowUpBucket | null) ?? 'overdue'
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const scoped = state.tasks.filter(
    (t) => (everyone || t.ownerId === user.id) && terms.every((w) => `${t.title} ${refLabel(state, t.ref)}`.toLowerCase().includes(w)),
  )
  const byBucket = (b: FollowUpBucket) => scoped.filter((t) => followUpBucket(t, now) === b)
  const rows = byBucket(tab).sort((a, b) => (tab === 'done' ? (b.doneAt ?? '').localeCompare(a.doneAt ?? '') : a.dueAt.localeCompare(b.dueAt)))
  const total = state.tasks.filter((t) => followUpBucket(t, now) === tab).length
  const filters = [q, everyone ? null : 'mine'].filter(Boolean).length
  const clear = () => setParams(tab === 'overdue' ? { who: 'all' } : { tab, who: 'all' }, { replace: true })

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Calls, WhatsApp messages and site visits the team promised. Clear the overdue ones first."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search follow-ups"
              placeholder="Task, deal or contact"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('deal.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New follow-up
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <PillTabs
          label="Follow-up buckets"
          value={tab}
          onChange={(v) => set('tab', v === 'overdue' ? null : v)}
          items={BUCKETS.map((b) => ({ value: b, label: BUCKET_LABEL[b], count: byBucket(b).length }))}
        />
        <ChipRow className="flex-1">
          <Chip active={!everyone} onClick={() => set('who', null)}>
            Mine
          </Chip>
          <Chip active={everyone} onClick={() => set('who', 'all')}>
            Everyone
          </Chip>
        </ChipRow>
        <span className="text-xs text-muted tabular-nums">
          {rows.length} of {total}
          {filters > 0 && (
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear filters
            </Button>
          )}
        </span>
      </div>
      <Card className="mt-3 p-3">
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        ) : filters && total ? (
          <EmptyState
            compact
            title="No matching follow-ups"
            description="Switch to Everyone or clear the search."
            action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>}
          />
        ) : (
          <EmptyState compact icon={<ListChecks />} title={tab === 'overdue' ? 'Nothing overdue' : `No ${BUCKET_LABEL[tab].toLowerCase()} follow-ups`} description="Add a follow-up from here or from a deal page." />
        )}
      </Card>
      <TaskDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
