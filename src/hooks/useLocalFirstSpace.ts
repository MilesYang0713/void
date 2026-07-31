import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { defaultIdeas } from '../data/ideas'
import type { Language } from '../i18n'
import type { DeletedIdeaItem, IdeaNodeData, Vec3, VersionHistoryEntry } from '../types'
import { cloneTree, countNodes, normalizeTree } from '../utils/tree'
import { cloneVersionHistory, defaultVersionHistory, normalizeVersionHistory } from '../data/versionHistory'
import {
  getLocalSnapshot,
  putLocalSnapshot,
  saveConflictBackup,
  type LocalSpaceSnapshot,
} from '../lib/localDatabase'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const LEGACY_STORAGE_KEYS = [
  'void.idea-tree.v0.11.0',
  'void.idea-tree.v0.10.0',
  'void.idea-tree.v0.9.0',
  'void.idea-tree.v0.8.0',
  'void.idea-tree.v0.7.0',
  'void.idea-tree.v0.6.0',
  'void.idea-tree.v0.5.0',
  'void.idea-tree.v0.4.0',
  'void.idea-tree.v0.3.0',
  'void.idea-tree.v0.2.0',
]
const LEGACY_LANGUAGE_KEY = 'void.settings.language'
const SYNC_DEBOUNCE_MS = 900
const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000
const MAX_CLOUD_BACKUPS = 30

export type SyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'offline' | 'error'

interface CloudPayload {
  version: 4
  roots: IdeaNodeData[]
  inbox: IdeaNodeData[]
  blackHole: DeletedIdeaItem[]
  versionHistory: VersionHistoryEntry[]
}

interface CloudSpaceRow {
  user_id: string
  ideas: IdeaNodeData[] | CloudPayload
  language: Language
  client_updated_at: string
  updated_at?: string
}


export type CloudBackupSource = 'automatic' | 'manual' | 'pre_restore'
export type BackupHistoryStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error'

export interface CloudBackupSummary {
  id: string
  source: CloudBackupSource
  createdAt: string
  clientUpdatedAt: string
  ideaCount: number
  inboxCount: number
  blackHoleCount: number
}

interface CloudBackupRow {
  id: string
  user_id: string
  ideas: IdeaNodeData[] | CloudPayload
  language: Language
  source: CloudBackupSource
  client_updated_at: string
  created_at: string
  idea_count: number
  inbox_count: number
  black_hole_count: number
}

interface BackupFile {
  format: 'void-backup'
  version: 4
  exportedAt: string
  account: string | null
  language: Language
  ideas: IdeaNodeData[]
  inbox: IdeaNodeData[]
  blackHole: DeletedIdeaItem[]
  versionHistory: VersionHistoryEntry[]
}

const BLACK_HOLE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

function normalizeBlackHole(value: unknown): DeletedIdeaItem[] {
  if (!Array.isArray(value)) return []
  const now = Date.now()
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Partial<DeletedIdeaItem>
    if (!item.node || typeof item.id !== 'string' || typeof item.deletedAt !== 'string') return []
    const deletedAt = Number.isFinite(Date.parse(item.deletedAt)) ? item.deletedAt : new Date().toISOString()
    const expiresAt = item.expiresAt && Number.isFinite(Date.parse(item.expiresAt))
      ? item.expiresAt
      : new Date(Date.parse(deletedAt) + BLACK_HOLE_RETENTION_MS).toISOString()
    if (Date.parse(expiresAt) <= now) return []
    return [{
      id: item.id,
      node: normalizeTree([item.node])[0],
      originalParentId: typeof item.originalParentId === 'string' ? item.originalParentId : null,
      originalPosition: Array.isArray(item.originalPosition) ? item.originalPosition as Vec3 : undefined,
      deletedAt,
      expiresAt,
    } as DeletedIdeaItem]
  })
}

