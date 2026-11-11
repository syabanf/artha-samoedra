import { Card, PageHeader } from '@artha/ui'
import { useAppState } from '../../state/store'
import { ConsoleJessyChat, useConsoleJessy } from './AssistantLauncher'

/** The console Jessy chat on its own page, for phones and the "Ask Jessy" command. */
export function AssistantPage() {
  const { state } = useAppState()
  const chat = useConsoleJessy()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Ask ${state.settings.agentName}`}
        description="Ask for a report or about any figure on your dashboard: sales, finance, stock, purchasing, people, listings and leads. Any change waits for your Confirm and runs in your name."
        className="mb-0"
      />
      <Card className="overflow-hidden p-0">
        <ConsoleJessyChat chat={chat} className="h-[calc(100dvh-16rem)] min-h-[420px]" />
      </Card>
    </div>
  )
}
