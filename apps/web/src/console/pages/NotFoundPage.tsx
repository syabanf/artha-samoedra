import { Button, Card, EmptyState } from '@artha/ui'
import { LayoutDashboard, Search, SearchX } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { paths } from '../../components/links'

/** Console 404: a path the console does not have, inside the shell so the menu stays at hand. */
export function ConsoleNotFoundPage() {
  const { pathname } = useLocation()
  return (
    <Card>
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={<SearchX />}
        title="Page not found"
        description={`The console has no page at ${pathname}. The link may be old, or the record was removed.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" asChild>
              <Link to={paths.console}>
                <LayoutDashboard />
                Dashboard
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={paths.search}>
                <Search />
                Search the console
              </Link>
            </Button>
          </div>
        }
      />
    </Card>
  )
}