function decodeCloudPayload(value: unknown): { ideas: IdeaNodeData[]; inbox: IdeaNodeData[]; blackHole: DeletedIdeaItem[]; versionHistory: VersionHistoryEntry[] } {
  if (Array.isArray(value)) return { ideas: normalizeTree(value as IdeaNodeData[]), inbox: [], blackHole: [], versionHistory: cloneVersionHistory(defaultVersionHistory) }
  if (value && typeof value === 'object') {
    const payload = value as Partial<CloudPayload>
    return {
      ideas: normalizeTree(Array.isArray(payload.roots) ? payload.roots : []),
      inbox: normalizeTree(Array.isArray(payload.inbox) ? payload.inbox : []),
      blackHole: normalizeBlackHole(payload.blackHole),
      versionHistory: normalizeVersionHistory(payload.versionHistory),
    }
  }
  return { ideas: [], inbox: [], blackHole: [], versionHistory: cloneVersionHistory(defaultVersionHistory) }
}

function readLegacyIdeas(): IdeaNodeData[] | null {
  for (const key of LEGACY_STORAGE_KEYS) {
    const saved = window.localStorage.getItem(key)
    if (!saved) continue
    try {
      const parsed = JSON.parse(saved) as IdeaNodeData[]
      if (Array.isArray(parsed)) return normalizeTree(parsed)
    } catch {
      // Try the next legacy key.
    }
  }
  return null
}

function readLegacyLanguage(): Language {
  return window.localStorage.getItem(LEGACY_LANGUAGE_KEY) === 'en' ? 'en' : 'zh-CN'
}

function createDefaultSnapshot(userId: string): LocalSpaceSnapshot {
  const now = new Date().toISOString()
  return {
    userId,
    ideas: readLegacyIdeas() ?? cloneTree(defaultIdeas),
    inbox: [],
    blackHole: [],
    versionHistory: cloneVersionHistory(defaultVersionHistory),
    language: readLegacyLanguage(),
    updatedAt: now,
    dirty: true,
    lastCloudUpdatedAt: null,
  }
}


function snapshotIdeaCount(snapshot: Pick<LocalSpaceSnapshot, 'ideas'>) {
  return countNodes(snapshot.ideas)
}

function backupRowToSummary(row: CloudBackupRow): CloudBackupSummary {
  return {
    id: row.id,
    source: row.source,
    createdAt: row.created_at,
    clientUpdatedAt: row.client_updated_at,
    ideaCount: row.idea_count,
    inboxCount: row.inbox_count,
    blackHoleCount: row.black_hole_count,
  }
}

function isMissingBackupTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || Boolean(error.message?.includes('cloud_backups'))
}

function compareTimestamps(left?: string | null, right?: string | null) {
  const leftTime = left ? Date.parse(left) : 0
  const rightTime = right ? Date.parse(right) : 0
  return leftTime - rightTime
}

export interface LocalFirstSpaceController {
  configured: boolean
  session: Session | null
  authReady: boolean
  dataReady: boolean
  ideas: IdeaNodeData[]
  setIdeas: Dispatch<SetStateAction<IdeaNodeData[]>>
  inbox: IdeaNodeData[]
  setInbox: Dispatch<SetStateAction<IdeaNodeData[]>>
  blackHole: DeletedIdeaItem[]
  setBlackHole: Dispatch<SetStateAction<DeletedIdeaItem[]>>
  versionHistory: VersionHistoryEntry[]
  setVersionHistory: Dispatch<SetStateAction<VersionHistoryEntry[]>>
  language: Language
  setLanguage: Dispatch<SetStateAction<Language>>
  syncStatus: SyncStatus
  lastSyncedAt: string | null
  isOnline: boolean
  authError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<'signed-in' | 'confirm-email'>
  signOut: () => Promise<void>
  exportBackup: () => void
  importBackup: (file: File) => Promise<void>
  syncNow: () => Promise<void>
  backupHistory: CloudBackupSummary[]
  backupHistoryStatus: BackupHistoryStatus
  backupAction: 'idle' | 'creating' | 'restoring' | 'deleting'
  refreshBackupHistory: () => Promise<void>
  createCloudBackup: () => Promise<void>
  restoreCloudBackup: (backupId: string) => Promise<void>
  deleteCloudBackup: (backupId: string) => Promise<void>
}

