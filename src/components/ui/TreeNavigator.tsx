import type { CSSProperties } from 'react'
import type { Language } from '../../i18n'
import { UI_TEXT } from '../../i18n'
import type { IdeaNodeData } from '../../types'

interface TreeNavigatorProps {
  ideas: IdeaNodeData[]
  selectedId: string | null
  language: Language
  onSelect: (id: string | null) => void
  onClose: () => void
  onReset: () => void
}

interface TreeBranchProps {
  nodes: IdeaNodeData[]
  selectedId: string | null
  onSelect: (id: string) => void
  depth?: number
}

function TreeBranch({ nodes, selectedId, onSelect, depth = 0 }: TreeBranchProps) {
  return (
    <ul className="tree-list" style={{ '--tree-depth': depth } as CSSProperties}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className={`tree-node ${selectedId === node.id ? 'tree-node--active' : ''}`}
            onClick={() => onSelect(node.id)}
          >
            <span className="tree-node__orb" style={{ background: node.color, boxShadow: `0 0 13px ${node.color}` }} />
            <span className="tree-node__title">{node.title}</span>
            {node.children.length > 0 && <span className="tree-node__count">{node.children.length}</span>}
          </button>
          {node.children.length > 0 && (
            <TreeBranch nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

export default function TreeNavigator({ ideas, selectedId, language, onSelect, onClose, onReset }: TreeNavigatorProps) {
  const copy = UI_TEXT[language]

  return (
    <aside className="tree-navigator">
      <header className="tree-navigator__header">
        <div>
          <span>{copy.consciousnessStructure}</span>
          <h2>{copy.allIdeas}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}>
          ×
        </button>
      </header>

      <button type="button" className={`tree-root ${selectedId === null ? 'tree-root--active' : ''}`} onClick={() => onSelect(null)}>
        <span>✦</span>
        {copy.returnVoidRoot}
      </button>

      <div className="tree-scroll">
        {ideas.length > 0 ? (
          <TreeBranch nodes={ideas} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <p className="tree-empty">{copy.emptyVoid}</p>
        )}
      </div>

      <footer className="tree-navigator__footer">
        <button type="button" className="danger-link" onClick={onReset}>
          {copy.restoreExamples}
        </button>
      </footer>
    </aside>
  )
}
