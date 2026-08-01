import { useMemo, useState, type CSSProperties } from 'react'
import type { Language } from '../../i18n'
import type { IdeaNodeData } from '../../types'
import { countNodes } from '../../utils/tree'

interface InboxDragPayload {
  inboxRootId: string
  nodeId: string
}

interface DestinationOption {
  id: string
  label: string
  depth: number
}

interface IdeaInboxProps {
  items: IdeaNodeData[]
  ideas: IdeaNodeData[]
  language: Language
  dropActive: boolean
  onClose: () => void
  onRestore: (id: string, original: boolean) => void
  onOrganize: (id: string, parentId: string | null) => void
  onDelete: (id: string) => void
  onExtractBranch: (inboxRootId: string, nodeId: string) => void
  onMoveIdeaIntoInbox: (id: string) => void
  embedded?: boolean
}

function flattenDestinations(nodes: IdeaNodeData[], depth = 0): DestinationOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: node.title, depth },
    ...flattenDestinations(node.children, depth + 1),
  ])
}

function NestedInboxTree({
  node,
  rootId,
  depth,
  onExtract,
}: {
  node: IdeaNodeData
  rootId: string
  depth: number
  onExtract: (rootId: string, nodeId: string) => void
}) {
  return (
    <div className="inbox-tree-node" style={{ '--tree-depth': depth } as CSSProperties}>
      <div
        className="inbox-tree-node__row"
        draggable
        onDragStart={(event) => {
          const payload: InboxDragPayload = { inboxRootId: rootId, nodeId: node.id }
          event.dataTransfer.setData('application/x-void-inbox', JSON.stringify(payload))
          event.dataTransfer.effectAllowed = 'move'
        }}
      >
        <span style={{ background: node.color }} />
        <strong>{node.title}</strong>
        <button type="button" onClick={() => onExtract(rootId, node.id)}>取出</button>
      </div>
      {node.children.map((child) => (
        <NestedInboxTree key={child.id} node={child} rootId={rootId} depth={depth + 1} onExtract={onExtract} />
      ))}
    </div>
  )
}

