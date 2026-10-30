import type {
  ApiToken,
  Appearance,
  Branch,
  Company,
  MessageLog,
  MessageTemplate,
  NotificationRule,
  Permission,
  RoleDef,
  User,
  UserStatus,
} from '@artha/types'
import { PERMISSIONS } from '@artha/types'
import { patchById, upsert } from './rows'
import type { AppState } from './store'

export const ADMIN_ROLE = 'rol-admin'

export type IamAction =
  | { type: 'users/invite'; user: User }
  | { type: 'users/update'; id: string; patch: Partial<Pick<User, 'name' | 'email' | 'phone' | 'roleId' | 'branchId'>> }
  | { type: 'users/setStatus'; id: string; status: UserStatus }
  | { type: 'roles/upsert'; role: RoleDef }
  | { type: 'roles/remove'; id: string }
  | { type: 'branches/upsert'; branch: Branch }
  | { type: 'branches/remove'; id: string }
  | { type: 'company/update'; patch: Partial<Company> }
  | { type: 'appearance/update'; patch: Partial<Appearance> }
  | { type: 'integrations/connect'; id: string; account: string }
  | { type: 'integrations/disconnect'; id: string }
  | { type: 'templates/upsert'; template: MessageTemplate }
  | { type: 'templates/remove'; id: string }
  | { type: 'messages/send'; message: MessageLog }
  | { type: 'notificationRules/update'; id: string; patch: Partial<Pick<NotificationRule, 'channels' | 'roleIds' | 'enabled'>> }
  | { type: 'apiTokens/create'; token: ApiToken }
  | { type: 'apiTokens/revoke'; id: string }

// ---- permission checks over data-driven roles ----

export const roleOf = (s: AppState, userId: string) => {
  const user = s.users.find((u) => u.id === userId)
  return user ? s.roles.find((r) => r.id === user.roleId) : undefined
}

export const userCan = (s: AppState, userId: string, p: Permission) =>
  s.users.find((u) => u.id === userId)?.status === 'active' && !!roleOf(s, userId)?.permissions.includes(p)

// ---- blockers ----

const activeAdmins = (s: AppState) => s.users.filter((u) => u.roleId === ADMIN_ROLE && u.status === 'active')

/** Losing the last active admin would lock everyone out of settings. */
const lastAdminBlocker = (s: AppState, userId: string) =>
  activeAdmins(s).length === 1 && activeAdmins(s)[0].id === userId ? 'Keep at least one active admin.' : null

export const roleRemoveBlocker = (s: AppState, role: RoleDef) => {
  if (role.system) return 'System roles cannot be deleted.'
  const n = s.users.filter((u) => u.roleId === role.id).length
  return n ? `${n} ${n === 1 ? 'user still has' : 'users still have'} this role. Move them to another role first.` : null
}

export const branchRemoveBlocker = (s: AppState, branch: Branch) => {
  if (branch.isHead) return 'The head office cannot be deleted.'
  const n = s.users.filter((u) => u.branchId === branch.id).length
  return n ? `${n} ${n === 1 ? 'user works' : 'users work'} at this branch. Move them first.` : null
}

export const iamBlocker = (s: AppState, a: IamAction): string | null => {
  switch (a.type) {
    case 'users/invite':
      if (s.users.some((u) => u.email.toLowerCase() === a.user.email.toLowerCase())) return 'Another user already uses this email.'
      return null
    case 'users/update':
      if (a.patch.email && s.users.some((u) => u.id !== a.id && u.email.toLowerCase() === a.patch.email!.toLowerCase()))
        return 'Another user already uses this email.'
      return a.patch.roleId && a.patch.roleId !== ADMIN_ROLE ? lastAdminBlocker(s, a.id) : null
    case 'users/setStatus':
      return a.status !== 'active' ? lastAdminBlocker(s, a.id) : null
    case 'roles/upsert':
      if (!a.role.name.trim()) return 'Give the role a name.'
      if (s.roles.some((r) => r.id !== a.role.id && r.name.toLowerCase() === a.role.name.trim().toLowerCase())) return 'Another role has this name.'
      if (a.role.id === ADMIN_ROLE && a.role.permissions.length !== PERMISSIONS.length) return 'The Admin role keeps every permission.'
      return null
    case 'roles/remove': {
      const role = s.roles.find((r) => r.id === a.id)
      return role ? roleRemoveBlocker(s, role) : 'Role not found.'
    }
    case 'branches/upsert':
      if (s.branches.some((b) => b.id !== a.branch.id && b.code === a.branch.code)) return 'Another branch uses this code.'
      return null
    case 'branches/remove': {
      const branch = s.branches.find((b) => b.id === a.id)
      return branch ? branchRemoveBlocker(s, branch) : 'Branch not found.'
    }
    default:
      return null
  }
}

// ---- reducer slice ----

export const iamApply = (s: AppState, a: IamAction, at: string): AppState => {
  switch (a.type) {
    case 'users/invite':
      return { ...s, users: [...s.users, a.user] }
    case 'users/update':
      return { ...s, users: patchById(s.users, a.id, (u) => ({ ...u, ...a.patch })) }
    case 'users/setStatus':
      return { ...s, users: patchById(s.users, a.id, (u) => ({ ...u, status: a.status })) }
    case 'roles/upsert':
      return { ...s, roles: upsert(s.roles, { ...a.role, name: a.role.name.trim() }) }
    case 'roles/remove':
      return { ...s, roles: s.roles.filter((r) => r.id !== a.id) }
    case 'branches/upsert':
      return { ...s, branches: upsert(s.branches, a.branch) }
    case 'branches/remove':
      return { ...s, branches: s.branches.filter((b) => b.id !== a.id) }
    case 'company/update':
      return { ...s, company: { ...s.company, ...a.patch } }
    case 'appearance/update':
      return { ...s, appearance: { ...s.appearance, ...a.patch } }
    case 'integrations/connect':
      return {
        ...s,
        integrations: patchById(s.integrations, a.id, (i) => ({ ...i, status: 'connected', account: a.account, connectedAt: at, lastError: null })),
      }
    case 'integrations/disconnect':
      return {
        ...s,
        integrations: patchById(s.integrations, a.id, (i) => ({ ...i, status: 'disconnected', connectedAt: null, lastError: null })),
      }
    case 'templates/upsert':
      return { ...s, templates: upsert(s.templates, a.template) }
    case 'templates/remove':
      return { ...s, templates: s.templates.filter((t) => t.id !== a.id) }
    case 'messages/send':
      return { ...s, messages: [a.message, ...s.messages] }
    case 'notificationRules/update':
      return { ...s, notificationRules: patchById(s.notificationRules, a.id, (r) => ({ ...r, ...a.patch })) }
    case 'apiTokens/create':
      return { ...s, apiTokens: [a.token, ...s.apiTokens] }
    case 'apiTokens/revoke':
      return { ...s, apiTokens: patchById(s.apiTokens, a.id, (t) => ({ ...t, revokedAt: at })) }
  }
}

/** Fills {{placeholders}} in a message template. */
export const fillTemplate = (body: string, values: Record<string, string>) =>
  body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)

export const templateVariables = (body: string) => [...new Set([...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
