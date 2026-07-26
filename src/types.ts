export type Vec3 = [number, number, number]

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
