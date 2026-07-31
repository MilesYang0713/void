import type { Language } from '../i18n'
import type { DeletedIdeaItem, IdeaNodeData, VersionHistoryEntry } from '../types'

const DATABASE_NAME = 'void-local-first'
const DATABASE_VERSION = 1
const SNAPSHOT_STORE = 'snapshots'
const BACKUP_STORE = 'conflict-backups'

export interface LocalSpaceSnapshot {
  userId: string
  ideas: IdeaNodeData[]
  inbox: IdeaNodeData[]
  blackHole: DeletedIdeaItem[]
  versionHistory: VersionHistoryEntry[]
  language: Language
  updatedAt: string
  dirty: boolean
  lastCloudUpdatedAt?: string | null
}

export interface ConflictBackup extends LocalSpaceSnapshot {
  backupId: string
  reason: string
  createdAt: string
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'userId' })
      }
      if (!database.objectStoreNames.contains(BACKUP_STORE)) {
        const store = database.createObjectStore(BACKUP_STORE, { keyPath: 'backupId' })
        store.createIndex('userId', 'userId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
  })

  return databasePromise
}

export async function getLocalSnapshot(userId: string): Promise<LocalSpaceSnapshot | null> {
  const database = await openDatabase()
  const transaction = database.transaction(SNAPSHOT_STORE, 'readonly')
  const done = transactionDone(transaction)
  const result = await requestToPromise(
    transaction.objectStore(SNAPSHOT_STORE).get(userId) as IDBRequest<LocalSpaceSnapshot | undefined>,
  )
  await done
  return result ?? null
}

export async function putLocalSnapshot(snapshot: LocalSpaceSnapshot): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(SNAPSHOT_STORE).put(snapshot)
  await done
}

export async function saveConflictBackup(
  snapshot: LocalSpaceSnapshot,
  reason: string,
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(BACKUP_STORE, 'readwrite')
  const done = transactionDone(transaction)
  const createdAt = new Date().toISOString()
  const backup: ConflictBackup = {
    ...snapshot,
    backupId: `${snapshot.userId}:${createdAt}:${Math.random().toString(36).slice(2, 8)}`,
    reason,
    createdAt,
  }
  transaction.objectStore(BACKUP_STORE).put(backup)
  await done
}