export function useLocalFirstSpace(): LocalFirstSpaceController {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [ideas, setIdeas] = useState<IdeaNodeData[]>(() => cloneTree(defaultIdeas))
  const [inbox, setInbox] = useState<IdeaNodeData[]>([])
  const [blackHole, setBlackHole] = useState<DeletedIdeaItem[]>([])
  const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>(() => cloneVersionHistory(defaultVersionHistory))
  const [language, setLanguage] = useState<Language>(readLegacyLanguage)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [authError, setAuthError] = useState<string | null>(null)
  const [backupHistory, setBackupHistory] = useState<CloudBackupSummary[]>([])
  const [backupHistoryStatus, setBackupHistoryStatus] = useState<BackupHistoryStatus>('idle')
  const [backupAction, setBackupAction] = useState<'idle' | 'creating' | 'restoring' | 'deleting'>('idle')

  const latestSnapshotRef = useRef<LocalSpaceSnapshot | null>(null)
  const uploadTimerRef = useRef<number | null>(null)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const skipPersistenceRef = useRef(false)
  const activeUserIdRef = useRef<string | null>(null)
  const bootstrappingUserIdRef = useRef<string | null>(null)
  const bootstrapGenerationRef = useRef(0)
  const lastAutomaticBackupAtRef = useRef(0)

  const applySnapshot = useCallback(async (snapshot: LocalSpaceSnapshot, skipNextSave = true) => {
    if (skipNextSave) skipPersistenceRef.current = true
    const normalizedSnapshot: LocalSpaceSnapshot = {
      ...snapshot,
      ideas: normalizeTree(snapshot.ideas),
      inbox: normalizeTree(snapshot.inbox ?? []),
      blackHole: normalizeBlackHole(snapshot.blackHole ?? []),
      versionHistory: normalizeVersionHistory(snapshot.versionHistory),
    }
    latestSnapshotRef.current = normalizedSnapshot
    setIdeas(normalizedSnapshot.ideas)
    setInbox(normalizedSnapshot.inbox)
    setBlackHole(normalizedSnapshot.blackHole)
    setVersionHistory(normalizedSnapshot.versionHistory)
    setLanguage(normalizedSnapshot.language)
    await putLocalSnapshot(normalizedSnapshot)
  }, [])

  const trimCloudBackups = useCallback(async (userId: string) => {
    if (!supabase) return
    const { data } = await supabase
      .from('cloud_backups')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(MAX_CLOUD_BACKUPS, MAX_CLOUD_BACKUPS + 99)

    const staleIds = (data ?? []).map((item) => item.id as string)
    if (staleIds.length > 0) {
      await supabase.from('cloud_backups').delete().in('id', staleIds)
    }
  }, [])

  const insertCloudBackup = useCallback(async (
    snapshot: LocalSpaceSnapshot,
    source: CloudBackupSource,
  ) => {
    if (!supabase || !navigator.onLine) throw new Error('Cloud backup requires a network connection')

    const { data, error } = await supabase
      .from('cloud_backups')
      .insert({
        user_id: snapshot.userId,
        ideas: { version: 4, roots: snapshot.ideas, inbox: snapshot.inbox, blackHole: snapshot.blackHole, versionHistory: snapshot.versionHistory } satisfies CloudPayload,
        language: snapshot.language,
        source,
        client_updated_at: snapshot.updatedAt,
        idea_count: snapshotIdeaCount(snapshot),
        inbox_count: countNodes(snapshot.inbox),
        black_hole_count: snapshot.blackHole.length,
      })
      .select('id, user_id, ideas, language, source, client_updated_at, created_at, idea_count, inbox_count, black_hole_count')
      .single()

    if (error) {
      if (isMissingBackupTableError(error)) setBackupHistoryStatus('missing')
      throw error
    }

    const summary = backupRowToSummary(data as CloudBackupRow)
    setBackupHistory((current) => [summary, ...current.filter((item) => item.id !== summary.id)].slice(0, MAX_CLOUD_BACKUPS))
    setBackupHistoryStatus('ready')
    if (source === 'automatic') lastAutomaticBackupAtRef.current = Date.parse(summary.createdAt)
    await trimCloudBackups(snapshot.userId)
    return summary
  }, [trimCloudBackups])

  const maybeCreateAutomaticBackup = useCallback(async (snapshot: LocalSpaceSnapshot) => {
    if (!supabase || !navigator.onLine || backupHistoryStatus === 'missing') return
    if (Date.now() - lastAutomaticBackupAtRef.current < AUTO_BACKUP_INTERVAL_MS) return
    try {
      await insertCloudBackup(snapshot, 'automatic')
    } catch {
      // Cloud sync remains usable even if backup history has not been configured yet.
    }
  }, [backupHistoryStatus, insertCloudBackup])

  const uploadSnapshot = useCallback(async (snapshot: LocalSpaceSnapshot) => {
    if (!supabase || !navigator.onLine) {
      setSyncStatus('offline')
      return
    }

    setSyncStatus('syncing')
    const { data, error } = await supabase
      .from('user_spaces')
      .upsert(
        {
          user_id: snapshot.userId,
          ideas: { version: 4, roots: snapshot.ideas, inbox: snapshot.inbox, blackHole: snapshot.blackHole, versionHistory: snapshot.versionHistory } satisfies CloudPayload,
          language: snapshot.language,
          client_updated_at: snapshot.updatedAt,
        },
        { onConflict: 'user_id' },
      )
      .select('client_updated_at')
      .single()

    if (error) {
      setSyncStatus('error')
      return
    }

    const latest = latestSnapshotRef.current
    if (!latest || latest.userId !== snapshot.userId) return

    if (latest.updatedAt === snapshot.updatedAt) {
      const synced: LocalSpaceSnapshot = {
        ...latest,
        dirty: false,
        lastCloudUpdatedAt: data.client_updated_at,
      }
      latestSnapshotRef.current = synced
      await putLocalSnapshot(synced)
      setLastSyncedAt(data.client_updated_at)
      setSyncStatus('synced')
      void maybeCreateAutomaticBackup(synced)
    } else {
      setSyncStatus('pending')
    }
  }, [maybeCreateAutomaticBackup])

  const scheduleUpload = useCallback((snapshot: LocalSpaceSnapshot) => {
    if (uploadTimerRef.current) window.clearTimeout(uploadTimerRef.current)
    if (!navigator.onLine) {
      setSyncStatus('offline')
      return
    }

    setSyncStatus('pending')
    uploadTimerRef.current = window.setTimeout(() => {
      void uploadSnapshot(snapshot)
    }, SYNC_DEBOUNCE_MS)
  }, [uploadSnapshot])

  const loadBackupHistory = useCallback(async (userId: string) => {
    if (!supabase || !navigator.onLine) {
      setBackupHistoryStatus('idle')
      return
    }
    setBackupHistoryStatus('loading')
    const { data, error } = await supabase
      .from('cloud_backups')
      .select('id, user_id, ideas, language, source, client_updated_at, created_at, idea_count, inbox_count, black_hole_count')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_CLOUD_BACKUPS)

    if (error) {
      setBackupHistory([])
      setBackupHistoryStatus(isMissingBackupTableError(error) ? 'missing' : 'error')
      return
    }

    const summaries = (data as CloudBackupRow[]).map(backupRowToSummary)
    setBackupHistory(summaries)
    const latestAutomatic = summaries.find((item) => item.source === 'automatic')
    lastAutomaticBackupAtRef.current = latestAutomatic ? Date.parse(latestAutomatic.createdAt) : 0
    setBackupHistoryStatus('ready')
  }, [])

  const refreshBackupHistory = useCallback(async () => {
    const userId = session?.user.id ?? activeUserIdRef.current
    if (!userId) return
    await loadBackupHistory(userId)
  }, [loadBackupHistory, session?.user.id])

  const bootstrapUser = useCallback(async (userId: string) => {
    const generation = ++bootstrapGenerationRef.current
    const isInitialLoad = latestSnapshotRef.current?.userId !== userId
    if (isInitialLoad) setDataReady(false)
    setAuthError(null)
    activeUserIdRef.current = userId
    void loadBackupHistory(userId)

    let local = await getLocalSnapshot(userId)
    if (generation !== bootstrapGenerationRef.current || activeUserIdRef.current !== userId) return
    if (!local) {
      local = createDefaultSnapshot(userId)
      await putLocalSnapshot(local)
    } else {
      local = {
        ...local,
        ideas: normalizeTree(local.ideas),
        inbox: normalizeTree(local.inbox ?? []),
        blackHole: normalizeBlackHole(local.blackHole ?? []),
        versionHistory: normalizeVersionHistory(local.versionHistory),
      }
    }

    if (!supabase || !navigator.onLine) {
      await applySnapshot(local)
      setSyncStatus('offline')
      setDataReady(true)
      return
    }

    setSyncStatus('syncing')
    const { data, error } = await supabase
      .from('user_spaces')
      .select('user_id, ideas, language, client_updated_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (generation !== bootstrapGenerationRef.current || activeUserIdRef.current !== userId) return

    if (error) {
      await applySnapshot(local)
      setSyncStatus('error')
      setDataReady(true)
      return
    }

    const cloudData = data as CloudSpaceRow | null

    if (!cloudData) {
      await applySnapshot(local)
      setDataReady(true)
      await uploadSnapshot(local)
      return
    }

    const decodedCloud = decodeCloudPayload(cloudData.ideas)
    const cloud: LocalSpaceSnapshot = {
      userId,
      ideas: decodedCloud.ideas,
      inbox: decodedCloud.inbox,
      blackHole: decodedCloud.blackHole,
      versionHistory: decodedCloud.versionHistory,
      language: cloudData.language === 'en' ? 'en' : 'zh-CN',
      updatedAt: cloudData.client_updated_at,
      dirty: false,
      lastCloudUpdatedAt: cloudData.client_updated_at,
    }

    if (compareTimestamps(local.updatedAt, cloud.updatedAt) > 0 && local.dirty) {
      await applySnapshot(local)
      setDataReady(true)
      await uploadSnapshot(local)
      return
    }

    await applySnapshot(cloud)
    setLastSyncedAt(cloud.updatedAt)
    setSyncStatus('synced')
    setDataReady(true)
  }, [applySnapshot, loadBackupHistory, uploadSnapshot])

  useEffect(() => {
    document.documentElement.lang = language
    window.localStorage.setItem(LEGACY_LANGUAGE_KEY, language)
  }, [language])

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }

    let mounted = true
    const applySession = (nextSession: Session | null) => {
      if (!mounted) return
      setSession((current) => {
        const currentToken = current?.access_token ?? null
        const nextToken = nextSession?.access_token ?? null
        return currentToken === nextToken ? current : nextSession
      })
      setAuthReady(true)
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setAuthError(error.message)
      applySession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (realtimeChannelRef.current && supabase) {
      void supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }

    if (!session?.user.id) {
      activeUserIdRef.current = null
      bootstrappingUserIdRef.current = null
      bootstrapGenerationRef.current += 1
      latestSnapshotRef.current = null
      setDataReady(false)
      setBackupHistory([])
      setBackupHistoryStatus('idle')
      return
    }

    const userId = session.user.id
    if (latestSnapshotRef.current?.userId !== userId && bootstrappingUserIdRef.current !== userId) {
      bootstrappingUserIdRef.current = userId
      void bootstrapUser(userId).finally(() => {
        if (bootstrappingUserIdRef.current === userId) bootstrappingUserIdRef.current = null
      })
    }

    if (!supabase) return
    const channel = supabase
      .channel(`void-space-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_spaces',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Partial<CloudSpaceRow>
          if (!row.client_updated_at || row.ideas == null) return
          const current = latestSnapshotRef.current
          if (!current || compareTimestamps(row.client_updated_at, current.updatedAt) <= 0) return

          const decodedRemote = decodeCloudPayload(row.ideas)
          const remote: LocalSpaceSnapshot = {
            userId,
            ideas: decodedRemote.ideas,
            inbox: decodedRemote.inbox,
            blackHole: decodedRemote.blackHole,
            versionHistory: decodedRemote.versionHistory,
            language: row.language === 'en' ? 'en' : 'zh-CN',
            updatedAt: row.client_updated_at,
            dirty: false,
            lastCloudUpdatedAt: row.client_updated_at,
          }

          void (async () => {
            if (current.dirty) {
              await saveConflictBackup(current, 'A newer cloud snapshot replaced unsynced local data')
            }
            await applySnapshot(remote)
            setLastSyncedAt(remote.updatedAt)
            setSyncStatus('synced')
          })()
        },
      )
      .subscribe()

    realtimeChannelRef.current = channel
    return () => {
      if (supabase) void supabase.removeChannel(channel)
    }
  }, [applySnapshot, bootstrapUser, session?.user.id])

  useEffect(() => {
    if (!session?.user.id || !dataReady) return
    if (skipPersistenceRef.current) {
      skipPersistenceRef.current = false
      return
    }

    const snapshot: LocalSpaceSnapshot = {
      userId: session.user.id,
      ideas,
      inbox,
      blackHole,
      versionHistory,
      language,
      updatedAt: new Date().toISOString(),
      dirty: true,
      lastCloudUpdatedAt: latestSnapshotRef.current?.lastCloudUpdatedAt ?? null,
    }
    latestSnapshotRef.current = snapshot
    void putLocalSnapshot(snapshot)
    scheduleUpload(snapshot)
  }, [blackHole, dataReady, ideas, inbox, language, scheduleUpload, session?.user.id, versionHistory])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      const snapshot = latestSnapshotRef.current
      if (snapshot?.dirty) void uploadSnapshot(snapshot)
      else setSyncStatus('synced')
    }
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [uploadSnapshot])

  useEffect(() => {
    const purge = () => setBlackHole((current) => {
      const next = normalizeBlackHole(current)
      return next.length === current.length ? current : next
    })
    purge()
    const timer = window.setInterval(purge, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured')
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
      throw error
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured')
    setAuthError(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setAuthError(error.message)
      throw error
    }
    return data.session ? 'signed-in' : 'confirm-email'
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    if (uploadTimerRef.current) window.clearTimeout(uploadTimerRef.current)
    const snapshot = latestSnapshotRef.current
    if (snapshot?.dirty && navigator.onLine) await uploadSnapshot(snapshot)
    await supabase.auth.signOut()
    setIdeas(cloneTree(defaultIdeas))
    setInbox([])
    setBlackHole([])
    setVersionHistory(cloneVersionHistory(defaultVersionHistory))
    setBackupHistory([])
    setBackupHistoryStatus('idle')
    setDataReady(false)
  }, [uploadSnapshot])

  const syncNow = useCallback(async () => {
    const snapshot = latestSnapshotRef.current
    if (!snapshot) return
    await uploadSnapshot(snapshot)
  }, [uploadSnapshot])

  const createCloudBackup = useCallback(async () => {
    const snapshot = latestSnapshotRef.current
    if (!snapshot) return
    setBackupAction('creating')
    try {
      await insertCloudBackup(snapshot, 'manual')
      await loadBackupHistory(snapshot.userId)
    } finally {
      setBackupAction('idle')
    }
  }, [insertCloudBackup, loadBackupHistory])

  const restoreCloudBackup = useCallback(async (backupId: string) => {
    if (!supabase || !navigator.onLine) throw new Error('Cloud restore requires a network connection')
    const current = latestSnapshotRef.current
    if (!current) return

    setBackupAction('restoring')
    try {
      // Always preserve the current universe before a destructive restore.
      await insertCloudBackup(current, 'pre_restore')

      const { data, error } = await supabase
        .from('cloud_backups')
        .select('id, user_id, ideas, language, source, client_updated_at, created_at, idea_count, inbox_count, black_hole_count')
        .eq('id', backupId)
        .eq('user_id', current.userId)
        .single()
      if (error) throw error

      const row = data as CloudBackupRow
      const decoded = decodeCloudPayload(row.ideas)
      const restored: LocalSpaceSnapshot = {
        userId: current.userId,
        ideas: decoded.ideas,
        inbox: decoded.inbox,
        blackHole: decoded.blackHole,
        versionHistory: decoded.versionHistory,
        language: row.language === 'en' ? 'en' : 'zh-CN',
        updatedAt: new Date().toISOString(),
        dirty: true,
        lastCloudUpdatedAt: current.lastCloudUpdatedAt ?? null,
      }

      await applySnapshot(restored)
      await uploadSnapshot(restored)
      await loadBackupHistory(current.userId)
    } finally {
      setBackupAction('idle')
    }
  }, [applySnapshot, insertCloudBackup, loadBackupHistory, uploadSnapshot])

  const deleteCloudBackup = useCallback(async (backupId: string) => {
    if (!supabase) return
    setBackupAction('deleting')
    try {
      const { error } = await supabase.from('cloud_backups').delete().eq('id', backupId)
      if (error) throw error
      setBackupHistory((current) => current.filter((item) => item.id !== backupId))
    } finally {
      setBackupAction('idle')
    }
  }, [])

  const exportBackup = useCallback(() => {
    const backup: BackupFile = {
      format: 'void-backup',
      version: 4,
      exportedAt: new Date().toISOString(),
      account: session?.user.email ?? null,
      language,
      ideas,
      inbox,
      blackHole,
      versionHistory,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `void-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [blackHole, ideas, inbox, language, session?.user.email, versionHistory])

  const importBackup = useCallback(async (file: File) => {
    const content = await file.text()
    const parsed = JSON.parse(content) as Partial<BackupFile> | IdeaNodeData[]
    const importedIdeas = Array.isArray(parsed) ? parsed : parsed.ideas
    const importedInbox = Array.isArray(parsed) ? [] : parsed.inbox
    const importedBlackHole = Array.isArray(parsed) ? [] : parsed.blackHole
    const importedVersionHistory = Array.isArray(parsed) ? defaultVersionHistory : parsed.versionHistory
    if (!Array.isArray(importedIdeas)) throw new Error('The selected file is not a valid VOID backup')

    const nextIdeas = normalizeTree(importedIdeas)
    const nextLanguage = !Array.isArray(parsed) && parsed.language === 'en' ? 'en' : language
    setIdeas(nextIdeas)
    setInbox(normalizeTree(Array.isArray(importedInbox) ? importedInbox : []))
    setBlackHole(normalizeBlackHole(importedBlackHole))
    setVersionHistory(normalizeVersionHistory(importedVersionHistory))
    setLanguage(nextLanguage)
  }, [language])

  return {
    configured: isSupabaseConfigured,
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
  }
}
