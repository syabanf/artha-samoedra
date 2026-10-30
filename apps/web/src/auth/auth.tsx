import { roleOf, userCan } from '@artha/fixtures'
import type { Permission, RoleDef, User } from '@artha/types'
import { createContext, use, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { paths } from '../components/links'
import { usePersistentState } from '../lib/storage'
import { useAppState } from '../state/store'

interface Session {
  userId: string | null
  /** Set while an admin views the console as another user. */
  realUserId: string | null
}

interface AuthCtx {
  user: User | null
  role: RoleDef | null
  realUser: User | null
  signIn: (id: string) => void
  signOut: () => void
  impersonate: (id: string) => void
  stopImpersonating: () => void
  can: (p: Permission) => boolean
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state } = useAppState()
  const [session, setSession] = usePersistentState<Session>('session', { userId: null, realUserId: null })
  // A disabled or deleted user loses the session on the next render.
  const user = state.users.find((u) => u.id === session.userId && u.status === 'active') ?? null
  const realUser = state.users.find((u) => u.id === session.realUserId) ?? null
  return (
    <AuthContext
      value={{
        user,
        role: user ? (roleOf(state, user.id) ?? null) : null,
        realUser,
        signIn: (id) => setSession({ userId: id, realUserId: null }),
        signOut: () => setSession({ userId: null, realUserId: null }),
        impersonate: (id) => setSession({ userId: id, realUserId: session.realUserId ?? session.userId }),
        stopImpersonating: () => setSession({ userId: session.realUserId, realUserId: null }),
        can: (p) => !!user && userCan(state, user.id, p),
      }}
    >
      {children}
    </AuthContext>
  )
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

/** Pages behind RequireAuth can assume a user. */
export function useUser() {
  const { user } = useAuth()
  if (!user) throw new Error('useUser without a signed-in user')
  return user
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to={paths.login} replace state={{ from: location.pathname }} />
  return children
}
