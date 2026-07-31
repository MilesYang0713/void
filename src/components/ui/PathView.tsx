import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Language } from '../../i18n'
import type { IdeaNodeData } from '../../types'
import { countNodes } from '../../utils/tree'
import { exportIdeaWord } from '../../utils/wordExport'

interface LayoutNode {
  node: IdeaNodeData
  x: number
  y: number
  depth: number
}

interface LayoutEdge {
  from: LayoutNode
  to: LayoutNode
}

const COLUMN_WIDTH = 280
const ROW_HEIGHT = 118
const NODE_WIDTH = 190
const NODE_HEIGHT = 76

function layoutTree(root: IdeaNodeData) {
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  let nextLeaf = 0

  const visit = (node: IdeaNodeData, depth: number): LayoutNode => {
    let y: number
    if (node.children.length === 0) {
      y = nextLeaf * ROW_HEIGHT
      nextLeaf += 1
    } else {
      const children = node.children.map((child) => visit(child, depth + 1))
      y = children.reduce((sum, child) => sum + child.y, 0) / children.length
    }

    const current: LayoutNode = { node, x: depth * COLUMN_WIDTH, y, depth }
    nodes.push(current)
    node.children.forEach((child) => {
      const target = nodes.find((entry) => entry.node.id === child.id)
      if (target) edges.push({ from: current, to: target })
    })
    return current
  }

  const rootLayout = visit(root, 0)
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxY = Math.max(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x))
  return {
    nodes: nodes.map((node) => ({ ...node, y: node.y - minY + 120 })),
    edges: edges.map((edge) => ({
      from: { ...edge.from, y: edge.from.y - minY + 120 },
      to: { ...edge.to, y: edge.to.y - minY + 120 },
    })),
    width: maxX + NODE_WIDTH + 220,
    height: maxY - minY + NODE_HEIGHT + 240,
    rootLayout: { ...rootLayout, y: rootLayout.y - minY + 120 },
  }
}

interface PathViewProps {
  roots: IdeaNodeData[]
  initialRootId: string | null
  language: Language
  onClose: () => void
  onOpenIdea: (id: string) => void
  onMoveToInbox: (id: string) => void
}

