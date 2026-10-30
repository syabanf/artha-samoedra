import { countBy, DAY, fmtAgo, newId, toMs } from '@artha/fixtures'
import { Badge, Button, Card, Dialog, DialogFooter, EmptyState, FormField, Input, NativeSelect, PageHeader, StatCard, Switch } from '@artha/ui'
import { WORKFLOW_ACTION_LABEL, WORKFLOW_TRIGGER_LABEL, type WorkflowAction, type WorkflowRule, type WorkflowTrigger } from '@artha/types'
import { ArrowRight, CircleAlert, Plus, Workflow, Zap } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { NoAccess } from '../../components/NoAccess'

const TRIGGERS = Object.keys(WORKFLOW_TRIGGER_LABEL) as WorkflowTrigger[]
const ACTIONS = Object.keys(WORKFLOW_ACTION_LABEL) as WorkflowAction[]

/** Triggers each action can act on; the engine skips any other pairing without a run. */
const WORKS_WITH: Record<WorkflowAction, WorkflowTrigger[]> = {
  assign_round_robin: ['inquiry.created'],
  send_template: ['inquiry.created'],
  create_task: ['deal.stage_changed', 'quotation.sent'],
  notify_owner: TRIGGERS,
}
const pairingNote = (trigger: WorkflowTrigger, action: WorkflowAction) =>
  WORKS_WITH[action].includes(trigger) ? null : `${WORKFLOW_ACTION_LABEL[action]} runs only when ${WORKS_WITH[action].map((t) => WORKFLOW_TRIGGER_LABEL[t].toLowerCase()).join(' or ')}.`

const defaultParam = (action: WorkflowAction, firstTemplate: string) => (action === 'send_template' ? firstTemplate : action === 'create_task' ? '3' : '')