export default function IdeaInbox({
  items,
  ideas,
  language,
  dropActive,
  onClose,
  onRestore,
  onOrganize,
  onDelete,
  onExtractBranch,
  onMoveIdeaIntoInbox,
  embedded = false,
}: IdeaInboxProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [organizeId, setOrganizeId] = useState<string | null>(null)
  const [organizeTarget, setOrganizeTarget] = useState('')
  const [nativeDragOver, setNativeDragOver] = useState(false)
  const destinationOptions = useMemo(() => flattenDestinations(ideas), [ideas])
  const labels = language === 'zh-CN'
    ? {
        title: '灵感收集箱', eyebrow: '捕捉之后，再来整理',
        empty: '这里还没有未整理速记。你可以先用速记把想法捕捉下来。',
        restoreRoot: '转为主体', restoreOriginal: '放回原位', organise: '整理归入', confirmOrganise: '确认归入',
        chooseDestination: '选择主题或分支', expand: '打开主题', collapse: '收起主题', close: '关闭', delete: '删除',
        hint: '速记只负责捕捉。现在可以把它转为独立主体，或归入已有主题和分支。',
        branch: '分支', captured: '记录于', drop: '把思路路径中的节点拖到这里', root: '作为新主体',
      }
    : {
        title: 'Idea inbox', eyebrow: 'Capture first, organise later',
        empty: 'There are no unsorted captures yet. Use Capture whenever a thought appears.',
        restoreRoot: 'Make theme', restoreOriginal: 'Restore original', organise: 'Organise', confirmOrganise: 'File idea',
        chooseDestination: 'Choose a theme or branch', expand: 'Open theme', collapse: 'Collapse theme', close: 'Close', delete: 'Delete',
        hint: 'Capture only saves the thought. Here you can make it a theme or file it under an existing branch.',
        branch: 'branches', captured: 'Captured', drop: 'Drop a node from the path view here', root: 'Create as new theme',
      }

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const aTime = Date.parse(a.inboxOrigin?.storedAt ?? a.updatedAt)
    const bTime = Date.parse(b.inboxOrigin?.storedAt ?? b.updatedAt)
    return bTime - aTime
  }), [items])

  return (
    <aside
      className={`idea-inbox-panel ${embedded ? 'idea-inbox-panel--embedded' : ''} ${dropActive || nativeDragOver ? 'idea-inbox-panel--drop-active' : ''}`}
      data-inbox-panel
      data-inbox-dropzone
      onDragEnter={(event) => {
        const types = Array.from(event.dataTransfer.types)
        if (types.includes('application/x-void-idea') || types.includes('text/plain')) {
          event.preventDefault()
          setNativeDragOver(true)
        }
      }}
      onDragOver={(event) => {
        const types = Array.from(event.dataTransfer.types)
        if (types.includes('application/x-void-idea') || types.includes('text/plain')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setNativeDragOver(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setNativeDragOver(false)
      }}
      onDrop={(event) => {
        const customId = event.dataTransfer.getData('application/x-void-idea')
        const plain = event.dataTransfer.getData('text/plain')
        const ideaId = customId || (plain.startsWith('void-idea:') ? plain.slice('void-idea:'.length) : '')
        setNativeDragOver(false)
        if (!ideaId) return
        event.preventDefault()
        event.stopPropagation()
        onMoveIdeaIntoInbox(ideaId)
      }}
    >
      <header className="idea-inbox-panel__header">
        <div><span>{labels.eyebrow}</span><h2>{labels.title}</h2></div>
        {!embedded && <button type="button" className="panel-close" onClick={onClose} aria-label={labels.close}>×</button>}
      </header>

      <div className="inbox-box-visual" data-inbox-dropzone>
        <div className="inbox-box-visual__orbs">
          {sortedItems.slice(0, 5).map((item, index) => (
            <span key={item.id} style={{ '--orb-color': item.color, '--orb-index': index } as CSSProperties} />
          ))}
        </div>
        <div className="inbox-box-visual__body"><strong>{items.length}</strong><small>VOID</small></div>
      </div>

      <p className="idea-inbox-panel__hint">{embedded ? labels.hint : labels.hint}</p>
      {!embedded && <div className="idea-inbox-panel__drop-hint">▣ {labels.drop}</div>}

      <div className="inbox-items">
        {sortedItems.length === 0 && <div className="inbox-empty">{labels.empty}</div>}
        {sortedItems.map((item) => {
          const descendants = countNodes(item.children)
          const isTheme = descendants > 0
          const expanded = expandedId === item.id
          const organizing = organizeId === item.id
          return (
            <article key={item.id} className={`inbox-card ${isTheme ? 'inbox-card--theme' : ''}`} style={{ '--inbox-color': item.color } as CSSProperties}>
              <div className="inbox-card__main">
                <span className="inbox-card__orb" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description || '—'}</p>
                  <small>{labels.captured} {new Date(item.inboxOrigin?.storedAt ?? item.updatedAt).toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'en-AU')} · {descendants} {labels.branch}</small>
                </div>
              </div>

              <div className="inbox-card__actions inbox-card__actions--organise">
                <button type="button" className="inbox-action-primary" onClick={() => {
                  setOrganizeId(organizing ? null : item.id)
                  setOrganizeTarget(destinationOptions[0]?.id ?? '')
                }}>{labels.organise}</button>
                <button type="button" onClick={() => onOrganize(item.id, null)}>{labels.restoreRoot}</button>
                {item.inboxOrigin?.parentId && <button type="button" onClick={() => onRestore(item.id, true)}>{labels.restoreOriginal}</button>}
                {isTheme && <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)}>{expanded ? labels.collapse : labels.expand}</button>}
                <button type="button" className="inbox-action-danger" onClick={() => onDelete(item.id)}>{labels.delete}</button>
              </div>

              {organizing && (
                <div className="inbox-organizer">
                  <label>
                    <span>{labels.chooseDestination}</span>
                    <select value={organizeTarget} onChange={(event) => setOrganizeTarget(event.target.value)}>
                      <option value="">◌ {labels.root}</option>
                      {destinationOptions.map((option) => (
                        <option key={option.id} value={option.id}>{`${'　'.repeat(option.depth)}${option.depth > 0 ? '↳ ' : '◎ '}${option.label}`}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => {
                    onOrganize(item.id, organizeTarget || null)
                    setOrganizeId(null)
                  }}>{labels.confirmOrganise}</button>
                </div>
              )}

              {expanded && (
                <div className="inbox-card__tree">
                  {item.children.map((child) => (
                    <NestedInboxTree key={child.id} node={child} rootId={item.id} depth={0} onExtract={onExtractBranch} />
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </aside>
  )
}
