import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { defaultIdeas } from '../data/ideas'
import type { Language } from '../i18n'
import type { IdeaNodeData } from '../types'
import { cloneTree, normalizeTree } from '../utils/tree'
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

export type SyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'offline' | 'error'

interface CloudSpaceRow {
  user_id: string
  ideas: IdeaNodeData[]
  language: Language
  client_updated_at: string
  updated_at?: string
}

interface BackupFile {
  format: 'void-backup'
  version: 1
  exportedAt: string
  account: string | null
  language: Language
  ideas: IdeaNodeData[]
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
    language: readLegacyLanguage(),
    updatedAt: now,
    dirty: true,
    lastCloudUpdatedAt: null,
  }
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
}

export function useLocalFirstSpace(): LocalFirstSpaceController {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [ideas, setIdeas] = useState<IdeaNodeData[]>(() => cloneTree(defaultIdeas))
  const [language, setLanguage] = useState<Language>(readLegacyLanguage)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [authError, setAuthError] = useState<string | null>(null)

  const latestSnapshotRef = useRef<LocalSpaceSnapshot | null>(null)
  const uploadTimerRef = useRef<number | null>(null)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const skipPersistenceRef = useRef(false)
  const activeUserIdRef = useRef<string | null>(null)

  const applySnapshot = useCallback(async (snapshot: LocalSpaceSnapshot, skipNextSave = true) => {
    if (skipNextSave) skipPersistenceRef.current = true
    latestSnapshotRef.current = snapshot
    setIdeas(normalizeTree(snapshot.ideas))
    setLanguage(snapshot.language)
    await putLocalSnapshot(snapshot)
  }, [])

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
          ideas: snapshot.ideas,
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
    } else {
      setSyncStatus('pending')
    }
  }, [])

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

  const bootstrapUser = useCallback(async (userId: string) => {
    setDataReady(false)
    setAuthError(null)
    activeUserIdRef.current = userId

    let local = await getLocalSnapshot(userId)
    if (!local) {
      local = createDefaultSnapshot(userId)
      await putLocalSnapshot(local)
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

    if (activeUserIdRef.current !== userId) return

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

    const cloud: LocalSpaceSnapshot = {
      userId,
      ideas: normalizeTree(Array.isArray(cloudData.ideas) ? cloudData.ideas : []),
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
  }, [applySnapshot, uploadSnapshot])

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
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
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
      latestSnapshotRef.current = null
      setDataReady(false)
      return
    }

    const userId = session.user.id
    void bootstrapUser(userId)

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
          if (!row.client_updated_at || !Array.isArray(row.ideas)) return
          const current = latestSnapshotRef.current
          if (!current || compareTimestamps(row.client_updated_at, current.updatedAt) <= 0) return

          const remote: LocalSpaceSnapshot = {
            userId,
            ideas: normalizeTree(row.ideas),
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
      language,
      updatedAt: new Date().toISOString(),
      dirty: true,
      lastCloudUpdatedAt: latestSnapshotRef.current?.lastCloudUpdatedAt ?? null,
    }
    latestSnapshotRef.current = snapshot
    void putLocalSnapshot(snapshot)
    scheduleUpload(snapshot)
  }, [dataReady, ideas, language, scheduleUpload, session?.user.id])

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
    setDataReady(false)
  }, [uploadSnapshot])

  const syncNow = useCallback(async () => {
    const snapshot = latestSnapshotRef.current
    if (!snapshot) return
    await uploadSnapshot(snapshot)
  }, [uploadSnapshot])

  const exportBackup = useCallback(() => {
    const backup: BackupFile = {
      format: 'void-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      account: session?.user.email ?? null,
      language,
      ideas,
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
  }, [ideas, language, session?.user.email])

  const importBackup = useCallback(async (file: File) => {
    const content = await file.text()
    const parsed = JSON.parse(content) as Partial<BackupFile> | IdeaNodeData[]
    const importedIdeas = Array.isArray(parsed) ? parsed : parsed.ideas
    if (!Array.isArray(importedIdeas)) throw new Error('The selected file is not a valid VOID backup')

    const nextIdeas = normalizeTree(importedIdeas)
    const nextLanguage = !Array.isArray(parsed) && parsed.language === 'en' ? 'en' : language
    setIdeas(nextIdeas)
    setLanguage(nextLanguage)
  }, [language])

  return {
    configured: isSupabaseConfigured,
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
  }
}
