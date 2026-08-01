import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { Language } from '../../i18n'
import type { IdeaNodeData } from '../../types'
import type { SyncStatus } from '../../hooks/useLocalFirstSpace'
import { countNodes, findNode, findPath } from '../../utils/tree'

export type MobileTab = 'themes' | 'quick' | 'inbox' | 'settings'

interface MobileShellProps {
  ideas: IdeaNodeData[]
  inboxCount: number
  language: Language
  syncStatus: SyncStatus
  isOnline: boolean
  accountEmail: string
  activeTab: MobileTab
  pageContent?: ReactNode
  themePageContent?: ReactNode
  onTabChange: (tab: MobileTab) => void
  onThemeChange: (id: string | null) => void
  onCompose: (parentId: string | null) => void
  onOpenGrowth: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => boolean
  floatingQuickEnabled: boolean
  floatingQuickOpacity: number
}

interface GestureState {
  pointerId: number
  startX: number
  lastX: number
  startedAt: number
}

interface FloatingGestureState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}

function circularDistance(index: number, active: number, length: number) {
  if (length <= 1) return 0
  let distance = index - active
  if (distance > length / 2) distance -= length
  if (distance < -length / 2) distance += length
  return distance
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readFloatingPosition() {
  const fallback = {
    x: Math.max(14, window.innerWidth - 76),
    y: Math.max(108, Math.min(window.innerHeight - 168, window.innerHeight * 0.58)),
  }
  try {
    const raw = window.localStorage.getItem('void-mobile-floating-quick-position')
    if (!raw) return fallback
    const value = JSON.parse(raw) as Partial<{ x: number; y: number }>
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return fallback
    return { x: value.x as number, y: value.y as number }
  } catch {
    return fallback
  }
}

function clampFloatingPosition(position: { x: number; y: number }) {
  const size = 58
  const side = 10
  const top = 72
  const bottom = 92
  return {
    x: clamp(position.x, side, Math.max(side, window.innerWidth - size - side)),
    y: clamp(position.y, top, Math.max(top, window.innerHeight - size - bottom)),
  }
}

export default function MobileShell({
  ideas,
  inboxCount,
  language,
  syncStatus,
  isOnline,
  accountEmail,
  activeTab,
  pageContent,
  themePageContent,
  onTabChange,
  onThemeChange,
  onCompose,
  onOpenGrowth,
  onEdit,
  onDelete,
  floatingQuickEnabled,
  floatingQuickOpacity,
}: MobileShellProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [floatingPosition, setFloatingPosition] = useState(() => clampFloatingPosition(readFloatingPosition()))
  const [floatingDragging, setFloatingDragging] = useState(false)
  const gestureRef = useRef<GestureState | null>(null)
  const floatingGestureRef = useRef<FloatingGestureState | null>(null)
  const wheelLockRef = useRef(false)
  const dragFrameRef = useRef<number | null>(null)
  const pendingDragXRef = useRef(0)
  const floatingFrameRef = useRef<number | null>(null)
  const pendingFloatingPositionRef = useRef(floatingPosition)

  const labels = language === 'zh-CN'
    ? {
        title: '主题', quick: '速记', compose: '构思', inbox: '灵感箱', settings: '设置',
        empty: '你的虚空还没有主体。先创建第一颗主题球。',
        swipe: '左右滑动切换主题', open: '进入主题', branches: '直接分支',
        descendants: '全部后代', records: '操作记录', thinkHere: '构思到这里', activity: '操作日历',
        noDescription: '暂时没有简介', noBranches: '这个主题还没有分支。',
        online: '云端已连接', offline: '离线保存中', syncing: '正在同步', pending: '等待同步', error: '同步异常',
        viewActivity: '查看操作日历', back: '返回主题轮换', backLevel: '返回上一级', themeDetail: '主题详情',
        addBranch: '添加分支', editDetail: '编辑详情', deleteIdea: '删除', openBranch: '进入分支',
      }
    : {
        title: 'Themes', quick: 'Capture', compose: 'Compose', inbox: 'Inbox', settings: 'Settings',
        empty: 'Your void has no core themes yet. Create the first theme.',
        swipe: 'Swipe to rotate themes', open: 'Enter theme', branches: 'Direct branches',
        descendants: 'All descendants', records: 'Activity records', thinkHere: 'Compose here', activity: 'Activity calendar',
        noDescription: 'No description yet', noBranches: 'This theme has no branches yet.',
        online: 'Cloud connected', offline: 'Saving offline', syncing: 'Syncing', pending: 'Waiting to sync', error: 'Sync issue',
        viewActivity: 'View activity calendar', back: 'Back to theme ring', backLevel: 'Back one level', themeDetail: 'Theme detail',
        addBranch: 'Add branch', editDetail: 'Edit details', deleteIdea: 'Delete', openBranch: 'Open branch',
      }

  const tabLabels: Record<MobileTab, string> = {
    themes: labels.title,
    quick: labels.quick,
    inbox: labels.inbox,
    settings: labels.settings,
  }

  useEffect(() => {
    if (ideas.length === 0) {
      setActiveIndex(0)
      onThemeChange(null)
      return
    }
    const rememberedId = window.localStorage.getItem('void-mobile-active-theme')
    const rememberedIndex = rememberedId ? ideas.findIndex((idea) => idea.id === rememberedId) : -1
    setActiveIndex((current) => rememberedIndex >= 0 ? rememberedIndex : clamp(current, 0, ideas.length - 1))
  }, [ideas, onThemeChange])

  useEffect(() => {
    if (activeTab !== 'themes') setDetailOpen(false)
  }, [activeTab])

  useEffect(() => {
    const keepInViewport = () => setFloatingPosition((current) => clampFloatingPosition(current))
    window.addEventListener('resize', keepInViewport)
    window.addEventListener('orientationchange', keepInViewport)
    return () => {
      window.removeEventListener('resize', keepInViewport)
      window.removeEventListener('orientationchange', keepInViewport)
    }
  }, [])

  useEffect(() => () => {
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current)
    if (floatingFrameRef.current !== null) window.cancelAnimationFrame(floatingFrameRef.current)
  }, [])

  const activeTheme = ideas[activeIndex] ?? null
  const detailPath = useMemo(
    () => activeTheme ? findPath([activeTheme], detailNodeId ?? activeTheme.id) : [],
    [activeTheme, detailNodeId],
  )
  const detailNode = detailPath.at(-1) ?? activeTheme
  const detailParent = detailPath.length > 1 ? detailPath.at(-2) ?? null : null

  useEffect(() => {
    if (!activeTheme) return
    window.localStorage.setItem('void-mobile-active-theme', activeTheme.id)
    onThemeChange(activeTheme.id)
  }, [activeTheme, onThemeChange])

  useEffect(() => {
    if (!detailOpen) return
    if (!activeTheme) {
      setDetailOpen(false)
      setDetailNodeId(null)
      return
    }
    if (!findNode([activeTheme], detailNodeId ?? activeTheme.id)) {
      setDetailNodeId(activeTheme.id)
    }
  }, [activeTheme, detailNodeId, detailOpen])

  const scheduleDragX = (value: number) => {
    pendingDragXRef.current = value
    if (dragFrameRef.current !== null) return
    dragFrameRef.current = window.requestAnimationFrame(() => {
      setDragX(pendingDragXRef.current)
      dragFrameRef.current = null
    })
  }

  const selectRelative = (delta: number) => {
    if (ideas.length <= 1) return
    pendingDragXRef.current = 0
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    setActiveIndex((current) => (current + delta + ideas.length) % ideas.length)
    setDragX(0)
  }

  const releaseGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const movement = event.clientX - gesture.startX
    const elapsed = Math.max(1, performance.now() - gesture.startedAt)
    const velocity = movement / elapsed
    gestureRef.current = null
    setIsDragging(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    if (Math.abs(movement) > 38 || Math.abs(velocity) > 0.32) {
      selectRelative(movement < 0 ? 1 : -1)
    } else {
      scheduleDragX(0)
    }
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const dominant = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (Math.abs(dominant) < 10 || wheelLockRef.current) return
    event.preventDefault()
    wheelLockRef.current = true
    selectRelative(dominant > 0 ? 1 : -1)
    window.setTimeout(() => { wheelLockRef.current = false }, 340)
  }

  const syncText = !isOnline || syncStatus === 'offline'
    ? labels.offline
    : syncStatus === 'syncing'
      ? labels.syncing
      : syncStatus === 'pending'
        ? labels.pending
        : syncStatus === 'error'
          ? labels.error
          : labels.online

  const visibleIdeas = useMemo(() => ideas.map((idea, index) => ({
    idea,
    offset: circularDistance(index, activeIndex, ideas.length),
  })).filter(({ offset }) => Math.abs(offset) <= 3), [ideas, activeIndex])

  const dragProgress = dragX / 112

  const switchTab = (tab: MobileTab) => {
    if (tab !== 'themes') setDetailOpen(false)
    onTabChange(tab)
  }

  const scheduleFloatingPosition = (position: { x: number; y: number }) => {
    pendingFloatingPositionRef.current = clampFloatingPosition(position)
    if (floatingFrameRef.current !== null) return
    floatingFrameRef.current = window.requestAnimationFrame(() => {
      setFloatingPosition(pendingFloatingPositionRef.current)
      floatingFrameRef.current = null
    })
  }

  const releaseFloatingQuick = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = floatingGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    floatingGestureRef.current = null
    setFloatingDragging(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const finalPosition = clampFloatingPosition(pendingFloatingPositionRef.current)
    setFloatingPosition(finalPosition)
    window.localStorage.setItem('void-mobile-floating-quick-position', JSON.stringify(finalPosition))
    if (!gesture.moved) switchTab('quick')
  }

  const openActiveThemeDetail = () => {
    if (!activeTheme) return
    setDetailNodeId(activeTheme.id)
    setDetailOpen(true)
  }

  const goBackFromDetail = () => {
    if (detailParent) {
      setDetailNodeId(detailParent.id)
      return
    }
    setDetailOpen(false)
    setDetailNodeId(null)
  }

  const deleteCurrentDetail = () => {
    if (!detailNode) return
    const deleted = onDelete(detailNode.id)
    if (!deleted) return
    if (detailParent) {
      setDetailNodeId(detailParent.id)
    } else {
      setDetailOpen(false)
      setDetailNodeId(null)
    }
  }

  const renderThemeRing = () => (
    <section className="mobile-theme-stage mobile-theme-stage--ring mobile-theme-stage--reordered" aria-label={labels.title}>
      {ideas.length === 0 ? (
        <div className="mobile-empty-state">
          <span className="mobile-empty-orb" />
          <p>{labels.empty}</p>
          <button type="button" onClick={() => onCompose(null)}>＋ {language === 'zh-CN' ? '创建第一主题' : 'Create first theme'}</button>
        </div>
      ) : activeTheme && (
        <>
          <article className="mobile-theme-summary mobile-theme-summary--ring mobile-theme-summary--top">
            <span>{activeIndex + 1} / {ideas.length}</span>
            <h1>{activeTheme.title}</h1>
            <p>{activeTheme.description || labels.noDescription}</p>
            <div className="mobile-theme-metrics">
              <b>{activeTheme.children.length}<small>{labels.branches}</small></b>
              <b>{countNodes(activeTheme.children)}<small>{labels.descendants}</small></b>
              <b>{activeTheme.growthEntries?.length ?? 0}<small>{labels.records}</small></b>
            </div>
          </article>

          <div className="mobile-theme-visual">
            <div
              className={`mobile-theme-ring ${isDragging ? 'mobile-theme-ring--dragging' : ''}`}
              onPointerDown={(event) => {
                gestureRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  lastX: event.clientX,
                  startedAt: performance.now(),
                }
                pendingDragXRef.current = dragX
                setIsDragging(true)
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                const gesture = gestureRef.current
                if (!gesture || gesture.pointerId !== event.pointerId) return
                gesture.lastX = event.clientX
                scheduleDragX(clamp(event.clientX - gesture.startX, -125, 125))
              }}
              onPointerUp={releaseGesture}
              onPointerCancel={releaseGesture}
              onWheel={handleWheel}
            >
              <div className="mobile-ring-atmosphere" aria-hidden="true"><i /><i /><i /></div>
              <div className="mobile-orbit-carousel">
                {visibleIdeas.map(({ idea, offset }) => {
                  const continuousOffset = offset + dragProgress
                  const angle = continuousOffset * 56
                  const radians = angle * Math.PI / 180
                  const depthRatio = Math.max(0, Math.cos(radians))
                  const absolute = Math.abs(continuousOffset)
                  const x = Math.sin(radians) * 178
                  const y = -4 + (1 - depthRatio) * 36 + Math.sin(radians * 1.15) * 4
                  const z = (depthRatio - 1) * 310
                  const scale = 0.34 + Math.pow(depthRatio, 1.8) * 0.91
                  const opacity = clamp(0.1 + depthRatio * 0.94 - Math.max(0, absolute - 2.35) * 0.12, 0.06, 1)
                  const visualOrder = Math.round(depthRatio * 100)
                  const isActive = offset === 0

                  return (
                    <button
                      type="button"
                      key={idea.id}
                      className={`mobile-theme-orb mobile-theme-orb--ring ${isActive ? 'mobile-theme-orb--active' : ''}`}
                      style={{
                        '--orb-color': idea.color,
                        '--orb-x': `${x}px`,
                        '--orb-y': `${y}px`,
                        '--orb-scale': scale,
                        '--orb-opacity': opacity,
                        '--orb-depth': `${z}px`,
                        '--orb-rotate-y': `${-angle * 0.32}deg`,
                        zIndex: visualOrder,
                      } as CSSProperties}
                      onClick={() => {
                        if (Math.abs(dragX) > 6) return
                        const index = ideas.findIndex((candidate) => candidate.id === idea.id)
                        if (index === activeIndex) openActiveThemeDetail()
                        else setActiveIndex(index)
                      }}
                      aria-label={idea.title}
                    >
                      <span className="mobile-theme-orb__halo" />
                      <span className="mobile-theme-orb__shell"><i /><i /><i /></span>
                      {isActive && idea.children.slice(0, 6).map((child, childIndex) => (
                        <em
                          key={child.id}
                          title={child.title}
                          style={{
                            '--satellite-color': child.color,
                            '--satellite-angle': `${childIndex * (360 / Math.min(6, idea.children.length || 1))}deg`,
                          } as CSSProperties}
                        />
                      ))}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mobile-arc-navigator" aria-label={labels.swipe}>
              <button type="button" className="mobile-arc-arrow mobile-arc-arrow--left" onClick={() => selectRelative(-1)} aria-label={language === 'zh-CN' ? '上一个主题' : 'Previous theme'}>
                <svg className="mobile-arc-arrow__glyph" viewBox="0 0 44 28" aria-hidden="true">
                  <path className="mobile-arc-arrow__path mobile-arc-arrow__path--outer" d="M23 4 L13 14 L23 24" />
                  <path className="mobile-arc-arrow__path mobile-arc-arrow__path--inner" d="M37 4 L27 14 L37 24" />
                </svg>
              </button>
              <svg viewBox="0 0 320 86" aria-hidden="true">
                <defs>
                  <linearGradient id="mobileArcGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
                    <stop offset=".22" stopColor="#a78bfa" stopOpacity=".7" />
                    <stop offset=".5" stopColor="#e9d5ff" stopOpacity=".95" />
                    <stop offset=".78" stopColor="#a78bfa" stopOpacity=".7" />
                    <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className="mobile-arc-track" d="M18 58 Q160 -8 302 58" />
                <path className="mobile-arc-flow" d="M18 58 Q160 -8 302 58" />
                <circle className="mobile-arc-center-halo" cx="160" cy="15" r="7" />
                <circle className="mobile-arc-center-core" cx="160" cy="15" r="2.6" />
              </svg>
              <button type="button" className="mobile-arc-arrow mobile-arc-arrow--right" onClick={() => selectRelative(1)} aria-label={language === 'zh-CN' ? '下一个主题' : 'Next theme'}>
                <svg className="mobile-arc-arrow__glyph" viewBox="0 0 44 28" aria-hidden="true">
                  <path className="mobile-arc-arrow__path mobile-arc-arrow__path--inner" d="M7 4 L17 14 L7 24" />
                  <path className="mobile-arc-arrow__path mobile-arc-arrow__path--outer" d="M21 4 L31 14 L21 24" />
                </svg>
              </button>
              <small>{labels.swipe}</small>
            </div>
          </div>

          <div className="mobile-theme-primary-actions mobile-theme-primary-actions--bottom">
            <button type="button" className="mobile-open-theme" onClick={openActiveThemeDetail}><span>{labels.open}</span><b>↗</b></button>
            <button type="button" className="mobile-activity-shortcut" onClick={() => onOpenGrowth(activeTheme.id)}><span>▤</span><b>{labels.viewActivity}</b><em>{activeTheme.growthEntries?.length ?? 0}</em></button>
          </div>
        </>
      )}
    </section>
  )

  const renderThemeDetail = () => detailNode && (
    <section className="mobile-native-page mobile-theme-detail-page">
      <button type="button" className="mobile-page-back" onClick={goBackFromDetail}>
        ‹ <span>{detailParent ? labels.backLevel : labels.back}</span>
      </button>

      <header className="mobile-native-page__header mobile-detail-header">
        <span>{labels.themeDetail}</span>
        <h1>{detailNode.title}</h1>
        <p>{detailNode.description || labels.noDescription}</p>
        {detailPath.length > 1 && (
          <nav className="mobile-detail-breadcrumb" aria-label={language === 'zh-CN' ? '分支路径' : 'Branch path'}>
            {detailPath.map((node, index) => (
              <button
                type="button"
                key={node.id}
                className={index === detailPath.length - 1 ? 'is-current' : ''}
                onClick={() => setDetailNodeId(node.id)}
              >
                {node.title}
              </button>
            ))}
          </nav>
        )}
      </header>

      <div className="mobile-detail-overview" style={{ '--detail-color': detailNode.color } as CSSProperties}>
        <div className="mobile-detail-overview__metrics">
          <span><b>{detailNode.children.length}</b><small>{labels.branches}</small></span>
          <span><b>{countNodes(detailNode.children)}</b><small>{labels.descendants}</small></span>
          <span><b>{detailNode.growthEntries?.length ?? 0}</b><small>{labels.records}</small></span>
        </div>
        <button
          type="button"
          className="mobile-detail-add-branch"
          onClick={() => onCompose(detailNode.id)}
          aria-label={labels.addBranch}
          title={labels.addBranch}
        >
          <i />
          <b>＋</b>
          <small>{labels.addBranch}</small>
        </button>
      </div>

      <div className="mobile-native-actions mobile-native-actions--detail">
        <button type="button" onClick={() => onEdit(detailNode.id)}>✎ {labels.editDetail}</button>
        <button type="button" onClick={() => onOpenGrowth(detailNode.id)}>▤ {labels.activity}</button>
        <button type="button" className="mobile-danger-action" onClick={deleteCurrentDetail}>⌫ {labels.deleteIdea}</button>
      </div>

      <section className="mobile-detail-section">
        <header><h2>{labels.branches}</h2><span>{detailNode.children.length}</span></header>
        {detailNode.children.length === 0 ? <p className="mobile-native-empty">{labels.noBranches}</p> : (
          <div className="mobile-native-list mobile-native-list--drilldown">
            {detailNode.children.map((child) => (
              <button
                type="button"
                className="mobile-native-list__item"
                key={child.id}
                style={{ '--item-color': child.color } as CSSProperties}
                onClick={() => setDetailNodeId(child.id)}
                aria-label={`${labels.openBranch}: ${child.title}`}
              >
                <span className="mobile-native-list__orb" />
                <span className="mobile-native-list__copy">
                  <strong>{child.title}</strong>
                  <small>{child.description || labels.noDescription}</small>
                </span>
                <span className="mobile-native-list__chevron">›</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <footer className="mobile-page-account">{accountEmail}</footer>
    </section>
  )

  const showThemeContent = activeTab === 'themes' && themePageContent
  const pageTitle = tabLabels[activeTab]

  return (
    <main className={`mobile-void-shell mobile-void-shell--ring mobile-void-shell--tabs mobile-tab-${activeTab}`}>
      <div className="mobile-cosmos" aria-hidden="true">
        <i className="mobile-nebula mobile-nebula--one" />
        <i className="mobile-nebula mobile-nebula--two" />
        <i className="mobile-starfield mobile-starfield--near" />
        <i className="mobile-starfield mobile-starfield--far" />
      </div>

      <header className="mobile-topbar mobile-topbar--tabs">
        <div className="mobile-brand">
          <span>悟</span>
          <div><strong>VOID</strong><small>{activeTab === 'themes' ? 'Mobile Universe' : pageTitle}</small></div>
        </div>
        <div className={`mobile-sync mobile-sync--${syncStatus}`}><i /><span>{syncText}</span></div>
      </header>

      <div className="mobile-shell-content">
        {activeTab === 'themes'
          ? (showThemeContent
              ? <section className="mobile-tab-page mobile-tab-page--theme-subpage">{themePageContent}</section>
              : detailOpen ? renderThemeDetail() : renderThemeRing())
          : <section className={`mobile-tab-page mobile-tab-page--${activeTab}`}>{pageContent}</section>}
      </div>

      {floatingQuickEnabled && activeTab === 'themes' && !detailOpen && !themePageContent && (
        <button
          type="button"
          className={`mobile-floating-quick ${floatingDragging ? 'mobile-floating-quick--dragging' : ''}`}
          style={{
            left: `${floatingPosition.x}px`,
            top: `${floatingPosition.y}px`,
            '--floating-opacity': clamp(floatingQuickOpacity, 0.25, 1),
          } as CSSProperties}
          aria-label={language === 'zh-CN' ? '悬浮速记' : 'Floating quick capture'}
          onPointerDown={(event) => {
            floatingGestureRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: floatingPosition.x,
              originY: floatingPosition.y,
              moved: false,
            }
            pendingFloatingPositionRef.current = floatingPosition
            setFloatingDragging(true)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const gesture = floatingGestureRef.current
            if (!gesture || gesture.pointerId !== event.pointerId) return
            const deltaX = event.clientX - gesture.startX
            const deltaY = event.clientY - gesture.startY
            if (Math.hypot(deltaX, deltaY) > 5) gesture.moved = true
            scheduleFloatingPosition({ x: gesture.originX + deltaX, y: gesture.originY + deltaY })
          }}
          onPointerUp={releaseFloatingQuick}
          onPointerCancel={(event) => {
            const gesture = floatingGestureRef.current
            if (gesture) gesture.moved = true
            releaseFloatingQuick(event)
          }}
        >
          <span>⚡</span>
          <small>{labels.quick}</small>
        </button>
      )}

      <nav className="mobile-bottom-dock mobile-bottom-dock--tabs" aria-label={language === 'zh-CN' ? '移动端页面导航' : 'Mobile page navigation'}>
        <button type="button" className={activeTab === 'themes' ? 'is-active' : ''} onClick={() => switchTab('themes')}><b>◉</b><span>{labels.title}</span></button>
        <button type="button" className={activeTab === 'quick' ? 'is-active' : ''} onClick={() => switchTab('quick')}><b>⚡</b><span>{labels.quick}</span></button>
        <button type="button" className={`mobile-dock-inbox ${activeTab === 'inbox' ? 'is-active' : ''}`} onClick={() => switchTab('inbox')}><b>▣</b><span>{labels.inbox}</span>{inboxCount > 0 && <em>{inboxCount}</em>}</button>
        <button type="button" className={activeTab === 'settings' ? 'is-active' : ''} onClick={() => switchTab('settings')}><b>⚙</b><span>{labels.settings}</span></button>
      </nav>
    </main>
  )
}
