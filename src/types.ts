export type Vec3 = [number, number, number]


export interface VersionHistoryEntry {
  id: string
  version: string
  title: string
  reason: string
  changedTo: string
  result: string
  createdAt: string
  updatedAt: string
}

export interface InboxOrigin {
  parentId: string | null
  position?: Vec3
  storedAt: string
}

export type GrowthEntryType =
  | 'created'
  | 'note'
  | 'edit'
  | 'branch'
  | 'move'
  | 'relation'
  | 'inbox'
  | 'restore'
  | 'delete'
  | 'origin'
  | 'addition'
  | 'inference'
  | 'question'
  | 'action'
  | 'revision'

export interface GrowthEntry {
  id: string
  type: GrowthEntryType
  content: string
  createdAt: string
  updatedAt: string
  completed?: boolean
  completedAt?: string
  convertedIdeaId?: string
  revisionOf?: string
  previousContent?: string
  nextContent?: string
  field?: 'title' | 'description' | 'color' | 'record' | 'structure' | 'position' | 'location'
  editable?: boolean
}


export interface IdeaNodeData {
  id: string
  title: string
  description: string
  color: string
  createdAt: string
  updatedAt: string
  children: IdeaNodeData[]
  accessCount?: number
  childCreationCount?: number
  lastAccessedAt?: string
  position?: Vec3
  inboxOrigin?: InboxOrigin
  growthEntries?: GrowthEntry[]
}

export interface DeletedIdeaItem {
  id: string
  node: IdeaNodeData
  originalParentId: string | null
  originalPosition?: Vec3
  deletedAt: string
  expiresAt: string
}

export interface IdeaDraft {
  title: string
  description: string
  color: string
}

export interface DragStatus {
  sourceTitle: string
  targetTitle: string | null
  scope: 'root' | 'branch'
  detachProgress?: number
  detachReady?: boolean
}

export interface ViewTransition {
  serial: number
  previousId: string | null
  startPosition: Vec3
  startScale: number
  direction: 'forward' | 'back' | 'jump' | 'create' | 'exit'
}

export interface RelationTransition {
  serial: number
  kind: 'nest' | 'detach'
  movingId: string
  targetId?: string
  sourcePosition: Vec3
  targetPosition: Vec3
  sourceScale: number
  targetScale: number
  color: string
  targetColor?: string
}
