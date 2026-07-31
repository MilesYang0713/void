import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Universe from './components/Universe'
import AuthScreen from './components/auth/AuthScreen'
import IdeaEditor from './components/ui/IdeaEditor'
import SettingsPanel from './components/ui/SettingsPanel'
import QuickCapture, { type CaptureMode, type QuickCapturePayload } from './components/ui/QuickCapture'
import TreeNavigator from './components/ui/TreeNavigator'
import PathView from './components/ui/PathView'
import IdeaInbox from './components/ui/IdeaInbox'
import GlobalSearch from './components/ui/GlobalSearch'
import BlackHolePanel from './components/ui/BlackHolePanel'
import GrowthPanel from './components/ui/GrowthPanel'
import { defaultIdeas } from './data/ideas'
import { UI_TEXT } from './i18n'
import { exportAllIdeasWord, exportIdeaWord } from './utils/wordExport'
import { useLocalFirstSpace } from './hooks/useLocalFirstSpace'
import type { DeletedIdeaItem, DragStatus, GrowthEntry, GrowthEntryType, IdeaDraft, IdeaNodeData, RelationTransition, Vec3, VersionHistoryEntry, ViewTransition } from './types'
import { PARENT_REST_POSITION, createChildPositions, createRootPositions } from './utils/layout'
import {
  cloneTree,
  countNodes,
  extractNode,
  findNode,
  findPath,
  getParentId,
  insertNode,
  makeIdeaId,
  moveNodeToRoot,
  moveNodeUnder,
  removeInboxMetadata,
  removeNode,
  touchNode,
  updateNode,
  updateNodePosition,
  updateGrowthEntries,
  makeGrowthEntryId,
} from './utils/tree'

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; nodeId: string }
  | null

type VersionEntryDraft = Omit<VersionHistoryEntry, 'id' | 'createdAt' | 'updatedAt'>

interface UndoEntry {
  label: string
  ideas: IdeaNodeData[]
  inbox: IdeaNodeData[]
  blackHole: DeletedIdeaItem[]
  selectedId: string | null
}

const BLACK_HOLE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

function cloneBlackHole(items: DeletedIdeaItem[]): DeletedIdeaItem[] {
  return items.map((item) => ({
    ...item,
    originalPosition: item.originalPosition ? [...item.originalPosition] as Vec3 : undefined,
    node: cloneTree([item.node])[0],
  }))
}


function makeActivityEntry(
  type: GrowthEntryType,
  content: string,
  options: Partial<GrowthEntry> = {},
): GrowthEntry {
  const timestamp = new Date().toISOString()
  return {
    id: makeGrowthEntryId(),
    type,
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
    editable: false,
    ...options,
  }
}

function appendActivity(
  nodes: IdeaNodeData[],
  id: string,
  entry: GrowthEntry,
): IdeaNodeData[] {
  return updateGrowthEntries(nodes, id, (entries) => [...entries, entry])
}

