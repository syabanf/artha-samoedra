import { employeeOfUser, fmtDate, fmtIdr, type AppState } from '@artha/fixtures'
import { LEAVE_TYPE_LABEL, HR_REQUEST_KIND_LABEL, type Employee, type HrRequest, type Shift } from '@artha/types'
import { Card, EmptyState, PageHeader } from '@artha/ui'
import type { ReactNode } from 'react'
import { useUser } from '../../auth/auth'
import { useAppState } from '../../state/store'

/** The signed-in user's employee record, or undefined when the user has none. */
export const useMe = () => {
  const { state } = useAppState()
  const user = useUser()
  return employeeOfUser(state, user.id)
}

/** Renders `children(me)` for a user with an employee record, or an empty state under the page title. */
export function WithMe({ title, children }: { title: string; children: (me: Employee) => ReactNode }) {
  const me = useMe()
  if (me) return children(me)
  return (
    <div>
      <PageHeader title={title} />
      <Card>
        <EmptyState title="No employee record" description="Your console user is not linked to an employee yet. Ask HR to link it and this page fills in." />
      </Card>
    </div>
  )
}

export const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
/** A YYYY-MM-DD date as "30 Oct 2026". */
export const day = (date: string) => fmtDate(`${date}T12:00:00`)
export const shiftHours = (shift: Shift | null) => (shift ? `${shift.name} · ${shift.start} to ${shift.end}` : 'Day off')
export const positionOf = (s: Pick<AppState, 'positions'>, e: Employee) => s.positions.find((p) => p.id === e.positionId)?.name ?? 'No position'

export const requestTitle = (r: HrRequest) => (r.leave ? LEAVE_TYPE_LABEL[r.leave.type] : HR_REQUEST_KIND_LABEL[r.kind])
export const requestDetail = (r: HrRequest) => {
  if (r.leave) return `${day(r.leave.from)}${r.leave.to !== r.leave.from ? ` to ${day(r.leave.to)}` : ''} · ${plural(r.leave.days, 'day')}`
  if (r.overtime) return `${day(r.overtime.date)} · ${r.overtime.hours} h`
  if (r.loan) return `${fmtIdr(r.loan.amount)} over ${plural(r.loan.installments, 'month')}`
  return ''
}

