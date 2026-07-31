import { useMemo, useState, type CSSProperties } from 'react'
import type { Language } from '../../i18n'
import type { IdeaNodeData } from '../../types'
import { countNodes } from '../../utils/tree'

interface InboxDragPayload {
  inboxRootId: string
  nodeId: string
}

interface IdeaInboxProps {
  items: IdeaNodeData[]
  language: Language
  dropActive: boolean
  onClose: () => void
  onRestore: (id: string, original: boolean) => void
  onExtractBranch: (inboxRootId: string, nodeId: string) => void
  onMoveIdeaIntoInbox: (id: string) => void
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
  language,
  dropActive,
  onClose,
  onRestore,
  onExtractBranch,
  onMoveIdeaIntoInbox,
}: IdeaInboxProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [nativeDragOver, setNativeDragOver] = useState(false)
  const labels = language === 'zh-CN'
    ? {
        title: '灵感收集箱',
        eyebrow: '暂存与等待整理',
        empty: '箱子还是空的。把暂时不处理的灵感或完整主题放进来。',
        restoreRoot: '取出到虚空',
        restoreOriginal: '放回原位',
        expand: '打开主题',
        collapse: '收起主题',
        close: '关闭',
        hint: '可以直接把箱内球拖到左侧虚空区域释放；在“思路路径”中也可以把节点拖回这个箱子。',
        branch: '分支',
        captured: '收纳于',
        drop: '把思路路径中的节点拖到这里',
      }
    : {
        title: 'Idea inbox',
        eyebrow: 'Hold and organise later',
        empty: 'The inbox is empty. Store ideas or complete themes here for later.',
        restoreRoot: 'Release to void',
        restoreOriginal: 'Restore original place',
        expand: 'Open theme',
        collapse: 'Collapse theme',
        close: 'Close',
        hint: 'Drag an item into the void area to release it. Nodes from the path view can also be dropped back into this box.',
        branch: 'branches',
        captured: 'Stored',
        drop: 'Drop a node from the path view here',
      }

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const aTime = Date.parse(a.inboxOrigin?.storedAt ?? a.updatedAt)
    const bTime = Date.parse(b.inboxOrigin?.storedAt ?? b.updatedAt)
    return bTime - aTime
  }), [items])

  return (
    <aside
      className={`idea-inbox-panel ${dropActive || nativeDragOver ? 'idea-inbox-panel--drop-active' : ''}`}
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
        <div>
          <span>{labels.eyebrow}</span>
          <h2>{labels.title}</h2>
        </div>
        <button type="button" className="panel-close" onClick={onClose} aria-label={labels.close}>×</button>
      </header>

      <div className="inbox-box-visual" data-inbox-dropzone>
        <div className="inbox-box-visual__orbs">
          {sortedItems.slice(0, 5).map((item, index) => (
            <span key={item.id} style={{ '--orb-color': item.color, '--orb-index': index } as CSSProperties} />
          ))}
        </div>
        <div className="inbox-box-visual__body"><strong>{items.length}</strong><small>VOID</small></div>
      </div>

      <p className="idea-inbox-panel__hint">{labels.hint}</p>
      <div className="idea-inbox-panel__drop-hint">▣ {labels.drop}</div>

      <div className="inbox-items">
        {sortedItems.length === 0 && <div className="inbox-empty">{labels.empty}</div>}
        {sortedItems.map((item) => {
          const descendants = countNodes(item.children)
          const isTheme = descendants > 0
          const expanded = expandedId === item.id
          return (
            <article
              key={item.id}
              className={`inbox-card ${isTheme ? 'inbox-card--theme' : ''}`}
              style={{ '--inbox-color': item.color } as CSSProperties}
              draggable
              onDragStart={(event) => {
                const payload: InboxDragPayload = { inboxRootId: item.id, nodeId: item.id }
                event.dataTransfer.setData('application/x-void-inbox', JSON.stringify(payload))
                event.dataTransfer.effectAllowed = 'move'
              }}
            >
              <div className="inbox-card__main">
                <span className="inbox-card__orb" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description || '—'}</p>
                  <small>{labels.captured} {new Date(item.inboxOrigin?.storedAt ?? item.updatedAt).toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'en-AU')} · {descendants} {labels.branch}</small>
                </div>
              </div>
              <div className="inbox-card__actions">
                <button type="button" onClick={() => onRestore(item.id, false)}>{labels.restoreRoot}</button>
                <button type="button" onClick={() => onRestore(item.id, true)}>{labels.restoreOriginal}</button>
                {isTheme && (
                  <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)}>
                    {expanded ? labels.collapse : labels.expand}
                  </button>
                )}
              </div>
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
