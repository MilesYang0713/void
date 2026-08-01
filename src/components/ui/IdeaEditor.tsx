import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { Language } from '../../i18n'
import { UI_TEXT } from '../../i18n'
import type { IdeaDraft, IdeaNodeData } from '../../types'

const colors = [
  '#a855f7',
  '#38bdf8',
  '#22d3ee',
  '#4ade80',
  '#fb923c',
  '#f472b6',
  '#facc15',
  '#818cf8',
]

interface IdeaEditorProps {
  mode: 'create' | 'edit'
  node?: IdeaNodeData | null
  parentTitle?: string | null
  language: Language
  onCancel: () => void
  onSave: (draft: IdeaDraft) => void
  embedded?: boolean
  autoFocus?: boolean
}

export default function IdeaEditor({
  mode,
  node,
  parentTitle,
  language,
  onCancel,
  onSave,
  embedded = false,
  autoFocus = true,
}: IdeaEditorProps) {
  const copy = UI_TEXT[language]
  const [title, setTitle] = useState(node?.title ?? '')
  const [description, setDescription] = useState(node?.description ?? '')
  const [color, setColor] = useState(node?.color ?? colors[0])
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus()
  }, [autoFocus])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const cleanedTitle = title.trim()
    if (!cleanedTitle) return

    onSave({
      title: cleanedTitle,
      description: description.trim(),
      color,
    })
  }

  const form = (
      <form
        className={`idea-editor ${embedded ? 'idea-editor--embedded' : ''}`}
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="idea-editor__header">
          <div>
            <span>{mode === 'create' ? copy.ideaBirth : copy.modifyIdea}</span>
            <h2>{mode === 'create' ? (parentTitle ? copy.addTo(parentTitle) : copy.createCoreIdea) : copy.editIdea(node?.title ?? '')}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label={copy.close}>
            ×
          </button>
        </header>

        <label className="field">
          <span>{copy.name}</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={40}
            placeholder={copy.namePlaceholder}
          />
          <small>{title.length}/40</small>
        </label>

        <label className="field">
          <span>{copy.description}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={280}
            rows={5}
            placeholder={copy.descriptionPlaceholder}
          />
          <small>{description.length}/280</small>
        </label>

        <fieldset className="color-field">
          <legend>{copy.energyColor}</legend>
          <div className="color-options">
            {colors.map((option) => (
              <button
                type="button"
                key={option}
                className={`color-option ${color === option ? 'color-option--selected' : ''}`}
                style={{ '--idea-color': option } as CSSProperties}
                onClick={() => setColor(option)}
                aria-label={copy.chooseColor(option)}
              />
            ))}
          </div>
        </fieldset>

        <footer className="idea-editor__footer">
          <button type="button" className="secondary-button" onClick={onCancel}>
            {copy.cancel}
          </button>
          <button type="submit" className="primary-button" disabled={!title.trim()}>
            {mode === 'create' ? copy.giveBirth : copy.saveChanges}
          </button>
        </footer>
      </form>
  )

  if (embedded) return form

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      {form}
    </div>
  )
}
