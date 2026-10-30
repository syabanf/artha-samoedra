import { useEffect } from 'react'

/** Sets the title and meta description for SEO on each public route. */
export function useDocumentMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title
    if (!description) return
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.name = 'description'
      document.head.append(tag)
    }
    tag.content = description
  }, [title, description])
}
