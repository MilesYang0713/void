import { useMemo, useState } from 'react'
import type { Language } from '../../i18n'
import type { VersionHistoryEntry } from '../../types'

type VersionDraft = Omit<VersionHistoryEntry, 'id' | 'createdAt' | 'updatedAt'>

interface VersionHistoryPanelProps {
  language: Language
  entries: VersionHistoryEntry[]
  onAdd: (draft: VersionDraft) => void
  onUpdate: (id: string, draft: VersionDraft) => void
  onDelete: (id: string) => void
}

const EMPTY_DRAFT: VersionDraft = {
  version: '',
  title: '',
  reason: '',
  changedTo: '',
  result: '',
}

function formatDate(value: string, language: Language) {
  return new Date(value).toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function VersionHistoryPanel({
  language,
  entries,
  onAdd,
  onUpdate,
  onDelete,
}: VersionHistoryPanelProps) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<VersionDraft>(EMPTY_DRAFT)

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [entries],
  )

  const copy = language === 'zh-CN'
    ? {
        eyebrow: '产品演化档案',
        title: 'VOID 版本演化',
        description: '记录每一次产品方向变化：为什么要改、具体改成什么，以及使用后的结果。这里保存的是 VOID 自己的成长路线。',
        add: '记录新节点',
        cancel: '取消',
        save: '保存节点',
        update: '保存修改',
        version: '版本或阶段',
        versionPlaceholder: '例如：v0.17.0 / 移动端阶段',
        titleLabel: '节点标题',
        titlePlaceholder: '例如：速记默认进入灵感箱',
        reason: '为什么更改',
        reasonPlaceholder: '原来的设计遇到了什么问题？为什么需要调整？',
        changedTo: '改为了什么',
        changedToPlaceholder: '最终采用了什么方案？具体变化是什么？',
        result: '结果与后续',
        resultPlaceholder: '实际使用效果如何？下一步准备验证什么？',
        edit: '编辑',
        delete: '删除',
        confirmDelete: '删除这个版本演化节点吗？此操作只删除说明，不会影响宇宙数据。',
        empty: '还没有版本演化记录。创建第一个节点，开始保存 VOID 的成长路线。',
        updated: '更新于',
      }
    : {
        eyebrow: 'Product evolution archive',
        title: 'VOID evolution history',
        description: 'Record every product-direction change: why it changed, what replaced it, and what happened afterward.',
        add: 'Add milestone',
        cancel: 'Cancel',
        save: 'Save milestone',
        update: 'Save changes',
        version: 'Version or stage',
        versionPlaceholder: 'For example: v0.17.0 / Mobile capture stage',
        titleLabel: 'Milestone title',
        titlePlaceholder: 'For example: Quick captures now enter the inbox',
        reason: 'Why it changed',
        reasonPlaceholder: 'What problem did the previous design create?',
        changedTo: 'What it became',
        changedToPlaceholder: 'What solution replaced it, and what exactly changed?',
        result: 'Result and next step',
        resultPlaceholder: 'What happened in real use, and what should be tested next?',
        edit: 'Edit',
        delete: 'Delete',
        confirmDelete: 'Delete this evolution milestone? This only removes the note and does not affect universe data.',
        empty: 'No evolution milestones yet. Add the first one to preserve how VOID develops.',
        updated: 'Updated',
      }

  const beginCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setComposerOpen(true)
  }

  const beginEdit = (entry: VersionHistoryEntry) => {
    setEditingId(entry.id)
    setDraft({
      version: entry.version,
      title: entry.title,
      reason: entry.reason,
      changedTo: entry.changedTo,
      result: entry.result,
    })
    setComposerOpen(true)
  }

  const closeComposer = () => {
    setComposerOpen(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  const submit = () => {
    const normalized = {
      version: draft.version.trim(),
      title: draft.title.trim(),
      reason: draft.reason.trim(),
      changedTo: draft.changedTo.trim(),
      result: draft.result.trim(),
    }
    if (!normalized.title || !normalized.reason || !normalized.changedTo) return
    if (editingId) onUpdate(editingId, normalized)
    else onAdd(normalized)
    closeComposer()
  }

  return (
    <section className="version-history-view">
      <div className="version-history-intro">
        <div>
          <span>{copy.eyebrow}</span>
          <h3>{copy.title}</h3>
          <p>{copy.description}</p>
        </div>
        <button type="button" className="primary-button compact" onClick={beginCreate}>
          ＋ {copy.add}
        </button>
      </div>

      {composerOpen && (
        <div className="version-history-composer">
          <div className="version-history-form-grid">
            <label>
              <span>{copy.version}</span>
              <input
                value={draft.version}
                placeholder={copy.versionPlaceholder}
                onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))}
              />
            </label>
            <label>
              <span>{copy.titleLabel}</span>
              <input
                autoFocus
                value={draft.title}
                placeholder={copy.titlePlaceholder}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
          </div>
          <label>
            <span>{copy.reason}</span>
            <textarea
              rows={3}
              value={draft.reason}
              placeholder={copy.reasonPlaceholder}
              onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
            />
          </label>
          <label>
            <span>{copy.changedTo}</span>
            <textarea
              rows={3}
              value={draft.changedTo}
              placeholder={copy.changedToPlaceholder}
              onChange={(event) => setDraft((current) => ({ ...current, changedTo: event.target.value }))}
            />
          </label>
          <label>
            <span>{copy.result}</span>
            <textarea
              rows={3}
              value={draft.result}
              placeholder={copy.resultPlaceholder}
              onChange={(event) => setDraft((current) => ({ ...current, result: event.target.value }))}
            />
          </label>
          <div className="version-history-composer__actions">
            <button type="button" className="secondary-button" onClick={closeComposer}>{copy.cancel}</button>
            <button
              type="button"
              className="primary-button"
              disabled={!draft.title.trim() || !draft.reason.trim() || !draft.changedTo.trim()}
              onClick={submit}
            >
              {editingId ? copy.update : copy.save}
            </button>
          </div>
        </div>
      )}

      {sortedEntries.length === 0 ? (
        <div className="version-history-empty">{copy.empty}</div>
      ) : (
        <div className="version-history-timeline">
          {sortedEntries.map((entry) => (
            <article className="version-history-entry" key={entry.id}>
              <div className="version-history-entry__rail">
                <span />
              </div>
              <div className="version-history-entry__card">
                <header>
                  <div>
                    {entry.version && <em>{entry.version}</em>}
                    <h4>{entry.title}</h4>
                  </div>
                  <time>{formatDate(entry.createdAt, language)}</time>
                </header>
                <div className="version-history-entry__section">
                  <strong>{copy.reason}</strong>
                  <p>{entry.reason}</p>
                </div>
                <div className="version-history-entry__section version-history-entry__section--change">
                  <strong>{copy.changedTo}</strong>
                  <p>{entry.changedTo}</p>
                </div>
                {entry.result && (
                  <div className="version-history-entry__section version-history-entry__section--result">
                    <strong>{copy.result}</strong>
                    <p>{entry.result}</p>
                  </div>
                )}
                <footer>
                  {entry.updatedAt !== entry.createdAt && <small>{copy.updated} {formatDate(entry.updatedAt, language)}</small>}
                  <span />
                  <button type="button" onClick={() => beginEdit(entry)}>{copy.edit}</button>
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => {
                      if (window.confirm(copy.confirmDelete)) onDelete(entry.id)
                    }}
                  >
                    {copy.delete}
                  </button>
                </footer>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
