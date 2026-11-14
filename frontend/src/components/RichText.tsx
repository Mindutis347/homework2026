import type { ReactNode } from 'react'

/** Product descriptions allow a deliberately small slice of Markdown, so a seller
 *  or admin can bold a phrase, add a heading or a bullet list without pulling in a
 *  whole editor. Anything unrecognised renders as plain text, which keeps existing
 *  descriptions looking exactly as before. */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*)/g

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let index = 0
  INLINE.lastIndex = 0
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('**')) {
      parts.push(
        <strong key={key} className="font-extrabold text-white">{token.slice(2, -2)}</strong>,
      )
    } else {
      parts.push(<em key={key} className="italic">{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)

  return (
    <div className={`space-y-3 text-sm leading-relaxed text-brand-100 ${className}`}>
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`

        if (block.startsWith('# ')) {
          return (
            <h3 key={key} className="font-display text-lg font-extrabold text-white">
              {inline(block.slice(2), key)}
            </h3>
          )
        }
        if (block.startsWith('## ')) {
          return (
            <h4 key={key} className="font-display text-base font-extrabold text-white">
              {inline(block.slice(3), key)}
            </h4>
          )
        }

        const lines = block.split('\n').map((line) => line.trim())
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={`${key}-li-${lineIndex}`}>{inline(line.replace(/^[-*]\s+/, ''), `${key}-${lineIndex}`)}</li>
              ))}
            </ul>
          )
        }

        return (
          <p key={key}>
            {lines.map((line, lineIndex) => (
              <span key={`${key}-l-${lineIndex}`}>
                {inline(line, `${key}-${lineIndex}`)}
                {lineIndex < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