function appendNodeActivity(node: IdeaNodeData, entry: GrowthEntry): IdeaNodeData {
  return {
    ...node,
    growthEntries: [...(node.growthEntries ?? []), entry],
    updatedAt: entry.createdAt,
    lastAccessedAt: entry.createdAt,
  }
}

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
    inbox,
    setInbox,
    blackHole,
    setBlackHole,
    versionHistory,
    setVersionHistory,
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
    backupHistory,
    backupHistoryStatus,
    backupAction,
    refreshBackupHistory,
    createCloudBackup,
    restoreCloudBackup,
    deleteCloudBackup,
  } = useLocalFirstSpace()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewTransition, setViewTransition] = useState<ViewTransition>(initialTransition)
  const [editor, setEditor] = useState<EditorState>(null)
  const [treeOpen, setTreeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pathOpen, setPathOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [blackHoleOpen, setBlackHoleOpen] = useState(false)
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null)
  const [dockOpen, setDockOpen] = useState(false)
  const [inboxDropActive, setInboxDropActive] = useState(false)
  const [dragStatus, setDragStatus] = useState<DragStatus | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null)
  const [quickToast, setQuickToast] = useState<string | null>(null)
  const [relationTransition, setRelationTransition] = useState<RelationTransition | null>(null)
  const [growthOpen, setGrowthOpen] = useState(false)

  const copy = UI_TEXT[language]
  const selectedPath = useMemo(() => findPath(ideas, selectedId), [ideas, selectedId])
  const selectedIdea = selectedPath.at(-1) ?? null
  const parentIdea = selectedPath.length > 1 ? selectedPath.at(-2) ?? null : null
  const selectedGrowthEntries = selectedIdea?.growthEntries ?? []
  const previousIdea = useMemo(() => findNode(ideas, viewTransition.previousId), [ideas, viewTransition.previousId])
  const editingNode = editor?.mode === 'edit' ? findNode(ideas, editor.nodeId) : null
  const totalIdeas = useMemo(() => countNodes(ideas) + countNodes(inbox), [ideas, inbox])
  const overlayOpen = Boolean(editor || treeOpen || settingsOpen || captureMode || pathOpen || inboxOpen || blackHoleOpen || growthOpen)
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

  const captureUndo = (label: string) => {
    setUndoEntry({
      label,
      ideas: cloneTree(ideas),
      inbox: cloneTree(inbox),
      blackHole: cloneBlackHole(blackHole),
      selectedId,
    })
  }

  const undoLastAction = () => {
    if (!undoEntry || relationTransition) return
    setIdeas(cloneTree(undoEntry.ideas))
    setInbox(cloneTree(undoEntry.inbox))
    setBlackHole(cloneBlackHole(undoEntry.blackHole))
    setSelectedId(undoEntry.selectedId)
    setViewTransition(initialTransition)
    setDragStatus(null)
    setUndoEntry(null)
    const toast = language === 'zh-CN' ? `已撤销：${undoEntry.label}` : `Undone: ${undoEntry.label}`
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2200)
  }

  const addVersionEntry = (draft: VersionEntryDraft) => {
    const timestamp = new Date().toISOString()
    setVersionHistory((current) => [{
      id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...draft,
      createdAt: timestamp,
      updatedAt: timestamp,
    }, ...current])
  }

  const updateVersionEntry = (id: string, draft: VersionEntryDraft) => {
    const timestamp = new Date().toISOString()
    setVersionHistory((current) => current.map((entry) => entry.id === id
      ? { ...entry, ...draft, updatedAt: timestamp }
      : entry))
  }

  const deleteVersionEntry = (id: string) => {
    setVersionHistory((current) => current.filter((entry) => entry.id !== id))
  }

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
    setPathOpen(false)
    setInboxOpen(false)
    setBlackHoleOpen(false)
    setGrowthOpen(false)
    setEditor({ mode: 'create' })
  }
  const openEdit = () => {
    if (!selectedIdea) return
    setTreeOpen(false)
    setSettingsOpen(false)
    setCaptureMode(null)
    setPathOpen(false)
    setInboxOpen(false)
    setBlackHoleOpen(false)
    setGrowthOpen(false)
    setEditor({ mode: 'edit', nodeId: selectedIdea.id })
  }

  const saveEditor = (draft: IdeaDraft) => {
    captureUndo(editor?.mode === 'edit' ? (language === 'zh-CN' ? '编辑灵感' : 'edit idea') : (language === 'zh-CN' ? '新建灵感' : 'create idea'))
    if (editor?.mode === 'edit' && editingNode) {
      const changes: GrowthEntry[] = []
      if (editingNode.title !== draft.title) {
        changes.push(makeActivityEntry(
          'edit',
          language === 'zh-CN' ? `名称由「${editingNode.title}」改为「${draft.title}」` : `Renamed “${editingNode.title}” to “${draft.title}”`,
          { previousContent: editingNode.title, nextContent: draft.title, field: 'title' },
        ))
      }
      if (editingNode.description !== draft.description) {
        changes.push(makeActivityEntry(
          'edit',
          language === 'zh-CN' ? '修改了简介' : 'Updated description',
          { previousContent: editingNode.description || (language === 'zh-CN' ? '（空）' : '(empty)'), nextContent: draft.description || (language === 'zh-CN' ? '（空）' : '(empty)'), field: 'description' },
        ))
      }
      if (editingNode.color !== draft.color) {
        changes.push(makeActivityEntry(
          'edit',
          language === 'zh-CN' ? '修改了能量颜色' : 'Changed energy colour',
          { previousContent: editingNode.color, nextContent: draft.color, field: 'color' },
        ))
      }

      setIdeas((current) => {
        let next = updateNode(current, editingNode.id, draft)
        for (const entry of changes) next = appendActivity(next, editingNode.id, entry)
        return next
      })
      setEditor(null)
      return
    }

    const timestamp = new Date().toISOString()
    const entryPosition: Vec3 = selectedIdea
      ? createChildPositions(selectedIdea.children.length + 1).at(-1) ?? [1.4, -0.8, 0]
      : createRootPositions(ideas.length + 1).at(-1) ?? [1.4, -0.8, 0]

    const createdEntry: GrowthEntry = {
      id: makeGrowthEntryId(),
      type: 'created',
      content: draft.description
        ? (language === 'zh-CN' ? `创建灵感。初始简介：${draft.description}` : `Created idea. Initial description: ${draft.description}`)
        : (language === 'zh-CN' ? '创建了这颗灵感' : 'Created this idea'),
      createdAt: timestamp,
      updatedAt: timestamp,
      editable: false,
    }

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
      growthEntries: [createdEntry],
      children: [],
    }

    setViewTransition({
      serial: Date.now(),
      previousId: selectedIdea?.id ?? null,
      startPosition: entryPosition,
      startScale: 0.08,
      direction: 'create',
    })
    setIdeas((current) => {
      let next = insertNode(current, selectedIdea?.id ?? null, newIdea)
      if (selectedIdea) {
        next = appendActivity(next, selectedIdea.id, makeActivityEntry(
          'branch',
          language === 'zh-CN' ? `新增分支「${draft.title}」` : `Added branch “${draft.title}”`,
          { field: 'structure' },
        ))
      }
      return next
    })
    setSelectedId(newIdea.id)
    setEditor(null)
  }

  const moveRoot = (id: string, position: Vec3) => {
    captureUndo(language === 'zh-CN' ? '移动主球' : 'move core')
    setIdeas((current) => appendActivity(
      updateNodePosition(current, id, position),
      id,
      makeActivityEntry('move', language === 'zh-CN' ? '重新放置了主球位置' : 'Repositioned the core idea', { field: 'position' }),
    ))
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
    captureUndo(language === 'zh-CN' ? '融合分支' : 'nest branch')
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
      setIdeas((current) => {
        let next = moveNodeUnder(current, movingId, targetId)
        next = appendActivity(next, movingId, makeActivityEntry(
          'relation',
          language === 'zh-CN' ? `融入「${targetNode.title}」下面` : `Nested under “${targetNode.title}”`,
          { field: 'structure' },
        ))
        next = appendActivity(next, targetId, makeActivityEntry(
          'relation',
          language === 'zh-CN' ? `接收分支「${movingNode.title}」` : `Received branch “${movingNode.title}”`,
          { field: 'structure' },
        ))
        return next
      })
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
    captureUndo(language === 'zh-CN' ? '脱出分支' : 'detach branch')
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
      setIdeas((current) => appendActivity(
        moveNodeToRoot(current, movingId, targetPosition),
        movingId,
        makeActivityEntry('relation', language === 'zh-CN' ? '脱出原分支并成为新的主体' : 'Detached and became a new core idea', { field: 'structure' }),
      ))
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
    setPathOpen(false)
    setInboxOpen(false)
    setBlackHoleOpen(false)
    setGrowthOpen(false)
    setCaptureMode(mode)
  }

  const saveQuickCapture = (payload: QuickCapturePayload) => {
    captureUndo(payload.mode === 'quick' ? (language === 'zh-CN' ? '速记' : 'quick capture') : (language === 'zh-CN' ? '保存构思' : 'save concept'))
    const timestamp = new Date().toISOString()
    const destinationId = payload.parentId
    const palette = ['#a855f7', '#22d3ee', '#60a5fa', '#34d399', '#f59e0b', '#f472b6']
    const colorSeed = [...payload.title].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const position = payload.mode === 'quick'
      ? undefined
      : destinationId
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
      growthEntries: [{
        id: makeGrowthEntryId(),
        type: 'created',
        content: payload.description
          ? (language === 'zh-CN' ? `创建灵感。初始简介：${payload.description}` : `Created idea. Initial description: ${payload.description}`)
          : (language === 'zh-CN' ? '创建了这颗灵感' : 'Created this idea'),
        createdAt: timestamp,
        updatedAt: timestamp,
        editable: false,
      }],
      children: [],
    }

    if (payload.mode === 'quick') {
      const inboxIdea: IdeaNodeData = {
        ...newIdea,
        inboxOrigin: {
          parentId: null,
          storedAt: timestamp,
        },
      }
      setInbox((current) => [...current, inboxIdea])
    } else {
      setIdeas((current) => {
        let next = insertNode(current, destinationId, newIdea)
        if (destinationId) {
          next = appendActivity(next, destinationId, makeActivityEntry(
            'branch',
            language === 'zh-CN' ? `通过构思新增分支「${payload.title}」` : `Added branch “${payload.title}” through concept capture`,
            { field: 'structure' },
          ))
        }
        return next
      })
    }

    setCaptureMode(null)
    const destinationNode = destinationId ? findNode(ideas, destinationId) : null
    const destinationLabel = payload.mode === 'quick'
      ? copy.ideaInbox
      : destinationNode?.title ?? copy.voidRoot
    const toast = copy.quickSaved(payload.title, destinationLabel)
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2600)
  }

  const moveIdeaToInbox = (id: string) => {
    captureUndo(language === 'zh-CN' ? '放入灵感箱' : 'move to inbox')
    setInboxDropActive(false)
    const node = findNode(ideas, id)
    if (!node) return
    const originParentId = getParentId(ideas, id) ?? null
    const originPosition = node.position ? [...node.position] as Vec3 : undefined
    const result = extractNode(ideas, id)
    if (!result.extracted) return

    const inboxTime = new Date().toISOString()
    const stored: IdeaNodeData = appendNodeActivity({
      ...result.extracted,
      position: undefined,
      inboxOrigin: {
        parentId: originParentId,
        position: originPosition,
        storedAt: inboxTime,
      },
      updatedAt: inboxTime,
    }, {
      id: makeGrowthEntryId(),
      type: 'inbox',
      content: language === 'zh-CN' ? '放入灵感箱' : 'Moved into the idea inbox',
      createdAt: inboxTime,
      updatedAt: inboxTime,
      field: 'location',
      editable: false,
    })
    setIdeas(result.nodes)
    setInbox((current) => [...current, stored])
    if (selectedId && findNode([stored], selectedId)) {
      setSelectedId(null)
      setViewTransition(initialTransition)
    }
    const toast = language === 'zh-CN' ? `已将「${stored.title}」放入灵感箱` : `Moved “${stored.title}” into the inbox`
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2600)
  }

  const restoreInboxItem = (id: string, original: boolean) => {
    captureUndo(language === 'zh-CN' ? '取出灵感箱内容' : 'restore inbox item')
    const item = inbox.find((entry) => entry.id === id)
    if (!item) return
    const clean = removeInboxMetadata(item)
    const preferredParent = original ? item.inboxOrigin?.parentId ?? null : null
    const validParent = preferredParent && findNode(ideas, preferredParent) ? preferredParent : null
    const position = validParent
      ? undefined
      : item.inboxOrigin?.position ?? createRootPositions(ideas.length + 1).at(-1) ?? [2.8, -1.4, 0]
    const restoredTime = new Date().toISOString()
    const restored: IdeaNodeData = appendNodeActivity({ ...clean, position, updatedAt: restoredTime }, {
      id: makeGrowthEntryId(),
      type: 'restore',
      content: original
        ? (language === 'zh-CN' ? '从灵感箱放回原位' : 'Restored from the inbox to its previous location')
        : (language === 'zh-CN' ? '从灵感箱取出到虚空' : 'Released from the inbox into the void'),
      createdAt: restoredTime,
      updatedAt: restoredTime,
      field: 'location',
      editable: false,
    })
    setInbox((current) => current.filter((entry) => entry.id !== id))
    setIdeas((current) => insertNode(current, validParent, restored))
    const toast = language === 'zh-CN' ? `已取出「${item.title}」` : `Released “${item.title}”`
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2600)
  }

  const extractInboxBranch = (inboxRootId: string, nodeId: string) => {
    captureUndo(language === 'zh-CN' ? '取出主题分支' : 'extract stored branch')
    if (inboxRootId === nodeId) {
      restoreInboxItem(nodeId, false)
      return
    }
    const root = inbox.find((entry) => entry.id === inboxRootId)
    if (!root) return
    const result = extractNode([root], nodeId)
    if (!result.extracted || result.nodes.length === 0) return
    const position = createRootPositions(ideas.length + 1).at(-1) ?? [2.8, -1.4, 0]
    const extractedTime = new Date().toISOString()
    const extracted = appendNodeActivity({ ...removeInboxMetadata(result.extracted), position, updatedAt: extractedTime }, {
      id: makeGrowthEntryId(),
      type: 'restore',
      content: language === 'zh-CN' ? '从灵感箱中的完整主题里单独取出' : 'Extracted from a stored theme',
      createdAt: extractedTime,
      updatedAt: extractedTime,
      field: 'location',
      editable: false,
    })
    setInbox((current) => current.map((entry) => entry.id === inboxRootId ? result.nodes[0] : entry))
    setIdeas((current) => [...current, extracted])
    const toast = language === 'zh-CN' ? `已从主题中取出「${extracted.title}」` : `Extracted “${extracted.title}” from the stored theme`
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2600)
  }

  const addGrowthEntry = (content: string) => {
    if (!selectedIdea) return
    captureUndo(language === 'zh-CN' ? '添加操作记录' : 'add activity note')
    const timestamp = new Date().toISOString()
    const entry: GrowthEntry = {
      id: makeGrowthEntryId(),
      type: 'note',
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
      editable: true,
    }
    setIdeas((current) => updateGrowthEntries(current, selectedIdea.id, (entries) => [...entries, entry]))
  }

  const reviseGrowthEntry = (entryId: string, content: string, mode: 'overwrite' | 'append') => {
    if (!selectedIdea) return
    const source = (selectedIdea.growthEntries ?? []).find((entry) => entry.id === entryId)
    const revisedContent = content.trim()
    if (!source || !revisedContent || revisedContent === source.content.trim()) return

    captureUndo(language === 'zh-CN' ? '修改操作记录' : 'revise activity record')
    const timestamp = new Date().toISOString()

    if (mode === 'append') {
      const appended: GrowthEntry = {
        id: makeGrowthEntryId(),
        type: 'note',
        content: revisedContent,
        createdAt: timestamp,
        updatedAt: timestamp,
        editable: true,
      }
      setIdeas((current) => updateGrowthEntries(current, selectedIdea.id, (entries) => [...entries, appended]))
      return
    }

    const changeEvent: GrowthEntry = {
      id: makeGrowthEntryId(),
      type: 'edit',
      content: language === 'zh-CN' ? '覆盖了一条已有记录' : 'Overwrote an existing record',
      createdAt: timestamp,
      updatedAt: timestamp,
      revisionOf: source.id,
      previousContent: source.content,
      nextContent: revisedContent,
      field: 'record',
      editable: false,
    }

    setIdeas((current) => updateGrowthEntries(current, selectedIdea.id, (entries) => [
      ...entries.map((entry) => entry.id === entryId
        ? { ...entry, content: revisedContent, updatedAt: timestamp }
        : entry),
      changeEvent,
    ]))
  }

  const deleteSelected = () => {
    if (!selectedIdea) return
    const descendants = countNodes(selectedIdea.children)
    const confirmed = window.confirm(
      language === 'zh-CN'
        ? `将「${selectedIdea.title}」移入黑洞吗？${descendants > 0 ? `\n它下面的 ${descendants} 个子灵感也会一起进入。` : ''}\n黑洞会保留 14 天，期间可以恢复。`
        : `Move “${selectedIdea.title}” into the black hole?${descendants > 0 ? `\nIts ${descendants} descendants will move with it.` : ''}\nIt can be restored for 14 days.`,
    )
    if (!confirmed) return

    captureUndo(language === 'zh-CN' ? '删除到黑洞' : 'move to black hole')
    const result = extractNode(ideas, selectedIdea.id)
    if (!result.extracted) return
    const deletedAt = new Date().toISOString()
    const item: DeletedIdeaItem = {
      id: `deleted-${selectedIdea.id}-${Date.now()}`,
      node: appendNodeActivity(result.extracted, {
        id: makeGrowthEntryId(),
        type: 'delete',
        content: language === 'zh-CN' ? '移入黑洞，等待14天后自动删除' : 'Moved into the black hole for 14-day retention',
        createdAt: deletedAt,
        updatedAt: deletedAt,
        field: 'location',
        editable: false,
      }),
      originalParentId: result.parentId,
      originalPosition: selectedIdea.position ? [...selectedIdea.position] as Vec3 : undefined,
      deletedAt,
      expiresAt: new Date(Date.parse(deletedAt) + BLACK_HOLE_RETENTION_MS).toISOString(),
    }
    setIdeas(result.nodes)
    setBlackHole((current) => [item, ...current])
    setSelectedId(parentIdea?.id ?? null)
    setViewTransition(initialTransition)
    const toast = language === 'zh-CN' ? `「${selectedIdea.title}」已进入黑洞` : `“${selectedIdea.title}” entered the black hole`
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2400)
  }

  const restoreBlackHoleItem = (id: string) => {
    const item = blackHole.find((entry) => entry.id === id)
    if (!item) return
    captureUndo(language === 'zh-CN' ? '从黑洞恢复' : 'restore from black hole')
    const validParent = item.originalParentId && findNode(ideas, item.originalParentId) ? item.originalParentId : null
    const position = validParent
      ? undefined
      : item.originalPosition ?? createRootPositions(ideas.length + 1).at(-1) ?? [2.8, -1.4, 0]
    const restoredAt = new Date().toISOString()
    const restored: IdeaNodeData = appendNodeActivity({
      ...item.node,
      position,
      updatedAt: restoredAt,
    }, {
      id: makeGrowthEntryId(),
      type: 'restore',
      content: language === 'zh-CN' ? '从黑洞恢复' : 'Restored from the black hole',
      createdAt: restoredAt,
      updatedAt: restoredAt,
      field: 'location',
      editable: false,
    })
    setBlackHole((current) => current.filter((entry) => entry.id !== id))
    setIdeas((current) => insertNode(current, validParent, restored))
    const toast = language === 'zh-CN' ? `已恢复「${item.node.title}」` : `Restored “${item.node.title}”`
    setQuickToast(toast)
    window.setTimeout(() => setQuickToast((current) => current === toast ? null : current), 2200)
  }

  const deleteBlackHoleItemForever = (id: string) => {
    const item = blackHole.find((entry) => entry.id === id)
    if (!item) return
    const confirmed = window.confirm(language === 'zh-CN' ? `永久删除「${item.node.title}」吗？此操作无法撤销。` : `Permanently delete “${item.node.title}”? This cannot be undone.`)
    if (!confirmed) return
    setBlackHole((current) => current.filter((entry) => entry.id !== id))
  }

  const emptyBlackHole = () => {
    if (blackHole.length === 0) return
    const confirmed = window.confirm(language === 'zh-CN' ? '永久清空黑洞中的全部内容吗？此操作无法撤销。' : 'Permanently empty the black hole? This cannot be undone.')
    if (!confirmed) return
    setBlackHole([])
  }

  const resetIdeas = () => {
    const confirmed = window.confirm(copy.confirmReset)
    if (!confirmed) return

    captureUndo(language === 'zh-CN' ? '恢复示例' : 'restore examples')
    setIdeas(cloneTree(defaultIdeas))
    setInbox([])
    setBlackHole([])
    setSelectedId(null)
    setViewTransition(initialTransition)
    setTreeOpen(false)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undoLastAction()
        return
      }

      if (event.key === 'Escape') {
        if (captureMode) setCaptureMode(null)
        else if (editor) setEditor(null)
        else if (pathOpen) setPathOpen(false)
        else if (inboxOpen) setInboxOpen(false)
        else if (growthOpen) setGrowthOpen(false)
        else if (blackHoleOpen) setBlackHoleOpen(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (treeOpen) setTreeOpen(false)
        else goBack()
        return
      }

      if (editor || treeOpen || settingsOpen || captureMode || pathOpen || inboxOpen || blackHoleOpen || growthOpen || dragStatus || relationTransition) return

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
    <main
      className={`app-shell ${overlayOpen ? 'app-shell--overlay-open' : ''}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-void-inbox') && !(event.target as HTMLElement).closest('[data-inbox-panel]')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={(event) => {
        if ((event.target as HTMLElement).closest('[data-inbox-panel]')) return
        const raw = event.dataTransfer.getData('application/x-void-inbox')
        if (!raw) return
        event.preventDefault()
        try {
          const payload = JSON.parse(raw) as { inboxRootId: string; nodeId: string }
          extractInboxBranch(payload.inboxRootId, payload.nodeId)
        } catch {
          // Ignore malformed external drag data.
        }
      }}
    >
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
        onMoveToInbox={moveIdeaToInbox}
        onInboxDragHover={setInboxDropActive}
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

      <GlobalSearch
        ideas={ideas}
        language={language}
        onOpenIdea={(id) => {
          setEditor(null)
          setTreeOpen(false)
          setSettingsOpen(false)
          setPathOpen(false)
          setInboxOpen(false)
          setBlackHoleOpen(false)
          setCaptureMode(null)
          jumpToIdea(id)
        }}
      />

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
            <span>{language === 'zh-CN' ? `${selectedGrowthEntries.length} 个操作节点` : `${selectedGrowthEntries.length} activity events`}</span>
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
            <button type="button" className="secondary-button compact growth-open-button" onClick={() => { setEditor(null); setTreeOpen(false); setSettingsOpen(false); setPathOpen(false); setInboxOpen(false); setBlackHoleOpen(false); setCaptureMode(null); setGrowthOpen(true) }}>
              ▤ {language === 'zh-CN' ? `操作日历 ${selectedGrowthEntries.length}` : `Activity calendar ${selectedGrowthEntries.length}`}
            </button>
            <button type="button" className="secondary-button compact" onClick={() => exportIdeaWord(selectedPath[0] ?? selectedIdea)}>
              ↓ Word
            </button>
            <button type="button" className="secondary-button compact" onClick={() => moveIdeaToInbox(selectedIdea.id)}>
              ▣ {language === 'zh-CN' ? '放入灵感箱' : 'Move to inbox'}
            </button>
            <button type="button" className="ghost-danger compact" onClick={deleteSelected}>
              {copy.delete}
            </button>
          </div>

          <button type="button" className="back-button" onClick={goBack}>
            ← {copy.backPrevious} <kbd>Esc</kbd>
          </button>
        </section>
      )}

      <aside className={`action-dock-shell ${dockOpen ? 'action-dock-shell--open' : ''}`} aria-label={language === 'zh-CN' ? '功能栏' : 'Action dock'}>
        <button
          type="button"
          className="action-dock-toggle"
          onClick={() => setDockOpen((open) => !open)}
          aria-expanded={dockOpen}
          aria-label={dockOpen ? (language === 'zh-CN' ? '收起功能栏' : 'Collapse action dock') : (language === 'zh-CN' ? '展开功能栏' : 'Expand action dock')}
          title={dockOpen ? (language === 'zh-CN' ? '收起功能栏' : 'Collapse action dock') : (language === 'zh-CN' ? '展开功能栏' : 'Expand action dock')}
        >
          <span className="dock-pulse" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>

        <div
          className="action-dock"
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest('.dock-button')) {
              window.setTimeout(() => setDockOpen(false), 0)
            }
          }}
        >
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
            className={`dock-button ${pathOpen ? 'dock-button--active' : ''}`}
            onClick={() => {
              setTreeOpen(false)
              setSettingsOpen(false)
              setInboxOpen(false)
              setBlackHoleOpen(false)
              setCaptureMode(null)
              setEditor(null)
              setGrowthOpen(false)
              setPathOpen((open) => !open)
            }}
          >
            <b>⇢</b>
            <span>{language === 'zh-CN' ? '思路路径' : 'Thought path'}</span>
          </button>
          <button
            type="button"
            className={`dock-button dock-button--inbox ${inboxOpen ? 'dock-button--active' : ''} ${inboxDropActive ? 'dock-button--drop-target' : ''}`}
            data-inbox-dropzone
            onClick={() => {
              setTreeOpen(false)
              setSettingsOpen(false)
              setBlackHoleOpen(false)
              setCaptureMode(null)
              setEditor(null)
              setGrowthOpen(false)
              setInboxOpen((open) => !open)
            }}
          >
            <span className="dock-inbox-icon">
              {inbox.slice(0, 3).map((item, index) => <i key={item.id} style={{ '--mini-color': item.color, '--mini-index': index } as CSSProperties} />)}
              <b>▣</b>
            </span>
            <span>{language === 'zh-CN' ? '灵感箱' : 'Inbox'}</span>
            {inbox.length > 0 && <em>{inbox.length}</em>}
          </button>
          <button
            type="button"
            className={`dock-button dock-button--undo ${undoEntry ? '' : 'dock-button--disabled'}`}
            onClick={undoLastAction}
            disabled={!undoEntry || Boolean(relationTransition)}
            title={undoEntry ? (language === 'zh-CN' ? `撤销：${undoEntry.label}` : `Undo: ${undoEntry.label}`) : (language === 'zh-CN' ? '暂无可撤销操作' : 'Nothing to undo')}
          >
            <b>↶</b>
            <span>{language === 'zh-CN' ? '撤销' : 'Undo'}</span>
            <kbd>Ctrl Z</kbd>
          </button>
          <button
            type="button"
            className={`dock-button dock-button--black-hole ${blackHoleOpen ? 'dock-button--active' : ''}`}
            onClick={() => {
              setTreeOpen(false)
              setSettingsOpen(false)
              setPathOpen(false)
              setInboxOpen(false)
              setCaptureMode(null)
              setEditor(null)
              setGrowthOpen(false)
              setBlackHoleOpen((open) => !open)
            }}
          >
            <b>◉</b>
            <span>{language === 'zh-CN' ? '黑洞' : 'Black hole'}</span>
            {blackHole.length > 0 && <em>{blackHole.length}</em>}
          </button>
          <button
            type="button"
            className="dock-button"
            onClick={() => {
              setSettingsOpen(false)
              setPathOpen(false)
              setInboxOpen(false)
              setBlackHoleOpen(false)
              setCaptureMode(null)
              setEditor(null)
              setGrowthOpen(false)
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
              setPathOpen(false)
              setInboxOpen(false)
              setBlackHoleOpen(false)
              setCaptureMode(null)
              setEditor(null)
              setGrowthOpen(false)
              setSettingsOpen((open) => !open)
            }}
          >
            <b>⚙</b>
            <span>{copy.settings}</span>
          </button>
        </div>
      </aside>
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

      {pathOpen && (
        <PathView
          roots={ideas}
          initialRootId={selectedPath[0]?.id ?? null}
          language={language}
          onClose={() => setPathOpen(false)}
          onOpenIdea={(id) => {
            setPathOpen(false)
            jumpToIdea(id)
          }}
          onMoveToInbox={moveIdeaToInbox}
        />
      )}

      {inboxOpen && (
        <IdeaInbox
          items={inbox}
          language={language}
          dropActive={inboxDropActive}
          onClose={() => setInboxOpen(false)}
          onRestore={restoreInboxItem}
          onExtractBranch={extractInboxBranch}
          onMoveIdeaIntoInbox={moveIdeaToInbox}
        />
      )}

      {blackHoleOpen && (
        <BlackHolePanel
          items={blackHole}
          language={language}
          onClose={() => setBlackHoleOpen(false)}
          onRestore={restoreBlackHoleItem}
          onDeleteForever={deleteBlackHoleItemForever}
          onEmpty={emptyBlackHole}
        />
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
          onExportWordAll={() => exportAllIdeasWord(ideas)}
          onImport={(file) => void importData(file)}
          onSignOut={() => void leaveAccount()}
          backupHistory={backupHistory}
          backupHistoryStatus={backupHistoryStatus}
          backupAction={backupAction}
          onRefreshBackups={refreshBackupHistory}
          onCreateBackup={createCloudBackup}
          onRestoreBackup={restoreCloudBackup}
          onDeleteBackup={deleteCloudBackup}
          versionHistory={versionHistory}
          onAddVersionEntry={addVersionEntry}
          onUpdateVersionEntry={updateVersionEntry}
          onDeleteVersionEntry={deleteVersionEntry}
        />
      )}

      {growthOpen && selectedIdea && (
        <GrowthPanel
          node={selectedIdea}
          isRoot={selectedPath.length === 1}
          language={language}
          onClose={() => setGrowthOpen(false)}
          onAdd={addGrowthEntry}
          onRevise={reviseGrowthEntry}
          onOpenIdea={(id) => { setGrowthOpen(false); jumpToIdea(id) }}
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
