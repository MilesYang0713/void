import { useMemo, useState, type FormEvent } from 'react'
import type { GrowthEntry, GrowthEntryType, IdeaNodeData } from '../../types'
import type { Language } from '../../i18n'

interface Props {
  node: IdeaNodeData
  isRoot: boolean
  language: Language
  onClose: () => void
  onAdd: (content: string) => void
  onRevise: (id: string, content: string, mode: 'overwrite' | 'append') => void
  onOpenIdea: (id: string) => void
  embedded?: boolean
}

interface ThemeItem {
  entry: GrowthEntry
  nodeId: string
  path: string
}

const typeIcons: Record<GrowthEntryType, string> = {
  created: '●',
  note: '＋',
  edit: '↻',
  branch: '⑂',
  move: '⌖',
  relation: '⇄',
  inbox: '▣',
  restore: '↥',
  delete: '×',
  origin: '●',
  addition: '＋',
  inference: '◇',
  question: '?',
  action: '→',
  revision: '↻',
}

function collectTheme(node: IdeaNodeData, path: string[] = []): ThemeItem[] {
  const current = [...path, node.title]
  const own = (node.growthEntries ?? []).map((entry) => ({
    entry,
    nodeId: node.id,
    path: current.join(' / '),
  }))
  return [...own, ...node.children.flatMap((child) => collectTheme(child, current))]
}

function isEditableEntry(entry: GrowthEntry) {
  if (entry.editable === false) return false
  return ['note', 'addition', 'inference', 'question', 'action', 'revision'].includes(entry.type)
}

