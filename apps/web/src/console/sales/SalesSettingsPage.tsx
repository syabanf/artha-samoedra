import { fmtPercent, newId, stageRemoveBlocker } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  type BadgeVariant,
} from '@artha/ui'
import type { CustomFieldDef, DealStage, StageKind } from '@artha/types'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { NoAccess } from '../../components/NoAccess'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

const KIND_LABEL: Record<StageKind, string> = { open: 'Open', won: 'Won', lost: 'Lost' }
const KIND_VARIANT: Record<StageKind, BadgeVariant> = { open: 'info', won: 'success', lost: 'muted' }
const FIELD_TYPE_LABEL: Record<CustomFieldDef['type'], string> = { text: 'Text', number: 'Number', select: 'Pick from a list' }

export function SalesSettingsPage() {
  const { can } = useAuth()
  if (!can('target.manage')) {
    return <NoAccess description="Pipeline settings need the target management permission." />
  }
  return (
    <div>
      <PageHeader title="Pipeline settings" description="Deal stages and their win probability, the reasons a deal is lost, and extra fields on contacts." />
      <div className="space-y-4">
        <StagesCard />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LostReasonsCard />
          <CustomFieldsCard />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- stages

function StagesCard() {
  const { state } = useAppState()
  const act = useAct()
  const [editing, setEditing] = useState<DealStage | 'new' | null>(null)
  const stages = [...state.stages].sort((a, b) => (a.kind === 'open' ? 0 : 1) - (b.kind === 'open' ? 0 : 1) || a.probability - b.probability)
  const inStage = (id: string) => state.deals.filter((d) => d.stageId === id).length
  return (
    <Card>
      <CardHeader
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus />
            Add stage
          </Button>
        }
      >
        <CardTitle>Deal stages</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {stages.map((st) => {
            const blocker = stageRemoveBlocker(state, st)
            return (
              <li key={st.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{st.name}</div>
                  <div className="text-xs text-muted tabular-nums">
                    {fmtPercent(st.probability, 0)} probability · {inStage(st.id)} {inStage(st.id) === 1 ? 'deal' : 'deals'}
                  </div>
                </div>
                <Badge variant={KIND_VARIANT[st.kind]}>{KIND_LABEL[st.kind]}</Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${st.name}`} onClick={() => setEditing(st)}>
                    <Pencil />
                  </Button>
                  <span title={blocker ?? undefined}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${st.name}`}
                      disabled={!!blocker}
                      onClick={() => act({ type: 'stages/remove', id: st.id }, 'Stage deleted', st.name)}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">Open stages run in order of probability. Won and Lost are fixed; you can rename them.</p>
      </CardContent>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing === 'new' ? 'New stage' : editing ? `Edit ${editing.name}` : ''}
        description="Probability weights the forecast: a deal in a 60% stage counts 60% of its value."
      >
        {editing && <StageForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </Card>
  )
}

function StageForm({ editing, onDone }: { editing: DealStage | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ name: editing?.name ?? '', probability: String(editing?.probability ?? 50) })
  const fixed = !!editing && editing.kind !== 'open'
  const probability = Number(f.probability)
  const taken = state.stages.some((st) => st.id !== editing?.id && st.name.toLowerCase() === f.name.trim().toLowerCase())
  const errors = {
    name: !f.name.trim() ? 'Enter the stage name.' : taken ? 'Another stage has this name.' : null,
    probability: fixed || (Number.isInteger(probability) && probability >= 1 && probability <= 99) ? null : 'Use a whole number from 1 to 99.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const stage: DealStage = editing
          ? { ...editing, name: f.name.trim(), probability: fixed ? editing.probability : probability }
          : { id: newId('stg'), name: f.name.trim(), probability, kind: 'open' }
        if (act({ type: 'stages/upsert', stage }, editing ? 'Stage updated' : 'Stage added', stage.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={show(errors.name)}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Second visit" />
        </FormField>
        <FormField label="Probability" required error={show(errors.probability)} hint={fixed ? 'Fixed for Won and Lost' : 'In percent'}>
          <Input inputMode="numeric" disabled={fixed} value={f.probability} onChange={(e) => setF({ ...f, probability: e.target.value })} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Add stage'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- lost reasons

function LostReasonsCard() {
  const { state } = useAppState()
  const act = useAct()
  const [draft, setDraft] = useState('')
  const reasons = state.crmSettings.lostReasons
  const value = draft.trim()
  const duplicate = reasons.some((r) => r.toLowerCase() === value.toLowerCase())
  const lastOne = reasons.length === 1 ? 'Keep at least one reason so a deal can be marked lost.' : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lost reasons</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <li key={r} className="inline-flex items-center gap-1 rounded-full bg-surface py-1 pl-3 pr-1 text-sm">
              {r}
              <span title={lastOne ?? undefined}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6"
                  aria-label={`Remove ${r}`}
                  disabled={!!lastOne}
                  onClick={() => act({ type: 'crmSettings/update', patch: { lostReasons: reasons.filter((x) => x !== r) } }, 'Reason removed', r)}
                >
                  <X />
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <form
          noValidate
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!value || duplicate) return
            if (act({ type: 'crmSettings/update', patch: { lostReasons: [...reasons, value] } }, 'Reason added', value)) setDraft('')
          }}
        >
          <FormField label="New reason" error={duplicate ? 'This reason is already on the list.' : undefined} className="min-w-0 flex-1">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Price too high" />
          </FormField>
          <Button type="submit" variant="soft" className="mt-7" disabled={!value || duplicate}>
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- custom fields

function CustomFieldsCard() {
  const { state } = useAppState()
  const act = useAct()
  const [editing, setEditing] = useState<CustomFieldDef | 'new' | null>(null)
  const fields = state.crmSettings.customFields
  return (
    <Card>
      <CardHeader
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus />
            Add field
          </Button>
        }
      >
        <CardTitle>Contact fields</CardTitle>
      </CardHeader>
      <CardContent>
        {fields.length ? (
          <ul className="divide-y divide-border">
            {fields.map((cf) => (
              <li key={cf.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{cf.label}</div>
                  <div className="truncate text-xs text-muted">
                    {FIELD_TYPE_LABEL[cf.type]}
                    {cf.type === 'select' && `: ${cf.options.join(', ')}`}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${cf.label}`} onClick={() => setEditing(cf)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${cf.label}`}
                  onClick={() => act({ type: 'crmSettings/update', patch: { customFields: fields.filter((x) => x.id !== cf.id) } }, 'Field removed', cf.label)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No extra fields" description="Add fields such as preferred area or financing to every contact." />
        )}
      </CardContent>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing === 'new' ? 'New contact field' : editing ? `Edit ${editing.label}` : ''}
        description="The field shows on every contact page and can be edited there."
      >
        {editing && <FieldForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </Card>
  )
}

function FieldForm({ editing, onDone }: { editing: CustomFieldDef | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ label: editing?.label ?? '', type: editing?.type ?? ('text' as CustomFieldDef['type']), options: editing?.options.join(', ') ?? '' })
  const options = f.options.split(',').map((o) => o.trim()).filter(Boolean)
  const fields = state.crmSettings.customFields
  const taken = fields.some((cf) => cf.id !== editing?.id && cf.label.toLowerCase() === f.label.trim().toLowerCase())
  const errors = {
    label: !f.label.trim() ? 'Enter the field label.' : taken ? 'Another field has this label.' : null,
    options: f.type === 'select' && options.length < 2 ? 'List at least two options, separated by commas.' : null,
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const field: CustomFieldDef = { id: editing?.id ?? newId('cf'), label: f.label.trim(), type: f.type, options: f.type === 'select' ? options : [] }
        const customFields = editing ? fields.map((cf) => (cf.id === editing.id ? field : cf)) : [...fields, field]
        if (act({ type: 'crmSettings/update', patch: { customFields } }, editing ? 'Field updated' : 'Field added', field.label)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Label" required error={show(errors.label)}>
          <Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Preferred area" />
        </FormField>
        <FormField label="Type" required>
          <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CustomFieldDef['type'] })}>
            {(Object.keys(FIELD_TYPE_LABEL) as CustomFieldDef['type'][]).map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {f.type === 'select' && (
          <FormField label="Options" required error={show(errors.options)} hint="Separate with commas" className="sm:col-span-2">
            <Input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} placeholder="Cash, KPR, Installment" />
          </FormField>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Add field'}</Button>
      </DialogFooter>
    </form>
  )
}
