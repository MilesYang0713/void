import type { CSSProperties } from 'react'
import type { Language } from '../../i18n'
import type { DeletedIdeaItem } from '../../types'
import { countNodes } from '../../utils/tree'

interface BlackHolePanelProps {
  items: DeletedIdeaItem[]
  language: Language
  onClose: () => void
  onRestore: (id: string) => void
  onDeleteForever: (id: string) => void
  onEmpty: () => void
}

function remainingDays(expiresAt: string) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000))
}

export default function BlackHolePanel({ items, language, onClose, onRestore, onDeleteForever, onEmpty }: BlackHolePanelProps) {
  const sorted = [...items].sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt))

  return (
    <aside className="black-hole-panel" aria-label={language === 'zh-CN' ? '黑洞' : 'Black hole'}>
      <header className="black-hole-panel__header">
        <div>
          <span>{language === 'zh-CN' ? '最近删除' : 'Recently deleted'}</span>
          <h2>{language === 'zh-CN' ? '黑洞' : 'Black hole'}</h2>
        </div>
        <button type="button" onClick={onClose}>×</button>
      </header>

      <div className="black-hole-visual" aria-hidden="true">
        <span className="black-hole-visual__disc" />
        <span className="black-hole-visual__ring black-hole-visual__ring--one" />
        <span className="black-hole-visual__ring black-hole-visual__ring--two" />
        <small>{items.length}</small>
      </div>

      <p className="black-hole-panel__hint">
        {language === 'zh-CN'
          ? '删除的灵感会在这里保留 14 天，到期后自动永久消失。恢复时会优先回到原来的位置。'
          : 'Deleted ideas stay here for 14 days, then disappear permanently. Restore returns them to their previous location when possible.'}
      </p>

      <div className="black-hole-list">
        {sorted.length === 0 ? (
          <div className="black-hole-empty">{language === 'zh-CN' ? '黑洞目前是空的。' : 'The black hole is empty.'}</div>
        ) : sorted.map((item) => {
          const descendants = countNodes(item.node.children)
          return (
            <article key={item.id} className="black-hole-card" style={{ '--black-hole-color': item.node.color } as CSSProperties}>
              <i className="black-hole-card__orb" />
              <div className="black-hole-card__body">
                <strong>{item.node.title}</strong>
                <p>{item.node.description || (language === 'zh-CN' ? '暂无简介' : 'No description')}</p>
                <small>
                  {language === 'zh-CN'
                    ? `${descendants} 个后代 · 剩余 ${remainingDays(item.expiresAt)} 天`
                    : `${descendants} descendants · ${remainingDays(item.expiresAt)} days left`}
                </small>
                <div>
                  <button type="button" onClick={() => onRestore(item.id)}>{language === 'zh-CN' ? '恢复' : 'Restore'}</button>
                  <button type="button" className="danger" onClick={() => onDeleteForever(item.id)}>{language === 'zh-CN' ? '永久删除' : 'Delete forever'}</button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {sorted.length > 0 && (
        <button type="button" className="black-hole-empty-all" onClick={onEmpty}>
          {language === 'zh-CN' ? '清空黑洞' : 'Empty black hole'}
        </button>
      )}
    </aside>
  )
}
