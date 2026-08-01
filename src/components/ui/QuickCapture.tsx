import { useEffect, useMemo, useRef, useState } from 'react'
import type { Language } from '../../i18n'
import { UI_TEXT } from '../../i18n'
import type { IdeaNodeData } from '../../types'

export type CaptureMode = 'quick' | 'compose'

export interface QuickCapturePayload {
  title: string
  description: string
  parentId: string | null
  mode: CaptureMode
}

interface QuickCaptureProps {
  mode: CaptureMode
  language: Language
  ideas: IdeaNodeData[]
  currentId: string | null
  onClose: () => void
  onSave: (payload: QuickCapturePayload) => void
  embedded?: boolean
  mobileInstant?: boolean
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

function makeInstantPayload(content: string, language: Language): Pick<QuickCapturePayload, 'title' | 'description'> {
  const clean = content.trim()
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const firstLine = lines[0] || (language === 'zh-CN' ? '未命名速记' : 'Untitled capture')
  const title = firstLine.length > 42 ? `${firstLine.slice(0, 40)}…` : firstLine
  const remainder = lines.length > 1 ? lines.slice(1).join('\n') : ''
  const description = remainder || (clean.length > 42 ? clean : '')
  return { title, description }
}

export default function QuickCapture({
  mode,
  language,
  ideas,
  currentId,
  onClose,
  onSave,
  embedded = false,
  mobileInstant = false,
}: QuickCaptureProps) {
  const copy = UI_TEXT[language]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instantText, setInstantText] = useState('')
  const [parentId, setParentId] = useState<string>(mode === 'compose' ? currentId ?? '' : '')
  const titleRef = useRef<HTMLInputElement>(null)
  const destinationOptions = useMemo(() => flattenDestinations(ideas), [ideas])
  const instantMode = embedded && mobileInstant && mode === 'quick'

  useEffect(() => {
    if (embedded) return
    titleRef.current?.focus()
    titleRef.current?.select()
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [embedded, onClose])

  useEffect(() => {
    if (mode === 'compose' && currentId) setParentId(currentId)
  }, [currentId, mode])

  const submit = () => {
    if (instantMode) {
      const clean = instantText.trim()
      if (!clean) return
      const generated = makeInstantPayload(clean, language)
      onSave({ ...generated, parentId: null, mode: 'quick' })
      setInstantText('')
      window.requestAnimationFrame(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      })
      return
    }

    const cleanTitle = title.trim()
    if (!cleanTitle) return
    onSave({
      title: cleanTitle,
      description: description.trim(),
      parentId: mode === 'quick' ? null : parentId || null,
      mode,
    })
    if (embedded) {
      setTitle('')
      setDescription('')
      window.requestAnimationFrame(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      })
    }
  }

  const isQuick = mode === 'quick'

  if (instantMode) {
    return (
      <section className="quick-capture quick-capture--embedded quick-capture--mobile-instant" role="region" aria-labelledby="mobile-instant-title">
        <header className="mobile-instant-capture__header">
          <div>
            <span>{language === 'zh-CN' ? '只捕捉，不整理' : 'Capture first, organise later'}</span>
            <h2 id="mobile-instant-title">{language === 'zh-CN' ? '速记' : 'Quick capture'}</h2>
            <p>{language === 'zh-CN' ? '直接写下此刻想到的内容。保存后自动进入灵感箱。' : 'Write the thought as it comes. It will be saved to the inbox automatically.'}</p>
          </div>
          <span className="mobile-instant-capture__status">{language === 'zh-CN' ? '未整理' : 'Unsorted'}</span>
        </header>

        <label className="mobile-instant-capture__field">
          <textarea
            value={instantText}
            rows={10}
            maxLength={1200}
            placeholder={language === 'zh-CN' ? '刚刚想到……' : 'I just thought of…'}
            onChange={(event) => setInstantText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <small>{instantText.length}/1200</small>
        </label>

        <div className="mobile-instant-capture__destination">
          <span>▣</span>
          <div>
            <strong>{language === 'zh-CN' ? '自动进入灵感箱' : 'Saved to Idea Inbox'}</strong>
            <small>{language === 'zh-CN' ? '之后再决定转为主体，或归入某个主题和分支。' : 'Later, turn it into a theme or file it under an existing branch.'}</small>
          </div>
        </div>

        <footer className="mobile-instant-capture__footer">
          <span>{language === 'zh-CN' ? '保存后停留在本页，方便连续记录。' : 'Stay here after saving for repeated capture.'}</span>
          <button type="button" className="primary-button" disabled={!instantText.trim()} onClick={submit}>
            {language === 'zh-CN' ? '保存速记' : 'Save capture'}
          </button>
        </footer>
      </section>
    )
  }

  const panel = (
    <section
      className={`quick-capture ${isQuick ? 'quick-capture--instant' : 'quick-capture--compose'} ${embedded ? 'quick-capture--embedded' : ''}`}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-labelledby="quick-capture-title"
      onMouseDown={embedded ? undefined : (event) => event.stopPropagation()}
    >
      <div className="quick-capture__pulse" />
      <header className="quick-capture__header">
        <div>
          <span>{isQuick ? copy.quickCaptureEyebrow : copy.composeEyebrow}</span>
          <h2 id="quick-capture-title">{isQuick ? copy.quickCaptureTitle : copy.composeTitle}</h2>
        </div>
        {!embedded && <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}>×</button>}
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
          rows={isQuick ? 4 : 5}
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
          <span>▣</span>
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
        <span>{embedded
          ? (isQuick
              ? (language === 'zh-CN' ? '保存后会停留在本页，方便连续记录。' : 'Stay on this page after saving for rapid capture.')
              : (language === 'zh-CN' ? '这是结构化新增：选择归属后直接进入主题树。' : 'This is a structured addition: choose its place in the theme tree.'))
          : (isQuick ? copy.quickCaptureHint : copy.composeHint)}</span>
        <button type="button" className="primary-button" disabled={!title.trim()} onClick={submit}>
          {isQuick ? copy.captureNow : copy.saveConcept}
        </button>
      </footer>
    </section>
  )

  if (embedded) return panel
  return (
    <div className="quick-capture-backdrop" role="presentation" onMouseDown={onClose}>
      {panel}
    </div>
  )
}
