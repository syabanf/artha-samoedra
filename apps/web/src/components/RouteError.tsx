import { Button } from '@artha/ui'
import { ArrowLeft, Home, RotateCcw } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { BrandLogo } from './BrandMark'
import { paths } from './links'

/**
 * The page a route shows when it throws or fails to load its code, in place of the router's
 * developer screen. It stands alone, since the layout around it may be what broke.
 */
export function RouteError({ area }: { area: 'site' | 'console' }) {
  const error = useRouteError()
  const missing = isRouteErrorResponse(error) && error.status === 404
  // A deploy replaces the page chunks; an old tab then fails to load one, and a reload fixes it.
  const stale = error instanceof Error && /dynamically imported module|Failed to fetch|Importing a module script/i.test(error.message)
  const home = area === 'console' ? paths.console : paths.home
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface px-4 text-center">
      <BrandLogo className="h-10" />
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {missing ? 'Page not found' : stale ? 'A new version is ready' : 'Something went wrong'}
          <span className="text-accent">.</span>
        </h1>
        <p className="text-sm text-muted">
          {missing
            ? 'The link may be old or mistyped.'
            : stale
              ? 'The app was updated while this tab was open. Reload to continue.'
              : 'This page hit an error. Reload it, or go back to where you were.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {!missing && (
          <Button variant="secondary" onClick={() => location.reload()}>
            <RotateCcw />
            Reload
          </Button>
        )}
        <Button variant="outline" onClick={() => history.back()}>
          <ArrowLeft />
          Go back
        </Button>
        <Button variant={missing ? 'secondary' : 'outline'} asChild>
          <Link to={home}>
            <Home />
            {area === 'console' ? 'Dashboard' : 'Home'}
          </Link>
        </Button>
      </div>
    </main>
  )
}

export const SiteRouteError = () => <RouteError area="site" />
export const ConsoleRouteError = () => <RouteError area="console" />
