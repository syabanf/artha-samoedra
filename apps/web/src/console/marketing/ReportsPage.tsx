import { fmtIdrShort, newId, nowIso, REPORT_GROUPS, runReport, type ReportRow } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  type Column,
} from '@artha/ui'
import {
  CONTACT_KIND_LABEL,
  INQUIRY_CHANNEL_LABEL,
  INQUIRY_STATUS_LABEL,
  LEAD_SOURCE_LABEL,
  TASK_KIND_LABEL,
  type ReportDataset,
  type ReportMetric,
  type ReportSchedule,
  type SavedReport,
} from '@artha/types'
import { Download, FolderOpen, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth, useUser } from '../../auth/auth'
import { downloadCsv } from '../../lib/csv'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { NoAccess } from '../../components/NoAccess'

const DATASET_LABEL: Record<ReportDataset, string> = { deals: 'Deals', inquiries: 'Inquiries', contacts: 'Contacts', tasks: 'Tasks' }
const SCHEDULE_LABEL: Record<ReportSchedule, string> = { none: 'Not emailed', weekly: 'Every Monday', monthly: 'First of the month' }
const BUCKET_LABEL: Record<string, string> = { overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', done: 'Done' }
const DATASETS = Object.keys(DATASET_LABEL) as ReportDataset[]

type Draft = Pick<SavedReport, 'dataset' | 'groupBy' | 'metric'> & { id: string | null; name: string }

const groupsOf = (d: ReportDataset) => REPORT_GROUPS[d] as Record<string, string>
const firstGroup = (d: ReportDataset) => Object.keys(groupsOf(d))[0]



export function ReportsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const [draft, setDraft] = useState<Draft>({ id: null, name: '', dataset: 'deals', groupBy: 'stage', metric: 'value' })
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  if (!can('report.view')) return <NoAccess />

  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? 'Unassigned'
  const label = (kind: string, key: string): string => {
    if (kind === 'user') return userName(key)
    if (kind === 'source') return LEAD_SOURCE_LABEL[key as keyof typeof LEAD_SOURCE_LABEL] ?? key
    if (kind === 'status') return INQUIRY_STATUS_LABEL[key as keyof typeof INQUIRY_STATUS_LABEL] ?? key
    if (kind === 'channel') return INQUIRY_CHANNEL_LABEL[key as keyof typeof INQUIRY_CHANNEL_LABEL] ?? key
    if (kind === 'kind') return CONTACT_KIND_LABEL[key as keyof typeof CONTACT_KIND_LABEL] ?? key
    if (kind === 'task') return TASK_KIND_LABEL[key as keyof typeof TASK_KIND_LABEL] ?? key
    if (kind === 'due') return BUCKET_LABEL[key] ?? key
    return key
  }

  const byValue = draft.metric === 'value' && draft.dataset === 'deals'
  const metricOf = (r: ReportRow) => (byValue ? r.value : r.count)
  const fmt = (n: number) => (byValue ? fmtIdrShort(n) : String(n))
  const all = runReport(state, draft, now, label).sort((a, b) => metricOf(b) - metricOf(a))
  const max = Math.max(1, ...all.map(metricOf))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = all.filter((r) => terms.every((t) => r.key.toLowerCase().includes(t)))
  const total = all.reduce((a, r) => a + metricOf(r), 0)
  const groupName = groupsOf(draft.dataset)[draft.groupBy]
  const title = draft.name || `${DATASET_LABEL[draft.dataset]} by ${groupName.toLowerCase()}`

  const setDataset = (dataset: ReportDataset) =>
    setDraft({ ...draft, dataset, groupBy: firstGroup(dataset), metric: dataset === 'deals' ? draft.metric : 'count' })
  const exportCsv = () =>
    downloadCsv(title, [
      [groupName, 'Count', ...(draft.dataset === 'deals' ? ['Value (IDR)'] : [])],
      ...all.map((r) => [r.key, r.count, ...(draft.dataset === 'deals' ? [Math.round(r.value)] : [])]),
    ])

  const columns: Column<ReportRow>[] = [
    { id: 'key', header: groupName, sortValue: (r) => r.key, cell: (r) => <span className="text-sm">{r.key}</span> },
    { id: 'count', header: 'Count', align: 'right', sortValue: (r) => r.count, cell: (r) => <span className="tabular-nums">{r.count}</span> },
    ...(draft.dataset === 'deals'
      ? [{ id: 'value', header: 'Value', align: 'right' as const, sortValue: (r: ReportRow) => r.value, cell: (r: ReportRow) => <span className="tabular-nums">{fmtIdrShort(r.value)}</span> }]
      : []),
    {
      id: 'share',
      header: 'Share',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => metricOf(r),
      cell: (r) => <span className="text-muted tabular-nums">{total ? Math.round((metricOf(r) / total) * 100) : 0}%</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Group deals, inquiries, contacts or tasks, export the rows, and email a saved report on a schedule." className="mb-2" />

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Dataset">
            <NativeSelect value={draft.dataset} onChange={(e) => setDataset(e.target.value as ReportDataset)}>
              {DATASETS.map((d) => (
                <option key={d} value={d}>
                  {DATASET_LABEL[d]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Group by">
            <NativeSelect value={draft.groupBy} onChange={(e) => setDraft({ ...draft, groupBy: e.target.value })}>
              {Object.entries(groupsOf(draft.dataset)).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Measure" hint={draft.dataset === 'deals' ? undefined : 'Value applies to deals only'}>
            <NativeSelect value={draft.metric} disabled={draft.dataset !== 'deals'} onChange={(e) => setDraft({ ...draft, metric: e.target.value as ReportMetric })}>
              <option value="count">Count</option>
              {draft.dataset === 'deals' && <option value="value">Deal value</option>}
            </NativeSelect>
          </FormField>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            action={
              <>
                <Button variant="outline" size="sm" disabled={!all.length} onClick={exportCsv}>
                  <Download />
                  Export CSV
                </Button>
                <Button size="sm" onClick={() => setSaving(true)}>
                  <Save />
                  {draft.id ? 'Save changes' : 'Save report'}
                </Button>
              </>
            }
          >
            <CardTitle className="truncate">{title}</CardTitle>
            <p className="text-xs text-muted tabular-nums">
              {byValue ? `${fmtIdrShort(total)} across ${all.length} groups` : `${total} records in ${all.length} groups`}
            </p>
          </CardHeader>
          <CardContent>
            {all.length === 0 ? (
              <EmptyState compact title="No records to group" description="This dataset is empty." />
            ) : (
              <ol className="space-y-2.5">
                {all.map((r, i) => (
                  <li key={r.key} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
                    <span className="truncate">{r.key}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface">
                      <div className={i === 0 ? 'h-full rounded-full bg-accent' : 'h-full rounded-full bg-chart-muted'} style={{ width: `${(metricOf(r) / max) * 100}%` }} />
                    </div>
                    <span className="whitespace-nowrap text-right font-semibold tabular-nums">{fmt(metricOf(r))}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <SavedReports current={draft.id} onOpen={(r) => setDraft({ id: r.id, name: r.name, dataset: r.dataset, groupBy: r.groupBy, metric: r.metric })} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rows</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <Input variant="soft" inputClassName="rounded-full" aria-label="Search rows" placeholder={`Search ${groupName.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-64" />
          {q && (
            <span className="text-xs text-muted tabular-nums">
              {rows.length} of {all.length}
              <Button variant="ghost" size="sm" className="ml-1" onClick={() => setQ('')}>
                Clear filters
              </Button>
            </span>
          )}
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.key}
          initialSort={{ id: byValue ? 'value' : 'count', desc: true }}
          resetPageKey={`${draft.dataset}|${draft.groupBy}|${q}`}
          empty={
            q ? (
              <EmptyState compact title="No matching rows" action={<Button variant="outline" size="sm" onClick={() => setQ('')}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No records to group" />
            )
          }
        />
      </Card>

      <Dialog open={saving} onOpenChange={setSaving} title={draft.id ? `Save ${draft.name}` : 'Save report'} description="Saved reports can be emailed to the team on a schedule.">
        {saving && (
          <SaveForm
            draft={draft}
            fallbackName={title}
            onDone={(saved) => {
              setSaving(false)
              if (saved) setDraft({ ...draft, id: saved.id, name: saved.name })
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function SavedReports({ current, onOpen }: { current: string | null; onOpen: (r: SavedReport) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? 'Former user'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved reports</CardTitle>
      </CardHeader>
      <CardContent>
        {state.reports.length === 0 ? (
          <EmptyState compact title="No saved reports" description="Build a report and save it to reuse or email it." />
        ) : (
          <ul className="divide-y divide-border">
            {state.reports.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.name}</span>
                    {current === r.id && <Badge variant="ink">Open</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {DATASET_LABEL[r.dataset]} by {(groupsOf(r.dataset)[r.groupBy] ?? r.groupBy).toLowerCase()} · {r.metric === 'value' ? 'value' : 'count'}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted">
                    {SCHEDULE_LABEL[r.schedule]}
                    {r.schedule !== 'none' && r.recipients.length > 0 && ` to ${r.recipients.map(userName).join(', ')}`}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Open ${r.name}`} onClick={() => onOpen(r)}>
                  <FolderOpen />
                </Button>
                <Button variant="ghost" size="icon-sm" className="text-accent" aria-label={`Delete ${r.name}`} onClick={() => act({ type: 'reports/remove', id: r.id }, 'Report deleted', r.name)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SaveForm({ draft, fallbackName, onDone }: { draft: Draft; fallbackName: string; onDone: (r: SavedReport | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const user = useUser()
  const existing = state.reports.find((r) => r.id === draft.id)
  const [name, setName] = useState(draft.name || fallbackName)
  const [schedule, setSchedule] = useState<ReportSchedule>(existing?.schedule ?? 'none')
  const [recipients, setRecipients] = useState<string[]>(existing?.recipients ?? [user.id])
  const [tried, setTried] = useState(false)
  const errors = {
    name: name.trim() ? null : 'Name the report.',
    recipients: schedule === 'none' || recipients.length ? null : 'Pick at least one recipient.',
  }
  const active = state.users.filter((u) => u.status === 'active')
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const report: SavedReport = {
          id: existing?.id ?? newId('rpt'),
          name: name.trim(),
          dataset: draft.dataset,
          groupBy: draft.groupBy,
          metric: draft.dataset === 'deals' ? draft.metric : 'count',
          schedule,
          recipients: schedule === 'none' ? [] : recipients,
          createdBy: existing?.createdBy ?? user.id,
          createdAt: existing?.createdAt ?? nowIso(),
        }
        onDone(act({ type: 'reports/upsert', report }, 'Report saved', `${report.name} · ${SCHEDULE_LABEL[schedule].toLowerCase()}`) ? report : null)
      }}
    >
      <div className="space-y-4">
        <FormField label="Name" required error={tried ? (errors.name ?? undefined) : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Email schedule">
          <NativeSelect value={schedule} onChange={(e) => setSchedule(e.target.value as ReportSchedule)}>
            {(Object.keys(SCHEDULE_LABEL) as ReportSchedule[]).map((s) => (
              <option key={s} value={s}>
                {SCHEDULE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {schedule !== 'none' && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Recipients</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {active.map((u) => (
                <label key={u.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <Checkbox
                    checked={recipients.includes(u.id)}
                    label={`Email ${u.name}`}
                    onCheckedChange={(on) => setRecipients(on ? [...recipients, u.id] : recipients.filter((x) => x !== u.id))}
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
            </div>
            {tried && errors.recipients && <p className="mt-2 text-xs font-medium text-accent-strong">{errors.recipients}</p>}
          </fieldset>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">Save report</Button>
      </DialogFooter>
    </form>
  )
}
