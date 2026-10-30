import { Fragment } from 'react'

/** Renders the small markdown subset the blog editor writes: ## headings, - and 1. lists, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-body">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        return (
          <Fragment key={i}>
            {lines[0].startsWith('## ') && <h2 className="pt-2 text-xl font-bold tracking-tight text-foreground">{lines[0].slice(3)}</h2>}
            {renderRest(lines[0].startsWith('## ') ? lines.slice(1) : lines)}
          </Fragment>
        )
      })}
    </div>
  )
}

function renderRest(lines: string[]) {
  if (!lines.length) return null
  if (lines.every((l) => /^- /.test(l)))
    return <ul className="list-disc space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{l.slice(2)}</li>)}</ul>
  if (lines.every((l) => /^\d+\. /.test(l)))
    return <ol className="list-decimal space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{l.replace(/^\d+\. /, '')}</li>)}</ol>
  return <p>{lines.join(' ')}</p>
}
