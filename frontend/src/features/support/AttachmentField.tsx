import { useRef } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui'

export const MAX_FILES = 3
export const MAX_BYTES = 1_500_000
export const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export type PendingAttachment = { name: string; mime: string; data: string; bytes: number }

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * Picture picker for a support request or reply. The server sniffs the bytes and
 * is the real gate; this only keeps the payload small and the errors local.
 */
export function AttachmentField({
  files,
  onChange,
  onError,
  disabled = false,
  footer,
}: {
  files: PendingAttachment[]
  onChange: (files: PendingAttachment[]) => void
  onError: (message: string | null) => void
  disabled?: boolean
  footer?: ReactNode
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onError(null)
    const next: PendingAttachment[] = []
    for (const file of Array.from(list)) {
      if (files.length + next.length >= MAX_FILES) {
        onError(`At most ${MAX_FILES} pictures per message.`)
        break
      }
      if (!ACCEPTED.includes(file.type)) {
        onError(`${file.name}: only PNG, JPEG, WebP or GIF pictures.`)
        continue
      }
      if (file.size > MAX_BYTES) {
        onError(`${file.name} is larger than 1.5 MB.`)
        continue
      }
      try {
        next.push({ name: file.name, mime: file.type, data: await readBase64(file), bytes: file.size })
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : 'Could not read that picture')
      }
    }
    onChange([...files, ...next].slice(0, MAX_FILES))
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative">
              <img
                src={`data:${file.mime};base64,${file.data}`}
                alt={file.name}
                className="h-20 w-20 rounded-[2px] border border-line object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-danger text-xs font-bold text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          className="hidden"
          onChange={(event) => void addFiles(event.target.files)}
        />
        <Button
          type="button"
          variant="onDark"
          size="sm"
          disabled={disabled || files.length >= MAX_FILES}
          onClick={() => fileRef.current?.click()}
        >
          Attach picture
        </Button>
        <span className="text-xs text-brand-200">Up to 3 PNG/JPEG/WebP/GIF, 1.5 MB each</span>
        {footer}
      </div>
    </div>
  )
}
