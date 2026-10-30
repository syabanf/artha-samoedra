import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AuthProvider } from './auth/auth'
import { AppearanceSync } from './lib/appearance'
import './index.css'
import { router } from './router'
import { AppStateProvider } from './state/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <AppearanceSync />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppStateProvider>
  </StrictMode>,
)
