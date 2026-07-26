import { useEffect, useMemo, useRef, useState } from 'react'
import type { Language } from '../../i18n'
import { UI_TEXT } from '../../i18n'
import type { IdeaNodeData } from '../../types'

export type CaptureMode = 'quick' | 'compose'

export interface QuickCapturePayload {
  title: string
  description: string
  parentId: string | null
}

interface QuickCaptureProps {
  mode: CaptureMode
  language: Language
  ideas: IdeaNodeData[]
  currentId: string | null
  onClose: () => void
  onSave: (payload: QuickCapturePayload) => void
}

interface DestinationOption {
  id: string
  label: string
  depth: number
}

function flattenDestinations(nodes: IdeaNodeData[], depth = 0): DestinationOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: node.title, depth },
    ...flattenDestinations(node.children, depth + 1),
  ])
}

export default function QuickCapture({ mode, language, ideas, currentId, onClose, onSave }: QuickCaptureProps) {
  const copy = UI_TEXT[language]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState<string>(mode === 'compose' ? currentId ?? '' : '')
  const titleRef = useRef<HTMLInputElement>(null)
  const destinationOptions = useMemo(() => flattenDestinations(ideas), [ideas])

  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const submit = () => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    onSave({
      title: cleanTitle,
      description: description.trim(),
      parentId: mode === 'quick' ? null : parentId || null,
    })
  }

  const isQuick = mode === 'quick'

  return (
    <div className="quick-capture-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`quick-capture ${isQuick ? 'quick-capture--instant' : 'quick-capture--compose'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-capture-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="quick-capture__pulse" />
        <header className="quick-capture__header">
          <div>
            <span>{isQuick ? copy.quickCaptureEyebrow : copy.composeEyebrow}</span>
            <h2 id="quick-capture-title">{isQuick ? copy.quickCaptureTitle : copy.composeTitle}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}>×</button>
        </header>

        <label className="quick-capture__field">
          <input
            ref={titleRef}
            value={title}
            maxLength={80}
            placeholder={isQuick ? copy.quickCapturePlaceholder : copy.composePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <small>{title.length}/80</small>
        </label>

        <label className="quick-capture__field quick-capture__field--description">
          <textarea
            value={description}
            rows={isQuick ? 2 : 3}
            maxLength={360}
            placeholder={isQuick ? copy.quickDescriptionPlaceholder : copy.composeDescriptionPlaceholder}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <small>{description.length}/360</small>
        </label>

        {isQuick ? (
          <div className="quick-capture__root-note">
            <span>◌</span>
            <div>
              <strong>{copy.quickDefaultRoot}</strong>
              <small>{copy.quickDefaultRootHint}</small>
            </div>
          </div>
        ) : (
          <label className="quick-capture__destination-select">
            <span>{copy.composeDestination}</span>
            <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">◌ {copy.voidRoot}</option>
              {destinationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {`${'　'.repeat(option.depth)}${option.depth > 0 ? '↳ ' : '◎ '}${option.label}`}
                </option>
              ))}
            </select>
            <small>{copy.composeDestinationHint}</small>
          </label>
        )}

        <footer className="quick-capture__footer">
          <span>{isQuick ? copy.quickCaptureHint : copy.composeHint}</span>
          <button type="button" className="primary-button" disabled={!title.trim()} onClick={submit}>
            {isQuick ? copy.captureNow : copy.saveConcept}
          </button>
        </footer>
      </section>
    </div>
  )
}