export function AutomationsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const [creating, setCreating] = useState(false)
  if (!can('automation.manage')) return <NoAccess />

  const runs = state.workflows.flatMap((w) => w.runs).filter((r) => now - toMs(r.at) < 7 * DAY)
  const ok = countBy(runs, (r) => (r.ok ? 'ok' : 'failed'))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automations"
        description="Rules that act when something happens in the CRM. Every run lands in the rule's log."
        className="mb-2"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            New rule
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard label="Rules on" value={state.workflows.filter((w) => w.enabled).length} unit={`of ${state.workflows.length}`} icon={<Workflow />} tone="ink" />
        <StatCard label="Runs this week" value={ok.ok ?? 0} icon={<Zap />} tone="success" />
        <StatCard label="Failed this week" value={ok.failed ?? 0} icon={<CircleAlert />} tone={ok.failed ? 'danger' : 'default'} className="col-span-2 xl:col-span-1" />
      </div>
      {state.workflows.length === 0 ? (
        <Card>
          <EmptyState title="No rules yet" description="Create a rule to assign, message or remind without lifting a finger." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {state.workflows.map((w) => (
            <RuleCard key={w.id} rule={w} />
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating} title="New rule" description="Pick what starts the rule and what it does. You can turn it off any time.">
        {creating && <RuleForm onDone={() => setCreating(false)} />}
      </Dialog>
    </div>
  )
}

function RuleCard({ rule }: { rule: WorkflowRule }) {
  const { state } = useAppState()
  const act = useAct()
  const [days, setDays] = useState(rule.param)
  const [all, setAll] = useState(false)
  const note = pairingNote(rule.trigger, rule.action)
  const shown = all ? rule.runs : rule.runs.slice(0, 3)
  const save = (param: string, toastText: string) => act({ type: 'workflows/upsert', rule: { ...rule, param } }, toastText, rule.name)

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 truncate font-semibold">{rule.name}</h2>
        <Switch
          checked={rule.enabled}
          label={`${rule.name} is on`}
          onCheckedChange={(on) => act({ type: 'workflows/upsert', rule: { ...rule, enabled: on } }, on ? 'Rule turned on' : 'Rule turned off', rule.name)}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-surface px-3 py-1">{WORKFLOW_TRIGGER_LABEL[rule.trigger]}</span>
        <ArrowRight className="size-4 shrink-0 text-muted" />
        <span className="rounded-full bg-ink px-3 py-1 text-on-ink">{WORKFLOW_ACTION_LABEL[rule.action]}</span>
      </div>
      {note && <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">{note}</p>}

      {rule.action === 'send_template' && (
        <FormField label="Template" className="mt-4">
          <NativeSelect value={rule.param} onChange={(e) => save(e.target.value, 'Template changed')}>
            {!state.templates.some((t) => t.id === rule.param) && <option value={rule.param}>Deleted template</option>}
            {state.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
      {rule.action === 'create_task' && (
        <form
          noValidate
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (Number(days) >= 1 && days !== rule.param) save(String(Number(days)), 'Due date changed')
          }}
        >
          <FormField label="Task due after" className="min-w-0 flex-1" error={Number(days) >= 1 ? undefined : 'Enter at least 1 day.'}>
            <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} right={<span className="pr-2 text-sm">days</span>} />
          </FormField>
          <Button type="submit" variant="outline" disabled={!(Number(days) >= 1) || days === rule.param}>
            Save
          </Button>
        </form>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Run log</div>
        {rule.runs.length === 0 ? (
          <p className="text-sm text-muted">No runs yet.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-sm">
                <Badge variant={r.ok ? 'success' : 'danger'}>{r.ok ? 'OK' : 'Failed'}</Badge>
                <span className="min-w-0 flex-1 break-words">{r.note}</span>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted">{fmtAgo(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
        {rule.runs.length > 3 && (
          <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${rule.runs.length} runs`}
          </Button>
        )}
      </div>
    </Card>
  )
}

function RuleForm({ onDone }: { onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const firstTemplate = state.templates[0]?.id ?? ''
  const [f, setF] = useState({ name: '', trigger: 'inquiry.created' as WorkflowTrigger, action: 'assign_round_robin' as WorkflowAction, param: '' })
  const [tried, setTried] = useState(false)
  const errors = {
    name: f.name.trim() ? null : 'Name the rule.',
    param:
      f.action === 'send_template' && !state.templates.some((t) => t.id === f.param)
        ? 'Choose a template.'
        : f.action === 'create_task' && !(Number(f.param) >= 1)
          ? 'Enter at least 1 day.'
          : null,
  }
  const note = pairingNote(f.trigger, f.action)
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const rule: WorkflowRule = { id: newId('wf'), name: f.name.trim(), trigger: f.trigger, action: f.action, param: f.param, enabled: true, runs: [] }
        if (act({ type: 'workflows/upsert', rule }, 'Rule created', `${rule.name} is on`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Name" required error={show(errors.name)}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Welcome new leads" />
        </FormField>
        <FormField label="When">
          <NativeSelect value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value as WorkflowTrigger })}>
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {WORKFLOW_TRIGGER_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Then">
          <NativeSelect
            value={f.action}
            onChange={(e) => {
              const action = e.target.value as WorkflowAction
              setF({ ...f, action, param: defaultParam(action, firstTemplate) })
            }}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {WORKFLOW_ACTION_LABEL[a]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {f.action === 'send_template' && (
          <FormField label="Template" required error={show(errors.param)}>
            <NativeSelect value={f.param} onChange={(e) => setF({ ...f, param: e.target.value })}>
              {state.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        {f.action === 'create_task' && (
          <FormField label="Task due after" required error={show(errors.param)}>
            <Input inputMode="numeric" value={f.param} onChange={(e) => setF({ ...f, param: e.target.value.replace(/\D/g, '') })} right={<span className="pr-2 text-sm">days</span>} />
          </FormField>
        )}
      </div>
      {note && <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">{note}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Create rule</Button>
      </DialogFooter>
    </form>
  )
}
