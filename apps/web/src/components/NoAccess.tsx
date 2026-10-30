import { Card, EmptyState } from '@artha/ui'
import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

/** Shown when a role lacks the permission a page needs. */
export const NoAccess = ({ description = 'Ask an admin to add the permission to your role.', action }: { description?: string; action?: ReactNode }) => (
  <Card>
    <EmptyState icon={<Lock />} title="You don't have access to this page" description={description} action={action} />
  </Card>
)