export default function PathView({
  roots,
  initialRootId,
  language,
  onClose,
  onOpenIdea,
  onMoveToInbox,
}: PathViewProps) {
  const labels = language === 'zh-CN'
    ? {
        eyebrow: '横向思路路径',
        close: '关闭',
        previous: '上一个主体',
        next: '下一个主体',
        open3d: '在宇宙中打开',
        export: '导出当前主体 Word',
        empty: '还没有可以展示的主体。',
        hint: '滚轮缩放 · 按住空白拖动画布 · 双击节点进入 3D 宇宙',
        inbox: '拖入灵感箱',
        branches: '个后代',
      }
    : {
        eyebrow: 'Horizontal thought path',
        close: 'Close',
        previous: 'Previous core',
        next: 'Next core',
        open3d: 'Open in universe',
        export: 'Export current core to Word',
        empty: 'There are no core ideas to display.',
        hint: 'Wheel to zoom · drag empty space to pan · double-click a node to open it in 3D',
        inbox: 'Drag into inbox',
        branches: ' descendants',
      }

  const initialIndex = Math.max(0, roots.findIndex((root) => root.id === initialRootId))
  const [rootIndex, setRootIndex] = useState(initialIndex)
  const [scale, setScale] = useState(0.9)
  const [offset, setOffset] = useState({ x: 80, y: 60 })
  const panRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  useEffect(() => {
    setRootIndex((current) => Math.min(current, Math.max(0, roots.length - 1)))
  }, [roots.length])

  useEffect(() => {
    if (!initialRootId) return
    const nextIndex = roots.findIndex((root) => root.id === initialRootId)
    if (nextIndex >= 0) setRootIndex(nextIndex)
  }, [initialRootId, roots])

  const currentRoot = roots[rootIndex] ?? null
  const layout = useMemo(() => currentRoot ? layoutTree(currentRoot) : null, [currentRoot])

  const switchRoot = (direction: -1 | 1) => {
    if (roots.length === 0) return
    setRootIndex((current) => (current + direction + roots.length) % roots.length)
    setScale(0.9)
    setOffset({ x: 80, y: 60 })
  }

  return (
    <section className="path-view" role="dialog" aria-modal="true">
      <header className="path-view__header">
        <div>
          <span>{labels.eyebrow}</span>
          <h2>{currentRoot?.title ?? 'VOID'}</h2>
          {currentRoot && <p>{rootIndex + 1} / {roots.length} · {countNodes(currentRoot.children)} {labels.branches}</p>}
        </div>
        <div
          className="path-view__root-switcher"
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={language === 'zh-CN' ? '切换主体' : 'Switch core idea'}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              switchRoot(-1)
            }}
            disabled={roots.length <= 1}
            aria-label={labels.previous}
            title={labels.previous}
          >
            ↑
          </button>
          <span>{roots.length > 0 ? `${rootIndex + 1} / ${roots.length}` : '0 / 0'}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              switchRoot(1)
            }}
            disabled={roots.length <= 1}
            aria-label={labels.next}
            title={labels.next}
          >
            ↓
          </button>
        </div>

        <div className="path-view__actions">
          {currentRoot && (
            <>
              <button type="button" onClick={() => exportIdeaWord(currentRoot)}>↓ {labels.export}</button>
              <button type="button" onClick={() => onOpenIdea(currentRoot.id)}>◎ {labels.open3d}</button>
            </>
          )}
          <button type="button" className="panel-close" onClick={onClose} aria-label={labels.close}>×</button>
        </div>
      </header>

      {currentRoot && layout ? (
        <div
          className="path-view__viewport"
          onWheel={(event) => {
            event.preventDefault()
            setScale((current) => Math.min(1.8, Math.max(0.38, current - event.deltaY * 0.001)))
          }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('.path-node, button, .path-view__root-switcher, .path-view__zoom')) return
            panRef.current = { x: offset.x, y: offset.y, startX: event.clientX, startY: event.clientY }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const pan = panRef.current
            if (!pan) return
            setOffset({ x: pan.x + event.clientX - pan.startX, y: pan.y + event.clientY - pan.startY })
          }}
          onPointerUp={() => { panRef.current = null }}
        >
          <div
            className="path-canvas"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          >
            <svg className="path-edges" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.map(({ from, to }) => {
                const startX = from.x + NODE_WIDTH
                const startY = from.y + NODE_HEIGHT / 2
                const endX = to.x
                const endY = to.y + NODE_HEIGHT / 2
                const middle = (startX + endX) / 2
                return (
                  <path
                    key={`${from.node.id}-${to.node.id}`}
                    d={`M ${startX} ${startY} C ${middle} ${startY}, ${middle} ${endY}, ${endX} ${endY}`}
                    style={{ '--edge-color': to.node.color } as CSSProperties}
                  />
                )
              })}
            </svg>

            {layout.nodes.map(({ node, x, y, depth }) => (
              <article
                key={node.id}
                className={`path-node ${depth === 0 ? 'path-node--root' : ''}`}
                style={{ left: x, top: y, '--node-color': node.color } as CSSProperties}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-void-idea', node.id)
                  event.dataTransfer.setData('text/plain', `void-idea:${node.id}`)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDoubleClick={() => onOpenIdea(node.id)}
              >
                <span className="path-node__orb" />
                <div>
                  <strong>{node.title}</strong>
                  <p>{node.description || '—'}</p>
                  <small>{node.children.length} / {countNodes(node.children)}</small>
                </div>
                <button type="button" title={labels.inbox} onClick={() => onMoveToInbox(node.id)}>▣</button>
              </article>
            ))}
          </div>

          <div className="path-view__zoom">
            <button type="button" onClick={() => setScale((value) => Math.min(1.8, value + 0.12))}>＋</button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((value) => Math.max(0.38, value - 0.12))}>－</button>
          </div>
          <p className="path-view__hint">{labels.hint}</p>
        </div>
      ) : (
        <div className="path-view__empty">{labels.empty}</div>
      )}
    </section>
  )
}
