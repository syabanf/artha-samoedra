import { branchRemoveBlocker, countBy, newId } from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Dialog, DialogFooter, FormField, Input, PageHeader, type Column } from '@artha/ui'
import type { AccentPreset, Branch, Company } from '@artha/types'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { ACCENTS } from '../../lib/appearance'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

const COMPANY_FIELDS: [keyof Company, string, string?][] = [
  ['name', 'Brand name'],
  ['legalName', 'Legal name'],
  ['taxId', 'Tax ID (NPWP)'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['website', 'Website'],
  ['address', 'Address', 'sm:col-span-2'],
]

export function BusinessPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('business.manage')
  const [company, setCompany] = useState(state.company)
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const users = countBy(state.users, (u) => u.branchId)
  const dirty = JSON.stringify(company) !== JSON.stringify(state.company)

  const columns: Column<Branch>[] = [
    {
      id: 'name',
      header: 'Branch',
      sortValue: (b) => b.name,
      cell: (b) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">{b.code}</span>
            {b.isHead && <Badge variant="ink">Head office</Badge>}
          </div>
          <div className="truncate text-sm">{b.name}</div>
        </div>
      ),
    },
    { id: 'city', header: 'City', hideBelow: 'sm', cell: (b) => b.city },
    { id: 'address', header: 'Address', hideBelow: 'lg', cell: (b) => <span className="text-sm text-muted">{b.address}</span> },
    { id: 'phone', header: 'Phone', hideBelow: 'md', cell: (b) => <span className="font-mono text-xs">{b.phone}</span> },
    { id: 'users', header: 'Users', align: 'right', cell: (b) => users[b.id] ?? 0 },
    {
      id: '_actions',
      header: '',
      width: '5.5rem',
      cell: (b) => {
        if (!manage) return null
        const blocker = branchRemoveBlocker(state, b)
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-accent"
              aria-label={`Delete ${b.name}`}
              disabled={!!blocker}
              title={blocker ?? undefined}
              onClick={() => act({ type: 'branches/remove', id: b.id }, 'Branch deleted', b.name)}
            >
              <Trash2 />
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Business" description="Company details print on quotations, invoices and the website footer. Branches group users and, later, listings and cash accounts." className="mb-2" />
      <Card>
        <CardHeader action={manage && <Button size="sm" disabled={!dirty} onClick={() => act({ type: 'company/update', patch: company }, 'Company details saved')}>Save company</Button>}>
          <CardTitle>Company</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!manage} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {COMPANY_FIELDS.map(([key, label, span]) => (
              <FormField key={key} label={label} className={span}>
                <Input value={company[key]} onChange={(e) => setCompany({ ...company, [key]: e.target.value })} />
              </FormField>
            ))}
          </fieldset>
        </CardContent>
      </Card>
      <Card>
        <CardHeader action={manage && <Button variant="outline" size="sm" onClick={() => setEditing('new')}><Plus />Add branch</Button>}>
          <CardTitle>Branches ({state.branches.length})</CardTitle>
        </CardHeader>
        <div className="pb-2">
          <DataTable rows={state.branches} columns={columns} getRowKey={(b) => b.id} pageSize={0} />
        </div>
      </Card>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing === 'new' ? 'Add branch' : `Edit ${editing?.name ?? ''}`}
        description="The code prints on documents numbered by branch, so keep it short and unique."
      >
        {editing && <BranchForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function BranchForm({ editing, onDone }: { editing: Branch | null; onDone: () => void }) {
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [b, setB] = useState<Branch>(editing ?? { id: newId('brn'), code: '', name: '', city: '', address: '', phone: '', isHead: false })
  const errors = {
    code: /^[A-Z]{2,4}$/.test(b.code) ? null : 'Use 2 to 4 capital letters.',
    name: b.name.trim() ? null : 'Enter the branch name.',
    city: b.city.trim() ? null : 'Enter the city.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const set = (k: keyof Branch) => (e: { target: { value: string } }) => setB({ ...b, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value })
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        if (act({ type: 'branches/upsert', branch: b }, editing ? 'Branch saved' : 'Branch added', b.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <FormField label="Code" required error={show(errors.code)}>
          <Input value={b.code} onChange={set('code')} inputClassName="font-mono uppercase" maxLength={4} />
        </FormField>
        <FormField label="Name" required error={show(errors.name)}>
          <Input value={b.name} onChange={set('name')} placeholder="Semarang office" />
        </FormField>
        <FormField label="City" required error={show(errors.city)}>
          <Input value={b.city} onChange={set('city')} />
        </FormField>
        <FormField label="Phone">
          <Input value={b.phone} onChange={set('phone')} />
        </FormField>
        <FormField label="Address" className="sm:col-span-2">
          <Input value={b.address} onChange={set('address')} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save branch' : 'Add branch'}</Button>
      </DialogFooter>
    </form>
  )
}

export function AppearancePage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('business.manage')
  const [logoText, setLogoText] = useState(state.appearance.logoText)
  return (
    <div className="space-y-4">
      <PageHeader title="Appearance" description="The accent colour runs through buttons, active menu items and highlights on the console and the public website." className="mb-2" />
      <Card className="p-5">
        <h2 className="font-semibold">Accent colour</h2>
        <div role="radiogroup" aria-label="Accent colour" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {(Object.keys(ACCENTS) as AccentPreset[]).map((key) => {
            const a = ACCENTS[key]
            const active = state.appearance.accent === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!manage}
                onClick={() => act({ type: 'appearance/update', patch: { accent: key } }, 'Accent changed', a.label)}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-left text-sm font-semibold transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 ${active ? 'border-ink' : 'border-border'}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-white [&_svg]:size-4" style={{ background: a.strong }}>
                  {active && <Check />}
                </span>
                {a.label}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted">Each preset keeps white text on buttons at WCAG AA contrast. The brand colours from the Artha Samoedra logo replace these once the logo file arrives.</p>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Logo mark</h2>
        <form
          noValidate
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (logoText.trim()) act({ type: 'appearance/update', patch: { logoText: logoText.trim().toUpperCase() } }, 'Logo mark saved', logoText.toUpperCase())
          }}
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-strong text-base font-extrabold text-white">{logoText.toUpperCase() || '?'}</span>
          <FormField label="Letters" hint="1 to 3 letters on the rail and website header" className="w-40">
            <Input value={logoText} maxLength={3} disabled={!manage} onChange={(e) => setLogoText(e.target.value)} inputClassName="uppercase" />
          </FormField>
          {manage && (
            <Button type="submit" variant="outline" disabled={logoText.trim().toUpperCase() === state.appearance.logoText}>
              Save mark
            </Button>
          )}
        </form>
      </Card>
    </div>
  )
}
