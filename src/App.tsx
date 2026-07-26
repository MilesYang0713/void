import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Universe from './components/Universe'
import AuthScreen from './components/auth/AuthScreen'
import IdeaEditor from './components/ui/IdeaEditor'
import SettingsPanel from './components/ui/SettingsPanel'
import QuickCapture, { type CaptureMode, type QuickCapturePayload } from './components/ui/QuickCapture'
import TreeNavigator from './components/ui/TreeNavigator'
import { defaultIdeas } from './data/ideas'
import { UI_TEXT } from './i18n'
import { useLocalFirstSpace } from './hooks/useLocalFirstSpace'
import type { DragStatus, IdeaDraft, IdeaNodeData, RelationTransition, Vec3, ViewTransition } from './types'
import { PARENT_REST_POSITION, createChildPositions, createRootPositions } from './utils/layout'
import {
  cloneTree,
  countNodes,
  findNode,
  findPath,
  insertNode,
  makeIdeaId,
  moveNodeToRoot,
  moveNodeUnder,
  removeNode,
  touchNode,
  updateNode,
  updateNodePosition,
} from './utils/tree'

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; nodeId: string }
  | null

const initialTransition: ViewTransition = {
  serial: 0,
  previousId: null,
  startPosition: [0, 0, -0.8],
  startScale: 0.48,
  direction: 'jump',
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export default function App() {
  const {
    configured,
    session,
    authReady,
    dataReady,
    ideas,
    setIdeas,
    language,
    setLanguage,
    syncStatus,
    lastSyncedAt,
    isOnline,
    authError,
    signIn,
    signUp,
    signOut,
    exportBackup,
    importBackup,
    syncNow,
  } = useLocalFirstSpace()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewTransition, setViewTransition] = useState<ViewTransition>(initialTransition)
  const [editor, setEditor] = useState<EditorState>(null)
  const [treeOpen, setTreeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dragStatus, setDragStatus] = useState<DragStatus | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null)
  const [quickToast, setQuickToast] = useState<string | null>(null)
  const [relationTransition, setRelationTransition] = useState<RelationTransition | null>(null)

  const copy = UI_TEXT[language]
  const selectedPath = useMemo(() => findPath(ideas, selectedId), [ideas, selectedId])
  const selectedIdea = selectedPath.at(-1) ?? null
  const parentIdea = selectedPath.length > 1 ? selectedPath.at(-2) ?? null : null
  const previousIdea = useMemo(() => findNode(ideas, viewTransition.previousId), [ideas, viewTransition.previousId])
  const editingNode = editor?.mode === 'edit' ? findNode(ideas, editor.nodeId) : null
  const totalIdeas = useMemo(() => countNodes(ideas), [ideas])
  const overlayOpen = Boolean(editor || treeOpen || settingsOpen || captureMode)
  const lastSyncTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString(language === 'zh-CN' ? 'zh-CN' : 'en-AU', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null
  const syncLabel = syncStatus === 'offline' || !isOnline
    ? copy.syncOffline(totalIdeas)
    : syncStatus === 'syncing'
      ? copy.syncing(totalIdeas)
      : syncStatus === 'pending'
        ? copy.syncPending(totalIdeas)
        : syncStatus === 'error'
          ? copy.syncError(totalIdeas)
          : copy.syncSynced(totalIdeas, lastSyncTime)

  const importData = async (file: File) => {
    const confirmed = window.confirm(copy.confirmImport)
    if (!confirmed) return
    try {
      await importBackup(file)
      const toast = copy.importSuccess
      setQuickToast(toast)
      window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2800)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : copy.importFailed)
    }
  }

  const leaveAccount = async () => {
    if (!window.confirm(copy.confirmSignOut)) return
    await signOut()
  }

  const registerUse = (id: string) => {
    setIdeas((current) => touchNode(current, id))
  }

  const startTransition = (
    nextId: string,
    startPosition: Vec3,
    startScale: number,
    direction: ViewTransition['direction'],
  ) => {
    if (nextId === selectedId) return

    registerUse(nextId)
    setViewTransition({
      serial: Date.now(),
      previousId: selectedId,
      startPosition,
      startScale,
      direction,
    })
    setSelectedId(nextId)
  }

  const selectFromUniverse = (id: string, position: Vec3, scale: number) => {
    startTransition(id, position, scale, 'forward')
  }

  const jumpToIdea = (id: string | null) => {
    if (id === selectedId) return

    if (!id) {
      const rootId = selectedPath[0]?.id ?? selectedIdea?.id ?? null
      setViewTransition({
        serial: Date.now(),
        previousId: rootId,
        startPosition: [0, 0, 0],
        startScale: 1.28,
        direction: 'exit',
      })
      setSelectedId(null)
      return
    }

    startTransition(id, [0, 0, -1.3], 0.4, 'jump')
  }

  const goBack = () => {
    if (!selectedIdea) return

    if (!parentIdea) {
      setViewTransition({
        serial: Date.now(),
        previousId: selectedIdea.id,
        startPosition: [0, 0, 0],
        startScale: 1.28,
        direction: 'exit',
      })
      setSelectedId(null)
      return
    }

    registerUse(parentIdea.id)
    setViewTransition({
      serial: Date.now(),
      previousId: selectedIdea.id,
      startPosition: PARENT_REST_POSITION,
      startScale: 0.34,
      direction: 'back',
    })
    setSelectedId(parentIdea.id)
  }

  const openCreate = () => {
    setTreeOpen(false)
    setSettingsOpen(false)
    setCaptureMode(null)
    setEditor({ mode: 'create' })
  }
  const openEdit = () => {
    if (!selectedIdea) return
    setTreeOpen(false)
    setSettingsOpen(false)
    setCaptureMode(null)
    setEditor({ mode: 'edit', nodeId: selectedIdea.id })
  }

  const saveEditor = (draft: IdeaDraft) => {
    if (editor?.mode === 'edit' && editingNode) {
      setIdeas((current) => updateNode(current, editingNode.id, draft))
      setEditor(null)
      return
    }

    const timestamp = new Date().toISOString()
    const entryPosition: Vec3 = selectedIdea
      ? createChildPositions(selectedIdea.children.length + 1).at(-1) ?? [1.4, -0.8, 0]
      : createRootPositions(ideas.length + 1).at(-1) ?? [1.4, -0.8, 0]

    const newIdea: IdeaNodeData = {
      id: makeIdeaId(),
      title: draft.title,
      description: draft.description,
      color: draft.color,
      createdAt: timestamp,
      updatedAt: timestamp,
      accessCount: 1,
      childCreationCount: 0,
      lastAccessedAt: timestamp,
      position: selectedIdea ? undefined : entryPosition,
      children: [],
    }

    setViewTransition({
      serial: Date.now(),
      previousId: selectedIdea?.id ?? null,
      startPosition: entryPosition,
      startScale: 0.08,
      direction: 'create',
    })
    setIdeas((current) => insertNode(current, selectedIdea?.id ?? null, newIdea))
    setSelectedId(newIdea.id)
    setEditor(null)
  }

  const moveRoot = (id: string, position: Vec3) => {
    setIdeas((current) => updateNodePosition(current, id, position))
  }

  const nestNode = (
    movingId: string,
    targetId: string,
    sourcePosition: Vec3,
    targetPosition: Vec3,
    sourceScale: number,
    targetScale: number,
  ) => {
    if (relationTransition) return
    const movingNode = findNode(ideas, movingId)
    const targetNode = findNode(ideas, targetId)
    if (!movingNode || !targetNode) return

    const transition: RelationTransition = {
      serial: Date.now(),
      kind: 'nest',
      movingId,
      targetId,
      sourcePosition,
      targetPosition,
      sourceScale,
      targetScale: Math.max(0.18, targetScale * 0.52),
      color: movingNode.color,
      targetColor: targetNode.color,
    }
    setRelationTransition(transition)
    setDragStatus(null)

    // Keep both source and target in their original positions while the carrier
    // travels. Commit the tree change only when the visual reaches the target.
    window.setTimeout(() => {
      setIdeas((current) => moveNodeUnder(current, movingId, targetId))
    }, 1740)
    window.setTimeout(() => {
      setRelationTransition((current) => current?.serial === transition.serial ? null : current)
    }, 2460)
  }

  const detachNode = (
    movingId: string,
    sourcePosition: Vec3,
    targetPosition: Vec3,
    sourceScale: number,
  ) => {
    if (relationTransition) return
    const movingNode = findNode(ideas, movingId)
    if (!movingNode) return

    const transition: RelationTransition = {
      serial: Date.now(),
      kind: 'detach',
      movingId,
      sourcePosition,
      targetPosition,
      sourceScale,
      targetScale: 0.82,
      color: movingNode.color,
    }
    setRelationTransition(transition)
    setDragStatus(null)

    window.setTimeout(() => {
      setIdeas((current) => moveNodeToRoot(current, movingId, targetPosition))
      setSelectedId(null)
      setViewTransition(initialTransition)
    }, 1900)
    window.setTimeout(() => {
      setRelationTransition((current) => current?.serial === transition.serial ? null : current)
    }, 2700)
  }

  const detachSelected = () => {
    if (!selectedIdea || !parentIdea) return
    const confirmed = window.confirm(copy.confirmDetach(selectedIdea.title))
    if (!confirmed) return

    const position = createRootPositions(ideas.length + 1).at(-1) ?? [2.8, -1.4, 0]
    detachNode(selectedIdea.id, [0, 0, 0], position, 1.28)
  }

  const openCapture = (mode: CaptureMode) => {
    setTreeOpen(false)
    setSettingsOpen(false)
    setEditor(null)
    setCaptureMode(mode)
  }

  const saveQuickCapture = (payload: QuickCapturePayload) => {
    const timestamp = new Date().toISOString()
    const destinationId = payload.parentId
    const palette = ['#a855f7', '#22d3ee', '#60a5fa', '#34d399', '#f59e0b', '#f472b6']
    const colorSeed = [...payload.title].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const position = destinationId
      ? undefined
      : createRootPositions(ideas.length + 1).at(-1) ?? [2.8, -1.4, 0]

    const newIdea: IdeaNodeData = {
      id: makeIdeaId(),
      title: payload.title,
      description: payload.description,
      color: palette[colorSeed % palette.length],
      createdAt: timestamp,
      updatedAt: timestamp,
      accessCount: 0,
      childCreationCount: 0,
      lastAccessedAt: timestamp,
      position,
      children: [],
    }

    setIdeas((current) => insertNode(current, destinationId, newIdea))
    setCaptureMode(null)
    const destinationNode = destinationId ? findNode(ideas, destinationId) : null
    const destinationLabel = destinationNode ? destinationNode.title : copy.voidRoot
    const toast = copy.quickSaved(payload.title, destinationLabel)
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2600)
  }

  const deleteSelected = () => {
    if (!selectedIdea) return
    const descendants = countNodes(selectedIdea.children)
    const confirmed = window.confirm(copy.confirmDelete(selectedIdea.title, descendants))
    if (!confirmed) return

    setIdeas((current) => removeNode(current, selectedIdea.id))
    setSelectedId(parentIdea?.id ?? null)
    setViewTransition(initialTransition)
  }

  const resetIdeas = () => {
    const confirmed = window.confirm(copy.confirmReset)
    if (!confirmed) return

    setIdeas(cloneTree(defaultIdeas))
    setSelectedId(null)
    setViewTransition(initialTransition)
    setTreeOpen(false)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      if (event.key === 'Escape') {
        if (captureMode) setCaptureMode(null)
        else if (editor) setEditor(null)
        else if (settingsOpen) setSettingsOpen(false)
        else if (treeOpen) setTreeOpen(false)
        else goBack()
        return
      }

      if (editor || treeOpen || settingsOpen || captureMode || dragStatus || relationTransition) return

      if (event.code === 'Space') {
        event.preventDefault()
        openCapture('quick')
        return
      }

      if (event.key.toLowerCase() === 'q') openCapture('quick')
      if (event.key.toLowerCase() === 'c') openCapture('compose')
      if (event.key.toLowerCase() === 'n') openCreate()
      if (event.key.toLowerCase() === 'e' && selectedIdea) openEdit()
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIdea) deleteSelected()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  if (!authReady) {
    return (
      <AuthScreen
        configured={configured}
        loading
        language={language}
        onLanguageChange={setLanguage}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    )
  }

  if (!configured || !session) {
    return (
      <AuthScreen
        configured={configured}
        language={language}
        authError={authError}
        onLanguageChange={setLanguage}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    )
  }

  if (!dataReady) {
    return (
      <AuthScreen
        configured={configured}
        loading
        language={language}
        onLanguageChange={setLanguage}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    )
  }

  return (
    <main className={`app-shell ${overlayOpen ? 'app-shell--overlay-open' : ''}`}>
      <Universe
        roots={ideas}
        currentNode={selectedIdea}
        parentNode={parentIdea}
        previousNode={previousIdea}
        transition={viewTransition}
        language={language}
        onSelect={selectFromUniverse}
        onBack={goBack}
        onMoveRoot={moveRoot}
        onNestNode={nestNode}
        onDetachNode={detachNode}
        relationTransition={relationTransition}
        onDragStatusChange={setDragStatus}
      />

      <header className="brand">
        <span className="brand-mark">悟</span>
        <span>
          <strong>VOID</strong>
          <small>{copy.prototype}</small>
        </span>
      </header>

      <nav className="breadcrumbs" aria-label="Idea path">
        <button type="button" onClick={() => jumpToIdea(null)} className={!selectedIdea ? 'is-current' : ''}>
          {copy.void}
        </button>
        {selectedPath.map((node) => (
          <span key={node.id}>
            <i>/</i>
            <button
              type="button"
              onClick={() => jumpToIdea(node.id)}
              className={selectedIdea?.id === node.id ? 'is-current' : ''}
            >
              {node.title}
            </button>
          </span>
        ))}
      </nav>

      {!selectedIdea && (
        <section className="welcome-panel">
          <p>{copy.homeEyebrow}</p>
          <h1>{ideas.length > 0 ? copy.exploreUniverse : copy.createFirstIdea}</h1>
          <span>{copy.homeHint}</span>
        </section>
      )}

      {selectedIdea && (
        <section className="idea-panel" style={{ '--panel-color': selectedIdea.color } as CSSProperties}>
          <span className="idea-panel__eyebrow">{copy.levelIdea(selectedPath.length)}</span>
          <h2>{selectedIdea.title}</h2>
          <p>{selectedIdea.description || copy.missingDescription}</p>

          <div className="idea-meta">
            <span>{copy.directBranches(selectedIdea.children.length)}</span>
            <span>{copy.descendants(countNodes(selectedIdea.children))}</span>
            <span>{copy.visits(selectedIdea.accessCount ?? 0)}</span>
          </div>

          {selectedIdea.children.length === 0 && <div className="empty-branch">{copy.emptyBranch}</div>}

          <div className="idea-panel__actions">
            <button type="button" className="primary-button compact" onClick={openCreate}>
              ＋ {copy.addBranch}
            </button>
            <button type="button" className="secondary-button compact" onClick={openEdit}>
              {copy.edit}
            </button>
            {parentIdea && (
              <button type="button" className="secondary-button compact detach-button" onClick={detachSelected}>
                ↗ {copy.detach}
              </button>
            )}
            <button type="button" className="ghost-danger compact" onClick={deleteSelected}>
              {copy.delete}
            </button>
          </div>

          <button type="button" className="back-button" onClick={goBack}>
            ← {copy.backPrevious} <kbd>Esc</kbd>
          </button>
        </section>
      )}

      <div className="action-dock">
        <button type="button" className="dock-button dock-button--quick" onClick={() => openCapture('quick')}>
          <b>⚡</b>
          <span>{copy.quickCapture}</span>
          <kbd>Space</kbd>
        </button>
        <button type="button" className="dock-button dock-button--compose" onClick={() => openCapture('compose')}>
          <b>◇</b>
          <span>{copy.compose}</span>
          <kbd>C</kbd>
        </button>
        <button type="button" className="dock-button dock-button--primary" onClick={openCreate}>
          <b>＋</b>
          <span>{selectedIdea ? copy.addBranch : copy.newCore}</span>
          <kbd>N</kbd>
        </button>
        <button
          type="button"
          className="dock-button"
          onClick={() => {
            setSettingsOpen(false)
            setCaptureMode(null)
            setEditor(null)
            setTreeOpen((open) => !open)
          }}
        >
          <b>⌘</b>
          <span>{copy.allStructure}</span>
        </button>
        <button
          type="button"
          className={`dock-button ${settingsOpen ? 'dock-button--active' : ''}`}
          onClick={() => {
            setTreeOpen(false)
            setCaptureMode(null)
            setEditor(null)
            setSettingsOpen((open) => !open)
          }}
        >
          <b>⚙</b>
          <span>{copy.settings}</span>
        </button>
      </div>

      {relationTransition && (
        <div className="relation-indicator">
          <span className="relation-indicator__line" />
          <strong>{copy.relationAnimating}</strong>
        </div>
      )}

      {dragStatus && (
        <div className={`drag-indicator ${dragStatus.targetTitle ? 'drag-indicator--target' : ''} ${dragStatus.detachReady ? 'drag-indicator--detach' : ''}`}>
          <span className="drag-indicator__orb" />
          <div>
            <strong>
              {dragStatus.targetTitle
                ? copy.releaseToNest(dragStatus.sourceTitle, dragStatus.targetTitle)
                : dragStatus.detachReady
                  ? copy.releaseToDetach(dragStatus.sourceTitle)
                  : copy.moving(dragStatus.sourceTitle)}
            </strong>
            <small>
              {dragStatus.targetTitle
                ? copy.targetHint
                : dragStatus.detachReady
                  ? copy.detachTargetHint
                  : dragStatus.scope === 'branch' ? copy.dragBranch : copy.freeMoveHint}
            </small>
          </div>
          {dragStatus.scope === 'branch' && !dragStatus.targetTitle && (
            <span
              className="drag-indicator__progress"
              style={{ '--detach-progress': `${Math.round((dragStatus.detachProgress ?? 0) * 100)}%` } as CSSProperties}
            />
          )}
        </div>
      )}

      {treeOpen && (
        <TreeNavigator
          ideas={ideas}
          selectedId={selectedId}
          language={language}
          onSelect={(id) => {
            jumpToIdea(id)
            setTreeOpen(false)
          }}
          onClose={() => setTreeOpen(false)}
          onReset={resetIdeas}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          language={language}
          onLanguageChange={setLanguage}
          onClose={() => setSettingsOpen(false)}
          accountEmail={session.user.email ?? ''}
          syncStatus={syncStatus}
          isOnline={isOnline}
          lastSyncedAt={lastSyncedAt}
          totalIdeas={totalIdeas}
          onSyncNow={() => void syncNow()}
          onExport={exportBackup}
          onImport={(file) => void importData(file)}
          onSignOut={() => void leaveAccount()}
        />
      )}

      {captureMode && (
        <QuickCapture
          mode={captureMode}
          language={language}
          ideas={ideas}
          currentId={selectedIdea?.id ?? null}
          onClose={() => setCaptureMode(null)}
          onSave={saveQuickCapture}
        />
      )}

      {editor && (
        <IdeaEditor
          mode={editor.mode}
          node={editingNode}
          parentTitle={selectedIdea?.title ?? null}
          language={language}
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}

      {quickToast && <div className="quick-toast">✓ {quickToast}</div>}

      <footer className="status-bar">
        <span className={`status-dot status-dot--${syncStatus}`} />
        <span>{syncLabel}</span>
      </footer>
    </main>
  )
}