export default function GrowthPanel({ node, isRoot, language, onClose, onAdd, onRevise, onOpenIdea, embedded = false }: Props) {
  const zh = language === 'zh-CN'
  const labels: Record<GrowthEntryType, string> = zh
    ? {
        created: '创建记录',
        note: '补充记录',
        edit: '内容修改',
        branch: '分支变化',
        move: '位置移动',
        relation: '关系调整',
        inbox: '灵感箱操作',
        restore: '恢复记录',
        delete: '删除记录',
        origin: '创建时内容',
        addition: '旧版补充',
        inference: '旧版推论',
        question: '旧版问题',
        action: '旧版行动',
        revision: '旧版修订',
      }
    : {
        created: 'Created',
        note: 'Added note',
        edit: 'Content changed',
        branch: 'Branch changed',
        move: 'Position moved',
        relation: 'Relation changed',
        inbox: 'Inbox operation',
        restore: 'Restored',
        delete: 'Deleted',
        origin: 'Original content',
        addition: 'Legacy addition',
        inference: 'Legacy inference',
        question: 'Legacy question',
        action: 'Legacy action',
        revision: 'Legacy revision',
      }

  const [tab, setTab] = useState<'mine' | 'theme'>('mine')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')

  const entries = useMemo(
    () => [...(node.growthEntries ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [node.growthEntries],
  )
  const theme = useMemo(
    () => collectTheme(node).sort((a, b) => Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt)),
    [node],
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!content.trim()) return
    onAdd(content.trim())
    setContent('')
  }

  const renderEntry = (entry: GrowthEntry, context?: ThemeItem) => {
    const editable = !context && isEditableEntry(entry)
    return (
      <article
        key={`${context?.nodeId ?? node.id}-${entry.id}`}
        className={`growth-entry growth-entry--${entry.type}`}
      >
        <div className="growth-entry__rail"><span>{typeIcons[entry.type]}</span></div>
        <div className="growth-entry__body">
          <header>
            <div>
              <strong>{labels[entry.type]}</strong>
              {context && (
                <button type="button" className="growth-path-link" onClick={() => onOpenIdea(context.nodeId)}>
                  {context.path}
                </button>
              )}
            </div>
            <time>
              {new Date(entry.createdAt).toLocaleString(zh ? 'zh-CN' : 'en-AU', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </header>

          {editingId === entry.id && editable ? (
            <div className="growth-entry__edit">
              <textarea
                value={editingContent}
                onChange={(event) => setEditingContent(event.target.value)}
                maxLength={1200}
                rows={4}
              />
              <p className="growth-edit-hint">
                {zh
                  ? '覆盖会更新这条记录当前显示的内容，同时自动新增一个现在时间的修改节点，保留修改前后。'
                  : 'Overwrite updates the current record and adds a new timestamped change event containing both versions.'}
              </p>
              <div className="growth-edit-actions">
                <button type="button" className="secondary-button compact" onClick={() => setEditingId(null)}>
                  {zh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  className="secondary-button compact"
                  onClick={() => {
                    if (editingContent.trim()) onRevise(entry.id, editingContent.trim(), 'append')
                    setEditingId(null)
                  }}
                >
                  {zh ? '仅追加新记录' : 'Append only'}
                </button>
                <button
                  type="button"
                  className="primary-button compact"
                  onClick={() => {
                    if (editingContent.trim()) onRevise(entry.id, editingContent.trim(), 'overwrite')
                    setEditingId(null)
                  }}
                >
                  {zh ? '覆盖原记录并留痕' : 'Overwrite with history'}
                </button>
              </div>
            </div>
          ) : (
            <p>{entry.content}</p>
          )}

          {(entry.previousContent || entry.nextContent) && (
            <details className="growth-change-details">
              <summary>{zh ? '查看修改前后' : 'View before and after'}</summary>
              {entry.previousContent && (
                <div><b>{zh ? '修改前' : 'Before'}</b><p>{entry.previousContent}</p></div>
              )}
              {(entry.nextContent || entry.content) && (
                <div><b>{zh ? '修改后' : 'After'}</b><p>{entry.nextContent ?? entry.content}</p></div>
              )}
            </details>
          )}

          {editable && editingId !== entry.id && (
            <footer>
              <button
                type="button"
                onClick={() => {
                  setEditingId(entry.id)
                  setEditingContent(entry.content)
                }}
              >
                {zh ? '修改' : 'Edit'}
              </button>
            </footer>
          )}
        </div>
      </article>
    )
  }

  const panel = (
      <section className={`growth-panel ${embedded ? 'growth-panel--embedded' : ''}`} onMouseDown={embedded ? undefined : (event) => event.stopPropagation()}>
        <header className="growth-panel__header">
          <div>
            <span>{zh ? '操作日历' : 'Activity calendar'}</span>
            <h2>{node.title}</h2>
            <p>{zh ? `${entries.length} 个时间节点` : `${entries.length} timeline events`}</p>
          </div>
          {embedded
            ? <button type="button" className="mobile-page-back mobile-page-back--panel" onClick={onClose}>‹ <span>{zh ? '返回主题' : 'Back to theme'}</span></button>
            : <button type="button" className="icon-button" onClick={onClose}>×</button>}
        </header>

        <nav className="growth-tabs">
          <button type="button" className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')}>
            {zh ? '当前球' : 'Current idea'}
          </button>
          {isRoot && (
            <button type="button" className={tab === 'theme' ? 'is-active' : ''} onClick={() => setTab('theme')}>
              {zh ? '整个主题操作' : 'Theme activity'} <em>{theme.length}</em>
            </button>
          )}
        </nav>

        {tab === 'mine' ? (
          <>
            <form className="growth-composer growth-composer--simple" onSubmit={submit}>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={zh ? '补充一条想法、说明或阶段结论……' : 'Add a note, explanation, or current conclusion…'}
                maxLength={1200}
                rows={3}
              />
              <div className="growth-composer__footer">
                <small>{content.length}/1200</small>
                <button type="submit" className="primary-button compact" disabled={!content.trim()}>
                  ＋ {zh ? '添加记录' : 'Add record'}
                </button>
              </div>
            </form>
            <div className="growth-timeline">
              {entries.length
                ? entries.map((entry) => renderEntry(entry))
                : <div className="growth-empty">{zh ? '暂无操作记录。' : 'No activity yet.'}</div>}
            </div>
          </>
        ) : (
          <div className="growth-timeline growth-timeline--theme">
            {theme.map((item) => renderEntry(item.entry, item))}
          </div>
        )}
      </section>
  )

  if (embedded) return panel
  return (
    <div className="modal-backdrop growth-backdrop" role="presentation" onMouseDown={onClose}>
      {panel}
    </div>
  )
}
